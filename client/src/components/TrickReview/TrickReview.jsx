import React, { useEffect } from 'react';
import Card from '../Card/Card';
import './TrickReview.css';

/**
 * The trick just played, in play order, with the name of whoever played each
 * card.
 *
 * The old review reopened the table's cross layout inside a box that was
 * `max-height: 100%; overflow: auto` in an already-short column, so it arrived
 * as a scrollable sliver of four anonymous cards — the one question it exists
 * to answer, "who played what", was the one thing it did not say.
 *
 * Order is the order the cards were played, left to right, because that is what
 * the question is usually about: who led, who followed, who took it.
 */
export default function TrickReview({ trick = [], players = [], winnerSocketId, summary, credited, onClose }) {
  useEffect(() => {
    const onKeyDown = e => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!trick.length) return null;

  const nameOf = socketId => players.find(p => p.socketId === socketId)?.name ?? 'Player';
  const teamOf = socketId => players.find(p => p.socketId === socketId)?.teamIndex;

  const points = trick.reduce(
    (sum, play) => sum + (play.cards || []).reduce((s, c) => s + (c.points || 0), 0), 0,
  );

  return (
    <div className="trick-review" role="dialog" aria-label="Last trick" onClick={onClose}>
      <div className="trick-review__panel" onClick={e => e.stopPropagation()}>
        <header className="trick-review__head">
          <span className="trick-review__title">Last trick</span>
          <span className="trick-review__points">
            {points} point{points === 1 ? '' : 's'} on the table
          </span>
          <button type="button" className="trick-review__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <ol className="trick-review__plays">
          {trick.map((play, i) => {
            const won  = play.socketId === winnerSocketId;
            const led  = i === 0;
            const team = teamOf(play.socketId);
            const cards = play.cards || (play.card ? [play.card] : []);
            const playPoints = cards.reduce((s, c) => s + (c.points || 0), 0);

            return (
              <li
                key={play.socketId ?? i}
                className={`trick-review__play${won ? ' trick-review__play--won' : ''}`}
              >
                <div className="trick-review__cards">
                  {cards.map((card, j) => (
                    <Card key={card?.id ?? j} card={card} size="md" />
                  ))}
                </div>
                <div className="trick-review__who">
                  <span className={`trick-review__name trick-review__name--team${team ?? 0}`}>
                    {nameOf(play.socketId)}
                  </span>
                  <span className="trick-review__tags">
                    {led && <span className="trick-review__tag">led</span>}
                    {won && <span className="trick-review__tag trick-review__tag--won">took it</span>}
                    {playPoints > 0 && <span className="trick-review__tag trick-review__tag--pts">{playPoints} pts</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>

        {summary && <p className="trick-review__summary">{summary}</p>}
        {credited > 0 && (
          <p className="trick-review__credited">Credited to the attackers: {credited} points.</p>
        )}
      </div>
    </div>
  );
}
