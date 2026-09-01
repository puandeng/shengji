import React, { useEffect, useRef, useState } from 'react';
import Card from '../Card/Card';
import './ScoreLadder.css';

const TEAM_NAME  = { attackers: 'Attackers', defenders: 'Defenders' };
const TEAM_SHORT = { attackers: 'ATK', defenders: 'DEF' };

// A band that spans a single point (attackers held to 0) would otherwise be one
// pixel wide, and that band is exactly the one worth seeing.
const MIN_BAND_FRAC = 0.07;

function layout(bands) {
  const domainLo = bands[0].min;
  const domainHi = bands[bands.length - 1].max + 1;
  const span     = Math.max(1, domainHi - domainLo);

  const edges = bands.map((b, i) => [b.min, i < bands.length - 1 ? bands[i + 1].min : domainHi]);
  const raw   = edges.map(([lo, hi]) => Math.max((hi - lo) / span, MIN_BAND_FRAC));
  const sum   = raw.reduce((a, w) => a + w, 0);
  const widths = raw.map(w => w / sum);

  const offsets = [];
  let acc = 0;
  widths.forEach((w) => { offsets.push(acc); acc += w; });

  return { edges, widths, offsets };
}

/**
 * Where the round stands.
 *
 * The round is not pass/fail at the threshold — both teams take more levels on
 * a bigger margin — so the whole ladder matters. It does not all matter *at
 * once*, though: the strip carries the three facts you steer by (your role, the
 * score against the target, and what the current band would pay), and the rest
 * — every band's range, the distance to the boundary either side, the points
 * still out there, the cards actually captured — waits behind one click.
 *
 * Every boundary comes from the server's `levelBands`; nothing here assumes 80
 * or 40, which are wrong once a team is playing at level A.
 */
export default function ScoreLadder({
  score = 0, bands, threshold, pointsRemaining, myRole, pileCards = [],
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const usable = Array.isArray(bands) && bands.length > 0 ? bands : null;

  // Before the server sends levelBands there is still a round in progress, so
  // fall back to the one number we can always state truthfully.
  if (!usable) {
    return (
      <div className="ladder ladder--fallback">
        <span className="ladder__fallback-label">Attackers</span>
        <span className="ladder__fallback-score">
          {score}{threshold ? ` / ${threshold}` : ''}
        </span>
      </div>
    );
  }

  const { edges, widths, offsets } = layout(usable);

  let idx = usable.findIndex(b => score >= b.min && score <= b.max);
  if (idx < 0) idx = score < usable[0].min ? 0 : usable.length - 1;

  const current = usable[idx];
  const prev    = idx > 0 ? usable[idx - 1] : null;
  const next    = idx < usable.length - 1 ? usable[idx + 1] : null;

  const [curLo, curHi] = edges[idx];
  const withinBand = Math.min(1, Math.max(0, (score - curLo) / Math.max(1, curHi - curLo)));
  const markerFrac = offsets[idx] + widths[idx] * withinBand;

  const toNext    = next ? next.min - score : null;
  const sincePrev = prev ? score - current.min : null;

  const remaining = Number.isFinite(pointsRemaining) ? pointsRemaining : null;
  const ceiling   = remaining == null ? null : score + remaining;

  // Whether the current band pays the reader's own side. The board shows a real
  // ATK/DEF badge, so an unqualified "DEFENDERS +2" reads as the reader's role
  // rather than as a forecast about a team.
  const winning = myRole ? current.team === myRole : null;

  const bandClass = (band, i) => [
    'ladder__band',
    `ladder__band--${band.team}`,
    i < idx ? 'ladder__band--passed' : '',
    i === idx ? 'ladder__band--current' : '',
    ceiling != null && band.min > ceiling ? 'ladder__band--out' : '',
    myRole && band.team === myRole ? 'ladder__band--mine' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={`ladder${open ? ' ladder--open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="ladder__strip"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title="Show every band, the distance to each boundary, and the cards captured"
      >
        {myRole && (
          <span className={`ladder__role ladder__role--${myRole}`}>
            {TEAM_SHORT[myRole]}
          </span>
        )}

        <span className="ladder__score">
          <strong>{score}</strong>
          <span className="ladder__score-target">/{threshold}</span>
        </span>

        <span className="ladder__track ladder__track--slim">
          {usable.map((band, i) => (
            <span
              key={`${band.min}-${band.max}`}
              className={bandClass(band, i)}
              style={{ width: `${widths[i] * 100}%` }}
            />
          ))}
          <span className="ladder__marker" style={{ left: `${markerFrac * 100}%` }} />
        </span>

        <span className={`ladder__verdict${winning === null ? '' : winning ? ' ladder__verdict--good' : ' ladder__verdict--bad'}`}>
          {TEAM_NAME[current.team] ?? current.team} +{current.levels}
        </span>

        <span className="ladder__chevron" aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>

      {open && (
        <div className="ladder__detail" role="dialog" aria-label="Round standing">
          <p className="ladder__sentence">
            {myRole === 'attackers'
              ? <>You are <strong>attacking</strong>: collect {threshold} points to take the bank.</>
              : myRole === 'defenders'
                ? <>You are <strong>defending</strong>: hold the attackers under {threshold}.</>
                : <>Attackers need {threshold} points to take the bank.</>}
            {' '}End the round here and the <strong>{(TEAM_NAME[current.team] ?? current.team).toLowerCase()}</strong>{' '}
            climb {current.levels} level{current.levels === 1 ? '' : 's'}.
          </p>

          <div className="ladder__track ladder__track--tall">
            {usable.map((band, i) => (
              <div
                key={`${band.min}-${band.max}`}
                className={bandClass(band, i)}
                style={{ width: `${widths[i] * 100}%` }}
                title={`${band.min}–${band.max} pts → ${TEAM_NAME[band.team] ?? band.team} +${band.levels}`}
              >
                <span className="ladder__band-level">+{band.levels}</span>
              </div>
            ))}
            <div className="ladder__marker ladder__marker--tall" style={{ left: `${markerFrac * 100}%` }} />
          </div>

          <div className="ladder__deltas">
            <span className="ladder__delta">
              {prev
                ? <>&#9666; {sincePrev} past {TEAM_SHORT[prev.team] ?? prev.team} +{prev.levels}</>
                : <>&#9666; floor</>}
            </span>
            <span className="ladder__delta">Target {threshold}</span>
            <span className="ladder__delta">
              {next
                ? <>{toNext} to {TEAM_SHORT[next.team] ?? next.team} +{next.levels} &#9656;</>
                : <>max &#9656;</>}
            </span>
          </div>

          {remaining != null && (
            <p className="ladder__remaining">
              {remaining} points still out there, kitty included
              {ceiling != null && <> — the attackers cannot finish above {Math.min(ceiling, usable[usable.length - 1].max)}</>}.
            </p>
          )}

          {pileCards.length > 0 && (
            <div className="ladder__pile">
              <span className="ladder__pile-label">Captured by the attackers</span>
              <div className="ladder__pile-cards">
                {pileCards.map((card, i) => (
                  <Card key={card.id || i} card={card} size="sm" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
