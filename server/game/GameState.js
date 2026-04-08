const Deck = require('./Deck');
const Card = require('./Card');
const {
  GAME_PHASES,
  TEAM_ASSIGNMENTS,
  PLAYERS_PER_ROOM,
  CARDS_PER_PLAYER,
  KITTY_SIZE,
  WINNING_THRESHOLD,
  TRUMP_DECLARATION_TIMEOUT,
} = require('./constants');

/**
 * GameState manages all core game logic for one room:
 *  - Dealing, trump selection, trick-taking, scoring
 *
 * Teams:
 *   Team 0 → seat indices 0 & 2 (attacker in a fresh game)
 *   Team 1 → seat indices 1 & 3 (defender)
 *
 * Trick-taking rules:
 *  1. Lead player plays any card.
 *  2. Others must follow lead suit if they have it.
 *  3. Trump beats non-trump; higher rank beats lower within same group.
 *  4. Trick winner leads the next trick.
 *
 * Scoring:
 *  - 5 = 5 pts, 10 = 10 pts, K = 10 pts
 *  - 200 total points across 2 decks
 *  - Attacking team wins round if they collect ≥ WINNING_THRESHOLD
 */
class GameState {
  constructor(roomId) {
    this.roomId         = roomId;
    this.phase          = GAME_PHASES.WAITING;
    this.players        = [];      // Array of player objects { socketId, name, seatIndex, teamIndex }
    this.hands          = {};      // { socketId: Card[] }
    this.kitty          = [];      // Card[] — held until kitty phase
    this.trumpSuit      = null;    // Declared trump suit ('S','H','D','C')
    this.trumpDeclarer  = null;    // socketId of trump declarer
    this.attackingTeam  = 0;       // Team 0 attacks first
    this.currentTrick   = [];      // [{ socketId, card }]
    this.tricks         = [];      // Completed tricks [{winner, cards}]
    this.leadSeat       = 0;       // Seat index of current lead player
    this.currentSeat    = 0;       // Seat index whose turn it is
    this.scores         = { 0: 0, 1: 0 }; // Points collected per team this round
    this.roundScores    = { 0: 0, 1: 0 }; // Cumulative scores across rounds
    this.winner         = null;    // null | 0 | 1
    this.trumpTimer     = null;    // Timeout handle for trump selection
    this.roundNumber    = 1;
  }

  // ─────────────────────────────────────────────
  // Player management
  // ─────────────────────────────────────────────

  addPlayer(socketId, name) {
    if (this.players.length >= PLAYERS_PER_ROOM) return { error: 'Room is full' };
    if (this.players.find(p => p.socketId === socketId)) return { error: 'Already in room' };

    const seatIndex = this.players.length;
    const teamIndex = TEAM_ASSIGNMENTS[seatIndex];

    const player = { socketId, name, seatIndex, teamIndex };
    this.players.push(player);
    return { player };
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex(p => p.socketId === socketId);
    if (idx === -1) return;
    this.players.splice(idx, 1);
    delete this.hands[socketId];
  }

  getPlayer(socketId) {
    return this.players.find(p => p.socketId === socketId);
  }

  getPlayerBySeat(seatIndex) {
    return this.players.find(p => p.seatIndex === seatIndex);
  }

  isReady() {
    return this.players.length === PLAYERS_PER_ROOM;
  }

  // ─────────────────────────────────────────────
  // Dealing
  // ─────────────────────────────────────────────

  deal() {
    if (!this.isReady()) return { error: 'Not enough players' };

    const deck = new Deck();
    const { hands, kitty } = deck.deal(PLAYERS_PER_ROOM, CARDS_PER_PLAYER, KITTY_SIZE);

    this.kitty = kitty;
    this.players.forEach((player, i) => {
      this.hands[player.socketId] = hands[i];
    });

    this.phase        = GAME_PHASES.TRUMP_SELECTION;
    this.trumpSuit    = null;
    this.trumpDeclarer = null;
    this.currentTrick = [];
    this.tricks       = [];
    this.scores       = { 0: 0, 1: 0 };

    return { success: true };
  }

  // ─────────────────────────────────────────────
  // Trump selection
  // ─────────────────────────────────────────────

  /**
   * A player declares trump by showing one of their cards.
   * The suit of that card becomes trump. First valid declaration wins.
   */
  declareTrump(socketId, cardId) {
    if (this.phase !== GAME_PHASES.TRUMP_SELECTION) return { error: 'Not in trump selection phase' };
    if (this.trumpSuit) return { error: 'Trump already declared' };

    const hand = this.hands[socketId];
    if (!hand) return { error: 'Player not found' };

    const card = hand.find(c => c.id === cardId);
    if (!card) return { error: 'Card not in hand' };

    this.trumpSuit     = card.suit;
    this.trumpDeclarer = socketId;

    const declarer = this.getPlayer(socketId);
    this.attackingTeam = declarer.teamIndex;

    return { success: true, trumpSuit: this.trumpSuit, declarer: declarer.name };
  }

  /**
   * Called when trump selection timer expires and no one declared.
   * Randomly picks a suit from the first player's hand.
   */
  autoSelectTrump() {
    if (this.trumpSuit) return;

    const firstPlayer = this.players[0];
    const hand = this.hands[firstPlayer.socketId];
    if (hand && hand.length > 0) {
      this.trumpSuit     = hand[0].suit;
      this.trumpDeclarer = firstPlayer.socketId;
      this.attackingTeam = firstPlayer.teamIndex;
    }
  }

  /** Move from trump selection → kitty phase */
  finishTrumpSelection() {
    if (!this.trumpSuit) this.autoSelectTrump();
    this.phase = GAME_PHASES.KITTY;
    return { success: true };
  }

  // ─────────────────────────────────────────────
  // Kitty phase
  // ─────────────────────────────────────────────

  /** Give kitty cards to the declaring player */
  giveKittyToDeclarer() {
    if (!this.trumpDeclarer) return { error: 'No trump declarer' };
    const hand = this.hands[this.trumpDeclarer];
    this.kitty.forEach(c => hand.push(c));
    return { success: true, kittyCards: this.kitty.map(c => c.toJSON()) };
  }

  /**
   * Declarer discards 4 cards back into the kitty.
   * These will be claimed by whoever wins the last trick.
   */
  discardToKitty(socketId, cardIds) {
    if (socketId !== this.trumpDeclarer) return { error: 'Only the trump declarer can discard' };
    if (cardIds.length !== KITTY_SIZE) return { error: `Must discard exactly ${KITTY_SIZE} cards` };

    const hand = this.hands[socketId];
    const discarded = [];

    for (const cardId of cardIds) {
      const idx = hand.findIndex(c => c.id === cardId);
      if (idx === -1) return { error: `Card ${cardId} not in hand` };
      discarded.push(hand.splice(idx, 1)[0]);
    }

    this.kitty = discarded;

    // Start playing — trump declarer's team leads first
    const declarer = this.getPlayer(socketId);
    this.leadSeat    = declarer.seatIndex;
    this.currentSeat = declarer.seatIndex;
    this.phase       = GAME_PHASES.PLAYING;

    return { success: true };
  }

  // ─────────────────────────────────────────────
  // Trick-taking
  // ─────────────────────────────────────────────

  /** Returns the socketId whose turn it currently is */
  get currentPlayerSocketId() {
    const player = this.getPlayerBySeat(this.currentSeat);
    return player ? player.socketId : null;
  }

  /**
   * Play a card. Validates it's the player's turn and follows suit rules.
   * Returns { error } or { trick, trickComplete, trickWinner, gameOver }
   */
  playCard(socketId, cardId) {
    if (this.phase !== GAME_PHASES.PLAYING) return { error: 'Game is not in playing phase' };
    if (socketId !== this.currentPlayerSocketId) return { error: "It's not your turn" };

    const hand = this.hands[socketId];
    const cardIdx = hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return { error: 'Card not in your hand' };

    const card = hand[cardIdx];

    // Validate follow-suit rule (when not leading)
    if (this.currentTrick.length > 0) {
      const leadCard  = this.currentTrick[0].card;
      const leadSuit  = leadCard.suit;
      const hasSuit   = hand.some(c => c.suit === leadSuit && c.id !== cardId);
      if (hasSuit && card.suit !== leadSuit) {
        return { error: `Must follow ${leadSuit} suit` };
      }
    }

    // Remove card from hand and add to current trick
    hand.splice(cardIdx, 1);
    this.currentTrick.push({ socketId, card });

    // Check if trick is complete (all 4 players have played)
    if (this.currentTrick.length < PLAYERS_PER_ROOM) {
      this._advanceSeat();
      return { success: true, trickComplete: false };
    }

    // Resolve the trick
    return this._resolveTrick();
  }

  _advanceSeat() {
    this.currentSeat = (this.currentSeat + 1) % PLAYERS_PER_ROOM;
  }

  _resolveTrick() {
    const leadCard = this.currentTrick[0].card;
    const leadSuit = leadCard.suit;

    // Find the winner: compare each card against the current best
    let winnerEntry = this.currentTrick[0];
    for (let i = 1; i < this.currentTrick.length; i++) {
      const entry = this.currentTrick[i];
      if (entry.card.beats(winnerEntry.card, leadSuit, this.trumpSuit)) {
        winnerEntry = entry;
      }
    }

    const winnerPlayer = this.getPlayer(winnerEntry.socketId);

    // Tally points from this trick
    let trickPoints = this.currentTrick.reduce((sum, e) => sum + e.card.points, 0);

    // If this is the last trick, add kitty points (×2 as is traditional)
    const isLastTrick = this.players.every(p => this.hands[p.socketId].length === 0);
    if (isLastTrick) {
      const kittyPoints = this.kitty.reduce((sum, c) => sum + c.points, 0);
      trickPoints += kittyPoints * 2; // Traditional Sheng Ji rule: kitty points doubled
    }

    this.scores[winnerPlayer.teamIndex] += trickPoints;

    const completedTrick = {
      cards:   this.currentTrick.map(e => ({ socketId: e.socketId, card: e.card.toJSON() })),
      winner:  winnerEntry.socketId,
      points:  trickPoints,
    };
    this.tricks.push(completedTrick);

    // Prepare for next trick
    this.currentTrick = [];
    this.leadSeat     = winnerPlayer.seatIndex;
    this.currentSeat  = winnerPlayer.seatIndex;

    // Check if round is over (all hands empty)
    if (isLastTrick) {
      return { ...this._finishRound(), trickComplete: true, completedTrick };
    }

    return { success: true, trickComplete: true, completedTrick, winner: winnerPlayer.socketId };
  }

  // ─────────────────────────────────────────────
  // Scoring & round end
  // ─────────────────────────────────────────────

  _finishRound() {
    this.phase = GAME_PHASES.SCORING;

    const attackingScore  = this.scores[this.attackingTeam];
    const defendingTeam   = this.attackingTeam === 0 ? 1 : 0;

    const attackingWon = attackingScore >= WINNING_THRESHOLD;

    // Accumulate round scores
    if (attackingWon) {
      this.roundScores[this.attackingTeam] += 1;
    } else {
      this.roundScores[defendingTeam] += 1;
    }

    // Check for overall winner (first to 3 rounds)
    let gameOver = false;
    if (this.roundScores[0] >= 3 || this.roundScores[1] >= 3) {
      gameOver   = true;
      this.phase = GAME_PHASES.GAME_OVER;
      this.winner = this.roundScores[0] >= 3 ? 0 : 1;
    }

    return {
      success:       true,
      roundOver:     true,
      gameOver,
      attackingTeam: this.attackingTeam,
      attackingWon,
      scores:        this.scores,
      roundScores:   this.roundScores,
      winner:        this.winner,
    };
  }

  // ─────────────────────────────────────────────
  // Serialisation helpers
  // ─────────────────────────────────────────────

  /** Full state snapshot (server-side, includes all hands) */
  toFullJSON() {
    return {
      roomId:        this.roomId,
      phase:         this.phase,
      players:       this.players,
      hands:         Object.fromEntries(
        Object.entries(this.hands).map(([id, cards]) => [id, cards.map(c => c.toJSON())])
      ),
      trumpSuit:     this.trumpSuit,
      trumpDeclarer: this.trumpDeclarer,
      attackingTeam: this.attackingTeam,
      currentTrick:  this.currentTrick.map(e => ({ socketId: e.socketId, card: e.card.toJSON() })),
      leadSeat:      this.leadSeat,
      currentSeat:   this.currentSeat,
      scores:        this.scores,
      roundScores:   this.roundScores,
      winner:        this.winner,
      roundNumber:   this.roundNumber,
    };
  }

  /** Per-player state snapshot — omits other players' hands */
  toPlayerJSON(socketId) {
    const full = this.toFullJSON();
    // Replace all hands with only this player's hand
    full.myHand = (this.hands[socketId] || []).map(c => c.toJSON());
    full.handCounts = Object.fromEntries(
      Object.entries(this.hands).map(([id, cards]) => [id, cards.length])
    );
    delete full.hands;
    return full;
  }
}

module.exports = GameState;
