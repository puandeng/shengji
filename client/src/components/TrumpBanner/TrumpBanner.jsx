import React from 'react';
import './TrumpBanner.css';

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAMES   = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
const RED_SUITS    = new Set(['H', 'D']);

const STRENGTH_LABEL = { 1: 'single', 2: 'pair', 3: 'joker pair' };

export default function TrumpBanner({ trumpSuit, trumpRank, trumpCallStrength, attackingTeam, players, phase }) {
  const isTrumpSelection = phase === 'TRUMP_SELECTION';

  if (!trumpSuit && isTrumpSelection) {
    return (
      <div className="trump-banner trump-banner--waiting">
        <span>
          Waiting for trump call — reveal a <strong>{trumpRank}</strong> to call trump
        </span>
      </div>
    );
  }

  if (!trumpSuit) {
    return (
      <div className="trump-banner trump-banner--waiting">
        <span>Waiting for trump declaration…</span>
      </div>
    );
  }

  const isRed    = RED_SUITS.has(trumpSuit);
  const teamName = `Team ${(attackingTeam ?? 0) + 1}`;
  const callStr  = trumpCallStrength ? ` (${STRENGTH_LABEL[trumpCallStrength] ?? ''} call)` : '';

  return (
    <div className="trump-banner">
      <span className="trump-banner__label">Trump</span>
      <span className={`trump-banner__suit ${isRed ? 'trump-banner__suit--red' : ''}`}>
        {SUIT_SYMBOLS[trumpSuit]} {SUIT_NAMES[trumpSuit]}
      </span>
      {trumpRank && (
        <>
          <span className="trump-banner__divider">·</span>
          <span className="trump-banner__rank">Rank: {trumpRank}</span>
        </>
      )}
      {isTrumpSelection && callStr && (
        <span className="trump-banner__call-status">{callStr}</span>
      )}
      <span className="trump-banner__divider">|</span>
      <span className="trump-banner__attacking">
        ⚔️ {teamName} attacking
      </span>
    </div>
  );
}
