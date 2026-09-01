import React from 'react';
import { useGame } from '../context/GameContext';
import GameBoard from '../components/GameBoard/GameBoard';
import ScoringModal from '../components/ScoringModal/ScoringModal';
import Notification from '../components/Notification/Notification';
import ChatPanel from '../components/ChatPanel/ChatPanel';
import DevMenu from '../components/DevMenu/DevMenu';
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
      {devMode && <DevMenu variant="floating" />}
      {notification && <Notification message={notification} />}

      <GameBoard />
      <ChatPanel />

      {(isScoring || isGameOver) && <ScoringModal />}
    </div>
  );
}
