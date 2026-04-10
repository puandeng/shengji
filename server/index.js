const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { setupSocketHandlers } = require('./socket');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '200 Card Game Server running' });
});

// Client config (exposes DEV_MODE flag so the UI can adapt)
app.get('/config', (req, res) => {
  res.json({ devMode: !!process.env.DEV_MODE });
});

// Set up all socket handlers
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🃏 200 Card Game Server running on port ${PORT}`);
});
