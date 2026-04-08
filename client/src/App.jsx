import React from 'react';
import { SocketProvider } from './context/SocketContext';
import { GameProvider, useGame } from './context/GameContext';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Game from './pages/Game';

function AppRouter() {
  const { screen } = useGame();

  switch (screen) {
    case 'lobby': return <Lobby />;
    case 'game':  return <Game />;
    default:      return <Home />;
  }
}

export default function App() {
  return (
    <SocketProvider>
      <GameProvider>
        <AppRouter />
      </GameProvider>
    </SocketProvider>
  );
}
