import React from 'react';
import { SUIT_SYMBOLS } from '../../suits';
import './PlayerInfo.css';

const TEAM_COLORS = ['var(--color-team0)', 'var(--color-team1)'];

// No cardCount here on purpose: every player plays the lead count every trick,
// so all four hands are always equal and a per-seat number says nothing. The
// single "cards left" figure lives on the round line instead.
export default function PlayerInfo({ player, isActive, trumpSuit, attackingTeam, vertical }) {
  if (!player) {
    return (
      <div className={`player-info player-info--empty ${vertical ? 'player-info--vertical' : ''}`}>
        <span className="player-info__avatar">?</span>
        <span className="player-info__name">Waiting…</span>
      </div>
    );
  }

  const teamColor = TEAM_COLORS[player.teamIndex] || '#888';
  // Undefined means the sides are not settled yet — nobody has called. Treating
  // that as "not attacking" badged all four seats DEF through the whole deal,
  // which is the opposite of what passing undefined was meant to achieve.
  const rolesKnown  = attackingTeam !== undefined && attackingTeam !== null;
  const isAttacking = rolesKnown && player.teamIndex === attackingTeam;

  return (
    <div
      className={[
        'player-info',
        isActive ? 'player-info--active' : '',
        vertical ? 'player-info--vertical' : '',
        !rolesKnown ? '' : isAttacking ? 'player-info--attacking' : 'player-info--defending',
      ].filter(Boolean).join(' ')}
      style={{ '--team-color': teamColor }}
    >
      <div className="player-info__avatar" style={{ background: teamColor }}>
        {player.name[0].toUpperCase()}
      </div>
      <div className="player-info__details">
        <span className="player-info__name">{player.name}</span>
        {rolesKnown && (
          <span className={`player-info__role ${isAttacking ? 'player-info__role--atk' : 'player-info__role--def'}`}>
            {isAttacking ? 'ATK' : 'DEF'}
          </span>
        )}
      </div>
      {isActive && <div className="player-info__turn-indicator">●</div>}
    </div>
  );
}
