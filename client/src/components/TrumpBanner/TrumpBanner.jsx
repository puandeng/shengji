import React from 'react';
import './TrumpBanner.css';

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAMES   = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
const RED_SUITS    = new Set(['H', 'D']);

export default function TrumpBanner({ trumpSuit, attackingTeam, players }) {
  if (!trumpSuit) {
    return (
      <div className="trump-banner trump-banner--waiting">
        <span>⏳ Waiting for trump declaration…</span>
      </div>
    );
  }

  const isRed = RED_SUITS.has(trumpSuit);
  const attackingPlayers = (players || []).filter(p => p.teamIndex === attackingTeam);
  const teamName = `Team ${(attackingTeam ?? 0) + 1}`;

  return (
    <div className="trump-banner">
      <span className="trump-banner__label">Trump</span>
      <span className={`trump-banner__suit ${isRed ? 'trump-banner__suit--red' : ''}`}>
        {SUIT_SYMBOLS[trumpSuit]} {SUIT_NAMES[trumpSuit]}
      </span>
      <span className="trump-banner__divider">|</span>
      <span className="trump-banner__attacking">
        ⚔️ {teamName} attacking
      </span>
    </div>
  );
}
