const GameState = require('../GameState');
const Card = require('../Card');
const { TOTAL_POINTS, GAME_PHASES } = require('../constants');

function makeGame(trumpRank = '2') {
  const game = new GameState('test-room');
  game.addPlayer('p0', 'Alice');
  game.addPlayer('p1', 'Bob');
  game.addPlayer('p2', 'Carol');
  game.addPlayer('p3', 'Dave');
  game.trumpRank = trumpRank;
  return game;
}

const plain = bands => bands.map(b => [b.min, b.max, b.team, b.levels]);

describe('levelBands', () => {
  it('lays out the ladder for threshold 80', () => {
    expect(plain(makeGame('2').levelBands())).toEqual([
      [0,   0,   'defenders', 3],
      [1,   39,  'defenders', 2],
      [40,  79,  'defenders', 1],
      // Making the threshold takes the bank but earns no level; levels come
      // from the margin above it (PLAN.md).
      [80,  119, 'attackers', 0],
      [120, 159, 'attackers', 1],
      [160, 199, 'attackers', 2],
      [200, 200, 'attackers', 3],
    ]);
  });

  it('slides the whole ladder for threshold 120 at level A', () => {
    expect(plain(makeGame('A').levelBands())).toEqual([
      [0,   0,   'defenders', 3],
      [1,   79,  'defenders', 2],
      [80,  119, 'defenders', 1],
      [120, 159, 'attackers', 0],
      [160, 199, 'attackers', 1],
      [200, 200, 'attackers', 2],
    ]);
  });

  it('covers every score from 0 to TOTAL_POINTS with no gaps or overlaps', () => {
    ['2', 'A'].forEach(rank => {
      const bands = makeGame(rank).levelBands();
      expect(bands[0].min).toBe(0);
      expect(bands[bands.length - 1].max).toBe(TOTAL_POINTS);
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i].min).toBe(bands[i - 1].max + 1);
      }
    });
  });
});

describe('levelBands agrees with _finishRound', () => {
  const scores = [0, 39, 40, 79, 80, 119, 120, 159, 160, 200];

  ['2', 'A'].forEach(rank => {
    scores.forEach(score => {
      it(`trumpRank ${rank}, attacker score ${score}`, () => {
        const game = makeGame(rank);
        game.attackingTeam = 0;
        game.scores = { 0: score, 1: 0 };

        const band   = game.levelBands().find(b => score >= b.min && score <= b.max);
        const result = game._finishRound();

        expect(band).toBeDefined();
        expect(result.attackingWon).toBe(band.team === 'attackers');
        expect(result.levelsAdvanced).toBe(band.levels);
        expect(result.advancingTeam).toBe(band.team === 'attackers' ? 0 : 1);
      });
    });
  });

  it('puts a kitty-inflated score above the ladder in the top band', () => {
    const game = makeGame('2');
    game.attackingTeam = 0;
    game.scores = { 0: 480, 1: 0 };

    const result = game._finishRound();
    expect(result.attackingWon).toBe(true);
    expect(result.levelsAdvanced).toBe(3);
  });
});

describe('points in play', () => {
  it('starts at zero and resets when a round is dealt', () => {
    const game = makeGame('2');
    game.pointsPlayed = 137;
    game.deal();

    expect(game.pointsPlayed).toBe(0);
    expect(game.pointsRemaining).toBe(TOTAL_POINTS);
  });

  it('counts point cards from both teams as tricks complete', () => {
    const game = makeGame('2');
    game.trumpSuit = 'S';
    game.phase = GAME_PHASES.PLAYING;
    game.leadSeat = 0;
    game.currentSeat = 0;
    game.hands = {
      p0: [new Card('H', 'K')],   // 10 pts — attacker
      p1: [new Card('H', '5')],   //  5 pts — defender
      p2: [new Card('H', '9')],   //  0 pts
      p3: [new Card('H', '3')],   //  0 pts
    };
    game.kitty = [];

    game.playCards('p0', ['H_K_0']);
    game.playCards('p1', ['H_5_0']);
    game.playCards('p2', ['H_9_0']);
    game.playCards('p3', ['H_3_0']);

    expect(game.pointsPlayed).toBe(15);
    expect(game.pointsRemaining).toBe(TOTAL_POINTS - 15);
  });

  it('exposes the ladder and points in play in the per-player view', () => {
    const game = makeGame('2');
    const view = game.toPlayerJSON('p0');

    expect(view.threshold).toBe(80);
    expect(view.pointsPlayed).toBe(0);
    expect(view.pointsRemaining).toBe(TOTAL_POINTS);
    expect(plain(view.levelBands)).toEqual(plain(game.levelBands()));
  });
});
