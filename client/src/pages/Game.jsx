import React from 'react';
import { useGame } from '../context/GameContext';
import GameBoard from '../components/GameBoard/GameBoard';
import ScoringModal from '../components/ScoringModal/ScoringModal';
import Notification from '../components/Notification/Notification';
import ChatPanel from '../components/ChatPanel/ChatPanel';
import './Game.css';

export default function Game() {
  const { gameState, notification, devMode } = useGame();

  if (!gameState) {
    return (
      <div className="game-loading">
        <div className="spinner" />
        <p>Loading game…</p>
      </div>
    );
  }

  const isScoring  = gameState.phase === 'SCORING';
  const isGameOver = gameState.phase === 'GAME_OVER';

  return (
    <div className="game-root">
      {devMode && <div className="dev-mode-indicator">DEV MODE</div>}
      {notification && <Notification message={notification} />}

      <GameBoard />
      <ChatPanel />

      {(isScoring || isGameOver) && <ScoringModal />}
    </div>
  );
}
