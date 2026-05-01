const Card = require('../Card');

describe('Card', () => {
  describe('constructor', () => {
    it('creates a regular card with correct properties', () => {
      const card = new Card('S', 'A', 0);
      expect(card.suit).toBe('S');
      expect(card.rank).toBe('A');
      expect(card.id).toBe('S_A_0');
      expect(card.points).toBe(0);
      expect(card.rankValue).toBe(14);
      expect(card.isJoker).toBe(false);
    });

    it('creates a point card with correct points', () => {
      expect(new Card('H', '5').points).toBe(5);
      expect(new Card('D', '10').points).toBe(10);
      expect(new Card('C', 'K').points).toBe(10);
    });

    it('creates a small joker', () => {
      const card = new Card('JOKER', 'SJ', 0);
      expect(card.isJoker).toBe(true);
      expect(card.isSmallJoker).toBe(true);
      expect(card.isBigJoker).toBe(false);
    });

    it('creates a big joker', () => {
      const card = new Card('JOKER', 'BJ', 0);
      expect(card.isJoker).toBe(true);
      expect(card.isBigJoker).toBe(true);
      expect(card.isSmallJoker).toBe(false);
    });
  });

  describe('isTrump', () => {
    it('jokers are always trump', () => {
      const sj = new Card('JOKER', 'SJ');
      const bj = new Card('JOKER', 'BJ');
      expect(sj.isTrump('S', '2')).toBe(true);
      expect(bj.isTrump('H', 'A')).toBe(true);
    });

    it('trump suit cards are trump', () => {
      const card = new Card('S', '5');
      expect(card.isTrump('S', '2')).toBe(true);
      expect(card.isTrump('H', '2')).toBe(false);
    });

    it('trump rank cards in any suit are trump', () => {
      const card = new Card('H', '2');
      expect(card.isTrump('S', '2')).toBe(true); // Off-suit trump-rank
    });
  });

  describe('effectiveSuit', () => {
    it('returns TRUMP for trump cards', () => {
      const card = new Card('S', '5');
      expect(card.effectiveSuit('S', '2')).toBe('TRUMP');
    });

    it('returns actual suit for non-trump cards', () => {
      const card = new Card('H', '5');
      expect(card.effectiveSuit('S', '2')).toBe('H');
    });

    it('returns TRUMP for off-suit trump-rank cards', () => {
      const card = new Card('H', '2');
      expect(card.effectiveSuit('S', '2')).toBe('TRUMP');
    });
  });

  describe('trumpOrder', () => {
    it('big joker is highest', () => {
      const bj = new Card('JOKER', 'BJ');
      expect(bj.trumpOrder('S', '2')).toBe(1000);
    });

    it('small joker is second highest', () => {
      const sj = new Card('JOKER', 'SJ');
      expect(sj.trumpOrder('S', '2')).toBe(999);
    });

    it('in-suit trump-rank beats off-suit trump-rank', () => {
      const inSuit = new Card('S', '2');
      const offSuit = new Card('H', '2');
      expect(inSuit.trumpOrder('S', '2')).toBeGreaterThan(offSuit.trumpOrder('S', '2'));
    });

    it('regular trump cards ordered by rank', () => {
      const low = new Card('S', '3');
      const high = new Card('S', 'A');
      expect(high.trumpOrder('S', '2')).toBeGreaterThan(low.trumpOrder('S', '2'));
    });
  });

  describe('beats', () => {
    const trumpSuit = 'S';
    const trumpRank = '2';

    it('trump beats non-trump', () => {
      const trump = new Card('S', '3');
      const nonTrump = new Card('H', 'A');
      expect(trump.beats(nonTrump, 'H', trumpSuit, trumpRank)).toBe(true);
      expect(nonTrump.beats(trump, 'H', trumpSuit, trumpRank)).toBe(false);
    });

    it('big joker beats small joker', () => {
      const bj = new Card('JOKER', 'BJ');
      const sj = new Card('JOKER', 'SJ');
      expect(bj.beats(sj, 'S', trumpSuit, trumpRank)).toBe(true);
      expect(sj.beats(bj, 'S', trumpSuit, trumpRank)).toBe(false);
    });

    it('higher trump beats lower trump', () => {
      const highTrump = new Card('S', 'A');
      const lowTrump = new Card('S', '3');
      expect(highTrump.beats(lowTrump, 'S', trumpSuit, trumpRank)).toBe(true);
    });

    it('lead suit beats off-suit (both non-trump)', () => {
      const lead = new Card('H', '3');
      const off = new Card('D', 'A');
      expect(lead.beats(off, 'H', trumpSuit, trumpRank)).toBe(true);
      expect(off.beats(lead, 'H', trumpSuit, trumpRank)).toBe(false);
    });

    it('higher rank wins within same non-trump suit', () => {
      const high = new Card('H', 'A');
      const low = new Card('H', '3');
      expect(high.beats(low, 'H', trumpSuit, trumpRank)).toBe(true);
      expect(low.beats(high, 'H', trumpSuit, trumpRank)).toBe(false);
    });

    it('off-suit trump-rank beats regular trump cards of lower rank', () => {
      const offSuitTrumpRank = new Card('H', '2'); // trump because rank = trumpRank
      const regularTrump = new Card('S', 'A');     // trump because suit = trumpSuit
      // Off-suit trump-rank has trumpOrder 997, regular trump A has rankValue 14+1=15
      expect(offSuitTrumpRank.beats(regularTrump, 'S', trumpSuit, trumpRank)).toBe(true);
    });

    it('in-suit trump-rank beats off-suit trump-rank', () => {
      const inSuit = new Card('S', '2');
      const offSuit = new Card('H', '2');
      expect(inSuit.beats(offSuit, 'S', trumpSuit, trumpRank)).toBe(true);
      expect(offSuit.beats(inSuit, 'S', trumpSuit, trumpRank)).toBe(false);
    });
  });

  describe('toJSON / fromJSON', () => {
    it('round-trips correctly', () => {
      const card = new Card('H', 'K', 1);
      const json = card.toJSON();
      const restored = Card.fromJSON(json);
      expect(restored.id).toBe(card.id);
      expect(restored.suit).toBe(card.suit);
      expect(restored.rank).toBe(card.rank);
      expect(restored.points).toBe(card.points);
    });
  });
});
