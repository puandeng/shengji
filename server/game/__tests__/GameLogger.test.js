const { short, shortPlay } = require('../GameLogger');
const Card = require('../Card');

describe('GameLogger notation', () => {
    const jackOfSpades = new Card('S', 'J', 0);
    const smallJoker   = new Card('JOKER', 'SJ', 0);
    const bigJoker     = new Card('JOKER', 'BJ', 0);

    it('renders suited cards suit-first', () => {
        expect(short(jackOfSpades)).toBe('SJ');
        expect(short(new Card('D', '10', 1))).toBe('D10');
        expect(short(new Card('C', 'K', 0))).toBe('CK');
    });

    it('does not collide the jack of spades with the small joker', () => {
        expect(short(smallJoker)).toBe('*s');
        expect(short(bigJoker)).toBe('*b');
        expect(short(smallJoker)).not.toBe(short(jackOfSpades));
    });

    it('renders a joker pair distinctly from a pair of spade jacks', () => {
        expect(shortPlay([smallJoker, smallJoker])).toBe('*s*s');
        expect(shortPlay([jackOfSpades, jackOfSpades])).toBe('SJSJ');
    });

    it('renders jokers from serialised (toJSON) cards too', () => {
        expect(short(smallJoker.toJSON())).toBe('*s');
        expect(short(bigJoker.toJSON())).toBe('*b');
    });
});
