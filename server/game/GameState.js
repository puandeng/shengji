const Deck = require('./Deck');
const Card = require('./Card');
const {
  GAME_PHASES,
  TEAM_ASSIGNMENTS,
  PLAYERS_PER_ROOM,
  CARDS_PER_PLAYER,
  KITTY_SIZE,
  STARTING_LEVEL,
  LEVEL_THRESHOLDS,
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
 *  2. Others must follow lead suit if they have it; must follow trump if lead is trump.
 *  3. Trump beats non-trump; big joker > small joker > all other trump > non-trump.
 *  4. Trick winner leads the next trick.
 *
 * Scoring:
 *  - 5 = 5 pts, 10 = 10 pts, K = 10 pts (200 total across 2 decks)
 *  - Only the attacking team's captures count. Defending team never accumulates points.
 *  - Attacking team wins the round if they collect ≥ LEVEL_THRESHOLDS[trumpRank].
 *  - Kitty belongs to whoever wins the last trick. If attackers win the last trick,
 *    kitty points × 2 (×cards in the winning play once multi-card plays are added)
 *    are added to their score. If defenders win, attackers get nothing from the kitty.
 */
class GameState {
  constructor(roomId) {
    this.roomId         = roomId;
    this.devMode        = false;
    this.phase          = GAME_PHASES.WAITING;
    this.players        = [];      // Array of player objects { socketId, name, seatIndex, teamIndex }
    this.hands          = {};      // { socketId: Card[] }
    this.kitty          = [];      // Card[] — held until kitty phase
    this.trumpSuit      = null;    // Declared trump suit ('S','H','D','C')
    this.trumpRank      = STARTING_LEVEL; // Current trump rank/level ('2'..'A')
    this.trumpDeclarer  = null;    // socketId of trump declarer
    this.attackingTeam  = 0;       // Team 0 attacks first
    this.currentTrick   = [];      // [{ socketId, card }]
    this.tricks         = [];      // Completed tricks [{winner, cards, points}]
    this.leadSeat       = 0;       // Seat index of current lead player
    this.currentSeat    = 0;       // Seat index whose turn it is
    this.scores         = { 0: 0, 1: 0 }; // Only attackingTeam's entry is ever non-zero
    this.roundScores    = { 0: 0, 1: 0 }; // Round-wins per team
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

    const player = { socketId, name, seatIndex, teamIndex, connected: true };
    this.players.push(player);
    return { player };
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex(p => p.socketId === socketId);
    if (idx === -1) return;

    // During an active game, mark as disconnected instead of removing
    if (this.phase !== GAME_PHASES.WAITING) {
      this.players[idx].connected = false;
      return;
    }

    this.players.splice(idx, 1);
    delete this.hands[socketId];
  }

  /**
   * Reconnect a player by swapping their old socketId for a new one.
   * Preserves seat, team, and hand.
   */
  reconnectPlayer(oldSocketId, newSocketId) {
    const player = this.getPlayer(oldSocketId);
    if (!player) return { error: 'Player not found' };

    // Update socketId in player object
    player.socketId = newSocketId;
    player.connected = true;

    // Move hand to new socketId
    if (this.hands[oldSocketId]) {
      this.hands[newSocketId] = this.hands[oldSocketId];
      delete this.hands[oldSocketId];
    }

    // Update trumpDeclarer if it was this player
    if (this.trumpDeclarer === oldSocketId) {
      this.trumpDeclarer = newSocketId;
    }

    // Update currentTrick entries
    this.currentTrick.forEach(entry => {
      if (entry.socketId === oldSocketId) entry.socketId = newSocketId;
    });

    return { player };
  }

  /** Find a disconnected player by name */
  getDisconnectedPlayer(name) {
    return this.players.find(p => p.connected === false && p.name === name);
  }

  getPlayer(socketId) {
    return this.players.find(p => p.socketId === socketId);
  }

  getPlayerBySeat(seatIndex) {
    return this.players.find(p => p.seatIndex === seatIndex);
  }

  isReady() {
    if (this.devMode) return this.players.length >= 1 && this.players.length <= PLAYERS_PER_ROOM;
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

    this.phase         = GAME_PHASES.TRUMP_SELECTION;
    this.trumpSuit     = null;
    this.trumpDeclarer = null;
    this.currentTrick  = [];
    this.tricks        = [];
    this.scores        = { 0: 0, 1: 0 };

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
   * Declarer discards KITTY_SIZE cards back into the kitty.
   * These are claimed by whoever wins the last trick.
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

    // Start playing — trump declarer leads first
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

    // Validate follow-suit / follow-trump rule (when not leading)
    if (this.currentTrick.length > 0) {
      const leadCard     = this.currentTrick[0].card;
      const leadIsTrump  = leadCard.isTrump(this.trumpSuit);

      if (leadIsTrump) {
        // Must follow trump (including jokers) if possible
        const hasTrump = hand.some(c => c.isTrump(this.trumpSuit) && c.id !== cardId);
        if (hasTrump && !card.isTrump(this.trumpSuit)) {
          return { error: 'Must follow trump suit' };
        }
      } else {
        // Must follow lead suit if possible
        const leadSuit = leadCard.suit;
        const hasSuit  = hand.some(c => c.suit === leadSuit && c.id !== cardId);
        if (hasSuit && card.suit !== leadSuit) {
          return { error: `Must follow ${leadSuit} suit` };
        }
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
    const isLastTrick  = this.players.every(p => this.hands[p.socketId].length === 0);

    // Raw point cards in this trick
    const trickPoints = this.currentTrick.reduce((sum, e) => sum + e.card.points, 0);

    // Only the attacking team accumulates points.
    // If defenders win the trick, the point cards in it are blocked — nobody scores them.
    let pointsScored = 0;
    if (winnerPlayer.teamIndex === this.attackingTeam) {
      pointsScored = trickPoints;

      if (isLastTrick) {
        // Attackers win the last trick → they collect the kitty.
        // Multiplier = 2 × cards in the winning play.
        // Multi-card plays not yet implemented, so last play is always 1 card → ×2.
        const kittyPoints = this.kitty.reduce((sum, c) => sum + c.points, 0);
        pointsScored += kittyPoints * 2;
      }

      this.scores[this.attackingTeam] += pointsScored;
    }
    // If defenders win the last trick, attackers get no kitty bonus.

    const completedTrick = {
      cards:  this.currentTrick.map(e => ({ socketId: e.socketId, card: e.card.toJSON() })),
      winner: winnerEntry.socketId,
      points: pointsScored, // points credited to attackers (0 if defenders won)
    };
    this.tricks.push(completedTrick);

    // Prepare for next trick
    this.currentTrick = [];
    this.leadSeat     = winnerPlayer.seatIndex;
    this.currentSeat  = winnerPlayer.seatIndex;

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

    const attackingScore = this.scores[this.attackingTeam];
    const defendingTeam  = this.attackingTeam === 0 ? 1 : 0;
    const threshold      = LEVEL_THRESHOLDS[this.trumpRank];
    const attackingWon   = attackingScore >= threshold;

    // Accumulate round-wins
    if (attackingWon) {
      this.roundScores[this.attackingTeam] += 1;
    } else {
      this.roundScores[defendingTeam] += 1;
    }

    // Check for overall winner (first to 3 rounds)
    let gameOver = false;
    if (this.roundScores[0] >= 3 || this.roundScores[1] >= 3) {
      gameOver    = true;
      this.phase  = GAME_PHASES.GAME_OVER;
      this.winner = this.roundScores[0] >= 3 ? 0 : 1;
    }

    return {
      success:       true,
      roundOver:     true,
      gameOver,
      attackingTeam: this.attackingTeam,
      attackingWon,
      threshold,
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
      trumpRank:     this.trumpRank,
      trumpDeclarer: this.trumpDeclarer,
      attackingTeam: this.attackingTeam,
      currentTrick:  this.currentTrick.map(e => ({ socketId: e.socketId, card: e.card.toJSON() })),
      leadSeat:      this.leadSeat,
      currentSeat:   this.currentSeat,
      scores:        this.scores,
      roundScores:   this.roundScores,
      winner:        this.winner,
      roundNumber:   this.roundNumber,
      threshold:     LEVEL_THRESHOLDS[this.trumpRank],
    };
  }

  /** Per-player state snapshot — omits other players' hands */
  toPlayerJSON(socketId) {
    const full = this.toFullJSON();
    full.myHand = (this.hands[socketId] || []).map(c => c.toJSON());
    full.handCounts = Object.fromEntries(
      Object.entries(this.hands).map(([id, cards]) => [id, cards.length])
    );
    delete full.hands;
    return full;
  }
}

module.exports = GameState;
