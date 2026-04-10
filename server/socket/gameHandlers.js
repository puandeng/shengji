const { GAME_PHASES } = require('../game/constants');

/**
 * Game-related socket events:
 *  game:declareTrump  → Declare trump suit by showing a card
 *  game:discardKitty  → Trump declarer discards 4 cards to kitty
 *  game:playCard      → Play a card during trick-taking
 */
function setupGameHandlers(io, socket, registry) {

  // ── Declare trump ──────────────────────────────────────────────────────────
  socket.on('game:declareTrump', ({ cardId }, callback) => {
    try {
      const room = registry.getRoomForSocket(socket.id);
      if (!room) return callback?.({ error: 'Not in a room' });

      const result = room.declareTrump(socket.id, cardId);
      if (result.error) return callback?.({ error: result.error });

      // Broadcast trump declaration to all players
      room.game.players.forEach(p => {
        io.to(p.socketId).emit('game:trumpSelected', {
          trumpSuit:     result.trumpSuit,
          trumpDeclarer: room.game.trumpDeclarer,
          declarerName:  result.declarer,
          auto:          false,
          ...room.toGameStateFor(p.socketId),
        });
      });

      room.scheduleBotKittyDiscard();
      callback?.({ success: true });

    } catch (err) {
      console.error('[game:declareTrump]', err);
      callback?.({ error: 'Server error' });
    }
  });

  // ── Discard to kitty ───────────────────────────────────────────────────────
  socket.on('game:discardKitty', ({ cardIds }, callback) => {
    try {
      const room = registry.getRoomForSocket(socket.id);
      if (!room) return callback?.({ error: 'Not in a room' });

      const result = room.discardToKitty(socket.id, cardIds);
      if (result.error) return callback?.({ error: result.error });

      // Broadcast updated game state — game is now in PLAYING phase
      room.game.players.forEach(p => {
        io.to(p.socketId).emit('game:kittyDiscarded', room.toGameStateFor(p.socketId));
      });

      room.scheduleBotPlay();
      callback?.({ success: true });

    } catch (err) {
      console.error('[game:discardKitty]', err);
      callback?.({ error: 'Server error' });
    }
  });

  // ── Play a card ────────────────────────────────────────────────────────────
  socket.on('game:playCard', ({ cardId }, callback) => {
    try {
      const room = registry.getRoomForSocket(socket.id);
      if (!room) return callback?.({ error: 'Not in a room' });

      const result = room.playCard(socket.id, cardId);
      if (result.error) return callback?.({ error: result.error });

      if (result.trickComplete) {
        // Broadcast completed trick + updated state to all
        room.game.players.forEach(p => {
          io.to(p.socketId).emit('game:trickComplete', {
            completedTrick: result.completedTrick,
            roundOver:      !!result.roundOver,
            gameOver:       !!result.gameOver,
            attackingWon:   result.attackingWon,
            scores:         result.scores || room.game.scores,
            roundScores:    result.roundScores || room.game.roundScores,
            winnerTeam:     result.winner,
            ...room.toGameStateFor(p.socketId),
          });
        });
      } else {
        // Card played but trick not yet complete — broadcast card play
        io.to(room.code).emit('game:cardPlayed', {
          socketId:    socket.id,
          cardId,
          currentSeat: room.game.currentSeat,
          trick:       room.game.currentTrick.map(e => ({
            socketId: e.socketId,
            card:     e.card.toJSON(),
          })),
        });
      }

      room.scheduleBotPlay();
      callback?.({ success: true });

    } catch (err) {
      console.error('[game:playCard]', err);
      callback?.({ error: 'Server error' });
    }
  });
}

module.exports = { setupGameHandlers };
