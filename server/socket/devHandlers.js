const { GAME_PHASES } = require('../game/constants');
const { runAnimatedDeal } = require('./dealFlow');

/**
 * DEV_MODE-only socket events:
 *  dev:scenario → rebuild this room's game in a chosen situation
 *
 * Every handler here refuses outright unless DEV_MODE is set, so the events
 * exist but do nothing on a normal server.
 */
function setupDevHandlers(io, socket, registry) {

  socket.on('dev:scenario', (opts, callback) => {
    try {
      if (!process.env.DEV_MODE) return callback?.({ error: 'Dev mode is off' });

      const room = registry.getRoomForSocket(socket.id);
      if (!room) return callback?.({ error: 'Not in a room' });

      const result = room.applyDevScenario(socket.id, opts || {});
      if (result.error) return callback?.({ error: result.error });

      // game:started, not a phase-specific event: the client has to replace its
      // whole snapshot, since the scenario may have moved the game backwards.
      room.game.players.forEach(p => {
        io.to(p.socketId).emit('game:started', room.toGameStateFor(p.socketId));
      });

      if (result.animateDeal) {
        runAnimatedDeal(io, room);
      } else if (room.game.phase === GAME_PHASES.PLAYING) {
        // The fast-forward stops at a trick boundary, which may be a bot's lead.
        room.scheduleBotPlay();
      }

      console.log(
        `[Dev] room ${room.code}: scenario "${result.scenario}" (${result.role}) — ` +
        `rank ${result.trumpRank}, trump ${result.trumpSuit || (result.animateDeal ? 'not called yet' : 'none')}, levels ` +
        `T0 ${result.teamLevels[0]} / T1 ${result.teamLevels[1]}`
      );
      callback?.(result);

    } catch (err) {
      console.error('[dev:scenario]', err);
      callback?.({ error: 'Server error' });
    }
  });
}

module.exports = { setupDevHandlers };
