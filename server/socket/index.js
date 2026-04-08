const { RoomRegistry } = require('../game/Room');
const { setupRoomHandlers } = require('./roomHandlers');
const { setupGameHandlers } = require('./gameHandlers');

const registry = new RoomRegistry();

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // Pass registry + io to each handler module
    setupRoomHandlers(io, socket, registry);
    setupGameHandlers(io, socket, registry);

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      handleDisconnect(io, socket, registry);
    });
  });
}

function handleDisconnect(io, socket, registry) {
  const room = registry.getRoomForSocket(socket.id);
  if (!room) return;

  room.removePlayer(socket.id);
  registry.untrackPlayer(socket.id);

  // Notify remaining players
  io.to(room.code).emit('player:left', {
    socketId: socket.id,
    roomState: room.toLobbyJSON(),
  });

  // Clean up empty rooms
  if (room.isEmpty) {
    registry.delete(room.code);
    console.log(`[Room] Deleted empty room ${room.code}`);
  }
}

module.exports = { setupSocketHandlers };
