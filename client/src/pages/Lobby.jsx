import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import DevMenu from '../components/DevMenu/DevMenu';
import './Lobby.css';

const TEAM_COLORS = ['#3498db', '#e74c3c'];

export default function Lobby() {
  const { room, myPlayer, startGame, addBot, removeBot, setTeamName, error, devMode } = useGame();

  if (!room) return null;

  const isHost       = myPlayer?.seatIndex === 0;
  const emptySeats   = 4 - room.playerCount;
  const hasBots      = room.players.some(p => p.isBot);
  const canStart     = room.playerCount >= 1;

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        {devMode && (
          <div className="dev-mode-banner">DEV MODE</div>
        )}
        <h2 className="lobby-title">Game Lobby</h2>

        <div className="lobby-code-section">
          <span className="lobby-code-label">Room Code</span>
          <div className="lobby-code">{room.code}</div>
          <span className="lobby-code-hint">Share this with your friends</span>
        </div>

        <div className="lobby-players">
          {/* Team 0: seats 0 & 2 */}
          <div className="lobby-team" style={{ borderColor: TEAM_COLORS[0] }}>
            <TeamName
              teamIndex={0}
              name={room.teamNames?.[0] || 'Team 1'}
              color={TEAM_COLORS[0]}
              canEdit={myPlayer?.teamIndex === 0}
              onSave={setTeamName}
            />
            <PlayerSlot seat={0} players={room.players} myPlayer={myPlayer} />
            <PlayerSlot seat={2} players={room.players} myPlayer={myPlayer} />
          </div>

          <div className="lobby-vs">VS</div>

          {/* Team 1: seats 1 & 3 */}
          <div className="lobby-team" style={{ borderColor: TEAM_COLORS[1] }}>
            <TeamName
              teamIndex={1}
              name={room.teamNames?.[1] || 'Team 2'}
              color={TEAM_COLORS[1]}
              canEdit={myPlayer?.teamIndex === 1}
              onSave={setTeamName}
            />
            <PlayerSlot seat={1} players={room.players} myPlayer={myPlayer} />
            <PlayerSlot seat={3} players={room.players} myPlayer={myPlayer} />
          </div>
        </div>

        {isHost && emptySeats > 0 && (
          <div className="lobby-bot-controls">
            <button className="btn-secondary" onClick={addBot}>
              + Add Bot
            </button>
            {hasBots && (
              <button className="btn-secondary" onClick={removeBot}>
                - Remove Bot
              </button>
            )}
          </div>
        )}

        <div className="lobby-status">
          {canStart
            ? (emptySeats > 0
              ? `Ready! ${emptySeats} bot${emptySeats > 1 ? 's' : ''} will fill remaining seats`
              : 'All players ready!')
            : 'Waiting for players…'}
        </div>

        {error && <p className="error-text">{error}</p>}

        {isHost && (
          <button
            className="btn-primary lobby-start-btn"
            onClick={startGame}
            disabled={!canStart}
          >
            Start Game{emptySeats > 0 ? ` (${emptySeats} bot${emptySeats > 1 ? 's' : ''} will join)` : ''}
          </button>
        )}

        {!isHost && (
          <p className="lobby-waiting-text">Waiting for the host to start…</p>
        )}

        {devMode && <DevMenu variant="panel" />}
      </div>
    </div>
  );
}

function TeamName({ teamIndex, name, color, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      onSave(teamIndex, trimmed).catch(() => {});
    }
    setEditing(false);
  }

  if (editing && canEdit) {
    return (
      <form className="team-name-form" onSubmit={handleSubmit}>
        <input
          className="team-name-input"
          style={{ color }}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          maxLength={20}
          autoFocus
          onBlur={handleSubmit}
        />
      </form>
    );
  }

  return (
    <h3
      className={`lobby-team-name ${canEdit ? 'lobby-team-name--editable' : ''}`}
      style={{ color }}
      onClick={() => { if (canEdit) { setDraft(name); setEditing(true); } }}
      title={canEdit ? 'Click to edit team name' : undefined}
    >
      {name}
      {canEdit && <span className="team-name-edit-hint">✎</span>}
    </h3>
  );
}

function PlayerSlot({ seat, players, myPlayer }) {
  const player = players.find(p => p.seatIndex === seat);
  const isMe   = player && myPlayer && player.name === myPlayer.name && player.seatIndex === seat;

  return (
    <div className={`player-slot ${player ? 'filled' : 'empty'}`}>
      {player ? (
        <>
          <span className="player-avatar">
            {player.isBot ? '🤖' : player.name[0].toUpperCase()}
          </span>
          <span className="player-name">
            {player.name}
            {isMe && <span className="player-you-badge"> (You)</span>}
            {player.isBot && <span className="player-bot-badge">BOT</span>}
          </span>
        </>
      ) : (
        <span className="player-empty-label">Waiting…</span>
      )}
    </div>
  );
}
