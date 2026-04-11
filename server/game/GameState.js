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
  LEVEL_ORDER,
  TRUMP_DECLARATION_TIMEOUT,
} = require('./constants');

// ─────────────────────────────────────────────
// Shape helpers
// ─────────────────────────────────────────────

/**
 * Advance a level by `steps`. Returns null if the team has won (levelled past A).
 */
function advanceLevel(currentLevel, steps) {
  const idx = LEVEL_ORDER.indexOf(currentLevel);
  const newIdx = idx + steps;
  if (newIdx >= LEVEL_ORDER.length) return null; // Past A → team wins
  return LEVEL_ORDER[newIdx];
}

/**
 * Classify the shape of a multi-card play.
 * Returns 'single' | 'pair' | 'tractor' | 'throw'
 */
function classifyPlay(cards, trumpSuit, trumpRank) {
  if (cards.length === 1) return 'single';

  // All cards must share the same effective suit
  const effSuits = new Set(cards.map(c => c.effectiveSuit(trumpSuit, trumpRank)));
  if (effSuits.size > 1) return 'throw';

  if (cards.length === 2) {
    return (cards[0].suit === cards[1].suit && cards[0].rank === cards[1].rank) ? 'pair' : 'throw';
  }

  // 4+ cards: tractor check (consecutive pairs in same effective suit)
  if (cards.length >= 4 && cards.length % 2 === 0 && isTractor(cards, trumpSuit, trumpRank)) {
    return 'tractor';
  }

  return 'throw';
}

/**
 * Returns true if `cards` (length ≥ 4, even) are consecutive pairs
 * (i.e. each rank appears exactly twice, and the ranks are consecutive in their ordering).
 */
function isTractor(cards, trumpSuit, trumpRank) {
  const effSuit = cards[0].effectiveSuit(trumpSuit, trumpRank);

  // Sort by tractor value
  const sorted = [...cards].sort((a, b) => tractorValue(a, trumpSuit, trumpRank) - tractorValue(b, trumpSuit, trumpRank));

  for (let i = 0; i < sorted.length; i += 2) {
    // Each pair must be identical in suit+rank
    if (sorted[i].suit !== sorted[i + 1].suit || sorted[i].rank !== sorted[i + 1].rank) return false;
    // Consecutive pairs must differ by exactly 1 tractor value
    if (i + 2 < sorted.length) {
      const v1 = tractorValue(sorted[i],     trumpSuit, trumpRank);
      const v2 = tractorValue(sorted[i + 2], trumpSuit, trumpRank);
      if (v2 - v1 !== 1) return false;
    }
  }
  return true;
}

/**
 * Numeric value used for tractor ordering.
 * For trump cards: spread out so only truly adjacent ranks form tractors.
 * For non-trump: normal rank value.
 */
function tractorValue(card, trumpSuit, trumpRank) {
  if (!card.isTrump(trumpSuit, trumpRank)) return card.rankValue;
  if (card.isBigJoker)  return 100;
  if (card.isSmallJoker) return 99;
  if (card.suit === trumpSuit && card.rank === trumpRank) return 50; // in-suit trump-rank (gap vs jokers = 49)
  if (card.rank === trumpRank) return 48;                            // off-suit trump-rank (gap vs in-suit = 2)
  // Regular trump card — skip the trumpRank position in the rank sequence
  const rv = card.rankValue;
  const skipVal = (trumpRank !== null) ? (require('./constants').RANK_ORDER[trumpRank] || 0) : 0;
  return rv < skipVal ? rv : rv + 1; // Shift ranks above trump-rank to leave a gap
}

/**
 * Compute how many cards of `effSuit` a hand contains, and the best combos.
 * Used for follow-suit enforcement.
 */
function handShapeInfo(hand, effSuit, trumpSuit, trumpRank) {
  const suited = hand.filter(c => c.effectiveSuit(trumpSuit, trumpRank) === effSuit);
  const total  = suited.length;

  // Count pairs
  const rankCounts = {};
  suited.forEach(c => {
    const key = `${c.suit}_${c.rank}`;
    rankCounts[key] = (rankCounts[key] || 0) + 1;
  });
  const pairCount    = Object.values(rankCounts).filter(n => n >= 2).length;
  // Count tractors (simplified: consecutive pairs)
  const tractorPairCount = countTractorPairs(suited, trumpSuit, trumpRank);

  return { total, pairCount, tractorPairCount };
}

function countTractorPairs(cards, trumpSuit, trumpRank) {
  if (cards.length < 4) return 0;
  // Group into pairs, then check for consecutive
  const pairValues = [];
  const seen = {};
  cards.forEach(c => {
    const key = `${c.suit}_${c.rank}`;
    if (!seen[key]) {
      seen[key] = 0;
    }
    seen[key]++;
    if (seen[key] === 2) {
      pairValues.push(tractorValue(c, trumpSuit, trumpRank));
    }
  });
  pairValues.sort((a, b) => a - b);

  let maxConsecutive = 0;
  let current = 1;
  for (let i = 1; i < pairValues.length; i++) {
    if (pairValues[i] - pairValues[i - 1] === 1) {
      current++;
      maxConsecutive = Math.max(maxConsecutive, current);
    } else {
      current = 1;
    }
  }
  return maxConsecutive;
}

/**
 * Determine the highest-beating entry among all trick plays for a given lead.
 * Returns the winning entry.
 */
function resolveTrickWinner(trick, trumpSuit, trumpRank) {
  const leadEntry   = trick[0];
  const leadCards   = leadEntry.cards;
  const leadShape   = leadEntry.shape;
  const leadEffSuit = leadCards[0].effectiveSuit(trumpSuit, trumpRank);

  let winner = leadEntry;

  for (let i = 1; i < trick.length; i++) {
    const entry = trick[i];
    if (beatsTrickEntry(entry, winner, leadShape, leadEffSuit, trumpSuit, trumpRank)) {
      winner = entry;
    }
  }
  return winner;
}

/**
 * Does `challenger` beat `current` given the lead shape and context?
 */
function beatsTrickEntry(challenger, current, leadShape, leadEffSuit, trumpSuit, trumpRank) {
  const chalEffSuit = challenger.cards[0].effectiveSuit(trumpSuit, trumpRank);
  const curEffSuit  = current.cards[0].effectiveSuit(trumpSuit, trumpRank);
  const leadIsTrump = leadEffSuit === 'TRUMP';

  // To beat: must match lead shape AND (same suit as lead OR trump beats non-trump lead)
  const chalMatchesSuit = chalEffSuit === leadEffSuit || (chalEffSuit === 'TRUMP' && !leadIsTrump);
  const curMatchesSuit  = curEffSuit  === leadEffSuit || (curEffSuit  === 'TRUMP' && !leadIsTrump);

  if (!chalMatchesSuit) return false; // Challenger can't beat anything if wrong suit
  if (!curMatchesSuit)  return true;  // Current doesn't match, challenger (which does) wins

  // Must match the lead shape to beat current winner
  if (challenger.shape !== leadShape) return false;
  if (current.shape !== leadShape)    return true; // Challenger matches shape, current doesn't

  // Both match shape and suit — compare best card
  return bestCard(challenger.cards, trumpSuit, trumpRank)
    .beats(bestCard(current.cards, trumpSuit, trumpRank), leadEffSuit === 'TRUMP' ? trumpSuit : leadEffSuit, trumpSuit, trumpRank);
}

/** The highest card in an array, used for combo comparison. */
function bestCard(cards, trumpSuit, trumpRank) {
  return cards.reduce((best, c) =>
    c.beats(best, best.suit === trumpSuit ? trumpSuit : best.suit, trumpSuit, trumpRank) ? c : best
  );
}

// ─────────────────────────────────────────────
// GameState
// ─────────────────────────────────────────────

/**
 * GameState manages all core game logic for one room.
 *
 * Scoring rules:
 *  - Only the attacking team accumulates points.
 *  - Defending team wins by blocking — never by scoring.
 *  - Attackers need ≥ LEVEL_THRESHOLDS[trumpRank] to win the round.
 *  - Kitty goes to whoever wins the last trick; if attackers win, they get
 *    kitty points × (2 × cards in winning play). If defenders win, no kitty bonus.
 *
 * Level progression:
 *  - Each team has a level ('2'..'A'). Starting level: '2'.
 *  - Winning a round advances the winning team's level by 1–3 based on margin.
 *  - The trump rank for the next round = attacking team's current level.
 *  - First team to level past 'A' wins the match.
 *
 * Multi-card plays: singles, pairs, tractors, throws.
 */
class GameState {
  constructor(roomId) {
    this.roomId         = roomId;
    this.devMode        = false;
    this.phase          = GAME_PHASES.WAITING;
    this.players        = [];
    this.hands          = {};           // { socketId: Card[] }
    this.kitty          = [];           // Card[]
    this.trumpSuit      = null;
    this.trumpRank      = STARTING_LEVEL;
    this.trumpDeclarer  = null;
    this.trumpCallStrength = 0;         // 0=none, 1=single, 2=pair (for bidding mechanic)
    this.attackingTeam  = 0;
    this.teamLevels     = { 0: STARTING_LEVEL, 1: STARTING_LEVEL };
    this.currentTrick   = [];           // [{ socketId, cards: Card[], shape }]
    this.tricks         = [];
    this.leadSeat       = 0;
    this.currentSeat    = 0;
    this.scores         = { 0: 0, 1: 0 }; // Only attackingTeam entry is ever non-zero
    this.roundScores    = { 0: 0, 1: 0 }; // Kept for compat; semantics = round-wins
    this.attackerPointPile = [];        // Point cards captured by attackers this round
    this.winner         = null;
    this.trumpTimer     = null;
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

    this.phase             = GAME_PHASES.TRUMP_SELECTION;
    this.trumpSuit         = null;
    this.trumpDeclarer     = null;
    this.trumpCallStrength = 0;
    this.currentTrick      = [];
    this.tricks            = [];
    this.scores            = { 0: 0, 1: 0 };
    this.attackerPointPile = [];

    return { success: true };
  }

  // ─────────────────────────────────────────────
  // Trump calling (dynamic bidding mechanic)
  // ─────────────────────────────────────────────

  /**
   * A player calls trump by revealing 1 card (single) or 2 identical cards (pair)
   * of the current trump rank, or a small+big joker pair (overrides everything).
   *
   * Call strengths: 0 = none, 1 = single rank card, 2 = pair of rank cards, 3 = joker pair
   * Higher strength overrides lower. Same strength: first caller wins (no override).
   */
  callTrump(socketId, cardIds) {
    if (this.phase !== GAME_PHASES.TRUMP_SELECTION) return { error: 'Not in trump selection phase' };

    const hand = this.hands[socketId];
    if (!hand) return { error: 'Player not found' };

    // Validate all cards are in the caller's hand
    const cards = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean);
    if (cards.length !== cardIds.length) return { error: 'One or more cards not in hand' };

    let strength = 0;
    let suit     = null;

    if (cards.length === 1) {
      const [c] = cards;
      if (c.rank === this.trumpRank && !c.isJoker) {
        strength = 1;
        suit     = c.suit;
      } else {
        return { error: `Must reveal a ${this.trumpRank} to call trump` };
      }
    } else if (cards.length === 2) {
      const [a, b] = cards;
      // Joker pair override
      if (a.isSmallJoker && b.isBigJoker || a.isBigJoker && b.isSmallJoker) {
        strength = 3;
        suit     = this.trumpSuit; // Keep current suit (joker pair just confirms it, or defaults)
        if (!suit) suit = this.players[0] ? this.hands[this.players[0].socketId]?.[0]?.suit ?? 'S' : 'S';
      } else if (a.rank === this.trumpRank && b.rank === this.trumpRank && a.suit === b.suit && !a.isJoker) {
        // Pair of same-suit trump-rank cards
        strength = 2;
        suit     = a.suit;
      } else {
        return { error: 'Must reveal a pair of identical trump-rank cards, or a small+big joker pair' };
      }
    } else {
      return { error: 'Call with 1 card (single) or 2 cards (pair / joker pair)' };
    }

    if (strength <= this.trumpCallStrength) {
      return { error: `Call strength ${strength} does not override current call (strength ${this.trumpCallStrength})` };
    }

    this.trumpSuit         = suit;
    this.trumpDeclarer     = socketId;
    this.trumpCallStrength = strength;

    const caller = this.getPlayer(socketId);
    this.attackingTeam = caller.teamIndex;

    return {
      success:      true,
      trumpSuit:    this.trumpSuit,
      trumpRank:    this.trumpRank,
      strength,
      declarer:     caller.name,
      callerCardIds: cardIds,
    };
  }

  /**
   * Called when trump selection timer expires and no one declared.
   * Uses the first kitty card's suit, or falls back to seat 0's first card.
   */
  autoSelectTrump() {
    if (this.trumpSuit) return;

    const nonJokerKitty = this.kitty.find(c => !c.isJoker);
    if (nonJokerKitty) {
      this.trumpSuit     = nonJokerKitty.suit;
      this.trumpDeclarer = null;
      // Default attacking team stays as-is (team 0)
    } else {
      const firstPlayer = this.players[0];
      const hand        = this.hands[firstPlayer.socketId];
      const nonJoker    = (hand || []).find(c => !c.isJoker);
      this.trumpSuit     = (nonJoker || hand?.[0])?.suit ?? 'S';
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

  giveKittyToDeclarer() {
    if (!this.trumpDeclarer) return { error: 'No trump declarer' };
    const hand = this.hands[this.trumpDeclarer];
    this.kitty.forEach(c => hand.push(c));
    return { success: true, kittyCards: this.kitty.map(c => c.toJSON()) };
  }

  discardToKitty(socketId, cardIds) {
    if (socketId !== this.trumpDeclarer) return { error: 'Only the trump declarer can discard' };
    if (cardIds.length !== KITTY_SIZE) return { error: `Must discard exactly ${KITTY_SIZE} cards` };

    const hand      = this.hands[socketId];
    const discarded = [];

    for (const cardId of cardIds) {
      const idx = hand.findIndex(c => c.id === cardId);
      if (idx === -1) return { error: `Card ${cardId} not in hand` };
      discarded.push(hand.splice(idx, 1)[0]);
    }

    this.kitty = discarded;

    const declarer      = this.getPlayer(socketId);
    this.leadSeat       = declarer.seatIndex;
    this.currentSeat    = declarer.seatIndex;
    this.phase          = GAME_PHASES.PLAYING;

    return { success: true };
  }

  // ─────────────────────────────────────────────
  // Trick-taking — multi-card plays
  // ─────────────────────────────────────────────

  get currentPlayerSocketId() {
    const player = this.getPlayerBySeat(this.currentSeat);
    return player ? player.socketId : null;
  }

  /**
   * Play one or more cards. Validates turn, follow-suit rules, and shape legality.
   * cardIds — string[] (1 for single, 2 for pair, 4+ for tractor, etc.)
   */
  playCards(socketId, cardIds) {
    if (this.phase !== GAME_PHASES.PLAYING) return { error: 'Game is not in playing phase' };
    if (socketId !== this.currentPlayerSocketId) return { error: "It's not your turn" };
    if (!cardIds || cardIds.length === 0) return { error: 'Must play at least one card' };

    const hand = this.hands[socketId];
    const cards = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean);
    if (cards.length !== cardIds.length) return { error: 'One or more cards not in your hand' };

    const shape = classifyPlay(cards, this.trumpSuit, this.trumpRank);

    // ── Lead play: validate legal combo size ──
    if (this.currentTrick.length === 0) {
      const err = this._validateLead(cards, shape);
      if (err) return err;
    } else {
      // ── Following play: must match lead size and follow suit ──
      const leadEntry = this.currentTrick[0];
      if (cards.length !== leadEntry.cards.length) {
        return { error: `Must play exactly ${leadEntry.cards.length} card(s) to match the lead` };
      }
      const err = this._validateFollow(socketId, cards, shape, leadEntry);
      if (err) return err;
    }

    // Remove played cards from hand
    cardIds.forEach(id => {
      const idx = hand.findIndex(c => c.id === id);
      if (idx !== -1) hand.splice(idx, 1);
    });

    this.currentTrick.push({ socketId, cards, shape });

    if (this.currentTrick.length < PLAYERS_PER_ROOM) {
      this._advanceSeat();
      return { success: true, trickComplete: false };
    }

    return this._resolveTrick();
  }

  /** Validate a lead play — throws / multi-card combos must be from the same effective suit. */
  _validateLead(cards, shape) {
    const effSuits = new Set(cards.map(c => c.effectiveSuit(this.trumpSuit, this.trumpRank)));
    if (effSuits.size > 1) {
      // Throw: allowed, but all component combos must be in the same effective suit
      // (simplified: we allow any lead, the throw logic is handled at resolution)
    }
    return null;
  }

  /**
   * Validate a following play.
   * Rules:
   *   - If lead is trump, must play trump if you have it.
   *   - If lead is a non-trump suit, must follow that suit if you have it.
   *   - For multi-card leads: must match the best shape you can form in the lead suit.
   */
  _validateFollow(socketId, playedCards, shape, leadEntry) {
    const leadEffSuit = leadEntry.cards[0].effectiveSuit(this.trumpSuit, this.trumpRank);
    const hand        = this.hands[socketId];
    const info        = handShapeInfo(hand, leadEffSuit, this.trumpSuit, this.trumpRank);
    const n           = leadEntry.cards.length;

    // Check played cards are all in the same effective suit OR all in a different suit
    const playedEffSuits = new Set(playedCards.map(c => c.effectiveSuit(this.trumpSuit, this.trumpRank)));

    const playedInLeadSuit = playedCards.filter(c =>
      c.effectiveSuit(this.trumpSuit, this.trumpRank) === leadEffSuit
    ).length;

    // Player must contribute as many lead-suit cards as possible (up to n)
    const maxCanPlay = Math.min(info.total, n);
    if (playedInLeadSuit < maxCanPlay) {
      return { error: `Must play as many ${leadEffSuit === 'TRUMP' ? 'trump' : leadEffSuit} cards as possible` };
    }

    // If player has enough lead-suit cards to fill the whole play (info.total >= n),
    // additionally check shape requirements: must match the best shape available.
    if (info.total >= n) {
      if (leadEntry.shape === 'pair' && info.pairCount > 0 && shape !== 'pair') {
        return { error: 'Must play a pair when you have one in the lead suit' };
      }
      if (leadEntry.shape === 'tractor' && info.tractorPairCount * 2 >= n && shape !== 'tractor') {
        return { error: 'Must play a tractor when you can form one in the lead suit' };
      }
    }

    return null;
  }

  _advanceSeat() {
    this.currentSeat = (this.currentSeat + 1) % PLAYERS_PER_ROOM;
  }

  _resolveTrick() {
    const winnerEntry  = resolveTrickWinner(this.currentTrick, this.trumpSuit, this.trumpRank);
    const winnerPlayer = this.getPlayer(winnerEntry.socketId);
    const isLastTrick  = this.players.every(p => this.hands[p.socketId].length === 0);

    // Raw point cards in the trick
    const trickPoints = this.currentTrick.reduce(
      (sum, e) => sum + e.cards.reduce((s, c) => s + c.points, 0), 0
    );

    // Only credit attacking team
    let pointsScored = 0;
    if (winnerPlayer.teamIndex === this.attackingTeam) {
      pointsScored = trickPoints;

      if (isLastTrick) {
        // Kitty multiplier: × (2 × number of cards in winning play)
        const winCardsCount = winnerEntry.cards.length;
        const multiplier    = 2 * winCardsCount;
        const kittyPoints   = this.kitty.reduce((s, c) => s + c.points, 0);
        pointsScored        += kittyPoints * multiplier;
      }

      this.scores[this.attackingTeam] += pointsScored;

      // Add point cards to the attacker's visible pile
      this.currentTrick.forEach(e => {
        e.cards.forEach(c => {
          if (c.points > 0) this.attackerPointPile.push(c);
        });
      });
    }

    const completedTrick = {
      cards:    this.currentTrick.map(e => ({
        socketId: e.socketId,
        cards:    e.cards.map(c => c.toJSON()),
        shape:    e.shape,
      })),
      winner:   winnerEntry.socketId,
      points:   pointsScored,
    };
    this.tricks.push(completedTrick);

    this.currentTrick = [];
    this.leadSeat     = winnerPlayer.seatIndex;
    this.currentSeat  = winnerPlayer.seatIndex;

    if (isLastTrick) {
      return { ...this._finishRound(), trickComplete: true, completedTrick };
    }

    return { success: true, trickComplete: true, completedTrick, winner: winnerPlayer.socketId };
  }

  // ─────────────────────────────────────────────
  // Scoring & level progression
  // ─────────────────────────────────────────────

  _finishRound() {
    this.phase = GAME_PHASES.SCORING;

    const attackingScore = this.scores[this.attackingTeam];
    const defendingTeam  = this.attackingTeam === 0 ? 1 : 0;
    const threshold      = LEVEL_THRESHOLDS[this.trumpRank];
    const attackingWon   = attackingScore >= threshold;

    // Level advancement — attacker margin determines how many levels they advance
    let levelsAdvanced = 0;
    let advancingTeam;

    if (attackingWon) {
      advancingTeam  = this.attackingTeam;
      levelsAdvanced = attackingScore >= threshold + 80 ? 3
                     : attackingScore >= threshold + 40 ? 2
                     : 1;
    } else {
      advancingTeam  = defendingTeam;
      const shortfall = threshold - attackingScore;
      levelsAdvanced  = attackingScore === 0 ? 3
                      : shortfall > 40       ? 2
                      : 1;
    }

    const newLevel = advanceLevel(this.teamLevels[advancingTeam], levelsAdvanced);
    let gameOver   = false;

    if (newLevel === null) {
      // Team levelled past A — they win the match
      gameOver    = true;
      this.phase  = GAME_PHASES.GAME_OVER;
      this.winner = advancingTeam;
    } else {
      this.teamLevels[advancingTeam] = newLevel;
    }

    // Accumulate round scores (legacy, for UI compat)
    if (attackingWon) {
      this.roundScores[this.attackingTeam] += 1;
    } else {
      this.roundScores[defendingTeam] += 1;
    }

    return {
      success:        true,
      roundOver:      true,
      gameOver,
      attackingTeam:  this.attackingTeam,
      attackingWon,
      threshold,
      levelsAdvanced,
      advancingTeam,
      teamLevels:     { ...this.teamLevels },
      scores:         this.scores,
      roundScores:    this.roundScores,
      winner:         this.winner,
    };
  }

  // ─────────────────────────────────────────────
  // Serialisation
  // ─────────────────────────────────────────────

  toFullJSON() {
    return {
      roomId:            this.roomId,
      phase:             this.phase,
      players:           this.players,
      hands:             Object.fromEntries(
        Object.entries(this.hands).map(([id, cards]) => [id, cards.map(c => c.toJSON())])
      ),
      trumpSuit:         this.trumpSuit,
      trumpRank:         this.trumpRank,
      trumpDeclarer:     this.trumpDeclarer,
      trumpCallStrength: this.trumpCallStrength,
      attackingTeam:     this.attackingTeam,
      teamLevels:        { ...this.teamLevels },
      currentTrick:      this.currentTrick.map(e => ({
        socketId: e.socketId,
        cards:    e.cards.map(c => c.toJSON()),
        shape:    e.shape,
      })),
      leadSeat:          this.leadSeat,
      currentSeat:       this.currentSeat,
      scores:            this.scores,
      roundScores:       this.roundScores,
      attackerPointPile: this.attackerPointPile.map(c => c.toJSON()),
      winner:            this.winner,
      roundNumber:       this.roundNumber,
      threshold:         LEVEL_THRESHOLDS[this.trumpRank],
    };
  }

  toPlayerJSON(socketId) {
    const full = this.toFullJSON();
    full.myHand     = (this.hands[socketId] || []).map(c => c.toJSON());
    full.handCounts = Object.fromEntries(
      Object.entries(this.hands).map(([id, cards]) => [id, cards.length])
    );
    delete full.hands;
    return full;
  }
}

module.exports = GameState;
