import React from 'react';
import { suitSymbol } from '../../suits';
import './TrumpBanner.css';

const RED_SUITS = new Set(['H', 'D']);

export default function TrumpBanner({ trumpSuit, trumpRank, trumpCallStrength, phase }) {
  const isTrumpPhase = phase === 'TRUMP_SELECTION' || phase === 'DEALING';
  const noTrumpCalled = !trumpSuit && trumpCallStrength === 3;
  const undecided = !trumpSuit && !noTrumpCalled;

  let suitClass = '';
  if (!undecided && !noTrumpCalled && trumpSuit) {
    suitClass = RED_SUITS.has(trumpSuit) ? 'trump-info__value--red' : 'trump-info__value--black';
  }

  return (
    <div className="trump-info">
      <div className="trump-info__row">
        <span className="trump-info__label">Trump</span>
        {undecided ? (
          <span className="trump-info__value trump-info__value--pending">
            {isTrumpPhase ? '?' : '—'}
          </span>
        ) : noTrumpCalled ? (
          <span className="trump-info__value trump-info__value--nt">NT</span>
        ) : (
          <span className={`trump-info__value ${suitClass}`}>
            {suitSymbol(trumpSuit)}
          </span>
        )}
      </div>
      <div className="trump-info__row">
        <span className="trump-info__label">Rank</span>
        <span className="trump-info__value trump-info__value--rank">{trumpRank || '—'}</span>
      </div>
    </div>
  );
}
