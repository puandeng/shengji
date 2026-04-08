import React from 'react';
import { useGame } from '../../context/GameContext';
import './ScoringModal.css';

export default function ScoringModal() {
  const { gameState, myPlayer, startNewRound } = useGame();
  if (!gameState) return null;

  const { phase, scores, roundScores, attackingTeam, winner } = gameState;
  const isGameOver = phase === 'GAME_OVER';

  const attacking = attackingTeam ?? 0;
  const defending = attacking === 0 ? 1 : 0;
  const attackingScore = scores?.[attacking] ?? 0;
  const attackingWon   = attackingScore >= 100;

  const isHost = myPlayer?.seatIndex === 0;

  return (
    <div className="scoring-overlay">
      <div className="scoring-modal">
        <h2 className="scoring-title">
          {isGameOver ? '🏆 Game Over!' : '📊 Round Results'}
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
          <ScoreRow label="Team 1 points" value={scores?.[0] ?? 0} />
          <ScoreRow label="Team 2 points" value={scores?.[1] ?? 0} />
        </div>

        <div className="scoring-rounds">
          <h3>Match Score (rounds won)</h3>
          <div className="scoring-rounds__row">
            <span>Team 1</span>
            <span className="scoring-rounds__stars">{renderStars(roundScores?.[0] ?? 0)}</span>
          </div>
          <div className="scoring-rounds__row">
            <span>Team 2</span>
            <span className="scoring-rounds__stars">{renderStars(roundScores?.[1] ?? 0)}</span>
          </div>
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

function ScoreRow({ label, value }) {
  return (
    <div className="score-row">
      <span>{label}</span>
      <span className="score-row__value">{value} pts</span>
    </div>
  );
}

function renderStars(count) {
  const total = 3;
  return '★'.repeat(count) + '☆'.repeat(Math.max(0, total - count));
}
