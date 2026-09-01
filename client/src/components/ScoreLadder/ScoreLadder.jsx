import React from 'react';
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
 * The round is not pass/fail at the threshold — both teams take more levels on a
 * bigger margin — so the score is shown against every band at once, with the
 * distance to the boundary on either side of where it currently sits.
 *
 * Every boundary comes from the server's `levelBands`; nothing here assumes 80
 * or 40, which are wrong once a team is playing at level A.
 */
export default function ScoreLadder({ score = 0, bands, threshold, pointsRemaining, myRole }) {
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

  return (
    <div className="ladder">
      <div className="ladder__head">
        {/* This is a forecast about a team, not the reader's own role. Without
            "ends here" it reads as a role badge — and since the board shows a
            real ATK/DEF badge elsewhere, an attacker sitting in a low band saw
            "DEFENDERS +2" and understandably read it as their own side. */}
        <span
          className={`ladder__now ladder__now--${current.team}`}
          title={`If the round ended at ${score} points, the ${TEAM_NAME[current.team] ?? current.team.toLowerCase()} would climb ${current.levels} level${current.levels === 1 ? '' : 's'}`}
        >
          <span className="ladder__now-lead">Ends here:</span>{' '}
          {TEAM_NAME[current.team] ?? current.team} +{current.levels}
        </span>
        <span className="ladder__score">{score} pts</span>
        {remaining != null && (
          <span className="ladder__remaining" title="Points still on the table, kitty included">
            {remaining} left
          </span>
        )}
      </div>

      <div className="ladder__track">
        {usable.map((band, i) => {
          const passed     = i < idx;
          const isCurrent  = i === idx;
          const unreachable = ceiling != null && band.min > ceiling;
          const cls = [
            'ladder__band',
            `ladder__band--${band.team}`,
            passed ? 'ladder__band--passed' : '',
            isCurrent ? 'ladder__band--current' : '',
            unreachable ? 'ladder__band--out' : '',
            myRole && band.team === myRole ? 'ladder__band--mine' : '',
          ].filter(Boolean).join(' ');

          return (
            <div
              key={`${band.min}-${band.max}`}
              className={cls}
              style={{ width: `${widths[i] * 100}%` }}
              title={`${band.min}–${band.max} pts → ${TEAM_NAME[band.team] ?? band.team} +${band.levels}${unreachable ? ' (out of reach)' : ''}`}
            >
              <span className="ladder__band-level">+{band.levels}</span>
            </div>
          );
        })}
        <div className="ladder__marker" style={{ left: `${markerFrac * 100}%` }}>
          <span className="ladder__marker-dot" />
        </div>
      </div>

      <div className="ladder__scale">
        {usable.map((band, i) => (
          <span key={`s-${band.min}`} className="ladder__tick" style={{ width: `${widths[i] * 100}%` }}>
            {band.min}
          </span>
        ))}
      </div>

      <div className="ladder__deltas">
        <span className="ladder__delta ladder__delta--down">
          {prev
            ? <>&#9666; {sincePrev} past {TEAM_SHORT[prev.team] ?? prev.team} +{prev.levels}</>
            : <>&#9666; floor</>}
        </span>
        <span className="ladder__delta ladder__delta--up">
          {next
            ? <>{toNext} to {TEAM_SHORT[next.team] ?? next.team} +{next.levels} &#9656;</>
            : <>max &#9656;</>}
        </span>
      </div>
    </div>
  );
}
