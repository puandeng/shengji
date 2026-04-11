const { GAME_PHASES } = require('../game/constants');

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

      // Send each player their own hand
      room.game.players.forEach(p => {
        const stateForPlayer = room.toGameStateFor(p.socketId);
        io.to(p.socketId).emit('game:started', stateForPlayer);
      });

      // Start trump selection timer
      room.startTrumpTimer(({ kittyResult }) => {
        // Timer expired — auto-select trump and move to kitty phase
        room.game.players.forEach(p => {
          const stateForPlayer = room.toGameStateFor(p.socketId);
          io.to(p.socketId).emit('game:trumpSelected', {
            trumpSuit:     room.game.trumpSuit,
            trumpDeclarer: room.game.trumpDeclarer,
            auto:          true,
            ...stateForPlayer,
          });
        });
        room.scheduleBotKittyDiscard();
      });

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

      // Restart trump timer
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
