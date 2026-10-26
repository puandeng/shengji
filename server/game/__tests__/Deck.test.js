const Deck = require('../Deck');
const GameState = require('../GameState');
const { Room } = require('../Room');
const { PLAYERS_PER_ROOM, CARDS_PER_PLAYER, KITTY_SIZE, TOTAL_POINTS } = require('../constants');

function createReadyGame() {
  const game = new GameState('test-room');
  game.addPlayer('p0', 'Alice');
  game.addPlayer('p1', 'Bob');
  game.addPlayer('p2', 'Carol');
  game.addPlayer('p3', 'Dave');
  return game;
}

describe('Deck & seeded deal reproducibility', () => {
  it('builds 108 unique card IDs totalling 200 points', () => {
    const deck = new Deck();
    expect(deck.size).toBe(108);
    const ids = new Set(deck.cards.map(c => c.id));
    expect(ids.size).toBe(108);
    const totalPoints = deck.cards.reduce((sum, c) => sum + c.points, 0);
    expect(totalPoints).toBe(TOTAL_POINTS);
  });

  it('produces identical hands and kitty for the same numeric seed (including 0)', () => {
    for (const seed of [0, 1, 42, 0xdeadbeef]) {
      const d1 = new Deck(seed).deal(PLAYERS_PER_ROOM, CARDS_PER_PLAYER, KITTY_SIZE);
      const d2 = new Deck().deal(PLAYERS_PER_ROOM, CARDS_PER_PLAYER, KITTY_SIZE, seed);

      expect(d1.seed).toBe(seed);
      expect(d2.seed).toBe(seed);
      expect(d1.kitty.map(c => c.id)).toEqual(d2.kitty.map(c => c.id));
      for (let i = 0; i < PLAYERS_PER_ROOM; i++) {
        expect(d1.hands[i].map(c => c.id)).toEqual(d2.hands[i].map(c => c.id));
      }
    }
  });

  it('produces identical hands and kitty for the same string seed', () => {
    const d1 = new Deck('room-ABCD-round-1').deal(PLAYERS_PER_ROOM, CARDS_PER_PLAYER, KITTY_SIZE);
    const d2 = new Deck('room-ABCD-round-1').deal(PLAYERS_PER_ROOM, CARDS_PER_PLAYER, KITTY_SIZE);

    expect(d1.kitty.map(c => c.id)).toEqual(d2.kitty.map(c => c.id));
    for (let i = 0; i < PLAYERS_PER_ROOM; i++) {
      expect(d1.hands[i].map(c => c.id)).toEqual(d2.hands[i].map(c => c.id));
    }
  });

  it('produces distinct shuffles for different seeds', () => {
    const d1 = new Deck(101).deal(PLAYERS_PER_ROOM, CARDS_PER_PLAYER, KITTY_SIZE);
    const d2 = new Deck(102).deal(PLAYERS_PER_ROOM, CARDS_PER_PLAYER, KITTY_SIZE);

    const flat1 = d1.hands.flat().map(c => c.id);
    const flat2 = d2.hands.flat().map(c => c.id);
    expect(flat1).not.toEqual(flat2);
  });

  it('resets to canonical order before re-shuffling the same Deck instance', () => {
    const deck = new Deck();
    deck.shuffle(777);
    const firstOrder = deck.cards.map(c => c.id);

    deck.shuffle(777);
    const secondOrder = deck.cards.map(c => c.id);

    expect(secondOrder).toEqual(firstOrder);
  });

  it('records the generated seed on an unseeded GameState.deal() so it can be replayed', () => {
    const g1 = createReadyGame();
    const res1 = g1.deal();
    expect(res1.success).toBe(true);
    expect(typeof res1.seed).toBe('number');
    expect(g1.dealSeed).toBe(res1.seed);

    const g2 = createReadyGame();
    g2.deal(res1.seed);

    expect(g2.kitty.map(c => c.id)).toEqual(g1.kitty.map(c => c.id));
    for (const id of ['p0', 'p1', 'p2', 'p3']) {
      expect(g2.hands[id].map(c => c.id)).toEqual(g1.hands[id].map(c => c.id));
    }
    expect(g2.dealQueue.map(e => e.card.id)).toEqual(g1.dealQueue.map(e => e.card.id));
  });

  it('replays a full round deterministically when dealt with the same seed', () => {
    function runSeededRound(seed) {
      const room = new Room('SEED');
      room.logger.enabled = false;
      room.startGame(seed);
      const game = room.game;
      game.finishDealing();

      // Deterministic trump selection & bury
      for (const p of game.players) {
        const rankCard = game.hands[p.socketId].find(c => c.rank === game.trumpRank && !c.isJoker);
        if (rankCard) {
          game.callTrump(p.socketId, [rankCard.id]);
          break;
        }
      }
      game.finishTrumpSelection();
      game.giveKittyToDeclarer();

      const declarer = game.trumpDeclarer;
      const buryIds = room.autoPlayKittyDiscard
        ? room.autoPlayKittyDiscard(declarer)
        : game.hands[declarer].slice(0, 8).map(c => c.id);
      game.discardToKitty(declarer, buryIds);

      while (game.phase === 'PLAYING') {
        const currentId = game.currentPlayerSocketId;
        const choice = room.autoPlayChoice(currentId);
        const res = game.playCards(currentId, choice);
        if (res.error) {
          const legal = game.playableCardIds(currentId);
          game.playCards(currentId, [legal[0]]);
        }
      }

      return {
        seed: game.dealSeed,
        phase: game.phase,
        scores: { ...game.scores },
        teamLevels: { ...game.teamLevels },
        cardsPlayedPerSeat: game.tricks.reduce((acc, t) => {
          t.cards.forEach(e => { acc[e.socketId] = (acc[e.socketId] || 0) + e.cards.length; });
          return acc;
        }, {}),
        tricks: game.tricks.map(t => ({
          winner: t.winner,
          points: t.points,
          plays: t.cards.map(e => ({ socketId: e.socketId, cardIds: e.cards.map(c => c.id) })),
        })),
      };
    }

    const r1 = runSeededRound(20261025);
    const r2 = runSeededRound(20261025);

    expect(r1.seed).toBe(20261025);
    expect(r1.phase).toBe('SCORING');
    expect(Object.values(r1.cardsPlayedPerSeat)).toEqual([25, 25, 25, 25]);
    expect(r2).toEqual(r1);
  });
});
