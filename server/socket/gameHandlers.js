const { GAME_PHASES } = require('../game/constants');

/**
 * Game-related socket events:
 *  game:callTrump    → Call/override trump during TRUMP_SELECTION (1 card = single, 2 = pair/joker)
 *  game:declareTrump → Legacy single-card trump declaration (kept for compat, calls callTrump internally)
 *  game:discardKitty → Trump declarer discards KITTY_SIZE cards
 *  game:playCards    → Play 1–N cards during trick-taking (single / pair / tractor / throw)
 */
function setupGameHandlers(io, socket, registry) {

  // ── Call trump (dynamic bidding mechanic) ────────────────────────────────
  socket.on('game:callTrump', ({ cardIds }, callback) => {
    try {
      const room = registry.getRoomForSocket(socket.id);
      if (!room) return callback?.({ error: 'Not in a room' });

      const result = room.callTrump(socket.id, cardIds);
      if (result.error) return callback?.({ error: result.error });

      // Broadcast the new call to all players so they can see who called and with what
      room.game.players.forEach(p => {
        io.to(p.socketId).emit('game:trumpCalled', {
          trumpSuit:    result.trumpSuit,
          trumpRank:    result.trumpRank,
          strength:     result.strength,
          declarerName: result.declarer,
          callerCardIds: result.callerCardIds,
          ...room.toGameStateFor(p.socketId),
        });
      });

      callback?.({ success: true });

    } catch (err) {
      console.error('[game:callTrump]', err);
      callback?.({ error: 'Server error' });
    }
  });

  // ── Declare trump (legacy — immediate: clears timer, moves to kitty phase) ──
  socket.on('game:declareTrump', ({ cardId }, callback) => {
    try {
      const room = registry.getRoomForSocket(socket.id);
      if (!room) return callback?.({ error: 'Not in a room' });

      const result = room.declareTrump(socket.id, cardId);
      if (result.error) return callback?.({ error: result.error });

      room.game.players.forEach(p => {
        io.to(p.socketId).emit('game:trumpSelected', {
          trumpSuit:    result.trumpSuit,
          trumpRank:    result.trumpRank,
          trumpDeclarer: room.game.trumpDeclarer,
          declarerName: result.declarer,
          auto:         false,
          ...room.toGameStateFor(p.socketId),
        });
      });

      callback?.({ success: true });

    } catch (err) {
      console.error('[game:declareTrump]', err);
      callback?.({ error: 'Server error' });
    }
  });

  // ── Discard to kitty ──────────────────────────────────────────────────────
  socket.on('game:discardKitty', ({ cardIds }, callback) => {
    try {
      const room = registry.getRoomForSocket(socket.id);
      if (!room) return callback?.({ error: 'Not in a room' });

      const result = room.discardToKitty(socket.id, cardIds);
      if (result.error) return callback?.({ error: result.error });

      room.game.players.forEach(p => {
        io.to(p.socketId).emit('game:kittyDiscarded', room.toGameStateFor(p.socketId));
      });

      callback?.({ success: true });

    } catch (err) {
      console.error('[game:discardKitty]', err);
      callback?.({ error: 'Server error' });
    }
  });

  // ── Play cards (multi-card: single / pair / tractor / throw) ─────────────
  socket.on('game:playCards', ({ cardIds }, callback) => {
    try {
      const room = registry.getRoomForSocket(socket.id);
      if (!room) return callback?.({ error: 'Not in a room' });

      const result = room.playCards(socket.id, cardIds);
      if (result.error) return callback?.({ error: result.error });

      if (result.trickComplete) {
        room.game.players.forEach(p => {
          io.to(p.socketId).emit('game:trickComplete', {
            completedTrick: result.completedTrick,
            roundOver:      !!result.roundOver,
            gameOver:       !!result.gameOver,
            attackingWon:   result.attackingWon,
            threshold:      result.threshold,
            teamLevels:     result.teamLevels,
            levelsAdvanced: result.levelsAdvanced,
            scores:         result.scores || room.game.scores,
            roundScores:    result.roundScores || room.game.roundScores,
            winnerTeam:     result.winner,
            ...room.toGameStateFor(p.socketId),
          });
        });
      } else {
        io.to(room.code).emit('game:cardsPlayed', {
          socketId:    socket.id,
          cardIds,
          cards:       result.cards || [],
          shape:       result.shape || 'single',
          currentSeat: room.game.currentSeat,
          trick:       room.game.currentTrick.map(e => ({
            socketId: e.socketId,
            cards:    e.cards.map(c => c.toJSON()),
            shape:    e.shape,
          })),
        });
      }

      callback?.({ success: true });

    } catch (err) {
      console.error('[game:playCards]', err);
      callback?.({ error: 'Server error' });
    }
  });

  // ── Legacy single-card play (delegates to playCards) ──────────────────────
  socket.on('game:playCard', ({ cardId }, callback) => {
    socket.emit = socket.emit; // no-op to avoid recursion
    try {
      const room = registry.getRoomForSocket(socket.id);
      if (!room) return callback?.({ error: 'Not in a room' });

      const result = room.playCards(socket.id, [cardId]);
      if (result.error) return callback?.({ error: result.error });

      if (result.trickComplete) {
        room.game.players.forEach(p => {
          io.to(p.socketId).emit('game:trickComplete', {
            completedTrick: result.completedTrick,
            roundOver:      !!result.roundOver,
            gameOver:       !!result.gameOver,
            attackingWon:   result.attackingWon,
            threshold:      result.threshold,
            teamLevels:     result.teamLevels,
            levelsAdvanced: result.levelsAdvanced,
            scores:         result.scores || room.game.scores,
            roundScores:    result.roundScores || room.game.roundScores,
            winnerTeam:     result.winner,
            ...room.toGameStateFor(p.socketId),
          });
        });
      } else {
        io.to(room.code).emit('game:cardPlayed', {
          socketId:    socket.id,
          cardId,
          currentSeat: room.game.currentSeat,
          trick:       room.game.currentTrick.map(e => ({
            socketId: e.socketId,
            cards:    e.cards.map(c => c.toJSON()),
            card:     e.cards[0]?.toJSON(), // Legacy compat
            shape:    e.shape,
          })),
        });
      }

      callback?.({ success: true });

    } catch (err) {
      console.error('[game:playCard]', err);
      callback?.({ error: 'Server error' });
    }
  });
}

module.exports = { setupGameHandlers };
