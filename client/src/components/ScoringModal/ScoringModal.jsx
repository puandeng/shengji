import React from 'react';
import { useGame } from '../../context/GameContext';
import './ScoringModal.css';

export default function ScoringModal() {
  const { gameState, myPlayer, startNewRound } = useGame();
  if (!gameState) return null;

  const { phase, scores, teamLevels, roundScores, attackingTeam, winner, threshold } = gameState;
  const isGameOver = phase === 'GAME_OVER';

  const attacking      = attackingTeam ?? 0;
  const defending      = attacking === 0 ? 1 : 0;
  const attackingScore = scores?.[attacking] ?? 0;
  const attackingWon   = attackingScore >= (threshold ?? 80);

  const isHost = myPlayer?.seatIndex === 0;

  return (
    <div className="scoring-overlay">
      <div className="scoring-modal">
        <h2 className="scoring-title">
          {isGameOver ? 'Game Over!' : 'Round Results'}
        </h2>

        {isGameOver ? (
          <div className="scoring-winner">
            <div className="scoring-winner__badge">
              Team {(winner ?? 0) + 1} wins the match!
            </div>
          </div>
        ) : (
          <div className="scoring-result">
            <span className={`scoring-result__label ${attackingWon ? 'won' : 'lost'}`}>
              {attackingWon ? '⚔️ Attacking team wins this round!' : '🛡️ Defending team wins this round!'}
            </span>
          </div>
        )}

        <div className="scoring-points">
          <ScoreRow label={`Team 1 captured`} value={`${scores?.[0] ?? 0} pts`} />
          <ScoreRow label={`Team 2 captured`} value={`${scores?.[1] ?? 0} pts`} />
          {threshold != null && (
            <ScoreRow label="Threshold" value={`${threshold} pts`} highlight />
          )}
        </div>

        <div className="scoring-rounds">
          <h3>Team Levels</h3>
          <LevelRow team="Team 1" level={teamLevels?.[0] ?? '2'} isWinner={winner === 0} />
          <LevelRow team="Team 2" level={teamLevels?.[1] ?? '2'} isWinner={winner === 1} />
        </div>

        {!isGameOver && isHost && (
          <button className="btn-primary scoring-btn" onClick={startNewRound}>
            Start Next Round
          </button>
        )}
        {!isGameOver && !isHost && (
          <p className="scoring-waiting">Waiting for host to start next round…</p>
        )}
        {isGameOver && (
          <button className="btn-secondary scoring-btn" onClick={() => window.location.reload()}>
            Play Again
          </button>
        )}
      </div>
    </div>
  );
}

function ScoreRow({ label, value, highlight }) {
  return (
    <div className={`score-row${highlight ? ' score-row--highlight' : ''}`}>
      <span>{label}</span>
      <span className="score-row__value">{value}</span>
    </div>
  );
}

const LEVEL_ORDER = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

function LevelRow({ team, level, isWinner }) {
  const idx   = LEVEL_ORDER.indexOf(level);
  const total = LEVEL_ORDER.length;

  return (
    <div className="level-row">
      <span className="level-row__team">{team}{isWinner ? ' 🏆' : ''}</span>
      <span className="level-row__level">Level {level}</span>
      <div className="level-row__bar">
        {LEVEL_ORDER.map((l, i) => (
          <div
            key={l}
            className={`level-row__pip ${i <= idx ? 'level-row__pip--filled' : ''}`}
            title={l}
          />
        ))}
      </div>
    </div>
  );
}
