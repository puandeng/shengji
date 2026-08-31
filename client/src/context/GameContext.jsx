import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { useSocket } from './SocketContext';
import { playCardSnap, playTrickWon, playRoundEnd } from '../sounds';
import { suitLabel } from '../suits';

const GameContext = createContext(null);

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// How long a completed trick stays frozen on the table before play resumes.
// The server's TRICK_DISPLAY_DELAY_MS (2.5s) used to be a forced stare; the
// trick is now reopenable on demand from the board, so the automatic pause only
// has to be long enough to register that the trick ended.
const TRICK_REVIEW_MS = 1100;

// A preview ack that never arrives (old server, no handler registered) must not
// leave the caller's promise pending forever.
const PREVIEW_TIMEOUT_MS = 2000;

const INITIAL_STATE = {
  screen:        'home',   // 'home' | 'lobby' | 'game'
  myPlayer:      null,     // { socketId, name, seatIndex, teamIndex }
  room:          null,     // lobby info { code, players, isFull, phase }
  gameState:     null,     // full per-player game state from server
  error:         null,
  notification:  null,
  chatMessages:  [],
  devMode:       false,
  newCardIds:    [],       // Card IDs that were just drawn (for animation)
  kittyCardIds:  [],       // the 8 cards the kitty gave the declarer, until buried
  completedTrick: null,
  trickWinner:    null,
  lastTrick:      null,    // { cards, winner } — survives the freeze so it can be reopened on demand
  roundResult:    null,    // how the last round resolved, for the scoring modal
  trickSummary:   null,    // one-line narration of the trick just finished
  trickCredited:  0,
  dealPause:      null,    // { windowIndex, totalWindows, deadline, durationMs } while dealing is paused
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
        lastTrick: null,
      };

    case 'UPDATE_GAME_STATE':
      return {
        ...state,
        gameState: { ...state.gameState, ...action.payload },
      };

    case 'CARD_PLAYED':
      // Optimistic update for current trick display; clear any lingering completed trick
      return {
        ...state,
        gameState: state.gameState
          ? {
              ...state.gameState,
              currentTrick: action.payload.trick,
              currentSeat: action.payload.currentSeat,
              // The legal set changes with every card played, so carry it here
              // rather than leaving the dimming frozen at trick start.
              playableCardIds: action.payload.playableCardIds ?? state.gameState.playableCardIds,
            }
          : state.gameState,
        completedTrick: null,
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

    case 'SET_DEV_MODE':
      return { ...state, devMode: action.payload };

    case 'SET_KITTY_CARDS':
      return { ...state, kittyCardIds: action.payload };

    case 'CLEAR_KITTY_CARDS':
      return { ...state, kittyCardIds: [] };

    case 'SET_NEW_CARDS':
      return { ...state, newCardIds: action.payload };

    case 'CLEAR_NEW_CARDS':
      return { ...state, newCardIds: [] };

    case 'CARD_DEALT': {
      if (!state.gameState) return state;
      const { card, allCounts } = action.payload;
      const newHand = card
        ? [...(state.gameState.myHand || []), card]
        : state.gameState.myHand || [];
      return {
        ...state,
        gameState: {
          ...state.gameState,
          myHand: newHand,
          handCounts: allCounts,
          dealIndex: action.payload.dealIndex,
          dealTotal: action.payload.dealTotal,
        },
        newCardIds: card ? [card.id] : [],
      };
    }

    // Slow-motion deal: dealing halts so everyone can call trump or pass.
    // Only trump/pause fields are merged — replacing gameState wholesale would
    // wipe the hand built up incrementally from game:cardDealt events.
    case 'DEAL_PAUSED':
      return {
        ...state,
        dealPause: {
          windowIndex:  action.payload.windowIndex,
          youCanCall:   action.payload.youCanCall,
          deadline:     action.payload.deadline,
          durationMs:   action.payload.durationMs,
        },
        gameState: {
          ...state.gameState,
          trumpSuit:         action.payload.trumpSuit,
          trumpRank:         action.payload.trumpRank,
          trumpDeclarer:     action.payload.trumpDeclarer,
          trumpDeclareCards: action.payload.trumpDeclareCards,
          trumpCallStrength: action.payload.trumpCallStrength,
          dealPaused:        true,
        },
      };

    case 'DEAL_RESUMED':
      return {
        ...state,
        dealPause: null,
        gameState: { ...state.gameState, dealPaused: false },
      };

    case 'DEAL_COMPLETE':
      return {
        ...state,
        gameState: action.payload,
        newCardIds: [],
      };

    case 'TRICK_COMPLETE':
      return {
        roundResult: action.meta?.roundResult ?? state.roundResult,
        trickSummary: action.meta?.trickSummary ?? null,
        trickCredited: action.meta?.trickCredited ?? 0,
        ...state,
        screen: 'game',
        gameState: { ...action.payload, currentTrick: action.meta.completedTrick },
        completedTrick: action.meta.completedTrick,
        trickWinner: action.meta.trickWinner,
        lastTrick: {
          cards:  action.meta.completedTrick,
          winner: action.meta.trickWinner,
        },
      };

    // Ends the freeze only. `lastTrick` deliberately survives so the board can
    // reopen the trick later — that is what lets the automatic pause be short.
    case 'CLEAR_COMPLETED_TRICK':
      return {
        ...state,
        gameState: state.gameState ? { ...state.gameState, currentTrick: [] } : state.gameState,
        completedTrick: null,
        trickWinner: null,
      };

    case 'RESET':
      return { ...INITIAL_STATE };

    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const { socket }        = useSocket();
  const stateRef          = useRef(state);
  stateRef.current        = state;
  const trickClearTimer   = useRef(null);

  // ── Fetch server config (dev mode flag) ──────────────────────────────────
  useEffect(() => {
    fetch(`${SERVER_URL}/config`)
      .then(res => res.json())
      .then(data => dispatch({ type: 'SET_DEV_MODE', payload: !!data.devMode }))
      .catch(() => {}); // non-critical — default to false
  }, []);

  // ── Auto-dismiss error messages after 5 seconds ─────────────────────────
  useEffect(() => {
    if (!state.error) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_ERROR' }), 5000);
    return () => clearTimeout(timer);
  }, [state.error]);

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
      // During dealing, preserve the client's incrementally-built hand
      // instead of replacing it with the server's snapshot (which may lag)
      if (stateRef.current.gameState?.phase === 'DEALING' || gameState.phase === 'DEALING') {
        dispatch({ type: 'UPDATE_GAME_STATE', payload: {
          trumpSuit: gameState.trumpSuit,
          trumpRank: gameState.trumpRank,
          trumpDeclarer: gameState.trumpDeclarer,
          trumpCallStrength: gameState.trumpCallStrength,
          trumpDeclareCards: gameState.trumpDeclareCards,
          attackingTeam: gameState.attackingTeam,
        }});
      } else {
        dispatch({ type: 'GAME_STATE', payload: gameState });
      }
      const calledWhat = gameState.trumpSuit ? suitLabel(gameState.trumpSuit) : 'no trump';
      const strengthLabel = gameState.strength === 3 ? 'joker pair' : gameState.strength === 2 ? 'pair' : 'single';
      dispatch({ type: 'SET_NOTIFICATION', payload: `${gameState.declarerName} called ${calledWhat} with a ${strengthLabel}` });
      setTimeout(() => dispatch({ type: 'CLEAR_NOTIFICATION' }), 4000);
    });
    on('game:trumpSelected',  (gameState)        => {
      // Detect kitty cards newly added to my hand → animate them
      const prevHand = stateRef.current.gameState?.myHand || [];
      const newHand  = gameState.myHand || [];
      const prevIds  = new Set(prevHand.map(c => c.id));
      const addedIds = newHand.filter(c => !prevIds.has(c.id)).map(c => c.id);

      dispatch({ type: 'GAME_STATE', payload: gameState });

      if (addedIds.length > 0) {
        dispatch({ type: 'SET_NEW_CARDS', payload: addedIds });
        setTimeout(() => dispatch({ type: 'CLEAR_NEW_CARDS' }), 1000);
        // The draw animation lasted a second and then the 8 kitty cards were
        // indistinguishable from the 25 you were dealt — so you could not tell
        // what the kitty gave you, or put back what you had just taken. Mark
        // them until the bury is submitted.
        dispatch({ type: 'SET_KITTY_CARDS', payload: addedIds });
      }

      const finalSuit = gameState.trumpSuit ? suitLabel(gameState.trumpSuit) : 'no trump';
      const msg = gameState.auto
        ? `Trump auto-selected: ${finalSuit}`
        : `${gameState.declarerName} declared trump: ${finalSuit}`;
      dispatch({ type: 'SET_NOTIFICATION', payload: msg });
      setTimeout(() => dispatch({ type: 'CLEAR_NOTIFICATION' }), 4000);
    });
    on('game:kittyDiscarded', (gameState)        => {
      dispatch({ type: 'GAME_STATE', payload: gameState });
      dispatch({ type: 'CLEAR_KITTY_CARDS' });
    });
    on('game:cardDealt',      (data)             => dispatch({ type: 'CARD_DEALT', payload: data }));
    on('game:dealComplete',   (gameState)        => dispatch({ type: 'DEAL_COMPLETE', payload: gameState }));
    on('game:dealPaused',     (data)             => dispatch({ type: 'DEAL_PAUSED', payload: data }));
    on('game:dealResumed',    (data)             => dispatch({ type: 'DEAL_RESUMED', payload: data }));
    on('game:cardPlayed',     (data)             => { playCardSnap(); dispatch({ type: 'CARD_PLAYED', payload: data }); });
    on('game:cardsPlayed',    (data)             => { playCardSnap(); dispatch({ type: 'CARD_PLAYED', payload: data }); });
    on('game:trickComplete',  (gameState)        => {
      const serverTrick = gameState.completedTrick;
      const completedTrick = serverTrick?.cards || stateRef.current.gameState?.currentTrick || [];
      const trickWinner = serverTrick?.winner || null;
      // Cap the server's delay rather than obey it: the trick can be reopened
      // from the board at any time, so freezing the table for 2.5s is a cost
      // with no remaining benefit.
      const delay = Math.min(gameState.trickDisplayDelay ?? TRICK_REVIEW_MS, TRICK_REVIEW_MS);

      dispatch({ type: 'TRICK_COMPLETE', payload: gameState, meta: { completedTrick, trickWinner, trickSummary: serverTrick?.summary ?? null, trickCredited: serverTrick?.credited ?? 0, roundResult: gameState.roundResult } });
      playTrickWon();
      clearTimeout(trickClearTimer.current);
      trickClearTimer.current = setTimeout(() => dispatch({ type: 'CLEAR_COMPLETED_TRICK' }), delay);

      if (gameState.gameOver) {
        dispatch({ type: 'SET_NOTIFICATION', payload: `Team ${gameState.winnerTeam + 1} wins the game!` });
        playRoundEnd(true);
      } else if (gameState.roundOver) {
        const adv = gameState.levelsAdvanced > 1 ? ` (+${gameState.levelsAdvanced} levels)` : '';
        const msg = gameState.attackingWon
          ? `Attacking team wins this round!${adv}`
          : `Defending team wins this round!${adv}`;
        dispatch({ type: 'SET_NOTIFICATION', payload: msg });
        setTimeout(() => dispatch({ type: 'CLEAR_NOTIFICATION' }), 5000);
        const myTeam = stateRef.current.myPlayer?.teamIndex;
        playRoundEnd(myTeam === gameState.attackingTeam ? gameState.attackingWon : !gameState.attackingWon);
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
      socket.off('game:cardDealt');
      socket.off('game:dealComplete');
      socket.off('game:dealPaused');
      socket.off('game:dealResumed');
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

  const passTrump = useCallback(() => {
    return new Promise((resolve, reject) => {
      socket.emit('game:passTrump', {}, (res) => {
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

  // Ask the server what a selection *would* be before committing it. The server
  // stays the only judge of shape and legality — this just makes its verdict
  // visible before the play is made. Unlike playCards it never raises the error
  // banner: a probe that fails is not a player mistake.
  const previewPlay = useCallback((cardIds) => {
    return new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error('not connected'));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('preview unavailable'));
      }, PREVIEW_TIMEOUT_MS);

      socket.emit('game:previewPlay', { cardIds }, (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!res || res.error) reject(new Error(res?.error || 'preview unavailable'));
        else resolve(res);
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
      completedTrick: state.completedTrick,
      trickWinner: state.trickWinner,
      createRoom,
      joinRoom,
      startGame,
      declareTrump,
      callTrump,
      passTrump,
      discardKitty,
      playCard,
      playCards,
      previewPlay,
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
