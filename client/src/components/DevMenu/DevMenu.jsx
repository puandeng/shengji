import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { suitSymbol } from '../../suits';
import './DevMenu.css';

const LEVELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const SCENARIOS = [
    { id: 'fresh',        label: 'Fresh start',   hint: 'Deal from the lobby, trump still to be called.' },
    { id: 'midgame',      label: 'Mid-game',      hint: 'Trump called, kitty buried, three tricks played.' },
    { id: 'endgame-win',  label: 'Endgame — win', hint: 'Two cards each, your team ahead of the threshold.' },
    { id: 'endgame-lose', label: 'Endgame — lose', hint: 'Two cards each, your team short of the threshold.' },
];

/**
 * DEV_MODE scenario picker.
 *
 * Reaching a late-round or level-up situation by playing takes several minutes,
 * so those states were the least tested part of the game. This drops the table
 * straight into one: pick which side you are on, what level each team holds,
 * and how far through the round to start.
 *
 * Nothing here is client logic — the server rebuilds the game and broadcasts a
 * fresh snapshot, exactly as it does for a real start.
 *
 * @param {'floating'|'panel'} variant — 'floating' is a corner button over the
 *   board, mirroring the chat toggle; 'panel' sits inside the lobby card.
 */
export default function DevMenu({ variant = 'panel' }) {
    const { setupScenario, myPlayer } = useGame();
    const [open, setOpen]     = useState(false);
    const [role, setRole]     = useState('attacking');
    const [myLevel, setMy]    = useState('2');
    const [oppLevel, setOpp]  = useState('2');
    const [busy, setBusy]     = useState(null);
    const [status, setStatus] = useState(null);

    async function run(scenario) {
        setBusy(scenario);
        setStatus(null);
        try {
            const res = await setupScenario({ scenario, role, myLevel, opponentLevel: oppLevel });
            setStatus({ ok: true, text: describe(res) });
            if (variant === 'floating') setOpen(false);
        } catch (err) {
            setStatus({ ok: false, text: String(err?.message || err) });
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className={`dev-menu dev-menu--${variant}`}>
            <button
                type="button"
                className="dev-menu__toggle"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                aria-label="Dev scenarios"
                title="Dev scenarios"
            >
                {variant === 'floating'
                    ? 'DEV'
                    : <>DEV MODE <span className="dev-menu__caret">{open ? '▴' : '▾'}</span> Scenarios</>}
            </button>

            {open && (
                <div className="dev-menu__panel" role="dialog" aria-label="Dev scenarios">
                    <div className="dev-menu__row">
                        <span className="dev-menu__label">You are</span>
                        <div className="dev-menu__segmented">
                            {['attacking', 'defending'].map(r => (
                                <button
                                    key={r}
                                    type="button"
                                    className={r === role ? 'is-active' : ''}
                                    onClick={() => setRole(r)}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="dev-menu__row">
                        <span className="dev-menu__label">Levels</span>
                        <div className="dev-menu__levels">
                            <label>
                                you
                                <select value={myLevel} onChange={e => setMy(e.target.value)}>
                                    {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </label>
                            <label>
                                them
                                <select value={oppLevel} onChange={e => setOpp(e.target.value)}>
                                    {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </label>
                        </div>
                    </div>

                    <div className="dev-menu__scenarios">
                        {SCENARIOS.map(s => (
                            <button
                                key={s.id}
                                type="button"
                                className="dev-menu__scenario"
                                disabled={busy !== null}
                                onClick={() => run(s.id)}
                            >
                                <span className="dev-menu__scenario-name">{s.label}</span>
                                <span className="dev-menu__scenario-hint">{s.hint}</span>
                            </button>
                        ))}
                    </div>

                    <p className="dev-menu__note">
                        Empty seats are filled with bots and everyone else's cards are played out to
                        get here. The remaining tricks are real, so an endgame can still swing —
                        a kitty capture on the last trick is worth several bands.
                        {myPlayer && <> You are seat {myPlayer.seatIndex + 1}.</>}
                    </p>

                    {status && (
                        <p className={status.ok ? 'dev-menu__status' : 'dev-menu__status dev-menu__status--error'}>
                            {status.text}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function describe(res) {
    if (!res) return 'Scenario set up.';
    if (res.scenario === 'fresh') {
        return `Fresh deal · rank ${res.trumpRank} · levels you ${res.teamLevels[res.myTeam]} / them ${res.teamLevels[res.myTeam === 0 ? 1 : 0]}`;
    }
    const side = res.myTeam === res.attackingTeam ? 'attacking' : 'defending';
    return `${side} · trump ${suitSymbol(res.trumpSuit)}${res.trumpRank} · need ${res.threshold} · `
        + `attackers ${res.attackerScore} · levels you ${res.teamLevels[res.myTeam]} / them ${res.teamLevels[res.myTeam === 0 ? 1 : 0]}`;
}
