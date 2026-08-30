const { MAX_CALL_STRENGTH, GAME_PHASES } = require('../game/constants');

/**
 * Room-related socket events:
 *  room:create   → Create a new room and join it
 *  room:join     → Join an existing room by code
 *  room:start    → Start the game (host only, needs 4 players)
 *  room:chat     → Send a chat message
 *  room:state    → Request current room state
 */
function setupRoomHandlers(io, socket, registry) {

  // ── Create a new room ──────────────────────────────────────────────────────
  socket.on('room:create', ({ name }, callback) => {
    try {
      if (!name || name.trim().length < 1) {
        return callback?.({ error: 'Name is required' });
      }

      const room   = registry.create();
      room.setIO(io);
      const result = room.addPlayer(socket.id, name.trim().slice(0, 20));

      if (result.error) return callback?.({ error: result.error });

      socket.join(room.code);
      registry.trackPlayer(socket.id, room.code);

      console.log(`[Room] ${name} created room ${room.code}`);
      callback?.({ success: true, room: room.toLobbyJSON(), player: result.player });

    } catch (err) {
      console.error('[room:create]', err);
      callback?.({ error: 'Server error' });
    }
  });

  // ── Join an existing room ──────────────────────────────────────────────────
  socket.on('room:join', ({ name, code }, callback) => {
    try {
      if (!name || !code) return callback?.({ error: 'Name and room code required' });

      const room = registry.get(code);
      if (!room) return callback?.({ error: `Room "${code.toUpperCase()}" not found` });

      const trimmedName = name.trim().slice(0, 20);

      // Reconnection: if game is in progress and a disconnected player has this name, rejoin
      if (room.game.phase !== GAME_PHASES.WAITING) {
        const disconnected = room.game.getDisconnectedPlayer(trimmedName);
        if (!disconnected) {
          return callback?.({ error: 'Game already in progress' });
        }

        const oldSocketId = disconnected.socketId;
        const result = room.reconnectPlayer(oldSocketId, socket.id);
        if (result.error) return callback?.({ error: result.error });

        socket.join(room.code);
        registry.trackPlayer(socket.id, room.code);

        // Send reconnected player the current game state
        const gameState = room.toGameStateFor(socket.id);
        socket.emit('game:started', gameState);

        // Notify others
        socket.to(room.code).emit('player:joined', {
          player:    result.player,
          roomState: room.toLobbyJSON(),
        });

        console.log(`[Room] ${trimmedName} reconnected to room ${room.code}`);
        return callback?.({ success: true, room: room.toLobbyJSON(), player: result.player, reconnected: true });
      }

      if (room.isFull) return callback?.({ error: 'Room is full' });

      const result = room.addPlayer(socket.id, trimmedName);
      if (result.error) return callback?.({ error: result.error });

      socket.join(room.code);
      registry.trackPlayer(socket.id, room.code);

      // Notify existing players
      socket.to(room.code).emit('player:joined', {
        player:    result.player,
        roomState: room.toLobbyJSON(),
      });

      console.log(`[Room] ${trimmedName} joined room ${room.code}`);
      callback?.({ success: true, room: room.toLobbyJSON(), player: result.player });

    } catch (err) {
      console.error('[room:join]', err);
      callback?.({ error: 'Server error' });
    }
  });

  // ── Start game ─────────────────────────────────────────────────────────────
  socket.on('room:start', (_, callback) => {
    try {
      const room = registry.getRoomForSocket(socket.id);
      if (!room) return callback?.({ error: 'Not in a room' });

      const player = room.game.getPlayer(socket.id);
      if (!player || player.seatIndex !== 0) {
        return callback?.({ error: 'Only the host (seat 0) can start the game' });
      }

      const result = room.startGame();
      if (result.error) return callback?.({ error: result.error });

      // Send initial state (dealing phase, empty hands)
      room.game.players.forEach(p => {
        io.to(p.socketId).emit('game:started', room.toGameStateFor(p.socketId));
      });

      // Animate dealing: drip-feed cards one at a time
      room.startAnimatedDeal(
        (entry, idx) => {
          // Each card dealt — send updated partial hand to each player
          room.game.players.forEach(p => {
            const dealtCard = entry.socketId === p.socketId ? entry.card.toJSON() : null;
            io.to(p.socketId).emit('game:cardDealt', {
              seatIndex:  entry.seatIndex,
              card:       dealtCard,
              dealIndex:  idx + 1,
              dealTotal:  room.game.dealQueue.length,
              handCount:  room.game.getDealtCounts()[p.socketId] || 0,
              allCounts:  room.game.getDealtCounts(),
            });
          });
        },
        () => {
          // Dealing complete — move to trump selection
          room.game.players.forEach(p => {
            io.to(p.socketId).emit('game:dealComplete', room.toGameStateFor(p.socketId));
          });

          // Nothing outranks a joker pair, so there is nothing to wait for —
          // skip the 30s trump window and go straight to the kitty.
          if (room.game.trumpCallStrength >= MAX_CALL_STRENGTH) {
            room._clearTrumpTimer();
            room.game.finishTrumpSelection();
            room.game.giveKittyToDeclarer();
            room.game.players.forEach(p => {
              io.to(p.socketId).emit('game:trumpSelected', {
                trumpSuit:     room.game.trumpSuit,
                trumpDeclarer: room.game.trumpDeclarer,
                auto:          false,
                ...room.toGameStateFor(p.socketId),
              });
            });
            room.scheduleBotKittyDiscard();
            return;
          }

          room.scheduleBotTrumpCall();

          room.startTrumpTimer(({ kittyResult }) => {
            room.game.players.forEach(p => {
              io.to(p.socketId).emit('game:trumpSelected', {
                trumpSuit:     room.game.trumpSuit,
                trumpDeclarer: room.game.trumpDeclarer,
                auto:          true,
                ...room.toGameStateFor(p.socketId),
              });
            });
            room.scheduleBotKittyDiscard();
          });
        },
        (info) => {
          // Slow-motion deal: the deal is paused, everyone may call trump or pass
          room.game.players.forEach(p => {
            // youCanCall is per-player on purpose: broadcasting *why* the deal
            // paused would tell the table that someone just drew a trump card.
            io.to(p.socketId).emit('game:dealPaused', {
              ...info,
              youCanCall: room.game.canCall(p.socketId),
              ...room.toGameStateFor(p.socketId),
            });
          });
        },
        (info) => {
          room.game.players.forEach(p => {
            io.to(p.socketId).emit('game:dealResumed', { ...info, ...room.toGameStateFor(p.socketId) });
          });
        },
      );

      console.log(`[Room] Game started in room ${room.code}`);
      callback?.({ success: true });

    } catch (err) {
      console.error('[room:start]', err);
      callback?.({ error: 'Server error' });
    }
  });

  // ── Start new round ────────────────────────────────────────────────────────
  socket.on('room:newRound', (_, callback) => {
    try {
      const room = registry.getRoomForSocket(socket.id);
      if (!room) return callback?.({ error: 'Not in a room' });

      const result = room.startNewRound();
      if (result.error) return callback?.({ error: result.error });

      room.game.players.forEach(p => {
        io.to(p.socketId).emit('game:newRound', room.toGameStateFor(p.socketId));
      });

      // Animate dealing for the new round
      room.startAnimatedDeal(
        (entry, idx) => {
          room.game.players.forEach(p => {
            const dealtCard = entry.socketId === p.socketId ? entry.card.toJSON() : null;
            io.to(p.socketId).emit('game:cardDealt', {
              seatIndex:  entry.seatIndex,
              card:       dealtCard,
              dealIndex:  idx + 1,
              dealTotal:  room.game.dealQueue.length,
              handCount:  room.game.getDealtCounts()[p.socketId] || 0,
              allCounts:  room.game.getDealtCounts(),
            });
          });
        },
        () => {
          room.game.players.forEach(p => {
            io.to(p.socketId).emit('game:dealComplete', room.toGameStateFor(p.socketId));
          });

          // Nothing outranks a joker pair, so there is nothing to wait for —
          // skip the 30s trump window and go straight to the kitty.
          if (room.game.trumpCallStrength >= MAX_CALL_STRENGTH) {
            room._clearTrumpTimer();
            room.game.finishTrumpSelection();
            room.game.giveKittyToDeclarer();
            room.game.players.forEach(p => {
              io.to(p.socketId).emit('game:trumpSelected', {
                trumpSuit:     room.game.trumpSuit,
                trumpDeclarer: room.game.trumpDeclarer,
                auto:          false,
                ...room.toGameStateFor(p.socketId),
              });
            });
            room.scheduleBotKittyDiscard();
            return;
          }

          room.scheduleBotTrumpCall();

          room.startTrumpTimer(({ kittyResult }) => {
            room.game.players.forEach(p => {
              io.to(p.socketId).emit('game:trumpSelected', {
                trumpSuit:     room.game.trumpSuit,
                trumpDeclarer: room.game.trumpDeclarer,
                auto:          true,
                ...room.toGameStateFor(p.socketId),
              });
            });
            room.scheduleBotKittyDiscard();
          });
        },
        (info) => {
          // Slow-motion deal: the deal is paused, everyone may call trump or pass
          room.game.players.forEach(p => {
            // youCanCall is per-player on purpose: broadcasting *why* the deal
            // paused would tell the table that someone just drew a trump card.
            io.to(p.socketId).emit('game:dealPaused', {
              ...info,
              youCanCall: room.game.canCall(p.socketId),
              ...room.toGameStateFor(p.socketId),
            });
          });
        },
        (info) => {
          room.game.players.forEach(p => {
            io.to(p.socketId).emit('game:dealResumed', { ...info, ...room.toGameStateFor(p.socketId) });
          });
        },
      );

      callback?.({ success: true });

    } catch (err) {
      console.error('[room:newRound]', err);
      callback?.({ error: 'Server error' });
    }
  });

  // ── Chat ───────────────────────────────────────────────────────────────────
  socket.on('room:chat', ({ message }) => {
    const room = registry.getRoomForSocket(socket.id);
    if (!room || !message) return;

    const entry = room.addChatMessage(socket.id, message);
    if (entry) {
      io.to(room.code).emit('room:chatMessage', entry);
    }
  });

  // ── Request current state (reconnect / refresh) ────────────────────────────
  socket.on('room:state', (_, callback) => {
    const room = registry.getRoomForSocket(socket.id);
    if (!room) return callback?.({ error: 'Not in a room' });
    callback?.({ success: true, state: room.toGameStateFor(socket.id) });
  });
}

module.exports = { setupRoomHandlers };
