import React from 'react';
import './ActionBar.css';

/**
 * The board's one place for verbs.
 *
 * Buttons are rendered for the whole phase, disabled rather than absent, with
 * the reason they are disabled shown as text instead of hidden in a tooltip —
 * a control that vanishes teaches nothing about why it is unavailable.
 *
 * `status` is the target ("2 of 2 selected"), `detail` the explanation
 * ("Pair of 7s", "Not your turn").
 */
export default function ActionBar({
  status,
  statusTone = 'muted',
  detail,
  detailTone = 'muted',
  actions = [],
  aside,
  busy,
}) {
  return (
    <div className={`action-bar${busy ? ' action-bar--busy' : ''}`}>
      <div className="action-bar__readout">
        {status && <span className={`action-bar__status action-bar__status--${statusTone}`}>{status}</span>}
        {detail && (
          <span
            className={`action-bar__detail action-bar__detail--${detailTone}`}
            title={typeof detail === 'string' ? detail : undefined}
          >
            {detail}
          </span>
        )}
      </div>

      <div className="action-bar__actions">
        {actions.map(({ key, label, onClick, disabled, disabledReason, variant = 'secondary' }) => (
          <button
            key={key}
            className={`btn-${variant} action-bar__btn`}
            onClick={onClick}
            disabled={!!disabled}
            title={disabled ? disabledReason || undefined : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {aside && <div className="action-bar__aside">{aside}</div>}
    </div>
  );
}
