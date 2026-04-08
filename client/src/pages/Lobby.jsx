import React from 'react';
import { useGame } from '../context/GameContext';
import './Lobby.css';

const TEAM_COLORS = ['#3498db', '#e74c3c'];
const SEAT_LABELS = ['Seat 1', 'Seat 2', 'Seat 3', 'Seat 4'];

export default function Lobby() {
  const { room, myPlayer, startGame, error } = useGame();

  if (!room) return null;

  const isHost       = myPlayer?.seatIndex === 0;
  const canStart     = room.playerCount === 4;
  const emptySeats   = 4 - room.playerCount;

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <h2 className="lobby-title">Game Lobby</h2>

        <div className="lobby-code-section">
          <span className="lobby-code-label">Room Code</span>
          <div className="lobby-code">{room.code}</div>
          <span className="lobby-code-hint">Share this with your friends</span>
        </div>

        <div className="lobby-players">
          {/* Team 0: seats 0 & 2 */}
          <div className="lobby-team" style={{ borderColor: TEAM_COLORS[0] }}>
            <h3 style={{ color: TEAM_COLORS[0] }}>Team 1</h3>
            <PlayerSlot seat={0} players={room.players} myPlayer={myPlayer} />
            <PlayerSlot seat={2} players={room.players} myPlayer={myPlayer} />
          </div>

          <div className="lobby-vs">VS</div>

          {/* Team 1: seats 1 & 3 */}
          <div className="lobby-team" style={{ borderColor: TEAM_COLORS[1] }}>
            <h3 style={{ color: TEAM_COLORS[1] }}>Team 2</h3>
            <PlayerSlot seat={1} players={room.players} myPlayer={myPlayer} />
            <PlayerSlot seat={3} players={room.players} myPlayer={myPlayer} />
          </div>
        </div>

        <div className="lobby-status">
          {canStart
            ? '✅ All players ready!'
            : `⏳ Waiting for ${emptySeats} more player${emptySeats > 1 ? 's' : ''}…`}
        </div>

        {error && <p className="error-text">{error}</p>}

        {isHost && (
          <button
            className="btn-primary lobby-start-btn"
            onClick={startGame}
            disabled={!canStart}
          >
            Start Game
          </button>
        )}

        {!isHost && (
          <p className="lobby-waiting-text">Waiting for the host to start…</p>
        )}
      </div>
    </div>
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
            {player.name[0].toUpperCase()}
          </span>
          <span className="player-name">
            {player.name}
            {isMe && <span className="player-you-badge"> (You)</span>}
          </span>
        </>
      ) : (
        <span className="player-empty-label">Waiting…</span>
      )}
    </div>
  );
}
