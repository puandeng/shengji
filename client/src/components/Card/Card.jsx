import React from 'react';
import './Card.css';

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RED_SUITS    = new Set(['H', 'D']);

/**
 * Card component
 * Props:
 *   card        — card object { id, suit, rank, points }
 *   selected    — bool, whether card is selected (for multi-select)
 *   onClick     — handler
 *   disabled    — bool
 *   faceDown    — bool, show card back
 *   size        — 'sm' | 'md' | 'lg' (default 'md')
 *   highlight   — bool, glow effect (e.g. when it's a point card)
 */
export default function Card({
  card,
  selected  = false,
  onClick,
  disabled  = false,
  faceDown  = false,
  size      = 'md',
  highlight = false,
}) {
  if (!card) return null;

  const isRed  = RED_SUITS.has(card.suit);
  const symbol = SUIT_SYMBOLS[card.suit] || '?';

  const classes = [
    'card',
    `card--${size}`,
    isRed    ? 'card--red'       : 'card--black',
    selected  ? 'card--selected'  : '',
    disabled  ? 'card--disabled'  : '',
    highlight ? 'card--highlight' : '',
    faceDown  ? 'card--facedown'  : '',
    onClick && !disabled ? 'card--clickable' : '',
  ].filter(Boolean).join(' ');

  if (faceDown) {
    return (
      <div className={classes}>
        <div className="card__back" />
      </div>
    );
  }

  return (
    <div
      className={classes}
      onClick={disabled ? undefined : onClick}
      title={`${card.rank}${symbol}${card.points ? ` (${card.points}pts)` : ''}`}
    >
      <div className="card__corner card__corner--top-left">
        <span className="card__rank">{card.rank}</span>
        <span className="card__suit">{symbol}</span>
      </div>
      <div className="card__center">{symbol}</div>
      <div className="card__corner card__corner--bottom-right">
        <span className="card__rank">{card.rank}</span>
        <span className="card__suit">{symbol}</span>
      </div>
      {card.points > 0 && (
        <div className="card__points-badge">{card.points}</div>
      )}
    </div>
  );
}
