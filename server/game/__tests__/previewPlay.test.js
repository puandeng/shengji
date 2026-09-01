const GameState = require('../GameState');
const Card = require('../Card');
const { GAME_PHASES } = require('../constants');

/**
 * Build a game parked in PLAYING with hand-picked hands, so preview results are
 * deterministic instead of depending on the shuffle.
 */
function makePlayingGame({ trumpSuit = 'S', trumpRank = '2', hands = {} } = {}) {
  const game = new GameState('test-room');
  game.addPlayer('p0', 'Alice');
  game.addPlayer('p1', 'Bob');
  game.addPlayer('p2', 'Carol');
  game.addPlayer('p3', 'Dave');

  game.trumpSuit = trumpSuit;
  game.trumpRank = trumpRank;
  game.trumpDeclarer = 'p0';
  game.phase = GAME_PHASES.PLAYING;
  game.leadSeat = 0;
  game.currentSeat = 0;
  game.hands = { p0: [], p1: [], p2: [], p3: [] };
  Object.entries(hands).forEach(([id, cards]) => { game.hands[id] = cards; });
  return game;
}

const c = (suit, rank, deck = 0) => new Card(suit, rank, deck);

describe('previewPlay', () => {
  describe('shape and label', () => {
    it('labels a single with the card name, not a suit letter', () => {
      const game = makePlayingGame({ hands: { p0: [c('H', 'K')] } });
      const r = game.previewPlay('p0', ['H_K_0']);

      expect(r.shape).toBe('single');
      expect(r.shapeLabel).toBe('Single — King of hearts');
      expect(r.legal).toBe(true);
      expect(r.reason).toBeNull();
    });

    it('labels a single joker', () => {
      const game = makePlayingGame({ hands: { p0: [c('JOKER', 'SJ')] } });
      const r = game.previewPlay('p0', ['JOKER_SJ_0']);

      expect(r.shape).toBe('single');
      expect(r.shapeLabel).toBe('Single — small joker');
    });

    it('labels a pair', () => {
      const game = makePlayingGame({ hands: { p0: [c('H', '7', 0), c('H', '7', 1)] } });
      const r = game.previewPlay('p0', ['H_7_0', 'H_7_1']);

      expect(r.shape).toBe('pair');
      expect(r.shapeLabel).toBe('Pair of 7s');
      expect(r.legal).toBe(true);
    });

    it('labels a joker pair', () => {
      const game = makePlayingGame({ hands: { p0: [c('JOKER', 'BJ', 0), c('JOKER', 'BJ', 1)] } });
      const r = game.previewPlay('p0', ['JOKER_BJ_0', 'JOKER_BJ_1']);

      expect(r.shape).toBe('pair');
      expect(r.shapeLabel).toBe('Pair of big jokers');
    });

    it('labels a tractor with its pair count', () => {
      const hand = [
        c('H', '3', 0), c('H', '3', 1),
        c('H', '4', 0), c('H', '4', 1),
        c('H', '5', 0), c('H', '5', 1),
      ];
      const game = makePlayingGame({ hands: { p0: hand } });
      const r = game.previewPlay('p0', hand.map(x => x.id));

      expect(r.shape).toBe('tractor');
      expect(r.shapeLabel).toBe('Tractor — 3 consecutive pairs');
      expect(r.legal).toBe(true);
    });

    it('labels a throw', () => {
      const hand = [c('H', '9'), c('H', '7', 0), c('H', '7', 1)];
      const game = makePlayingGame({ hands: { p0: hand } });
      const r = game.previewPlay('p0', hand.map(x => x.id));

      expect(r.shape).toBe('throw');
      expect(r.shapeLabel).toBe('Throw — single + pair');
      expect(r.legal).toBe(true);
    });

    it('rejects a non-combo with the lead-validation wording', () => {
      const hand = [c('H', 'K'), c('H', '9')];
      const game = makePlayingGame({ hands: { p0: hand } });
      const r = game.previewPlay('p0', hand.map(x => x.id));

      expect(r.shape).toBe('invalid');
      expect(r.shapeLabel).toBe('Not a legal combo');
      expect(r.legal).toBe(false);
      expect(r.reason).toBe(game._validateLead(hand, 'invalid').error);
    });

    it('rejects cards that are not in hand', () => {
      const game = makePlayingGame({ hands: { p0: [c('H', 'K')] } });
      const r = game.previewPlay('p0', ['D_A_0']);

      expect(r.legal).toBe(false);
      expect(r.reason).toBe('One or more cards not in your hand');
    });

    it('handles an empty selection', () => {
      const game = makePlayingGame({ hands: { p0: [c('H', 'K')] } });
      const r = game.previewPlay('p0', []);

      expect(r.shape).toBe('invalid');
      expect(r.legal).toBe(false);
      expect(r.requiredCount).toBe(0);
    });
  });

  describe('illegal follow', () => {
    it('reuses the exact rejection playCards would give, and does not mutate', () => {
      const game = makePlayingGame({
        hands: {
          p0: [c('H', 'K')],
          p1: [c('H', '9'), c('D', '3')],
        },
      });
      game.playCards('p0', ['H_K_0']);

      const handBefore  = game.hands['p1'].length;
      const trickBefore = game.currentTrick.length;
      const seatBefore  = game.currentSeat;

      const preview = game.previewPlay('p1', ['D_3_0']);

      expect(preview.shape).toBe('single');
      expect(preview.legal).toBe(false);
      expect(preview.reason).toContain('Hearts led');
      expect(preview.requiredCount).toBe(1);

      // Nothing moved.
      expect(game.hands['p1'].length).toBe(handBefore);
      expect(game.currentTrick.length).toBe(trickBefore);
      expect(game.currentSeat).toBe(seatBefore);

      // Same wording as the real play path — the message is not a second copy.
      const rejected = game.playCards('p1', ['D_3_0']);
      expect(rejected.error).toBe(preview.reason);
    });

    it('explains the trump-rank subtlety for lead-suit lookalikes', () => {
      const game = makePlayingGame({
        trumpSuit: 'S',
        trumpRank: '2',
        hands: {
          p0: [c('H', 'K')],
          p1: [c('H', '9'), c('H', '2'), c('D', '3')],
        },
      });
      game.playCards('p0', ['H_K_0']);

      const r = game.previewPlay('p1', ['D_3_0']);
      expect(r.legal).toBe(false);
      expect(r.reason).toContain('2 of hearts counts as trump, not hearts');
    });

    it('rejects a wrong-size follow with the match-the-lead wording', () => {
      const game = makePlayingGame({
        hands: {
          p0: [c('H', '7', 0), c('H', '7', 1)],
          p1: [c('H', '9'), c('H', '8')],
        },
      });
      game.playCards('p0', ['H_7_0', 'H_7_1']);

      const r = game.previewPlay('p1', ['H_9_0']);
      expect(r.legal).toBe(false);
      expect(r.reason).toBe('Must play exactly 2 card(s) to match the lead');
    });

    it('does not mutate even for a legal preview', () => {
      const game = makePlayingGame({ hands: { p0: [c('H', 'K'), c('D', '3')] } });

      const r = game.previewPlay('p0', ['H_K_0']);
      expect(r.legal).toBe(true);
      expect(game.hands['p0'].length).toBe(2);
      expect(game.currentTrick.length).toBe(0);
    });
  });

  describe('requiredCount', () => {
    it('is 0 when leading', () => {
      const game = makePlayingGame({ hands: { p0: [c('H', 'K')] } });
      expect(game.previewPlay('p0', ['H_K_0']).requiredCount).toBe(0);
    });

    it('is the lead count when following', () => {
      const game = makePlayingGame({
        hands: {
          p0: [c('H', '7', 0), c('H', '7', 1)],
          p1: [c('H', '9'), c('H', '8')],
        },
      });
      game.playCards('p0', ['H_7_0', 'H_7_1']);

      expect(game.previewPlay('p1', ['H_9_0', 'H_8_0']).requiredCount).toBe(2);
    });

    it('is the lead count for a 6-card tractor lead', () => {
      const lead = [
        c('H', '3', 0), c('H', '3', 1),
        c('H', '4', 0), c('H', '4', 1),
        c('H', '5', 0), c('H', '5', 1),
      ];
      const game = makePlayingGame({ hands: { p0: lead, p1: [c('D', '3')] } });
      game.playCards('p0', lead.map(x => x.id));

      expect(game.previewPlay('p1', ['D_3_0']).requiredCount).toBe(6);
    });
  });
});
