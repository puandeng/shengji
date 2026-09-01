/**
 * DevScenario — build a game that is already in a particular situation.
 *
 * Only reachable in DEV_MODE. User testing kept starting from an empty lobby
 * and then spending five minutes dealing, calling, burying and playing tricks
 * before reaching the state under test, which meant late-round and level-up
 * behaviour was almost never exercised. These scenarios fast-forward the
 * engine through those steps in-process: the same `GameState` methods a real
 * game calls, just without the sockets, animations and bot timers.
 *
 * Two things are synthesised rather than played out, and both are marked below:
 * the declarer's trump call when their hand holds no trump-rank card, and the
 * attacker score in the endgame scenarios.
 */

const BotPlayer = require('./BotPlayer');
const {
    GAME_PHASES,
    KITTY_SIZE,
    LEVEL_ORDER,
    LEVEL_THRESHOLDS,
    STARTING_LEVEL,
    TOTAL_POINTS,
} = require('./constants');

const SCENARIOS = ['fresh', 'midgame', 'endgame-win', 'endgame-lose'];

// Tricks to play out before handing a mid-game scenario over to the human.
const MIDGAME_TRICKS = 3;

// Cards each player still holds when an endgame scenario starts.
const ENDGAME_CARDS_LEFT = 2;

// How far the rigged endgame score sits from the threshold. One full band, so
// the scoring modal shows a level change rather than a bare threshold miss.
const ENDGAME_MARGIN = 45;

// Safety net for the fast-forward loop — 25 tricks × 4 plays is the real cap.
const MAX_AUTO_PLAYS = 400;

/**
 * Build a scenario in `room` around the seat `socketId` occupies.
 *
 * @param {import('./Room').Room} room
 * @param {string} socketId — the player the scenario is framed around
 * @param {{ scenario?: string, role?: 'attacking'|'defending', myLevel?: string, opponentLevel?: string }} opts
 * @returns {{ error: string } | { success: true, scenario: string, animateDeal: boolean, ... }}
 */
function applyScenario(room, socketId, opts = {}) {
    const game     = room.game;
    const scenario = opts.scenario || 'fresh';
    if (!SCENARIOS.includes(scenario)) return { error: `Unknown scenario "${scenario}"` };

    const role = opts.role === 'defending' ? 'defending' : 'attacking';

    room.clearTimers();
    game.resetToLobby();
    room.fillWithBots();
    if (!game.isReady()) return { error: 'Need at least one player seated' };

    const me = game.getPlayer(socketId);
    if (!me) return { error: 'Not seated in this room' };

    const myTeam  = me.teamIndex;
    const oppTeam = myTeam === 0 ? 1 : 0;
    setLevel(game, myTeam,  opts.myLevel);
    setLevel(game, oppTeam, opts.opponentLevel);

    if (scenario === 'fresh') {
        // Round-1 rules: no declarer is pre-assigned and anybody may call, so
        // the rank in play cannot be read off the declaring team yet. Use the
        // requesting player's level — that is the one the menu is setting.
        game.trumpRank = game.teamLevels[myTeam];
        const dealt = game.deal();
        if (dealt.error) return dealt;
        return { success: true, scenario, role, animateDeal: true, ...summarise(game, me) };
    }

    // Declaring means defending, so the seat that declares fixes the requesting
    // player's role: their partner declaring puts them on the defending team,
    // an opponent declaring makes them an attacker.
    const declarerSeat = role === 'defending' ? (me.seatIndex + 2) % 4 : (me.seatIndex + 1) % 4;
    const declarer     = game.getPlayerBySeat(declarerSeat);
    if (!declarer) return { error: 'Four seats are needed to build this scenario' };

    // The rank in play is the declaring team's level — they defend their own.
    game.trumpRank   = game.teamLevels[declarer.teamIndex];
    // Levels are pre-set, so calling this round 1 would read as a match that
    // reached level K in its first hand.
    game.roundNumber = 2;

    const dealt = game.deal();
    if (dealt.error) return dealt;

    game.finishDealing();
    forceTrumpCall(game, declarer);
    game.finishTrumpSelection();
    game.giveKittyToDeclarer();

    const buried = autoBury(game);
    if (buried.error) return buried;

    if (scenario === 'midgame') {
        playUntil(room, () => game.tricks.length >= MIDGAME_TRICKS);
    } else {
        playUntil(room, () => minHandSize(game) <= ENDGAME_CARDS_LEFT);
        rigEndgameScore(game, role, scenario === 'endgame-win');
    }

    return {
        success:     true,
        scenario,
        role,
        animateDeal: false,
        ...summarise(game, me),
    };
}

/** Set one team's level, and treat it as the only rank they have visited. */
function setLevel(game, teamIndex, level) {
    const value = LEVEL_ORDER.includes(level) ? level : STARTING_LEVEL;
    game.teamLevels[teamIndex]  = value;
    // Mandatory stops key off ranks already visited. A team dropped straight in
    // at Q has not passed 5/10 in this match, so it must still stop at K.
    game.visitedRanks[teamIndex] = new Set([value]);
}

/**
 * Put the declarer in the chair. A real call reveals a trump-rank card, so use
 * one when the dealt hand has one; otherwise write the outcome of a call
 * directly, since the scenario is about the roles, not about how they were won.
 */
function forceTrumpCall(game, declarer) {
    const hand     = game.hands[declarer.socketId] || [];
    const rankCard = hand.find(c => !c.isJoker && c.rank === game.trumpRank);
    if (rankCard && !game.callTrump(declarer.socketId, [rankCard.id]).error) return;

    const nonJoker = hand.find(c => !c.isJoker);
    game.trumpSuit         = nonJoker ? nonJoker.suit : 'S';
    game.trumpCallStrength = 1;
    game.trumpDeclarer     = declarer.socketId;
    game.trumpCallerSeat   = declarer.seatIndex;
    game.attackingTeam     = declarer.teamIndex === 0 ? 1 : 0;
}

/** Bury for the declarer with the same logic a bot in that seat would use. */
function autoBury(game) {
    const declarerId = game.trumpDeclarer;
    const cardIds    = BotPlayer.chooseKittyDiscard(
        game.hands[declarerId], KITTY_SIZE, game.trumpSuit, game.trumpRank
    );
    return game.discardToKitty(declarerId, cardIds);
}

/**
 * Play whole tricks — every seat, the requesting player's included — until
 * `done()` holds at a trick boundary. Stopping mid-trick would drop the human
 * into a turn order they never saw the start of.
 */
function playUntil(room, done) {
    const game = room.game;
    let plays  = 0;

    while (game.phase === GAME_PHASES.PLAYING && plays++ < MAX_AUTO_PLAYS) {
        if (game.currentTrick.length === 0 && done()) break;

        const socketId = game.currentPlayerSocketId;
        const cardIds  = room.autoPlayChoice(socketId);
        if (!cardIds || cardIds.length === 0) break;
        if (game.playCards(socketId, cardIds).error) break;
    }
}

function minHandSize(game) {
    return Math.min(...game.players.map(p => (game.hands[p.socketId] || []).length));
}

/**
 * Decide the endgame before the last tricks are played.
 *
 * The attacker score is the only number the round verdict reads, so setting it
 * is enough to fix the outcome — and only the attackers ever score, which is
 * why "you win" means a high attacker score in one role and a low one in the
 * other. `pointsPlayed` has to move with it or the ladder and the "points
 * remaining" counter would contradict each other on screen.
 *
 * The remaining tricks are real: attackers can still climb into a higher band,
 * and a kitty capture on the last trick can still turn a losing score around.
 */
function rigEndgameScore(game, role, wantWin) {
    const threshold        = LEVEL_THRESHOLDS[game.trumpRank];
    const attackersMustWin = (role === 'attacking') === wantWin;
    const score            = attackersMustWin
        ? threshold + ENDGAME_MARGIN
        : Math.max(0, threshold - ENDGAME_MARGIN);

    game.scores[game.attackingTeam] = score;
    game.pointsPlayed = Math.min(TOTAL_POINTS, Math.max(game.pointsPlayed, score));
}

function summarise(game, me) {
    return {
        phase:         game.phase,
        trumpSuit:     game.trumpSuit,
        trumpRank:     game.trumpRank,
        threshold:     LEVEL_THRESHOLDS[game.trumpRank],
        teamLevels:    { ...game.teamLevels },
        attackingTeam: game.attackingTeam,
        myTeam:        me.teamIndex,
        tricksPlayed:  game.tricks.length,
        attackerScore: game.scores[game.attackingTeam],
    };
}

module.exports = {
    applyScenario,
    SCENARIOS,
    MIDGAME_TRICKS,
    ENDGAME_CARDS_LEFT,
    ENDGAME_MARGIN,
};
