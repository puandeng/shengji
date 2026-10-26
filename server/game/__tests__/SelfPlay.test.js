const {
  runSelfPlay,
  runGame,
  runRound,
  createSelfPlayGame,
} = require('../SelfPlay');
const BotPlayer = require('../BotPlayer');
const Card      = require('../Card');
const GameState = require('../GameState');

describe('SelfPlay headless harness', () => {
  describe('runRound', () => {
    it('plays a complete round (100 cards across 4 seats) with valid masks, actions, and rewards', () => {
      const result = runRound({ seed: 20261025, strictPolicy: true });

      expect(result.seed).toBe(20261025);
      expect(result.tricksPlayed).toBeGreaterThan(0);
      expect(result.tricksPlayed).toBeLessThanOrEqual(25);
      expect(result.steps).toBe(result.tricksPlayed * 4);
      expect(result.invalidActions).toBe(0);
      expect(result.transitions).toHaveLength(result.steps);
      expect([0, 1]).toContain(result.advancingTeam);
      expect(result.band).toEqual(expect.objectContaining({
        min:    expect.any(Number),
        max:    expect.any(Number),
        team:   expect.stringMatching(/^(attackers|defenders)$/),
        levels: expect.any(Number),
      }));

      // Verify each seat acts once per trick and plays exactly 25 cards total
      const bySeat = { 0: [], 1: [], 2: [], 3: [] };
      for (const t of result.transitions) {
        bySeat[t.seatIndex].push(t);

        // State & mask integrity
        expect(t.state.phase).toBe('PLAYING');
        expect(t.state.hand.length).toBeGreaterThanOrEqual(t.action.length);
        expect(t.legalActionMask.length).toBeGreaterThanOrEqual(1);
        expect(t.handMask).toHaveLength(t.state.hand.length);

        const handSet  = new Set(t.state.hand);
        const legalSet = new Set(t.legalActionMask);
        expect(t.action.length).toBeGreaterThanOrEqual(1);
        for (const cardId of t.action) {
          expect(handSet.has(cardId)).toBe(true);
          expect(legalSet.has(cardId)).toBe(true);
        }

        // Trick outcome & reward populated
        expect(t.trickOutcome).toEqual(expect.objectContaining({
          winnerSeat:  expect.any(Number),
          winnerTeam:  expect.any(Number),
          trickPoints: expect.any(Number),
          credited:    expect.any(Number),
        }));

        const expectedSign = t.teamIndex === result.advancingTeam ? 1 : -1;
        const expectedReward = (expectedSign * result.levelsAdvanced) || 0;
        expect(t.reward).toBe(expectedReward);
        expect(t.roundWon).toBe(t.teamIndex === result.advancingTeam);
        expect(t.band).toEqual(result.band);
      }

      for (const seat of [0, 1, 2, 3]) {
        expect(bySeat[seat]).toHaveLength(result.tricksPlayed);
        expect(bySeat[seat][0].state.hand).toHaveLength(25);
        const lastStep = bySeat[seat][bySeat[seat].length - 1];
        expect(lastStep.state.hand).toHaveLength(lastStep.action.length);
        const totalCardsPlayed = bySeat[seat].reduce((sum, t) => sum + t.action.length, 0);
        expect(totalCardsPlayed).toBe(25);
      }
    });
  });

  describe('reproducibility & seeding', () => {
    it('produces identical multi-round games and transitions for the same numeric seed', () => {
      const run1 = runSelfPlay({ games: 2, seed: 424242, strictPolicy: true });
      const run2 = runSelfPlay({ games: 2, seed: 424242, strictPolicy: true });

      expect(run1.gamesPlayed).toBe(2);
      expect(run1.roundsPlayed).toBeGreaterThan(2);
      expect(run1.transitions).toHaveLength(run1.totalTransitions);
      expect(run1.invalidActions).toBe(0);
      expect(run2).toEqual(run1);
    });

    it('produces identical trajectories for the same string seed', () => {
      const r1 = runSelfPlay({ rounds: 3, seed: 'selfplay-batch-A', strictPolicy: true });
      const r2 = runSelfPlay({ rounds: 3, seed: 'selfplay-batch-A', strictPolicy: true });

      expect(r1.roundsPlayed).toBe(3);
      expect(r1.transitions).toHaveLength(r1.totalTransitions);
      expect(r2).toEqual(r1);
    });

    it('produces different trajectories for different seeds', () => {
      const r1 = runSelfPlay({ rounds: 2, seed: 1001 });
      const r2 = runSelfPlay({ rounds: 2, seed: 1002 });

      const actions1 = r1.transitions.map(t => t.action.join(','));
      const actions2 = r2.transitions.map(t => t.action.join(','));
      expect(actions1).not.toEqual(actions2);
    });

    it('records the generated seed when none is supplied so the run can be replayed', () => {
      const initial = runSelfPlay({ rounds: 2 });
      expect(typeof initial.seed).toBe('number');

      const replay = runSelfPlay({ rounds: 2, seed: initial.seed });
      expect(replay).toEqual(initial);
    });
  });

  describe('full match progression', () => {
    it('plays a full match from 2 to past A, respecting mandatory stops and declaring a winner', () => {
      const match = runGame({ seed: 99, strictPolicy: true });

      expect(match.gameOver).toBe(true);
      expect([0, 1]).toContain(match.winner);
      expect(match.roundsPlayed).toBeGreaterThanOrEqual(4); // at least 5, 10, K, A stops
      expect(match.invalidActions).toBe(0);
      expect(match.transitions).toHaveLength(match.totalSteps);
      const totalCards = match.transitions.reduce((sum, t) => sum + t.action.length, 0);
      expect(totalCards).toBe(match.roundsPlayed * 100);
    });

    it('streams transitions via onTransition without storing them when collectTransitions is false', () => {
      const streamed = [];
      const res = runSelfPlay({
        rounds:             3,
        seed:               777,
        collectTransitions: false,
        onTransition:       t => streamed.push(t),
      });

      expect(res.totalTransitions).toBeGreaterThan(0);
      expect(res.transitions).toHaveLength(0);
      expect(streamed).toHaveLength(res.totalTransitions);
    });
  });

  describe('pluggable policies & tractor follow obligations', () => {
    it('supports custom per-team policies via the BotPlayer interface', () => {
      const calls = { team0: 0, team1: 0 };
      const team0Policy = {
        chooseLegalCards(hand, currentTrick, trumpSuit, trumpRank, ctx) {
          calls.team0 += 1;
          return BotPlayer.chooseLegalCards(hand, currentTrick, trumpSuit, trumpRank, ctx);
        },
      };
      const team1Policy = {
        chooseLegalCards(hand, currentTrick, trumpSuit, trumpRank, ctx) {
          calls.team1 += 1;
          return BotPlayer.chooseLegalCards(hand, currentTrick, trumpSuit, trumpRank, ctx);
        },
      };

      const res = runRound({
        seed:     123,
        policies: { 0: team0Policy, 1: team1Policy },
      });

      expect(res.steps).toBe(res.tricksPlayed * 4);
      expect(calls.team0).toBe(res.tricksPlayed * 2);
      expect(calls.team1).toBe(res.tricksPlayed * 2);
    });

    it('falls back to BotPlayer when a policy returns an illegal action (or throws under strictPolicy)', () => {
      const brokenPolicy = {
        chooseLegalCards() {
          return ['NOT_IN_HAND'];
        },
      };

      const lenient = runRound({
        seed:         555,
        policy:       brokenPolicy,
        strictPolicy: false,
      });
      expect(lenient.steps).toBe(lenient.tricksPlayed * 4);
      expect(lenient.invalidActions).toBe(lenient.steps);

      expect(() =>
        runRound({
          seed:         555,
          policy:       brokenPolicy,
          strictPolicy: true,
        })
      ).toThrow(/Illegal play/);
    });

    it('follows a tractor lead legally in BotPlayer.chooseLegalCards when holding a tractor or pairs', () => {
      const game = createSelfPlayGame();
      game.deal(42);
      game.finishDealing();
      game.finishTrumpSelection();
      game.giveKittyToDeclarer();
      const declarer = game.trumpDeclarer;
      game.discardToKitty(
        declarer,
        BotPlayer.chooseKittyDiscard(game.hands[declarer], 8, game.trumpSuit, game.trumpRank)
      );

      // Rig a 4-card spade tractor lead (S7,S7,S8,S8) when trumpSuit='H', trumpRank='2'
      game.trumpSuit = 'H';
      game.trumpRank = '2';
      const leadId = game.currentPlayerSocketId;
      const c1 = new Card('S', '7', 0);
      const c2 = new Card('S', '7', 1);
      const c3 = new Card('S', '8', 0);
      const c4 = new Card('S', '8', 1);
      game.hands[leadId] = [c1, c2, c3, c4];
      expect(game.playCards(leadId, [c1.id, c2.id, c3.id, c4.id]).error).toBeUndefined();

      // Next seat holds a spade tractor (S9,S9,S10,S10) plus extra spades
      const followId = game.currentPlayerSocketId;
      const f1 = new Card('S', '9', 0);
      const f2 = new Card('S', '9', 1);
      const f3 = new Card('S', '10', 0);
      const f4 = new Card('S', '10', 1);
      const f5 = new Card('S', 'A', 0);
      game.hands[followId] = [f1, f2, f3, f4, f5];

      const chosen = BotPlayer.chooseLegalCards(
        game.hands[followId], game.currentTrick, game.trumpSuit, game.trumpRank
      );
      expect(chosen).toHaveLength(4);
      expect(GameState.classifyPlay(
        chosen.map(id => game.hands[followId].find(c => c.id === id)),
        game.trumpSuit,
        game.trumpRank
      )).toBe('tractor');
      expect(game.playCards(followId, chosen).error).toBeUndefined();
    });
  });
});
