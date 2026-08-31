import React from 'react';
import { useGame } from '../../context/GameContext';
import Card from '../Card/Card';
import './ScoringModal.css';

export default function ScoringModal() {
  const { gameState, myPlayer, startNewRound, roundResult } = useGame();
  if (!gameState) return null;

  const { phase, scores, teamLevels, roundScores, attackingTeam, winner, threshold } = gameState;
  const isGameOver = phase === 'GAME_OVER';

  const attacking      = attackingTeam ?? 0;
  const defending      = attacking === 0 ? 1 : 0;
  const attackingScore = scores?.[attacking] ?? 0;
  // The server already decided this from the band ladder. Recomputing it here
  // could disagree with the ladder the player was just watching.
  const attackingWon   = roundResult?.attackingWon ?? (attackingScore >= (threshold ?? 80));
  const iAttacked      = myPlayer?.teamIndex === attacking;
  const iWon           = iAttacked === attackingWon;
  const kitty          = roundResult?.kittyResult;
  const tablePoints    = roundResult?.tablePoints ?? attackingScore;
  const levelsGained   = roundResult?.levelsAdvanced ?? 0;
  const advancing      = roundResult?.advancingTeam;

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
            <span className={`scoring-result__label ${iWon ? 'won' : 'lost'}`}>
              {iWon ? 'Your team wins the round' : 'Your team loses the round'}
            </span>
            <p className="scoring-result__why">
              {iAttacked
                ? <>You were <strong>attacking</strong>: you needed {threshold} points and collected {attackingScore}.</>
                : <>You were <strong>defending</strong>: you had to hold the attackers under {threshold}, and they collected {attackingScore}.</>}
            </p>
          </div>
        )}

        {/* Showing "Team 2 captured 0 pts" as a peer row read as a failure
            rather than the rule — only the attacking team ever scores. This
            accounts for the attackers' total instead, including the kitty,
            which used to swing the result by 90 with nothing explaining it. */}
        <div className="scoring-points">
          <ScoreRow label="Points taken in tricks" value={`${tablePoints} pts`} />
          {kitty && kitty.points > 0 && (
            <ScoreRow
              label={kitty.captured
                ? `Kitty captured (${kitty.points} × ${kitty.multiplier})`
                : `Kitty protected by the declarers (${kitty.points} pts)`}
              value={kitty.captured ? `+${kitty.bonus} pts` : '+0 pts'}
            />
          )}
          <ScoreRow label="Attackers' total" value={`${attackingScore} pts`} highlight />
          {threshold != null && (
            <ScoreRow label="Needed" value={`${threshold} pts`} />
          )}
        </div>

        {kitty && kitty.cards?.length > 0 && (
          <div className="scoring-kitty">
            <h3>The kitty {kitty.captured ? '— captured' : '— protected'}</h3>
            <div className="scoring-kitty__cards">
              {kitty.cards.map((c, i) => (
                <Card key={c.id || i} card={c} size="sm" highlight={c.points > 0} />
              ))}
            </div>
          </div>
        )}

        {advancing != null && (
          <p className="scoring-outcome">
            {levelsGained > 0
              ? <>Team {advancing + 1} climbs <strong>{levelsGained}</strong> level{levelsGained === 1 ? '' : 's'}.</>
              : <>Team {advancing + 1} takes the bank — no level this round.</>}
            {roundResult?.jackDemotion && <> The Jack demotion sends the declarers back to level 2.</>}
          </p>
        )}

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
