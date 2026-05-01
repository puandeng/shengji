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
 * Returns 'single' | 'pair' | 'tractor' | 'throw' | 'invalid'
 *
 * Valid combos (all must share the same effective suit):
 *   single  — 1 card
 *   pair    — 2 identical cards (same suit + rank)
 *   tractor — 2+ consecutive pairs (same effective suit, consecutive tractor values)
 *   throw   — 1 single + 1 pair (3 cards, same effective suit) — speculative lead
 *   invalid — anything that doesn't fit the above
 */
function classifyPlay(cards, trumpSuit, trumpRank) {
  if (cards.length === 1) return 'single';

  // All cards must share the same effective suit
  const effSuits = new Set(cards.map(c => c.effectiveSuit(trumpSuit, trumpRank)));
  if (effSuits.size > 1) return 'invalid';

  if (cards.length === 2) {
    return (cards[0].suit === cards[1].suit && cards[0].rank === cards[1].rank) ? 'pair' : 'invalid';
  }

  // 3 cards: throw check (1 single + 1 pair, same effective suit)
  if (cards.length === 3) {
    if (isThrow(cards, trumpSuit, trumpRank)) return 'throw';
    return 'invalid';
  }

  // 4+ cards: tractor check (consecutive pairs in same effective suit)
  if (cards.length >= 4 && cards.length % 2 === 0 && isTractor(cards, trumpSuit, trumpRank)) {
    return 'tractor';
  }

  return 'invalid';
}

/**
 * Returns true if `cards` (length === 3) form a valid throw: 1 single + 1 pair, same effective suit.
 */
function isThrow(cards, trumpSuit, trumpRank) {
  if (cards.length !== 3) return false;

  // Group by suit+rank identity
  const groups = {};
  cards.forEach(c => {
    const key = `${c.suit}_${c.rank}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  });

  const counts = Object.values(groups).map(g => g.length).sort((a, b) => a - b);
  // Must be exactly [1, 2] — one single and one pair
  return counts.length === 2 && counts[0] === 1 && counts[1] === 2;
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
 * Numeric value used for tractor ordering — consecutive values enable tractors.
 *
 * Trump ordering (low → high):
 *   regular trump-suit cards by rank (skipping trump rank) → off-suit trump-rank
 *   → in-suit trump-rank → small joker → big joker
 *
 * Trump rank is adjacent to both the highest regular trump card (Ace or below)
 * and small jokers, enabling tractors like:
 *   A,A + 2,2 (if 2 is trump rank)   and   2,2 + SJ,SJ   and   SJ,SJ + BJ,BJ
 *
 * For non-trump cards: normal rank value (used for non-trump suit tractors).
 */
function tractorValue(card, trumpSuit, trumpRank) {
  if (!card.isTrump(trumpSuit, trumpRank)) return card.rankValue;

  const RANK_ORDER = require('./constants').RANK_ORDER;
  const trumpRankVal = (trumpRank !== null) ? (RANK_ORDER[trumpRank] || 0) : 0;

  if (card.isBigJoker)  return 1003;
  if (card.isSmallJoker) return 1002;
  if (card.suit === trumpSuit && card.rank === trumpRank) return 1001; // in-suit trump-rank
  if (card.rank === trumpRank) return 1000;                            // off-suit trump-rank

  // Regular trump-suit card — build a consecutive sequence skipping the trump rank.
  // Cards below trump rank keep their rank value; cards above shift down by 1.
  // Then offset so that the highest regular card (A or the card just below trump rank)
  // is exactly 999 (one below off-suit trump-rank at 1000).
  const rv = card.rankValue;
  const adjustedRv = rv < trumpRankVal ? rv : rv - 1; // Remove gap left by trump rank
  // The max possible adjustedRv is 13 (A=14 shifted to 13, or K=13 if trump is A)
  // We want max adjustedRv to map to 999
  const maxAdjusted = 14 - 1; // A(14) - 1 since we always skip one rank
  return 999 - maxAdjusted + adjustedRv;
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
 *
 * For throws: challenger must beat both the single and pair components of the current winner.
 * A throw can be beaten by a larger single or pair (either component being higher counts).
 */
function beatsTrickEntry(challenger, current, leadShape, leadEffSuit, trumpSuit, trumpRank) {
  const chalEffSuit = challenger.cards[0].effectiveSuit(trumpSuit, trumpRank);
  const curEffSuit  = current.cards[0].effectiveSuit(trumpSuit, trumpRank);
  const leadIsTrump = leadEffSuit === 'TRUMP';

  // To beat: must be in the lead suit OR trump over non-trump lead
  const chalMatchesSuit = chalEffSuit === leadEffSuit || (chalEffSuit === 'TRUMP' && !leadIsTrump);
  const curMatchesSuit  = curEffSuit  === leadEffSuit || (curEffSuit  === 'TRUMP' && !leadIsTrump);

  if (!chalMatchesSuit) return false;
  if (!curMatchesSuit)  return true;

  // For throws: compare the pair components, then single components
  if (leadShape === 'throw') {
    const chalComps = splitThrowComponents(challenger.cards, trumpSuit, trumpRank);
    const curComps  = splitThrowComponents(current.cards, trumpSuit, trumpRank);
    if (!chalComps || !curComps) return false;

    const leadSuitForComp = leadEffSuit === 'TRUMP' ? trumpSuit : leadEffSuit;
    const pairBeats   = chalComps.pairCard.beats(curComps.pairCard, leadSuitForComp, trumpSuit, trumpRank);
    const singleBeats = chalComps.singleCard.beats(curComps.singleCard, leadSuitForComp, trumpSuit, trumpRank);
    // Must beat both components
    return pairBeats && singleBeats;
  }

  // Must match the lead shape to beat current winner
  if (challenger.shape !== leadShape) return false;
  if (current.shape !== leadShape)    return true;

  // Both match shape and suit — compare best card
  return bestCard(challenger.cards, trumpSuit, trumpRank)
    .beats(bestCard(current.cards, trumpSuit, trumpRank), leadEffSuit === 'TRUMP' ? trumpSuit : leadEffSuit, trumpSuit, trumpRank);
}

/**
 * Split a 3-card throw into its single and pair components.
 * Returns { singleCard, pairCard } where pairCard is one of the pair cards (for comparison).
 */
function splitThrowComponents(cards, trumpSuit, trumpRank) {
  if (cards.length !== 3) return null;

  const groups = {};
  cards.forEach(c => {
    const key = `${c.suit}_${c.rank}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  });

  let singleCard = null;
  let pairCard = null;
  for (const key in groups) {
    if (groups[key].length === 1) singleCard = groups[key][0];
    if (groups[key].length === 2) pairCard = groups[key][0];
  }

  // If cards are all the same rank (3 of a kind), treat first as pair, last as single
  if (!singleCard || !pairCard) {
    singleCard = cards[0];
    pairCard = cards[1];
  }

  return { singleCard, pairCard };
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
    this.trumpPasses    = new Set();      // socketIds that have passed on trump calling
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
    this.trumpPasses       = new Set();
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
   * of the current trump rank, or a pair of same-type jokers (overrides everything).
   *
   * Call strengths: 0 = none, 1 = single rank card, 2 = pair of rank cards, 3 = same-joker pair
   * A joker pair must be two small jokers OR two big jokers — not a mixed small+big pair,
   * and single jokers are not allowed. When a joker pair wins, there is NO trump suit for
   * the round; only trump-rank cards and jokers are trump.
   * Higher strength overrides lower. Same strength: first caller wins (no override).
   */
  callTrump(socketId, cardIds) {
    if (this.phase !== GAME_PHASES.TRUMP_SELECTION) return { error: 'Not in trump selection phase' };

    const hand = this.hands[socketId];
    if (!hand) return { error: 'Player not found' };

    // Validate all cards are in the caller's hand
    const cards = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean);
    if (cards.length !== cardIds.length) return { error: 'One or more cards not in hand' };

    let strength      = 0;
    let suit          = null;
    let noTrumpSuit   = false;

    if (cards.length === 1) {
      const [c] = cards;
      if (c.isJoker) {
        return { error: 'A single joker cannot call trump — jokers must be paired (two small or two big)' };
      }
      if (c.rank === this.trumpRank) {
        strength = 1;
        suit     = c.suit;
      } else {
        return { error: `Must reveal a ${this.trumpRank} to call trump` };
      }
    } else if (cards.length === 2) {
      const [a, b] = cards;
      // Same-type joker pair: two small jokers OR two big jokers
      if (a.isJoker && b.isJoker) {
        const bothSmall = a.isSmallJoker && b.isSmallJoker;
        const bothBig   = a.isBigJoker   && b.isBigJoker;
        if (!bothSmall && !bothBig) {
          return { error: 'Joker pair must be two small jokers or two big jokers — mixed pairs are not allowed' };
        }
        strength    = 3;
        suit        = null;   // No trump suit — only trump-rank cards and jokers are trump
        noTrumpSuit = true;
      } else if (a.rank === this.trumpRank && b.rank === this.trumpRank && a.suit === b.suit && !a.isJoker) {
        // Pair of same-suit trump-rank cards
        strength = 2;
        suit     = a.suit;
      } else {
        return { error: 'Must reveal a pair of identical trump-rank cards, or a same-type joker pair' };
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
   * A player passes on calling trump. Returns whether all players have now passed.
   */
  passTrump(socketId) {
    if (this.phase !== GAME_PHASES.TRUMP_SELECTION) return { error: 'Not in trump selection phase' };
    const player = this.getPlayer(socketId);
    if (!player) return { error: 'Player not found' };
    this.trumpPasses.add(socketId);
    const allPassed = this.players.every(p => this.trumpPasses.has(p.socketId));
    return { success: true, allPassed };
  }

  /**
   * Called when trump selection timer expires and no one declared.
   * Uses the first kitty card's suit, or falls back to seat 0's first card.
   */
  autoSelectTrump() {
    // Skip if any declaration was already made (including joker-pair "no trump suit" calls)
    if (this.trumpCallStrength > 0) return;
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
    if (this.trumpCallStrength === 0) this.autoSelectTrump();
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

  /** Validate a lead play — all combos must be a recognized shape from the same effective suit. */
  _validateLead(cards, shape) {
    if (shape === 'invalid') {
      return { error: 'Invalid combo — cards must form a single, pair, tractor (consecutive pairs), or throw (single + pair), all in the same suit' };
    }
    return null;
  }

  /**
   * Validate a following play.
   * Rules:
   *   - Follower must play the same total number of cards as the lead.
   *   - Must contribute as many lead-suit cards as possible (up to n).
   *   - If follower has enough lead-suit cards, must match the lead's sub-shapes
   *     as closely as possible (e.g., if lead is a pair, play a pair if you have one).
   *   - For throws (single+pair): must play a pair in lead suit if you have one,
   *     plus fill remaining with lead-suit cards; if not enough lead-suit, fill with anything.
   */
  _validateFollow(socketId, playedCards, shape, leadEntry) {
    const leadEffSuit = leadEntry.cards[0].effectiveSuit(this.trumpSuit, this.trumpRank);
    const hand        = this.hands[socketId];
    const info        = handShapeInfo(hand, leadEffSuit, this.trumpSuit, this.trumpRank);
    const n           = leadEntry.cards.length;

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
      // For throws: must include a pair if you have one in the lead suit
      if (leadEntry.shape === 'throw' && info.pairCount > 0) {
        // Check that played cards include at least one pair in lead suit
        const leadSuitPlayed = playedCards.filter(c =>
          c.effectiveSuit(this.trumpSuit, this.trumpRank) === leadEffSuit
        );
        const pairGroups = {};
        leadSuitPlayed.forEach(c => {
          const key = `${c.suit}_${c.rank}`;
          pairGroups[key] = (pairGroups[key] || 0) + 1;
        });
        const hasPair = Object.values(pairGroups).some(count => count >= 2);
        if (!hasPair) {
          return { error: 'Must play a pair in the lead suit when you have one' };
        }
      }
    }

    return null;
  }

  _advanceSeat() {
    this.currentSeat = (this.currentSeat + 1) % PLAYERS_PER_ROOM;
  }

  _resolveTrick() {
    const leadEntry    = this.currentTrick[0];
    const leadPlayer   = this.getPlayer(leadEntry.socketId);
    const winnerEntry  = resolveTrickWinner(this.currentTrick, this.trumpSuit, this.trumpRank);
    const winnerPlayer = this.getPlayer(winnerEntry.socketId);
    const isLastTrick  = this.players.every(p => this.hands[p.socketId].length === 0);

    // Throw penalty: if leader played a throw and an opponent beat it, penalize the leader's team
    let throwPenalty = 0;
    if (leadEntry.shape === 'throw' && winnerEntry.socketId !== leadEntry.socketId) {
      // Check if winner is on the opposing team
      if (winnerPlayer.teamIndex !== leadPlayer.teamIndex) {
        // Leader's team is penalized 30 points
        if (leadPlayer.teamIndex === this.attackingTeam) {
          // Attacker led the throw and got beaten → attackers lose 30
          throwPenalty = -30;
        } else {
          // Defender led the throw and got beaten → attackers gain 30
          throwPenalty = 30;
        }
      }
    }

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

    // Apply throw penalty
    if (throwPenalty !== 0) {
      this.scores[this.attackingTeam] = Math.max(0, this.scores[this.attackingTeam] + throwPenalty);
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
      trumpPassCount:    this.trumpPasses.size,
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
