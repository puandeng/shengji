const { SUITS, RANKS, POINT_VALUES, RANK_ORDER, SUIT_SYMBOLS, JOKER_RANKS } = require('./constants');

class Card {
  /**
   * @param {string} suit      - One of SUITS values ('S','H','D','C') or 'JOKER'
   * @param {string} rank      - One of RANKS values ('2'..'A') or JOKER_RANKS value ('SJ','BJ')
   * @param {number} deckIndex - Which deck this card came from (0 or 1) — used for unique IDs
   */
  constructor(suit, rank, deckIndex = 0) {
    this.suit         = suit;
    this.rank         = rank;
    this.deckIndex    = deckIndex;
    this.id           = `${suit}_${rank}_${deckIndex}`;
    this.points       = POINT_VALUES[rank] || 0;
    this.rankValue    = RANK_ORDER[rank] || 0;
    this.isJoker      = suit === 'JOKER';
    this.isSmallJoker = rank === JOKER_RANKS.SMALL;
    this.isBigJoker   = rank === JOKER_RANKS.BIG;
  }

  /**
   * Whether this card counts as trump.
   * Jokers, trump-suit cards, and trump-rank cards (in any suit) are all trump.
   */
  isTrump(trumpSuit, trumpRank) {
    return this.isJoker || this.suit === trumpSuit || this.rank === trumpRank;
  }

  /**
   * Returns the "effective suit" for follow-suit purposes.
   * All trump cards (jokers, trump-suit, trump-rank) share the suit 'TRUMP'.
   */
  effectiveSuit(trumpSuit, trumpRank) {
    return this.isTrump(trumpSuit, trumpRank) ? 'TRUMP' : this.suit;
  }

  /**
   * Numeric value for ordering within trump.
   * Full order (low → high):
   *   regular trump cards by rank < off-suit trump-rank < in-suit trump-rank < small joker < big joker
   */
  trumpOrder(trumpSuit, trumpRank) {
    if (this.isBigJoker)  return 1000;
    if (this.isSmallJoker) return 999;
    if (this.suit === trumpSuit && this.rank === trumpRank) return 998; // In-suit trump-rank (highest non-joker trump)
    if (this.rank === trumpRank) return 997;                            // Off-suit trump-rank
    return this.rankValue;                                              // Regular trump card
  }

  /**
   * Whether this card beats another, given the lead suit and trump context.
   *
   * Full ordering: big joker > small joker > in-suit trump-rank > off-suit trump-rank
   *                > regular trump (by rank) > lead-suit non-trump (by rank) > off-suit non-trump
   */
  beats(other, leadSuit, trumpSuit, trumpRank) {
    const thisTrump  = this.isTrump(trumpSuit, trumpRank);
    const otherTrump = other.isTrump(trumpSuit, trumpRank);

    // Trump beats non-trump
    if (thisTrump && !otherTrump) return true;
    if (!thisTrump && otherTrump) return false;

    // Both trump: compare via trumpOrder
    if (thisTrump && otherTrump) {
      return this.trumpOrder(trumpSuit, trumpRank) > other.trumpOrder(trumpSuit, trumpRank);
    }

    // Neither trump: lead suit wins over off-suit; within same suit, higher rank wins
    const thisLead  = this.suit === leadSuit;
    const otherLead = other.suit === leadSuit;
    if (thisLead && !otherLead) return true;
    if (!thisLead && otherLead) return false;
    return this.rankValue > other.rankValue;
  }

  /** Compact display string, e.g. "A♠", "SJoker", "BJoker" */
  toString() {
    if (this.isSmallJoker) return 'SJoker';
    if (this.isBigJoker)   return 'BJoker';
    return `${this.rank}${SUIT_SYMBOLS[this.suit] || ''}`;
  }

  /** Plain object for serialisation (sending to client) */
  toJSON() {
    return {
      id:           this.id,
      suit:         this.suit,
      rank:         this.rank,
      deckIndex:    this.deckIndex,
      points:       this.points,
      rankValue:    this.rankValue,
      isJoker:      this.isJoker,
      isSmallJoker: this.isSmallJoker,
      isBigJoker:   this.isBigJoker,
    };
  }

  /** Reconstruct a Card from a plain JSON object */
  static fromJSON(obj) {
    return new Card(obj.suit, obj.rank, obj.deckIndex);
  }
}

module.exports = Card;
