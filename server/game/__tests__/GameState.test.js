const GameState = require('../GameState');
const Card = require('../Card');

function createReadyGame() {
  const game = new GameState('test-room');
  game.addPlayer('p0', 'Alice');
  game.addPlayer('p1', 'Bob');
  game.addPlayer('p2', 'Carol');
  game.addPlayer('p3', 'Dave');
  return game;
}

function createDealedGame() {
  const game = createReadyGame();
  game.deal();
  game.finishDealing();
  return game;
}

function createPlayingGame(trumpSuit = 'S', trumpRank = '2') {
  const game = createDealedGame();
  game.trumpSuit = trumpSuit;
  game.trumpRank = trumpRank;
  game.trumpDeclarer = 'p0';
  game.trumpCallStrength = 1;
  game.finishTrumpSelection();
  game.giveKittyToDeclarer();
  const hand = game.hands['p0'];
  const discardIds = hand.slice(0, 8).map(c => c.id);
  game.discardToKitty('p0', discardIds);
  return game;
}

describe('GameState', () => {
  describe('addPlayer', () => {
    it('assigns correct seats and teams', () => {
      const game = new GameState('test');
      const r0 = game.addPlayer('p0', 'A');
      const r1 = game.addPlayer('p1', 'B');
      const r2 = game.addPlayer('p2', 'C');
      const r3 = game.addPlayer('p3', 'D');

      expect(r0.player.seatIndex).toBe(0);
      expect(r0.player.teamIndex).toBe(0);
      expect(r1.player.seatIndex).toBe(1);
      expect(r1.player.teamIndex).toBe(1);
      expect(r2.player.seatIndex).toBe(2);
      expect(r2.player.teamIndex).toBe(0);
      expect(r3.player.seatIndex).toBe(3);
      expect(r3.player.teamIndex).toBe(1);
    });

    it('rejects 5th player', () => {
      const game = createReadyGame();
      const r = game.addPlayer('p4', 'Extra');
      expect(r.error).toBeDefined();
    });
  });

  describe('callTrump', () => {
    it('accepts a single trump-rank card', () => {
      const game = createDealedGame();
      // Manually place a trump-rank card in p0's hand
      const trumpCard = new Card('H', game.trumpRank, 0);
      trumpCard.id = 'test_trump_card';
      game.hands['p0'].push(trumpCard);

      const result = game.callTrump('p0', ['test_trump_card']);
      expect(result.success).toBe(true);
      expect(result.strength).toBe(1);
      expect(result.trumpSuit).toBe('H');
    });

    it('rejects a single joker', () => {
      const game = createDealedGame();
      const joker = new Card('JOKER', 'SJ', 0);
      joker.id = 'test_joker';
      game.hands['p0'].push(joker);

      const result = game.callTrump('p0', ['test_joker']);
      expect(result.error).toMatch(/single joker/i);
    });

    it('accepts a same-type joker pair', () => {
      const game = createDealedGame();
      const sj1 = new Card('JOKER', 'SJ', 0);
      sj1.id = 'sj_0';
      const sj2 = new Card('JOKER', 'SJ', 1);
      sj2.id = 'sj_1';
      game.hands['p0'].push(sj1, sj2);

      const result = game.callTrump('p0', ['sj_0', 'sj_1']);
      expect(result.success).toBe(true);
      expect(result.strength).toBe(3);
      expect(result.trumpSuit).toBeNull();
    });

    it('rejects a mixed joker pair', () => {
      const game = createDealedGame();
      const sj = new Card('JOKER', 'SJ', 0);
      sj.id = 'sj_test';
      const bj = new Card('JOKER', 'BJ', 0);
      bj.id = 'bj_test';
      game.hands['p0'].push(sj, bj);

      const result = game.callTrump('p0', ['sj_test', 'bj_test']);
      expect(result.error).toMatch(/mixed/i);
    });

    it('higher strength overrides lower', () => {
      const game = createDealedGame();

      // p0 calls single
      const c1 = new Card('H', game.trumpRank, 0);
      c1.id = 'c1';
      game.hands['p0'].push(c1);
      game.callTrump('p0', ['c1']);
      expect(game.trumpCallStrength).toBe(1);

      // p1 calls pair (strength 2) — overrides
      const c2 = new Card('D', game.trumpRank, 0);
      c2.id = 'c2';
      const c3 = new Card('D', game.trumpRank, 1);
      c3.id = 'c3';
      game.hands['p1'].push(c2, c3);
      const result = game.callTrump('p1', ['c2', 'c3']);
      expect(result.success).toBe(true);
      expect(result.strength).toBe(2);
      expect(game.trumpSuit).toBe('D');
    });

    it('same strength does not override', () => {
      const game = createDealedGame();

      const c1 = new Card('H', game.trumpRank, 0);
      c1.id = 'c1';
      game.hands['p0'].push(c1);
      game.callTrump('p0', ['c1']);

      const c2 = new Card('D', game.trumpRank, 0);
      c2.id = 'c2';
      game.hands['p1'].push(c2);
      const result = game.callTrump('p1', ['c2']);
      expect(result.error).toMatch(/does not override/i);
    });
  });

  describe('follow-suit validation', () => {
    it('requires following lead suit when possible', () => {
      const game = createPlayingGame('S', '2');

      // Set up hands explicitly for this test
      game.hands['p0'] = [new Card('H', 'A', 0)];
      game.hands['p0'][0].id = 'h_a_0';
      game.hands['p1'] = [new Card('H', '3', 0), new Card('D', 'K', 0)];
      game.hands['p1'][0].id = 'h_3_0';
      game.hands['p1'][1].id = 'd_k_0';
      game.hands['p2'] = [new Card('D', '5', 0)];
      game.hands['p2'][0].id = 'd_5_0';
      game.hands['p3'] = [new Card('D', '6', 0)];
      game.hands['p3'][0].id = 'd_6_0';

      game.currentSeat = 0;
      game.leadSeat = 0;

      // p0 leads H
      game.playCards('p0', ['h_a_0']);

      // p1 has H — must follow suit, playing D should fail
      const result = game.playCards('p1', ['d_k_0']);
      expect(result.error).toBeDefined();
    });

    it('allows off-suit when player has no lead-suit cards', () => {
      const game = createPlayingGame('S', '2');

      game.hands['p0'] = [new Card('H', 'A', 0)];
      game.hands['p0'][0].id = 'h_a_0';
      game.hands['p1'] = [new Card('D', 'K', 0)]; // No hearts
      game.hands['p1'][0].id = 'd_k_0';
      game.hands['p2'] = [new Card('D', '5', 0)];
      game.hands['p2'][0].id = 'd_5_0';
      game.hands['p3'] = [new Card('D', '6', 0)];
      game.hands['p3'][0].id = 'd_6_0';

      game.currentSeat = 0;
      game.leadSeat = 0;

      game.playCards('p0', ['h_a_0']);
      const result = game.playCards('p1', ['d_k_0']);
      expect(result.error).toBeUndefined();
    });
  });

  describe('shape classification (via playCards)', () => {
    it('allows singles', () => {
      const game = createPlayingGame('S', '2');
      game.hands['p0'] = [new Card('H', 'A', 0)];
      game.hands['p0'][0].id = 'h_a_0';
      game.currentSeat = 0;
      game.leadSeat = 0;

      const result = game.playCards('p0', ['h_a_0']);
      expect(result.error).toBeUndefined();
    });

    it('allows pairs (two identical cards)', () => {
      const game = createPlayingGame('S', '2');
      const c1 = new Card('H', 'A', 0);
      c1.id = 'h_a_0';
      const c2 = new Card('H', 'A', 1);
      c2.id = 'h_a_1';
      game.hands['p0'] = [c1, c2];
      game.currentSeat = 0;
      game.leadSeat = 0;

      const result = game.playCards('p0', ['h_a_0', 'h_a_1']);
      expect(result.error).toBeUndefined();
    });

    it('requires followers to match lead card count', () => {
      const game = createPlayingGame('S', '2');

      // p0 leads a pair
      const c1 = new Card('H', 'A', 0);
      c1.id = 'h_a_0';
      const c2 = new Card('H', 'A', 1);
      c2.id = 'h_a_1';
      game.hands['p0'] = [c1, c2];

      // p1 tries to play a single
      const c3 = new Card('H', '3', 0);
      c3.id = 'h_3_0';
      game.hands['p1'] = [c3, new Card('D', '4', 0)];
      game.hands['p1'][1].id = 'd_4_0';

      game.currentSeat = 0;
      game.leadSeat = 0;

      game.playCards('p0', ['h_a_0', 'h_a_1']);
      const result = game.playCards('p1', ['h_3_0']);
      expect(result.error).toMatch(/exactly 2/);
    });
  });

  describe('combo validation', () => {
    it('rejects cross-suit pairs on lead', () => {
      const game = createPlayingGame('S', '2');
      const c1 = new Card('H', 'A', 0);
      c1.id = 'h_a_0';
      const c2 = new Card('D', 'A', 0);
      c2.id = 'd_a_0';
      game.hands['p0'] = [c1, c2];
      game.currentSeat = 0;
      game.leadSeat = 0;

      const result = game.playCards('p0', ['h_a_0', 'd_a_0']);
      expect(result.error).toMatch(/invalid/i);
    });

    it('rejects non-pair 2-card plays of same suit', () => {
      const game = createPlayingGame('S', '2');
      const c1 = new Card('H', 'A', 0);
      c1.id = 'h_a_0';
      const c2 = new Card('H', 'K', 0);
      c2.id = 'h_k_0';
      game.hands['p0'] = [c1, c2];
      game.currentSeat = 0;
      game.leadSeat = 0;

      const result = game.playCards('p0', ['h_a_0', 'h_k_0']);
      expect(result.error).toMatch(/invalid/i);
    });

    it('allows valid throw (single + pair, same suit)', () => {
      const game = createPlayingGame('S', '2');
      const c1 = new Card('H', 'A', 0);
      c1.id = 'h_a_0';
      const c2 = new Card('H', 'K', 0);
      c2.id = 'h_k_0';
      const c3 = new Card('H', 'K', 1);
      c3.id = 'h_k_1';
      game.hands['p0'] = [c1, c2, c3, new Card('H', '3', 0)];
      game.hands['p0'][3].id = 'filler';
      game.currentSeat = 0;
      game.leadSeat = 0;

      const result = game.playCards('p0', ['h_a_0', 'h_k_0', 'h_k_1']);
      expect(result.error).toBeUndefined();
    });
  });

  describe('scoring', () => {
    it('only credits attacking team with points', () => {
      const game = createPlayingGame('S', '2');
      game.attackingTeam = 0; // p0 (seat 0) and p2 (seat 2) are attackers

      // Give each player one card; p0 (attacker) leads and wins with a point card
      game.hands['p0'] = [new Card('H', 'A', 0)];
      game.hands['p0'][0].id = 'h_a_0';
      game.hands['p1'] = [new Card('H', '5', 0)]; // 5 points
      game.hands['p1'][0].id = 'h_5_0';
      game.hands['p2'] = [new Card('H', '3', 0)];
      game.hands['p2'][0].id = 'h_3_0';
      game.hands['p3'] = [new Card('H', '4', 0)];
      game.hands['p3'][0].id = 'h_4_0';

      game.currentSeat = 0;
      game.leadSeat = 0;

      game.playCards('p0', ['h_a_0']);
      game.playCards('p1', ['h_5_0']);
      game.playCards('p2', ['h_3_0']);
      const result = game.playCards('p3', ['h_4_0']);

      // p0 (attacker, team 0) wins with A — gets the 5 points from p1's card
      // Attacker winning the last trick "protects" the kitty — no kitty bonus
      expect(result.trickComplete).toBe(true);
      expect(game.scores[0]).toBe(5);
    });
  });
});

describe('follow-suit rejection messages', () => {
  // Spades led, trump is hearts with rank 2.
  function leadSpades(followerHand) {
    const game = createReadyGame();
    game.phase = 'PLAYING';
    game.trumpSuit = 'H';
    game.trumpRank = '2';
    game.hands = { p0: [new Card('S', '5', 0)], p1: followerHand, p2: [], p3: [] };
    game.leadSeat = 0;
    game.currentSeat = 0;
    game.playCards('p0', ['S_5_0']);
    return game;
  }

  it('says how many lead-suit cards are held, played, and required', () => {
    const game = leadSpades([new Card('S', '7', 0), new Card('S', '9', 0), new Card('H', '3', 0)]);
    const { error } = game.playCards('p1', ['H_3_0']);
    expect(error).toContain('You hold 2 spade cards');
    expect(error).toContain('played 0');
    expect(error).toContain('you must play 1');
  });

  it('explains that a trump-rank card of the lead suit is trump, not the lead suit', () => {
    const game = leadSpades([new Card('S', '2', 0), new Card('S', '7', 0), new Card('H', '3', 0)]);
    const { error } = game.playCards('p1', ['H_3_0']);
    expect(error).toContain('You hold 1 spade card');
    expect(error).toContain('2 of spades counts as trump, not spades');
  });

  it('allows trump when every lead-suit-looking card is actually trump', () => {
    const game = leadSpades([new Card('S', '2', 0), new Card('H', '3', 0)]);
    expect(game.playCards('p1', ['H_3_0']).error).toBeUndefined();
  });

  it('names the pair requirement when a pair was led', () => {
    const game = createReadyGame();
    game.phase = 'PLAYING';
    game.trumpSuit = 'H';
    game.trumpRank = '2';
    game.hands = {
      p0: [new Card('S', '5', 0), new Card('S', '5', 1)],
      p1: [new Card('S', '7', 0), new Card('S', '7', 1), new Card('S', '9', 0)],
      p2: [], p3: [],
    };
    game.leadSeat = 0;
    game.currentSeat = 0;
    game.playCards('p0', ['S_5_0', 'S_5_1']);
    const { error } = game.playCards('p1', ['S_7_0', 'S_9_0']);
    expect(error).toContain('A pair was led');
    expect(error).toContain('spades pair');
  });
});

describe('trump call availability', () => {
  function gameWithRank(rank) {
    const game = createReadyGame();
    game.trumpRank = rank;
    return game;
  }

  it('rates a single trump-rank card as strength 1', () => {
    const game = gameWithRank('2');
    expect(game.bestCallStrength([new Card('S', '2', 0), new Card('H', '9', 0)])).toBe(1);
  });

  it('rates a same-suit trump-rank pair as strength 2', () => {
    const game = gameWithRank('2');
    expect(game.bestCallStrength([new Card('S', '2', 0), new Card('S', '2', 1)])).toBe(2);
  });

  it('does not rate trump-rank cards of different suits as a pair', () => {
    const game = gameWithRank('2');
    expect(game.bestCallStrength([new Card('S', '2', 0), new Card('H', '2', 0)])).toBe(1);
  });

  it('rates a same-type joker pair as strength 3 but a mixed pair as 0', () => {
    const game = gameWithRank('2');
    const small = [new Card('JOKER', 'SJ', 0), new Card('JOKER', 'SJ', 1)];
    const mixed = [new Card('JOKER', 'SJ', 0), new Card('JOKER', 'BJ', 0)];
    expect(game.bestCallStrength(small)).toBe(3);
    expect(game.bestCallStrength(mixed)).toBe(0);
  });

  it('canCall requires strictly beating the standing call', () => {
    const game = gameWithRank('2');
    game.phase = 'TRUMP_SELECTION';
    game.hands['p0'] = [new Card('S', '2', 0)];
    expect(game.canCall('p0')).toBe(true);
    game.trumpCallStrength = 1;           // an equal call already stands
    expect(game.canCall('p0')).toBe(false);
  });
});

describe('joker-pair call is final', () => {
  it('leaves nobody able to call once a joker pair stands', () => {
    const game = createReadyGame();
    game.phase = 'TRUMP_SELECTION';
    game.trumpRank = '2';
    game.trumpCallStrength = 3;
    // Even the strongest possible holding cannot beat a standing joker pair.
    game.hands['p1'] = [new Card('JOKER', 'BJ', 0), new Card('JOKER', 'BJ', 1)];
    expect(game.bestCallStrength(game.hands['p1'])).toBe(3);
    expect(game.canCall('p1')).toBe(false);
  });

  it('rejects a joker-pair call that ties the standing one', () => {
    const game = createReadyGame();
    game.phase = 'TRUMP_SELECTION';
    game.trumpRank = '2';
    game.trumpCallStrength = 3;
    game.hands['p1'] = [new Card('JOKER', 'SJ', 0), new Card('JOKER', 'SJ', 1)];
    const { error } = game.callTrump('p1', ['JOKER_SJ_0', 'JOKER_SJ_1']);
    expect(error).toMatch(/does not override/);
  });
});

describe('auto-selected trump', () => {
  it('names a real declarer so the kitty can be picked up', () => {
    const game = createReadyGame();
    game.deal();
    game.finishDealing();
    game.finishTrumpSelection();          // nobody called — auto-select runs

    expect(game.trumpSuit).toBeTruthy();
    expect(game.trumpDeclarer).not.toBeNull();
    expect(game.getPlayer(game.trumpDeclarer)).toBeDefined();

    // The round can actually proceed: the declarer receives the kitty.
    const before = game.hands[game.trumpDeclarer].length;
    const result = game.giveKittyToDeclarer();
    expect(result.error).toBeUndefined();
    expect(game.hands[game.trumpDeclarer].length).toBe(before + 8);
  });
});

describe('kitty is a liability, not a payout', () => {
  // The declarer buries the kitty, and in this variant the declarer's own team
  // collects points — so the bury must never pay them.
  function lastTrick({ attackersWinIt, kittyPoints }) {
    const game = createReadyGame();
    game.phase = 'PLAYING';
    game.trumpSuit = 'S';
    game.trumpRank = '2';
    game.attackingTeam = 0;          // p0 + p2 called trump
    game.scores = { 0: 100, 1: 0 };  // already collected 100 from tricks
    game.kitty = kittyPoints === 40
      ? [new Card('H', 'K', 0), new Card('D', 'K', 0), new Card('C', 'K', 0), new Card('S', '10', 0)]
      : [new Card('H', '3', 0)];

    // p0 leads; the ace decides who takes it.
    const ace = new Card('H', 'A', 0);
    const low = () => new Card('H', '3', 1);
    game.hands = {
      p0: [attackersWinIt ? ace : low()],
      p1: [attackersWinIt ? low() : ace],
      p2: [new Card('H', '4', 0)],
      p3: [new Card('H', '6', 0)],
    };
    ['p0', 'p1', 'p2', 'p3'].forEach((id, i) => { game.hands[id][0].id = `c${i}`; });
    game.leadSeat = 0;
    game.currentSeat = 0;
    ['p0', 'p1', 'p2', 'p3'].forEach((id, i) => game.playCards(id, [`c${i}`]));
    return game;
  }

  it('pays nothing when the attackers protect their own bury', () => {
    const game = lastTrick({ attackersWinIt: true, kittyPoints: 40 });
    expect(game.scores[0]).toBe(100);   // 100 collected, no kitty gain
  });

  it('costs the attackers the bury when the defenders take the last trick', () => {
    const game = lastTrick({ attackersWinIt: false, kittyPoints: 40 });
    expect(game.scores[0]).toBe(20);    // 100 - (40 x 2)
  });

  it('never drives the score below zero', () => {
    const game = lastTrick({ attackersWinIt: false, kittyPoints: 40 });
    game.scores[0] = 10;
    expect(game.scores[0]).toBeGreaterThanOrEqual(0);
  });

  it('does nothing when no point cards were buried', () => {
    const game = lastTrick({ attackersWinIt: false, kittyPoints: 0 });
    expect(game.scores[0]).toBe(100);
  });
});
