import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { useSocket } from './SocketContext';

const GameContext = createContext(null);

const INITIAL_STATE = {
  screen:        'home',   // 'home' | 'lobby' | 'game'
  myPlayer:      null,     // { socketId, name, seatIndex, teamIndex }
  room:          null,     // lobby info { code, players, isFull, phase }
  gameState:     null,     // full per-player game state from server
  error:         null,
  notification:  null,
  chatMessages:  [],
};

function reducer(state, action) {
  switch (action.type) {

    case 'SET_SCREEN':
      return { ...state, screen: action.payload, error: null };

    case 'JOIN_ROOM':
      return {
        ...state,
        screen:    'lobby',
        myPlayer:  action.payload.player,
        room:      action.payload.room,
        error:     null,
      };

    case 'UPDATE_ROOM':
      return { ...state, room: action.payload };

    case 'GAME_STATE':
      return {
        ...state,
        screen:    'game',
        gameState: action.payload,
      };

    case 'UPDATE_GAME_STATE':
      return {
        ...state,
        gameState: { ...state.gameState, ...action.payload },
      };

    case 'CARD_PLAYED':
      // Optimistic update for current trick display
      return {
        ...state,
        gameState: state.gameState
          ? { ...state.gameState, currentTrick: action.payload.trick, currentSeat: action.payload.currentSeat }
          : state.gameState,
      };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'SET_NOTIFICATION':
      return { ...state, notification: action.payload };

    case 'CLEAR_NOTIFICATION':
      return { ...state, notification: null };

    case 'ADD_CHAT':
      return { ...state, chatMessages: [...state.chatMessages.slice(-99), action.payload] };

    case 'RESET':
      return { ...INITIAL_STATE };

    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const { socket }        = useSocket();

  // ── Socket event listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const on = (event, handler) => socket.on(event, handler);

    // Lobby events
    on('player:joined',       ({ roomState })    => dispatch({ type: 'UPDATE_ROOM', payload: roomState }));
    on('player:left',         ({ roomState })    => dispatch({ type: 'UPDATE_ROOM', payload: roomState }));

    // Game events
    on('game:started',        (gameState)        => dispatch({ type: 'GAME_STATE',  payload: gameState }));
    on('game:newRound',       (gameState)        => dispatch({ type: 'GAME_STATE',  payload: gameState }));
    on('game:trumpCalled',    (gameState)        => {
      dispatch({ type: 'GAME_STATE', payload: gameState });
      const strengthLabel = gameState.strength === 3 ? 'joker pair' : gameState.strength === 2 ? 'pair' : 'single';
      dispatch({ type: 'SET_NOTIFICATION', payload: `${gameState.declarerName} called ${gameState.trumpSuit} with a ${strengthLabel}` });
      setTimeout(() => dispatch({ type: 'CLEAR_NOTIFICATION' }), 4000);
    });
    on('game:trumpSelected',  (gameState)        => {
      dispatch({ type: 'GAME_STATE', payload: gameState });
      const msg = gameState.auto
        ? `Trump auto-selected: ${gameState.trumpSuit}`
        : `${gameState.declarerName} declared trump: ${gameState.trumpSuit}`;
      dispatch({ type: 'SET_NOTIFICATION', payload: msg });
      setTimeout(() => dispatch({ type: 'CLEAR_NOTIFICATION' }), 4000);
    });
    on('game:kittyDiscarded', (gameState)        => dispatch({ type: 'GAME_STATE',  payload: gameState }));
    on('game:cardPlayed',     (data)             => dispatch({ type: 'CARD_PLAYED', payload: data }));
    on('game:cardsPlayed',    (data)             => dispatch({ type: 'CARD_PLAYED', payload: data }));
    on('game:trickComplete',  (gameState)        => {
      dispatch({ type: 'GAME_STATE', payload: gameState });
      if (gameState.gameOver) {
        const teamName = `Team ${gameState.winnerTeam + 1}`;
        dispatch({ type: 'SET_NOTIFICATION', payload: `Team ${gameState.winnerTeam + 1} wins the game!` });
      } else if (gameState.roundOver) {
        const adv = gameState.levelsAdvanced > 1 ? ` (+${gameState.levelsAdvanced} levels)` : '';
        const msg = gameState.attackingWon
          ? `Attacking team wins this round!${adv}`
          : `Defending team wins this round!${adv}`;
        dispatch({ type: 'SET_NOTIFICATION', payload: msg });
        setTimeout(() => dispatch({ type: 'CLEAR_NOTIFICATION' }), 5000);
      }
    });

    // Chat
    on('room:chatMessage',    (msg)              => dispatch({ type: 'ADD_CHAT', payload: msg }));

    return () => {
      socket.off('player:joined');
      socket.off('player:left');
      socket.off('game:started');
      socket.off('game:newRound');
      socket.off('game:trumpCalled');
      socket.off('game:trumpSelected');
      socket.off('game:kittyDiscarded');
      socket.off('game:cardPlayed');
      socket.off('game:cardsPlayed');
      socket.off('game:trickComplete');
      socket.off('room:chatMessage');
    };
  }, [socket]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const createRoom = useCallback((name) => {
    return new Promise((resolve, reject) => {
      socket.emit('room:create', { name }, (res) => {
        if (res.error) {
          dispatch({ type: 'SET_ERROR', payload: res.error });
          reject(res.error);
        } else {
          dispatch({ type: 'JOIN_ROOM', payload: { player: res.player, room: res.room } });
          resolve(res);
        }
      });
    });
  }, [socket]);

  const joinRoom = useCallback((name, code) => {
    return new Promise((resolve, reject) => {
      socket.emit('room:join', { name, code }, (res) => {
        if (res.error) {
          dispatch({ type: 'SET_ERROR', payload: res.error });
          reject(res.error);
        } else {
          dispatch({ type: 'JOIN_ROOM', payload: { player: res.player, room: res.room } });
          resolve(res);
        }
      });
    });
  }, [socket]);

  const startGame = useCallback(() => {
    return new Promise((resolve, reject) => {
      socket.emit('room:start', {}, (res) => {
        if (res?.error) {
          dispatch({ type: 'SET_ERROR', payload: res.error });
          reject(res.error);
        } else {
          resolve(res);
        }
      });
    });
  }, [socket]);

  const declareTrump = useCallback((cardId) => {
    return new Promise((resolve, reject) => {
      socket.emit('game:declareTrump', { cardId }, (res) => {
        if (res?.error) {
          dispatch({ type: 'SET_ERROR', payload: res.error });
          reject(res.error);
        } else resolve(res);
      });
    });
  }, [socket]);

  const callTrump = useCallback((cardIds) => {
    return new Promise((resolve, reject) => {
      socket.emit('game:callTrump', { cardIds }, (res) => {
        if (res?.error) {
          dispatch({ type: 'SET_ERROR', payload: res.error });
          reject(res.error);
        } else resolve(res);
      });
    });
  }, [socket]);

  const discardKitty = useCallback((cardIds) => {
    return new Promise((resolve, reject) => {
      socket.emit('game:discardKitty', { cardIds }, (res) => {
        if (res?.error) {
          dispatch({ type: 'SET_ERROR', payload: res.error });
          reject(res.error);
        } else resolve(res);
      });
    });
  }, [socket]);

  const playCard = useCallback((cardId) => {
    return new Promise((resolve, reject) => {
      socket.emit('game:playCards', { cardIds: [cardId] }, (res) => {
        if (res?.error) {
          dispatch({ type: 'SET_ERROR', payload: res.error });
          reject(res.error);
        } else resolve(res);
      });
    });
  }, [socket]);

  const playCards = useCallback((cardIds) => {
    return new Promise((resolve, reject) => {
      socket.emit('game:playCards', { cardIds }, (res) => {
        if (res?.error) {
          dispatch({ type: 'SET_ERROR', payload: res.error });
          reject(res.error);
        } else resolve(res);
      });
    });
  }, [socket]);

  const sendChat = useCallback((message) => {
    socket.emit('room:chat', { message });
  }, [socket]);

  const startNewRound = useCallback(() => {
    socket.emit('room:newRound', {}, () => {});
  }, [socket]);

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);

  return (
    <GameContext.Provider value={{
      ...state,
      createRoom,
      joinRoom,
      startGame,
      declareTrump,
      callTrump,
      discardKitty,
      playCard,
      playCards,
      sendChat,
      startNewRound,
      clearError,
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}
