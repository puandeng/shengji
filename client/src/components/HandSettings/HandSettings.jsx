import React, { useEffect, useRef, useState } from 'react';
import { SUIT_SYMBOLS, SUIT_NAMES } from '../../suits';
import { DEFAULT_PREFS } from './handPrefs';
import './HandSettings.css';

/**
 * Compact sort-order control for the hand.
 *
 * Lives in a narrow column beside the fan rather than above it: the hand area
 * is height-constrained, so the control may spend width but not vertical space.
 * The panel opens upward over the board and is dismissed on outside click/Esc.
 */
export default function HandSettings({ prefs, onChange }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = e => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        const onKeyDown = e => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    // Click-to-shift-left reaches every permutation in at most a few clicks and
    // needs no drag targets — which would be unusable at this size.
    function moveSuitLeft(suit) {
        const order = [...prefs.suitOrder];
        const i = order.indexOf(suit);
        if (i < 0) return;
        if (i === 0) {
            order.push(order.shift());
        } else {
            [order[i - 1], order[i]] = [order[i], order[i - 1]];
        }
        onChange({ suitOrder: order });
    }

    return (
        <div className="hand-settings" ref={rootRef}>
            <button
                type="button"
                className={open ? 'hand-settings__toggle hand-settings__toggle--open' : 'hand-settings__toggle'}
                onClick={() => setOpen(o => !o)}
                title="Hand sort order"
                aria-label="Hand sort order"
                aria-expanded={open}
            >
                ⇅
            </button>

            {open && (
                <div className="hand-settings__panel" role="dialog" aria-label="Hand sort order">
                    <div className="hand-settings__group">
                        <span className="hand-settings__label">Suit order</span>
                        <div className="hand-settings__suits">
                            {prefs.suitOrder.map(suit => (
                                <button
                                    type="button"
                                    key={suit}
                                    className={`hand-settings__suit hand-settings__suit--${suit === 'H' || suit === 'D' ? 'red' : 'black'}`}
                                    onClick={() => moveSuitLeft(suit)}
                                    title={`Move ${SUIT_NAMES[suit]} left`}
                                >
                                    {SUIT_SYMBOLS[suit]}
                                </button>
                            ))}
                        </div>
                        <span className="hand-settings__hint">Tap a suit to shift it left</span>
                    </div>

                    <div className="hand-settings__group">
                        <span className="hand-settings__label">Trump row</span>
                        <Segmented
                            value={prefs.trumpEnd}
                            options={[['left', 'Left'], ['right', 'Right']]}
                            onSelect={v => onChange({ trumpEnd: v })}
                        />
                    </div>

                    <div className="hand-settings__group">
                        <span className="hand-settings__label">Hand rows</span>
                        <Segmented
                            value={prefs.rows}
                            options={[['one', 'One'], ['two', 'Two']]}
                            onSelect={v => onChange({ rows: v })}
                        />
                    </div>

                    <div className="hand-settings__group">
                        <span className="hand-settings__label">Rank order</span>
                        <Segmented
                            value={prefs.rankDirection}
                            options={[['asc', 'Low → high'], ['desc', 'High → low']]}
                            onSelect={v => onChange({ rankDirection: v })}
                        />
                    </div>

                    <button
                        type="button"
                        className="hand-settings__reset"
                        onClick={() => onChange({ ...DEFAULT_PREFS })}
                    >
                        Reset to default
                    </button>
                </div>
            )}
        </div>
    );
}

function Segmented({ value, options, onSelect }) {
    return (
        <div className="hand-settings__seg">
            {options.map(([val, label]) => (
                <button
                    type="button"
                    key={val}
                    className={val === value ? 'hand-settings__seg-btn hand-settings__seg-btn--on' : 'hand-settings__seg-btn'}
                    onClick={() => onSelect(val)}
                    aria-pressed={val === value}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
