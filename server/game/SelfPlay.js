/**
 * SelfPlay — headless, deterministic in-process runner against GameState.
 *
 * Drives `GameState` directly at process speed (no sockets, no animation or
 * bot timers, no disk logs) and emits transitions for each play decision:
 *   { state, legalActionMask, action, reward, ... }
 *
 * - `legalActionMask` comes directly from `GameState.playableCardIds(socketId)`.
 * - `reward` comes from `_finishRound()` via `GameState.levelBands()`, signed
 *   for the acting player's team (+levelsAdvanced for the round-winning team,
 *   -levelsAdvanced for the other team).
 * - Policies implement the `BotPlayer` interface (`chooseLegalCards`,
 *   `chooseTrumpCall`, `chooseKittyDiscard`) and can be supplied globally,
 *   per-team (`{ 0: policyA, 1: policyB }`), or per-seat (`[p0, p1, p2, p3]`).
 */

const Deck      = require('./Deck');
const GameState = require('./GameState');
const BotPlayer = require('./BotPlayer');
const {
  GAME_PHASES,
  PLAYERS_PER_ROOM,
  KITTY_SIZE,
  MAX_CALL_STRENGTH,
  LEVEL_THRESHOLDS,
  LEVEL_ORDER,
  STARTING_LEVEL,
} = require('./constants');

const DEFAULT_MAX_ROUNDS_PER_GAME = 100;
const MAX_PLAYS_PER_ROUND         = 200;

/**
 * Draw the next unsigned 32-bit integer seed from a Mulberry32 RNG stream.
 */
function nextUint32Seed(rng) {
  return Math.floor(rng() * 0x100000000) >>> 0;
}

/**
 * Resolve the policy for a given seat (`0..3`) and team (`0 | 1`).
 * Falls back to `BotPlayer` for any omitted method.
 */
function resolveSeatPolicy(seatIndex, teamIndex, opts = {}) {
  const { policy, policies } = opts;
  let candidate = null;

  if (Array.isArray(policies)) {
    candidate = policies[seatIndex] || null;
  } else if (policies && typeof policies === 'object') {
    candidate = policies[teamIndex] || policies[`seat${seatIndex}`] || null;
  }
  if (!candidate && policy) {
    candidate = policy;
  }

  return {
    chooseLegalCards: (hand, currentTrick, trumpSuit, trumpRank, ctx) => {
      if (candidate && typeof candidate.chooseLegalCards === 'function') {
        return candidate.chooseLegalCards(hand, currentTrick, trumpSuit, trumpRank, ctx);
      }
      return BotPlayer.chooseLegalCards(hand, currentTrick, trumpSuit, trumpRank, ctx);
    },
    chooseTrumpCall: (hand, trumpRank, currentStrength, ctx) => {
      if (candidate && typeof candidate.chooseTrumpCall === 'function') {
        return candidate.chooseTrumpCall(hand, trumpRank, currentStrength, ctx);
      }
      return BotPlayer.chooseTrumpCall(hand, trumpRank, currentStrength, ctx);
    },
    chooseKittyDiscard: (hand, kittySize, trumpSuit, trumpRank, ctx) => {
      if (candidate && typeof candidate.chooseKittyDiscard === 'function') {
        return candidate.chooseKittyDiscard(hand, kittySize, trumpSuit, trumpRank, ctx);
      }
      return BotPlayer.chooseKittyDiscard(hand, kittySize, trumpSuit, trumpRank, ctx);
    },
  };
}

/**
 * Create a fresh 4-bot `GameState` ready to deal.
 */
function createSelfPlayGame(opts = {}) {
  const game = new GameState(opts.roomId || 'self-play');
  game.logger = null; // Headless self-play never writes review logs to disk

  for (let i = 0; i < PLAYERS_PER_ROOM; i++) {
    const socketId = BotPlayer.generateBotId(i);
    game.addPlayer(socketId, BotPlayer.generateBotName(i));
    const seated = game.getPlayer(socketId);
    if (seated) seated.isBot = true;
  }

  if (opts.teamLevels) {
    for (const t of [0, 1]) {
      const lvl = opts.teamLevels[t];
      if (lvl && LEVEL_ORDER.includes(lvl)) {
        game.teamLevels[t] = lvl;
        game.visitedRanks[t] = new Set([STARTING_LEVEL, lvl]);
      }
    }
    game.trumpRank = game.teamLevels[0];
  }

  return game;
}

/**
 * Build the player-perspective observation before a play decision.
 */
function buildPlayState(game, player, ctx) {
  const hand = game.hands[player.socketId] || [];
  return {
    phase:           game.phase,
    roundNumber:     game.roundNumber,
    trickIndex:      game.tricks.length,
    playIndex:       game.currentTrick.length,
    seatIndex:       player.seatIndex,
    teamIndex:       player.teamIndex,
    isAttacking:     ctx.isAttacking,
    attackingTeam:   game.attackingTeam,
    leadSeat:        game.leadSeat,
    currentSeat:     game.currentSeat,
    trumpSuit:       game.trumpSuit,
    trumpRank:       game.trumpRank,
    threshold:       LEVEL_THRESHOLDS[game.trumpRank],
    teamLevels:      { ...game.teamLevels },
    scores:          { ...game.scores },
    pointsPlayed:    game.pointsPlayed,
    pointsRemaining: game.pointsRemaining,
    partnerWinning:  ctx.partnerWinning,
    trickPoints:     ctx.trickPoints,
    hand:            hand.map(c => c.id),
    handCounts:      Object.fromEntries(
      game.players.map(p => [p.seatIndex, (game.hands[p.socketId] || []).length])
    ),
    currentTrick:    game.currentTrick.map(e => {
      const ep = game.getPlayer(e.socketId);
      return {
        seatIndex: ep ? ep.seatIndex : null,
        teamIndex: ep ? ep.teamIndex : null,
        cardIds:   e.cards.map(c => c.id),
        shape:     e.shape,
      };
    }),
  };
}

/**
 * Run the trump-bidding phase across all 4 seats in seat order starting from
 * the pre-assigned kitty picker (or seat 0 in round 1). Since a call must
 * strictly outrank `game.trumpCallStrength` (1 < 2 < 3), at most 3 calls can
 * succeed before bidding settles.
 */
function runTrumpPhase(game, seatPolicies) {
  if (game.phase === GAME_PHASES.DEALING) {
    game.finishDealing();
  }
  if (game.phase !== GAME_PHASES.TRUMP_SELECTION) return;

  const startSeat = game.kittyPickerSeat !== null ? game.kittyPickerSeat : 0;
  let lastCallerSeat = null;

  // Up to 3 override passes around the table (strengths 1 -> 2 -> 3)
  for (let pass = 0; pass < MAX_CALL_STRENGTH; pass++) {
    let anyCalledThisPass = false;

    for (let offset = 0; offset < PLAYERS_PER_ROOM; offset++) {
      if (game.trumpCallStrength >= MAX_CALL_STRENGTH) break;

      const seatIndex = (startSeat + offset) % PLAYERS_PER_ROOM;
      if (seatIndex === lastCallerSeat) continue;

      const player = game.getPlayerBySeat(seatIndex);
      if (!player) continue;

      const hand = game.hands[player.socketId] || [];
      if (!game.canCall(player.socketId)) {
        game.passTrump(player.socketId);
        continue;
      }

      const policy = seatPolicies[seatIndex];
      const callIds = policy.chooseTrumpCall(hand, game.trumpRank, game.trumpCallStrength, {
        seatIndex,
        teamIndex:     player.teamIndex,
        roundNumber:   game.roundNumber,
        teamLevels:    { ...game.teamLevels },
        kittyPickerSeat: game.kittyPickerSeat,
      });

      if (Array.isArray(callIds) && callIds.length > 0) {
        const res = game.callTrump(player.socketId, callIds);
        if (!res.error) {
          lastCallerSeat = seatIndex;
          anyCalledThisPass = true;
          continue;
        }
      }

      game.passTrump(player.socketId);
    }

    if (!anyCalledThisPass || game.trumpCallStrength >= MAX_CALL_STRENGTH) {
      break;
    }
  }

  game.finishTrumpSelection();
  game.giveKittyToDeclarer();
}

/**
 * Run the kitty bury phase for `game.trumpDeclarer`.
 */
function runKittyPhase(game, seatPolicies, strictPolicy = false) {
  if (game.phase !== GAME_PHASES.KITTY) return { invalidDiscard: false };

  const declarerId = game.trumpDeclarer;
  const declarer   = game.getPlayer(declarerId);
  const hand       = game.hands[declarerId] || [];
  const policy     = seatPolicies[declarer.seatIndex];

  const chosenIds = policy.chooseKittyDiscard(
    hand, KITTY_SIZE, game.trumpSuit, game.trumpRank,
    {
      seatIndex:   declarer.seatIndex,
      teamIndex:   declarer.teamIndex,
      roundNumber: game.roundNumber,
    }
  );

  const res = Array.isArray(chosenIds)
    ? game.discardToKitty(declarerId, chosenIds)
    : { error: 'Policy did not return cardIds array for kitty discard' };

  if (!res.error) {
    return { invalidDiscard: false };
  }

  if (strictPolicy) {
    throw new Error(`Invalid kitty discard from seat ${declarer.seatIndex}: ${res.error}`);
  }

  const fallbackIds = BotPlayer.chooseKittyDiscard(
    game.hands[declarerId], KITTY_SIZE, game.trumpSuit, game.trumpRank
  );
  const fallbackRes = game.discardToKitty(declarerId, fallbackIds);
  if (fallbackRes.error) {
    throw new Error(`Fallback kitty discard failed: ${fallbackRes.error}`);
  }
  return { invalidDiscard: true };
}

/**
 * Play a single round from deal (or current phase) through `_finishRound()`,
 * returning the round outcome and emitted transitions.
 *
 * @param {GameState} [existingGame]
 * @param {{
 *   seed?: number|string,
 *   gameIndex?: number,
 *   policy?: object,
 *   policies?: object|object[],
 *   collectTransitions?: boolean,
 *   onTransition?: (transition: object) => void,
 *   strictPolicy?: boolean,
 * }} [opts]
 */
function runRound(existingGame, opts = {}) {
  // Allow calling runRound(opts) without passing a GameState instance
  let game = existingGame;
  let options = opts;
  if (!(existingGame instanceof GameState)) {
    options = existingGame || {};
    game = createSelfPlayGame(options);
  }

  const {
    seed               = null,
    gameIndex          = 0,
    collectTransitions = true,
    onTransition       = null,
    strictPolicy       = false,
  } = options;

  if (game.phase === GAME_PHASES.WAITING) {
    const dealRes = game.deal(seed);
    if (dealRes.error) throw new Error(`Failed to deal round: ${dealRes.error}`);
  } else if (game.phase === GAME_PHASES.SCORING) {
    const nextRes = game.startNewRound(seed);
    if (nextRes.error) throw new Error(`Failed to start new round: ${nextRes.error}`);
  }

  const seatPolicies = [0, 1, 2, 3].map(seat => {
    const p = game.getPlayerBySeat(seat);
    return resolveSeatPolicy(seat, p ? p.teamIndex : seat % 2, options);
  });

  if (game.phase === GAME_PHASES.DEALING || game.phase === GAME_PHASES.TRUMP_SELECTION) {
    runTrumpPhase(game, seatPolicies);
  }

  let invalidActions = 0;
  if (game.phase === GAME_PHASES.KITTY) {
    const kittyOut = runKittyPhase(game, seatPolicies, strictPolicy);
    if (kittyOut.invalidDiscard) invalidActions += 1;
  }

  const roundTransitions = [];
  let currentTrickTransitions = [];
  let lastPlayResult = null;
  let stepIndex = 0;

  while (game.phase === GAME_PHASES.PLAYING && stepIndex < MAX_PLAYS_PER_ROUND) {
    const socketId = game.currentPlayerSocketId;
    const player   = game.getPlayer(socketId);
    const hand     = game.hands[socketId] || [];

    const winnerId       = game.currentTrickWinner();
    const winner         = winnerId ? game.getPlayer(winnerId) : null;
    const partnerWinning = !!(player && winner && winner.socketId !== socketId && winner.teamIndex === player.teamIndex);
    const trickPoints    = game.currentTrick.reduce(
      (sum, e) => sum + e.cards.reduce((s, c) => s + c.points, 0), 0
    );
    const isAttacking    = player.teamIndex === game.attackingTeam;

    const ctx = {
      partnerWinning,
      trickPoints,
      isAttacking,
      seatIndex:       player.seatIndex,
      teamIndex:       player.teamIndex,
      roundNumber:     game.roundNumber,
      trickIndex:      game.tricks.length,
      playIndex:       game.currentTrick.length,
      scores:          { ...game.scores },
      pointsPlayed:    game.pointsPlayed,
      pointsRemaining: game.pointsRemaining,
      threshold:       LEVEL_THRESHOLDS[game.trumpRank],
      teamLevels:      { ...game.teamLevels },
    };

    const state           = buildPlayState(game, player, ctx);
    const legalActionMask = game.playableCardIds(socketId);
    const legalSet        = new Set(legalActionMask);
    const handMask        = state.hand.map(id => legalSet.has(id));

    const seatPolicy = seatPolicies[player.seatIndex];
    let action = seatPolicy.chooseLegalCards(
      hand, game.currentTrick, game.trumpSuit, game.trumpRank, ctx
    );

    let playRes = Array.isArray(action)
      ? game.playCards(socketId, action)
      : { error: 'Policy did not return an array of cardIds' };

    if (playRes.error) {
      if (strictPolicy) {
        throw new Error(`Illegal play by seat ${player.seatIndex}: ${playRes.error}`);
      }
      invalidActions += 1;
      action  = BotPlayer.chooseLegalCards(hand, game.currentTrick, game.trumpSuit, game.trumpRank, ctx);
      playRes = game.playCards(socketId, action);
      if (playRes.error) {
        throw new Error(`Fallback BotPlayer produced illegal play: ${playRes.error}`);
      }
    }

    // Read the shape recorded on currentTrick or completedTrick
    const trickPlays  = playRes.trickComplete
      ? playRes.completedTrick.cards
      : game.currentTrick;
    const recordedPlay = trickPlays[trickPlays.length - 1];
    const actionShape  = recordedPlay ? recordedPlay.shape : 'single';

    const transition = {
      gameIndex,
      roundNumber:     game.roundNumber,
      stepIndex,
      trickIndex:      state.trickIndex,
      playIndex:       state.playIndex,
      seatIndex:       player.seatIndex,
      teamIndex:       player.teamIndex,
      isAttacking,
      state,
      legalActionMask,
      legalCardIds:    legalActionMask,
      handMask,
      action:          [...action],
      actionShape,
      trickOutcome:    null,
      reward:          0,
      band:            null,
      roundWon:        false,
    };

    roundTransitions.push(transition);
    currentTrickTransitions.push(transition);
    stepIndex += 1;

    if (playRes.trickComplete) {
      const ct = playRes.completedTrick;
      const winnerPlayer = game.getPlayer(ct.winner);
      const outcome = {
        winnerSeat:  winnerPlayer ? winnerPlayer.seatIndex : null,
        winnerTeam:  ct.winnerTeam,
        trickPoints: ct.trickPoints,
        credited:    ct.credited,
      };
      for (const t of currentTrickTransitions) {
        t.trickOutcome = outcome;
      }
      currentTrickTransitions = [];
    }

    lastPlayResult = playRes;
  }

  if (game.phase !== GAME_PHASES.SCORING && game.phase !== GAME_PHASES.GAME_OVER) {
    throw new Error(`Round did not finish cleanly (phase=${game.phase}, steps=${stepIndex})`);
  }

  // Derive the round reward from _finishRound() and levelBands()
  const attackingScore = game.scores[game.attackingTeam];
  const band           = game._bandForScore(attackingScore);
  const advancingTeam  = lastPlayResult.advancingTeam;
  const levelsAdvanced = lastPlayResult.levelsAdvanced;

  const teamRewards = {
    0: (advancingTeam === 0 ? levelsAdvanced : -levelsAdvanced) || 0,
    1: (advancingTeam === 1 ? levelsAdvanced : -levelsAdvanced) || 0,
  };

  for (const t of roundTransitions) {
    t.roundWon = t.teamIndex === advancingTeam;
    t.reward   = teamRewards[t.teamIndex];
    t.band     = { ...band };
    if (typeof onTransition === 'function') {
      onTransition(t);
    }
  }

  return {
    gameIndex,
    roundNumber:    game.roundNumber,
    seed:           game.dealSeed,
    trumpSuit:      game.trumpSuit,
    trumpRank:      game.trumpRank,
    declarerSeat:   game._seat(game.trumpDeclarer),
    attackingTeam:  lastPlayResult.attackingTeam,
    attackingScore,
    threshold:      lastPlayResult.threshold,
    attackingWon:   lastPlayResult.attackingWon,
    advancingTeam,
    levelsAdvanced,
    jackDemotion:   lastPlayResult.jackDemotion,
    kittyResult:    lastPlayResult.kittyResult,
    tablePoints:    lastPlayResult.tablePoints,
    band:           { ...band },
    teamRewards,
    teamLevels:     { ...game.teamLevels },
    gameOver:       !!lastPlayResult.gameOver,
    winner:         game.winner,
    tricksPlayed:   game.tricks.length,
    steps:          roundTransitions.length,
    invalidActions,
    transitions:    collectTransitions ? roundTransitions : [],
  };
}

/**
 * Play one complete match (from initial levels until `GAME_OVER` or `maxRounds`).
 *
 * @param {{
 *   seed?: number|string,
 *   gameIndex?: number,
 *   maxRounds?: number,
 *   teamLevels?: { 0?: string, 1?: string },
 *   policy?: object,
 *   policies?: object|object[],
 *   collectTransitions?: boolean,
 *   onTransition?: (transition: object) => void,
 *   onRoundEnd?: (roundSummary: object) => void,
 *   strictPolicy?: boolean,
 * }} [opts]
 */
function runGame(opts = {}) {
  const {
    seed               = null,
    gameIndex          = 0,
    maxRounds          = DEFAULT_MAX_ROUNDS_PER_GAME,
    teamLevels         = null,
    collectTransitions = true,
    onTransition       = null,
    onRoundEnd         = null,
    strictPolicy       = false,
  } = opts;

  const masterSeed = (seed !== undefined && seed !== null)
    ? Deck.seedToUint32(seed)
    : Deck.randomSeed();
  const rng = Deck.createRng(masterSeed);

  const game = createSelfPlayGame({
    roomId: `self-play-${gameIndex}`,
    teamLevels,
  });

  const rounds         = [];
  const allTransitions = [];
  let totalSteps       = 0;
  let invalidActions   = 0;

  for (let r = 0; r < maxRounds; r++) {
    if (game.phase === GAME_PHASES.GAME_OVER) break;

    const roundSeed = nextUint32Seed(rng);
    const roundSummary = runRound(game, {
      ...opts,
      seed: roundSeed,
      gameIndex,
      collectTransitions,
      onTransition,
      strictPolicy,
    });

    totalSteps     += roundSummary.steps;
    invalidActions += roundSummary.invalidActions;

    if (collectTransitions) {
      allTransitions.push(...roundSummary.transitions);
    }

    rounds.push(roundSummary);
    if (typeof onRoundEnd === 'function') {
      onRoundEnd(roundSummary);
    }

    if (roundSummary.gameOver || game.phase === GAME_PHASES.GAME_OVER) {
      break;
    }
  }

  return {
    gameIndex,
    seed:           masterSeed,
    gameOver:       game.phase === GAME_PHASES.GAME_OVER,
    winner:         game.winner,
    roundsPlayed:   rounds.length,
    finalLevels:    { ...game.teamLevels },
    roundWins:      { ...game.roundScores },
    totalSteps,
    invalidActions,
    rounds,
    transitions:    collectTransitions ? allTransitions : [],
  };
}

/**
 * Top-level seeded self-play runner.
 *
 * - Pass `games` (default `1`) to play `N` full multi-round matches to `GAME_OVER`.
 * - Or pass `rounds` to play `N` standalone single rounds from fresh deals.
 *
 * @param {{
 *   games?: number,
 *   rounds?: number,
 *   seed?: number|string,
 *   maxRoundsPerGame?: number,
 *   teamLevels?: { 0?: string, 1?: string },
 *   policy?: object,
 *   policies?: object|object[],
 *   collectTransitions?: boolean,
 *   onTransition?: (transition: object) => void,
 *   onRoundEnd?: (roundSummary: object) => void,
 *   onGameEnd?: (gameSummary: object) => void,
 *   strictPolicy?: boolean,
 * }} [opts]
 */
function runSelfPlay(opts = {}) {
  const {
    games              = 1,
    rounds             = null,
    seed               = null,
    maxRoundsPerGame   = DEFAULT_MAX_ROUNDS_PER_GAME,
    teamLevels         = null,
    collectTransitions = true,
    onTransition       = null,
    onRoundEnd         = null,
    onGameEnd          = null,
    strictPolicy       = false,
  } = opts;

  const masterSeed = (seed !== undefined && seed !== null)
    ? Deck.seedToUint32(seed)
    : Deck.randomSeed();
  const rng = Deck.createRng(masterSeed);

  const gameResults    = [];
  const allTransitions = [];
  let totalRounds      = 0;
  let totalTransitions = 0;
  let invalidActions   = 0;
  const teamWins       = { 0: 0, 1: 0 };
  const roundWins      = { 0: 0, 1: 0 };

  // Standalone single-round mode when `rounds` is explicitly specified
  if (typeof rounds === 'number' && rounds > 0) {
    for (let i = 0; i < rounds; i++) {
      const roundSeed = nextUint32Seed(rng);
      const game      = createSelfPlayGame({ roomId: `self-play-r${i}`, teamLevels });
      const roundRes  = runRound(game, {
        ...opts,
        seed: roundSeed,
        gameIndex: i,
        collectTransitions,
        onTransition,
        strictPolicy,
      });

      totalRounds      += 1;
      totalTransitions += roundRes.steps;
      invalidActions   += roundRes.invalidActions;
      roundWins[roundRes.advancingTeam] += 1;

      if (collectTransitions) {
        allTransitions.push(...roundRes.transitions);
      }
      if (typeof onRoundEnd === 'function') {
        onRoundEnd(roundRes);
      }
      gameResults.push(roundRes);
    }

    return {
      seed:             masterSeed,
      mode:             'rounds',
      gamesPlayed:      rounds,
      roundsPlayed:     totalRounds,
      totalTransitions,
      invalidActions,
      roundWins,
      games:            gameResults,
      transitions:      collectTransitions ? allTransitions : [],
    };
  }

  // Default: play `games` full matches
  const numGames = Math.max(0, Number(games) || 0);
  for (let g = 0; g < numGames; g++) {
    const gameSeed = nextUint32Seed(rng);
    const gameRes  = runGame({
      ...opts,
      seed:      gameSeed,
      gameIndex: g,
      maxRounds: maxRoundsPerGame,
      teamLevels,
      collectTransitions,
      onTransition,
      onRoundEnd,
      strictPolicy,
    });

    totalRounds      += gameRes.roundsPlayed;
    totalTransitions += gameRes.totalSteps;
    invalidActions   += gameRes.invalidActions;
    if (gameRes.winner === 0 || gameRes.winner === 1) {
      teamWins[gameRes.winner] += 1;
    }
    for (const r of gameRes.rounds) {
      roundWins[r.advancingTeam] += 1;
    }

    if (collectTransitions) {
      allTransitions.push(...gameRes.transitions);
    }
    if (typeof onGameEnd === 'function') {
      onGameEnd(gameRes);
    }
    gameResults.push(gameRes);
  }

  return {
    seed:             masterSeed,
    mode:             'games',
    gamesPlayed:      numGames,
    roundsPlayed:     totalRounds,
    totalTransitions,
    invalidActions,
    teamWins,
    roundWins,
    games:            gameResults,
    transitions:      collectTransitions ? allTransitions : [],
  };
}

module.exports = {
  runSelfPlay,
  runGame,
  runMatch: runGame,
  runRound,
  createSelfPlayGame,
  resolveSeatPolicy,
};

// CLI entry point: `node server/game/SelfPlay.js [--games N] [--rounds N] [--seed S] [--jsonl]`
if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] !== undefined ? args[idx + 1] : fallback;
  };
  const gamesArg  = getArg('--games', null);
  const roundsArg = getArg('--rounds', null);
  const seedArg   = getArg('--seed', null);
  const jsonl     = args.includes('--jsonl');

  const parsedSeed = seedArg !== null
    ? (/^\d+$/.test(seedArg) ? Number(seedArg) : seedArg)
    : undefined;

  const t0 = Date.now();
  const result = runSelfPlay({
    games:              gamesArg !== null ? Number(gamesArg) : 1,
    rounds:             roundsArg !== null ? Number(roundsArg) : null,
    seed:               parsedSeed,
    collectTransitions: !jsonl,
    onTransition:       jsonl ? (t => process.stdout.write(`${JSON.stringify(t)}\n`)) : null,
  });
  const elapsedMs = Date.now() - t0;

  if (!jsonl) {
    console.log(JSON.stringify({
      seed:             result.seed,
      mode:             result.mode,
      gamesPlayed:      result.gamesPlayed,
      roundsPlayed:     result.roundsPlayed,
      totalTransitions: result.totalTransitions,
      invalidActions:   result.invalidActions,
      teamWins:         result.teamWins,
      roundWins:        result.roundWins,
      elapsedMs,
    }, null, 2));
  }
}
