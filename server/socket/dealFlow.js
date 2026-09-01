const { MAX_CALL_STRENGTH } = require('../game/constants');

/**
 * Wire the animated deal to a room's sockets.
 *
 * room:start, room:newRound and dev scenario setup all need the identical
 * sequence — drip-feed, call windows, trump timer, kitty hand-off — and it was
 * copied verbatim between the first two, so a fix to one silently skipped the
 * other.
 */
function runAnimatedDeal(io, room) {
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

      room.startTrumpTimer(() => {
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
}

module.exports = { runAnimatedDeal };
