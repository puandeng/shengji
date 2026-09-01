import React from 'react';
import { SUIT_SYMBOLS } from '../../suits';
import './Card.css';

const RED_SUITS    = new Set(['H', 'D']);

/**
 * Card component
 * Props:
 *   card        — card object { id, suit, rank, points, isJoker, isSmallJoker, isBigJoker }
 *   selected    — bool
 *   onClick     — handler
 *   disabled    — bool
 *   faceDown    — bool
 *   size        — 'sm' | 'md' | 'lg'
 *   highlight   — bool (point card glow)
 *   isTrump     — bool (trump border indicator)
 */
export default function Card({
  card,
  selected  = false,
  onClick,
  disabled  = false,
  faceDown  = false,
  size      = 'md',
  highlight = false,
  isTrump   = false,
}) {
  if (!card) return null;

  const isJoker  = card.isJoker || card.suit === 'JOKER';
  const isBig    = card.isBigJoker   || card.rank === 'BJ';
  const isSmall  = card.isSmallJoker || card.rank === 'SJ';
  const isRed    = !isJoker && RED_SUITS.has(card.suit);
  const symbol   = SUIT_SYMBOLS[card.suit] || '';

  const label    = isBig ? 'BJ' : isSmall ? 'SJ' : card.rank;
  const centerSym = isBig ? '★' : isSmall ? '☆' : symbol;
  // Jokers show their star in the corner too — in a fan the corner is the only
  // part of the card you can see, so BJ/SJ must be distinguishable there.
  const cornerSym = isJoker ? centerSym : symbol;
  // '10', 'BJ' and 'SJ' are two glyphs wide and would overrun the exposed
  // sliver at full rank size.
  const rankClass = String(label).length > 1 ? 'card__rank card__rank--wide' : 'card__rank';

  const classes = [
    'card',
    `card--${size}`,
    isJoker              ? (isBig ? 'card--joker-big' : 'card--joker-small') : '',
    !isJoker && isRed    ? 'card--red'       : (!isJoker ? 'card--black' : ''),
    selected             ? 'card--selected'  : '',
    disabled             ? 'card--disabled'  : '',
    highlight            ? 'card--highlight' : '',
    isTrump && !selected ? 'card--trump'     : '',
    faceDown             ? 'card--facedown'  : '',
    onClick && !disabled ? 'card--clickable' : '',
  ].filter(Boolean).join(' ');

  if (faceDown) {
    return (
      <div className={classes}>
        <div className="card__back" />
      </div>
    );
  }

  const titleStr = isJoker
    ? (isBig ? 'Big Joker' : 'Small Joker')
    : `${card.rank}${symbol}${card.points ? ` (${card.points}pts)` : ''}`;

  return (
    <div
      className={classes}
      onClick={disabled ? undefined : onClick}
      title={titleStr}
    >
      <div className="card__corner card__corner--top-left">
        <span className={rankClass}>{label}</span>
        <span className="card__suit">{cornerSym}</span>
      </div>
      <div className="card__center">{centerSym}</div>
      <div className="card__corner card__corner--bottom-right">
        <span className={rankClass}>{label}</span>
        <span className="card__suit">{cornerSym}</span>
      </div>
      {card.points > 0 && (
        <div className="card__points-badge">{card.points}</div>
      )}
    </div>
  );
}
