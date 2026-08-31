const fs   = require('fs');
const path = require('path');

const { SUIT_SYMBOLS } = require('./constants');

// Logs live at the repo root, deliberately outside server/ — nodemon watches
// server/ in dev, and writing log files in there would restart the process on
// every trick.
const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

/**
 * Compact card notation: S5, D10, CK, *s (small joker), *b (big joker).
 *
 * Jokers deliberately do NOT use their rank ('SJ'/'BJ') — 'SJ' would collide
 * with the jack of spades, which also renders suit-first as 'SJ'. A leading '*'
 * can never be a suit, so joker tokens stay unambiguous.
 */
function short(card) {
    if (!card) return '??';
    if (card.isJoker || card.suit === 'JOKER') {
        const big = card.isBigJoker !== undefined ? card.isBigJoker : card.rank === 'BJ';
        return big ? '*b' : '*s';
    }
    return `${card.suit}${card.rank}`;
}

/**
 * A play is written with no separator between cards — each token starts with a
 * suit letter or is BJ/SJ, so "S5S5" and "D10CK" parse unambiguously.
 */
function shortPlay(cards) {
    return (cards || []).map(short).join('');
}

function shortList(cards) {
    return (cards || []).map(short).join(' ');
}

function suitLabel(suit) {
    if (!suit) return 'NT';                      // joker-pair call — no trump suit
    return SUIT_SYMBOLS[suit] || suit;
}

/**
 * Per-room game logger. Writes two files side by side:
 *
 *   logs/<CODE>-<timestamp>.jsonl — one JSON record per event, for agents/tools
 *   logs/<CODE>-<timestamp>.log   — chess-style notation, for humans skimming
 *
 * Both are append-only and flushed per event, so an abandoned or crashed game
 * still leaves a complete record up to the point it stopped.
 *
 * Disable with GAME_LOG=0.
 */
class GameLogger {
    constructor(roomCode) {
        this.roomCode = roomCode;
        this.enabled  = process.env.GAME_LOG !== '0';
        this.seq      = 0;
        this.trickNo  = 0;
        if (!this.enabled) return;

        try {
            fs.mkdirSync(LOG_DIR, { recursive: true });
            const stamp    = new Date().toISOString().replace(/[:.]/g, '-');
            this.jsonlPath = path.join(LOG_DIR, `${roomCode}-${stamp}.jsonl`);
            this.notePath  = path.join(LOG_DIR, `${roomCode}-${stamp}.log`);
        } catch (err) {
            this._disable(err);
        }
    }

    _disable(err) {
        this.enabled = false;
        console.error('[GameLogger] disabled:', err.message);
    }

    /** Append a structured record to the .jsonl stream. */
    event(type, data = {}) {
        if (!this.enabled) return;
        const rec = { seq: ++this.seq, ts: new Date().toISOString(), room: this.roomCode, type, ...data };
        try {
            fs.appendFileSync(this.jsonlPath, `${JSON.stringify(rec)}\n`);
        } catch (err) {
            this._disable(err);
        }
    }

    /** Append a line to the human-readable notation file. */
    note(line = '') {
        if (!this.enabled) return;
        try {
            fs.appendFileSync(this.notePath, `${line}\n`);
        } catch (err) {
            this._disable(err);
        }
    }

    // ─────────────────────────────────────────────
    // Domain events
    // ─────────────────────────────────────────────

    roundStart({ roundNumber, players, teamLevels, trumpRank, attackingTeam }) {
        this.trickNo = 0;
        this.event('round_start', { roundNumber, players, teamLevels, trumpRank, attackingTeam });

        if (roundNumber === 1) {
            this.note(`# Sheng Ji game log — room ${this.roomCode}`);
            this.note(`# started ${new Date().toISOString()}`);
            this.note('# cards: <suit><rank> (S5, D10, CK); *b = big joker, *s = small joker');
            this.note('# a play with no separator is one combo: S5S5 = pair of 5s');
            this.note('');
        }
        this.note(`=== Round ${roundNumber} ===`);
        this.note(`seats  ${players.map(p => `${p.seatIndex}:${p.name}[T${p.teamIndex}]${p.isBot ? '*' : ''}`).join('  ')}`);
        this.note(`levels T0=${teamLevels[0]} T1=${teamLevels[1]}   trump rank ${trumpRank}`);
    }

    deal({ hands, kitty }) {
        this.event('deal', { hands, kitty });
        this.note(`kitty  ${shortList(kitty)}`);
        hands.forEach(h => this.note(`hand ${h.seatIndex}  ${shortList(h.cards)}`));
    }

    /** A slow-motion deal pause window opened. `trigger` never names a player. */
    dealWindow({ windowIndex, trigger, dealtCount, totalCards }) {
        this.event('deal_window', { windowIndex, trigger, dealtCount, totalCards });
        this.note(`-- call window ${windowIndex} opened at ${dealtCount}/${totalCards} dealt (${trigger === 'card' ? 'a call became possible' : 'interval'})`);
    }

    trumpCall({ seatIndex, name, cards, strength, trumpSuit, attackingTeam }) {
        this.event('trump_call', { seatIndex, name, cards, strength, trumpSuit, attackingTeam });
        this.note(`trump call: seat${seatIndex} ${shortPlay(cards)} → ${suitLabel(trumpSuit)} (strength ${strength}, attackers T${attackingTeam})`);
    }

    trumpRejected({ seatIndex, cardIds, error }) {
        this.event('trump_rejected', { seatIndex, cardIds, error });
        this.note(`trump call REJECTED: seat${seatIndex} ${cardIds.join(',')} — ${error}`);
    }

    trumpPass({ seatIndex, name, allPassed, windowIndex }) {
        this.event('trump_pass', { seatIndex, name, allPassed, windowIndex });
        const where = windowIndex ? ` [call window ${windowIndex}]` : '';
        this.note(`trump pass: seat${seatIndex}${where}${allPassed ? ' (all passed)' : ''}`);
    }

    trumpFinal({ trumpSuit, trumpRank, declarerSeat, attackingTeam, threshold, auto }) {
        this.event('trump_final', { trumpSuit, trumpRank, declarerSeat, attackingTeam, threshold, auto });
        this.note(`trump SET: ${suitLabel(trumpSuit)} rank ${trumpRank} | declarer seat${declarerSeat ?? '-'}${auto ? ' (auto)' : ''} | attackers T${attackingTeam} | threshold ${threshold}`);
    }

    kittyDiscard({ seatIndex, cards }) {
        this.event('kitty_discard', { seatIndex, cards });
        this.note(`discard seat${seatIndex}: ${shortList(cards)}`);
        this.note('');
    }

    play({ seatIndex, name, isBot, cards, shape, leadSeat, legalCardIds, handBefore }) {
        // A decision record, not just an outcome: who chose, what they were
        // holding, what the rules allowed, and which of those they picked.
        // Without the legal set a training pipeline has to re-derive legality
        // by reimplementing the rules or replaying through the server.
        this.event('play', {
            seatIndex, name, isBot: !!isBot, cards, shape,
            isLead: seatIndex === leadSeat,
            legalCardIds, handBefore,
        });
    }

    playRejected({ seatIndex, cardIds, error }) {
        this.event('play_rejected', { seatIndex, cardIds, error });
        this.note(`  !! play REJECTED seat${seatIndex} ${cardIds.join(',')} — ${error}`);
    }

    /**
     * The important one for debugging scoring. `credited` is what actually
     * reached the attacker score; `reason` says why it was or wasn't credited,
     * which is what makes "I won that trick, where are my points?" answerable
     * from the log alone.
     */
    trickEnd(data) {
        this.trickNo += 1;
        const {
            plays, winnerSeat, winnerTeam, attackingTeam, trickPoints,
            credited, reason, kittyPoints, kittyMultiplier, kittyBonus,
            throwPenalty, scores, threshold, isLastTrick,
        } = data;

        this.event('trick_end', { trickNo: this.trickNo, ...data });

        const playStr = plays
            .map(p => `${p.seatIndex}:${shortPlay(p.cards)}`)
            .join('  ');
        const role  = winnerTeam === attackingTeam ? 'ATK' : 'DEF';
        const parts = [
            `${String(this.trickNo).padStart(2)}. ${playStr}`,
            `> seat${winnerSeat} [T${winnerTeam} ${role}]`,
            `table ${trickPoints}pts`,
            `credited +${credited}`,
            `att ${scores[attackingTeam]}/${threshold}`,
        ];
        this.note(parts.join('  '));
        if (reason) this.note(`      ${reason}`);
        if (throwPenalty) this.note(`      throw penalty applied: ${throwPenalty > 0 ? '+' : ''}${throwPenalty}`);
        if (isLastTrick) {
            const fate = kittyBonus === 0
                ? 'protected by the declarers — their own bury, so it pays nobody'
                : `+${kittyBonus} to the attackers — they captured the declarers' bury`;
            // kittyPoints is now computed on every last trick, so a protected
            // bury reports its real value instead of logging as 0pts.
            this.note(`      last trick: kitty ${kittyPoints}pts × ${kittyMultiplier} → ${fate}`);
        }
    }

    roundEnd(data) {
        const { attackingTeam, attackingScore, threshold, attackingWon, advancingTeam, levelsAdvanced, teamLevels, gameOver, winner } = data;
        this.event('round_end', data);
        this.note('');
        this.note(`round end: attackers T${attackingTeam} scored ${attackingScore}/${threshold} → ${attackingWon ? 'WIN' : 'LOSS'}`);
        this.note(`           T${advancingTeam} advances ${levelsAdvanced} level(s) → T0=${teamLevels[0]} T1=${teamLevels[1]}`);
        if (gameOver) this.note(`GAME OVER — team ${winner} wins the match`);
        this.note('');
    }
}

module.exports = { GameLogger, short, shortPlay, shortList, LOG_DIR };
