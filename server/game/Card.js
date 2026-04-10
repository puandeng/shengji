const { SUITS, RANKS, POINT_VALUES, RANK_ORDER, SUIT_SYMBOLS, JOKER_RANKS } = require('./constants');

class Card {
  /**
   * @param {string} suit      - One of SUITS values ('S','H','D','C') or 'JOKER'
   * @param {string} rank      - One of RANKS values ('2'..'A') or JOKER_RANKS value ('SJ','BJ')
   * @param {number} deckIndex - Which deck this card came from (0 or 1) — used for unique IDs
   */
  constructor(suit, rank, deckIndex = 0) {
    this.suit        = suit;
    this.rank        = rank;
    this.deckIndex   = deckIndex;
    this.id          = `${suit}_${rank}_${deckIndex}`;
    this.points      = POINT_VALUES[rank] || 0;
    this.rankValue   = RANK_ORDER[rank] || 0;
    this.isJoker     = suit === 'JOKER';
    this.isSmallJoker = rank === JOKER_RANKS.SMALL;
    this.isBigJoker   = rank === JOKER_RANKS.BIG;
  }

  /** Whether this card counts as trump. Jokers are always trump. */
  isTrump(trumpSuit) {
    return this.isJoker || this.suit === trumpSuit;
  }

  /**
   * Whether this card beats another card, given lead suit and trump suit.
   *
   * Full ordering (low → high):
   *   off-suit non-trump < lead-suit non-trump < trump non-joker < small joker < big joker
   */
  beats(other, leadSuit, trumpSuit) {
    // Big joker beats everything except another big joker (tie = false)
    if (this.isBigJoker)  return !other.isBigJoker;
    if (other.isBigJoker) return false;

    // Small joker beats everything below big joker
    if (this.isSmallJoker)  return !other.isSmallJoker;
    if (other.isSmallJoker) return false;

    const thisTrump  = this.isTrump(trumpSuit);
    const otherTrump = other.isTrump(trumpSuit);

    // Trump beats non-trump
    if (thisTrump && !otherTrump) return true;
    if (!thisTrump && otherTrump) return false;

    // Both trump: compare rank
    if (thisTrump && otherTrump) return this.rankValue > other.rankValue;

    // Neither trump: lead suit wins over off-suit
    const thisLead  = this.suit === leadSuit;
    const otherLead = other.suit === leadSuit;

    if (thisLead && !otherLead) return true;
    if (!thisLead && otherLead) return false;

    // Same suit: compare rank
    return this.rankValue > other.rankValue;
  }

  /** Compact display string, e.g. "A♠", "SJoker", "BJoker" */
  toString() {
    if (this.isSmallJoker) return 'SJoker';
    if (this.isBigJoker)   return 'BJoker';
    return `${this.rank}${SUIT_SYMBOLS[this.suit]}`;
  }

  /** Plain object for serialisation (sending to client) */
  toJSON() {
    return {
      id:          this.id,
      suit:        this.suit,
      rank:        this.rank,
      deckIndex:   this.deckIndex,
      points:      this.points,
      rankValue:   this.rankValue,
      isJoker:     this.isJoker,
      isSmallJoker: this.isSmallJoker,
      isBigJoker:  this.isBigJoker,
    };
  }

  /** Reconstruct a Card from a plain JSON object */
  static fromJSON(obj) {
    return new Card(obj.suit, obj.rank, obj.deckIndex);
  }
}

module.exports = Card;
