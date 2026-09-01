process.env.GAME_LOG = '0';   // no log files from the test suite
process.env.DEV_MODE = '1';   // Room reads this once, in its constructor

const { Room } = require('../Room');
const { LEVEL_THRESHOLDS } = require('../constants');
const { MIDGAME_TRICKS, ENDGAME_CARDS_LEFT } = require('../DevScenario');

// The deck is unseeded, so every scenario is built from a different shuffle.
// Each assertion runs over several deals — a rule that only holds for lucky
// hands is not a rule the dev menu can rely on.
const RUNS = 15;

function seatedRoom() {
  const room = new Room('TEST');
  room.addPlayer('human', 'Tester');
  return room;
}

function build(opts) {
  const room   = seatedRoom();
  const result = room.applyDevScenario('human', opts);
  expect(result.error).toBeUndefined();
  return { room, game: room.game, result, me: room.game.getPlayer('human') };
}

function eachRun(opts, assert) {
  for (let i = 0; i < RUNS; i++) assert(build(opts));
}

describe('dev scenarios', () => {

  it('refuses outside dev mode', () => {
    const saved = process.env.DEV_MODE;
    delete process.env.DEV_MODE;
    const room = new Room('NODEV');
    room.addPlayer('human', 'Tester');
    expect(room.applyDevScenario('human', { scenario: 'fresh' }).error).toBeTruthy();
    process.env.DEV_MODE = saved;
  });

  it('rejects an unknown scenario', () => {
    const room = seatedRoom();
    expect(room.applyDevScenario('human', { scenario: 'nonsense' }).error).toMatch(/Unknown scenario/);
  });

  it('fills the empty seats with bots', () => {
    const { game } = build({ scenario: 'fresh' });
    expect(game.players).toHaveLength(4);
    expect(game.players.filter(p => p.isBot)).toHaveLength(3);
  });

  describe('fresh', () => {
    it('stops at dealing so the deal can animate', () => {
      const { game, result } = build({ scenario: 'fresh' });
      expect(game.phase).toBe('DEALING');
      expect(result.animateDeal).toBe(true);
      expect(game.trumpDeclarer).toBeNull();
    });

    it('plays the requesting player’s level', () => {
      const { game } = build({ scenario: 'fresh', myLevel: 'Q', opponentLevel: '7' });
      expect(game.teamLevels[0]).toBe('Q');   // the human sits at seat 0
      expect(game.teamLevels[1]).toBe('7');
      expect(game.trumpRank).toBe('Q');
    });
  });

  describe('midgame', () => {
    it('puts the human on the attacking team', () => {
      eachRun({ scenario: 'midgame', role: 'attacking' }, ({ game, me }) => {
        expect(game.phase).toBe('PLAYING');
        expect(me.teamIndex).toBe(game.attackingTeam);
        expect(game.getPlayer(game.trumpDeclarer).teamIndex).not.toBe(me.teamIndex);
      });
    });

    it('puts the human on the defending team, with their partner declaring', () => {
      eachRun({ scenario: 'midgame', role: 'defending' }, ({ game, me }) => {
        expect(game.phase).toBe('PLAYING');
        expect(me.teamIndex).not.toBe(game.attackingTeam);
        const declarer = game.getPlayer(game.trumpDeclarer);
        expect(declarer.seatIndex).toBe((me.seatIndex + 2) % 4);
      });
    });

    it('leaves a few finished tricks and a whole trick to play', () => {
      eachRun({ scenario: 'midgame', role: 'attacking' }, ({ game }) => {
        expect(game.tricks.length).toBeGreaterThanOrEqual(MIDGAME_TRICKS);
        expect(game.currentTrick).toHaveLength(0);
        expect(game.hands[game.currentPlayerSocketId].length).toBeGreaterThan(ENDGAME_CARDS_LEFT);
      });
    });

    it('plays the declaring team’s level, and the kitty is already buried', () => {
      eachRun({ scenario: 'midgame', role: 'defending', myLevel: 'K', opponentLevel: '4' }, ({ game, me }) => {
        expect(game.teamLevels[me.teamIndex]).toBe('K');
        expect(game.trumpRank).toBe('K');                   // partner declares → our level
        expect(game.kitty).toHaveLength(8);
        expect(game.hands[game.trumpDeclarer].length)
          .toBe(game.hands[game.currentPlayerSocketId].length);
      });
    });
  });

  describe('endgame', () => {
    it('leaves everyone with a couple of cards', () => {
      eachRun({ scenario: 'endgame-win', role: 'attacking' }, ({ game }) => {
        expect(game.phase).toBe('PLAYING');
        expect(game.currentTrick).toHaveLength(0);
        game.players.forEach(p => {
          expect(game.hands[p.socketId].length).toBeGreaterThan(0);
          expect(game.hands[p.socketId].length).toBeLessThanOrEqual(ENDGAME_CARDS_LEFT + 1);
        });
      });
    });

    it('sets a winning position for an attacking human', () => {
      eachRun({ scenario: 'endgame-win', role: 'attacking' }, ({ game }) => {
        expect(game.scores[game.attackingTeam])
          .toBeGreaterThanOrEqual(LEVEL_THRESHOLDS[game.trumpRank]);
      });
    });

    it('sets a losing position for an attacking human', () => {
      eachRun({ scenario: 'endgame-lose', role: 'attacking' }, ({ game }) => {
        expect(game.scores[game.attackingTeam])
          .toBeLessThan(LEVEL_THRESHOLDS[game.trumpRank]);
      });
    });

    it('flips the score with the role — defenders win by keeping attackers short', () => {
      eachRun({ scenario: 'endgame-win', role: 'defending' }, ({ game }) => {
        expect(game.scores[game.attackingTeam])
          .toBeLessThan(LEVEL_THRESHOLDS[game.trumpRank]);
      });
      eachRun({ scenario: 'endgame-lose', role: 'defending' }, ({ game }) => {
        expect(game.scores[game.attackingTeam])
          .toBeGreaterThanOrEqual(LEVEL_THRESHOLDS[game.trumpRank]);
      });
    });

    it('keeps the points-seen counter consistent with the rigged score', () => {
      eachRun({ scenario: 'endgame-win', role: 'attacking' }, ({ game }) => {
        expect(game.pointsPlayed).toBeGreaterThanOrEqual(game.scores[game.attackingTeam]);
        expect(game.pointsRemaining).toBeGreaterThanOrEqual(0);
      });
    });

    it('reaches the A-level threshold when both teams are at A', () => {
      const { game } = build({ scenario: 'endgame-win', role: 'attacking', myLevel: 'A', opponentLevel: 'A' });
      expect(game.trumpRank).toBe('A');
      expect(game.scores[game.attackingTeam]).toBeGreaterThanOrEqual(120);
    });
  });

  it('can be re-applied over a game already in progress', () => {
    const room = seatedRoom();
    room.applyDevScenario('human', { scenario: 'midgame', role: 'attacking' });
    const first = room.game.tricks.length;
    expect(first).toBeGreaterThan(0);

    const again = room.applyDevScenario('human', { scenario: 'fresh', myLevel: '10' });
    expect(again.error).toBeUndefined();
    expect(room.game.phase).toBe('DEALING');
    expect(room.game.tricks).toHaveLength(0);
    expect(room.game.teamLevels[0]).toBe('10');
  });
});
