import React from 'react';
import './PlayerInfo.css';

const TEAM_COLORS = ['var(--color-team0)', 'var(--color-team1)'];
const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };

export default function PlayerInfo({ player, cardCount = 0, isActive, trumpSuit, attackingTeam, vertical }) {
  if (!player) {
    return (
      <div className={`player-info player-info--empty ${vertical ? 'player-info--vertical' : ''}`}>
        <span className="player-info__avatar">?</span>
        <span className="player-info__name">Waiting…</span>
      </div>
    );
  }

  const teamColor = TEAM_COLORS[player.teamIndex] || '#888';
  const isAttacking = attackingTeam !== undefined && player.teamIndex === attackingTeam;

  return (
    <div
      className={[
        'player-info',
        isActive ? 'player-info--active' : '',
        vertical ? 'player-info--vertical' : '',
        isAttacking ? 'player-info--attacking' : 'player-info--defending',
      ].filter(Boolean).join(' ')}
      style={{ '--team-color': teamColor }}
    >
      <div className="player-info__avatar" style={{ background: teamColor }}>
        {player.name[0].toUpperCase()}
      </div>
      <div className="player-info__details">
        <span className="player-info__name">{player.name}</span>
        <span className="player-info__meta">
          {cardCount} cards
          {trumpSuit && player.teamIndex !== undefined && (
            <span className="player-info__trump">
              {SUIT_SYMBOLS[trumpSuit]}
            </span>
          )}
        </span>
        <span className={`player-info__role ${isAttacking ? 'player-info__role--atk' : 'player-info__role--def'}`}>
          {isAttacking ? 'ATK' : 'DEF'}
        </span>
      </div>
      {isActive && <div className="player-info__turn-indicator">●</div>}
    </div>
  );
}
