const { GAME_PHASES, TRICK_DISPLAY_DELAY_MS } = require('../game/constants');

/**
 * Game-related socket events:
 *  game:callTrump    → Call/override trump during TRUMP_SELECTION (1 card = single, 2 = pair/joker)
 *  game:declareTrump → Legacy single-card trump declaration (kept for compat, calls callTrump internally)
 *  game:discardKitty → Trump declarer discards KITTY_SIZE cards
 *  game:playCards    → Play 1–N cards during trick-taking (single / pair / tractor / throw)
 *  game:previewPlay  → Ack-only legality check for a selection (never broadcast)
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

      // A call during a slow-motion deal window counts as that player acting.
      room.resumeDealIfAllActed();

      callback?.({ success: true });

    } catch (err) {
      console.error('[game:callTrump]', err);
      callback?.({ error: 'Server error' });
    }
  });

  // ── Pass on trump calling ─────────────────────────────────────────────────
  socket.on('game:passTrump', (_, callback) => {
    try {
      const room = registry.getRoomForSocket(socket.id);
      if (!room) return callback?.({ error: 'Not in a room' });

      const result = room.passTrump(socket.id);
      if (result.error) return callback?.({ error: result.error });

      // Only finalize if all passed AND we're in trump selection (not still dealing)
      if (result.allPassed && room.game.phase === GAME_PHASES.TRUMP_SELECTION) {
        room._clearTrumpTimer();
        room.game.finishTrumpSelection();
        const kittyResult = room.game.giveKittyToDeclarer();

        room.game.players.forEach(p => {
          io.to(p.socketId).emit('game:trumpSelected', {
            trumpSuit:     room.game.trumpSuit,
            trumpDeclarer: room.game.trumpDeclarer,
            auto:          true,
            ...room.toGameStateFor(p.socketId),
          });
        });
        room.scheduleBotKittyDiscard();
      }

      // Passing a deal window resumes dealing early once everyone has acted,
      // rather than making the table wait out the full timer.
      room.resumeDealIfAllActed();

      callback?.({ success: true, allPassed: result.allPassed, windowPass: result.windowPass });

    } catch (err) {
      console.error('[game:passTrump]', err);
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

      room.scheduleBotKittyDiscard();
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

      room.scheduleBotPlay();
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
            trickDisplayDelay: TRICK_DISPLAY_DELAY_MS,
            ...room.toGameStateFor(p.socketId),
          });
        });
        // Delay bot play after trick completes to let players see the trick
        if (!result.roundOver && !result.gameOver) {
          setTimeout(() => room.scheduleBotPlay(), TRICK_DISPLAY_DELAY_MS);
        }
      } else {
        // Per-player, not a room broadcast: the legal-follow set is different
        // for each seat, and without it the client's card dimming stays frozen
        // at whatever the legal set was when the trick opened.
        const trickView = room.game.currentTrick.map(e => ({
          socketId: e.socketId,
          cards:    e.cards.map(c => c.toJSON()),
          shape:    e.shape,
        }));
        room.game.players.forEach(p => {
          io.to(p.socketId).emit('game:cardsPlayed', {
            socketId:    socket.id,
            cardIds,
            cards:       result.cards || [],
            shape:       result.shape || 'single',
            currentSeat: room.game.currentSeat,
            trick:       trickView,
            playableCardIds: room.game.playableCardIds(p.socketId),
          });
        });
        room.scheduleBotPlay();
      }

      callback?.({ success: true });

    } catch (err) {
      console.error('[game:playCards]', err);
      callback?.({ error: 'Server error' });
    }
  });

  // ── Preview a selection (read-only; ack only, never broadcast) ───────────
  // Answered through the callback alone — broadcasting would show the rest of
  // the table which cards this player is holding over.
  socket.on('game:previewPlay', ({ cardIds } = {}, callback) => {
    try {
      const room = registry.getRoomForSocket(socket.id);
      if (!room) return callback?.({ error: 'Not in a room' });
      if (room.game.phase !== GAME_PHASES.PLAYING) {
        return callback?.({ error: 'Game is not in playing phase' });
      }
      if (socket.id !== room.game.currentPlayerSocketId) {
        return callback?.({ error: "It's not your turn" });
      }

      callback?.(room.game.previewPlay(socket.id, cardIds));

    } catch (err) {
      console.error('[game:previewPlay]', err);
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
            trickDisplayDelay: TRICK_DISPLAY_DELAY_MS,
            ...room.toGameStateFor(p.socketId),
          });
        });
        if (!result.roundOver && !result.gameOver) {
          setTimeout(() => room.scheduleBotPlay(), TRICK_DISPLAY_DELAY_MS);
        }
      } else {
        io.to(room.code).emit('game:cardPlayed', {
          socketId:    socket.id,
          cardId,
          currentSeat: room.game.currentSeat,
          trick:       room.game.currentTrick.map(e => ({
            socketId: e.socketId,
            cards:    e.cards.map(c => c.toJSON()),
            card:     e.cards[0]?.toJSON(),
            shape:    e.shape,
          })),
        });
        room.scheduleBotPlay();
      }

      callback?.({ success: true });

    } catch (err) {
      console.error('[game:playCard]', err);
      callback?.({ error: 'Server error' });
    }
  });
}

module.exports = { setupGameHandlers };
