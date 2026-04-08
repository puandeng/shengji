const { SUITS, RANKS, POINT_VALUES, RANK_ORDER, SUIT_SYMBOLS } = require('./constants');

class Card {
  /**
   * @param {string} suit  - One of SUITS values ('S','H','D','C')
   * @param {string} rank  - One of RANKS values ('2'..'A')
   * @param {number} deckIndex - Which deck this card came from (0 or 1) — used for unique IDs
   */
  constructor(suit, rank, deckIndex = 0) {
    this.suit      = suit;
    this.rank      = rank;
    this.deckIndex = deckIndex;
    this.id        = `${suit}${rank}_${deckIndex}`;
    this.points    = POINT_VALUES[rank] || 0;
    this.rankValue = RANK_ORDER[rank];
  }

  /** Whether this card is a trump card given a trump suit */
  isTrump(trumpSuit) {
    return this.suit === trumpSuit;
  }

  /** Whether this card beats another card, given lead suit and trump suit */
  beats(other, leadSuit, trumpSuit) {
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

  /** Compact display string, e.g. "A♠" */
  toString() {
    return `${this.rank}${SUIT_SYMBOLS[this.suit]}`;
  }

  /** Plain object for serialisation (sending to client) */
  toJSON() {
    return {
      id:        this.id,
      suit:      this.suit,
      rank:      this.rank,
      deckIndex: this.deckIndex,
      points:    this.points,
      rankValue: this.rankValue,
    };
  }

  /** Reconstruct a Card from a plain JSON object */
  static fromJSON(obj) {
    return new Card(obj.suit, obj.rank, obj.deckIndex);
  }
}

module.exports = Card;
