# 200 Card Game — Setup Guide

A real-time multiplayer card game based on the Chinese trick-taking game **Sheng Ji**.

## Prerequisites
- Node.js 18+
- npm 9+

## Quick Start

### 1. Install dependencies

```bash
# From the project root
npm install
cd server && npm install
cd ../client && npm install
```

### 2. Configure environment

```bash
cp .env.example server/.env
cp .env.example client/.env
```

Edit the files if you need custom ports.

### 3. Run in development

Open **two terminals**:

**Terminal 1 — Server:**
```bash
cd server
npm run dev
# → Server on http://localhost:3001
```

**Terminal 2 — Client:**
```bash
cd client
npm run dev
# → Client on http://localhost:5173
```

Or use the root script to run both together:
```bash
# From root (requires concurrently)
npm run dev
```

### 4. Play

1. Open `http://localhost:5173` in your browser
2. Enter a name and click **Create Room** — you'll get a 4-letter room code
3. Share the code with 3 friends; they click **Join Room** and enter the code
4. Once all 4 players are in the lobby, the host (Seat 1) clicks **Start Game**

## Game Rules

| Phase | Description |
|---|---|
| **Trump Selection** | Any player can declare trump by clicking a card (30s timer) |
| **Kitty** | Trump declarer receives 4 kitty cards, discards 4 back |
| **Playing** | Trick-taking — must follow lead suit if possible |
| **Scoring** | 5=5pts, 10=10pts, K=10pts (200 pts total in 2 decks) |

- **Teams:** Seats 1 & 3 vs Seats 2 & 4
- **Attacking team** wins the round if they collect ≥ 100 points
- **First to 3 rounds** wins the match

## Project Structure

```
200-card-game/
├── server/               # Node.js + Express + Socket.io
│   ├── game/
│   │   ├── constants.js  # Game rules & constants
│   │   ├── Card.js       # Card model
│   │   ├── Deck.js       # Deck creation & shuffle
│   │   ├── GameState.js  # Core game logic
│   │   └── Room.js       # Room + Registry
│   ├── socket/
│   │   ├── index.js      # Socket setup & disconnect
│   │   ├── roomHandlers.js
│   │   └── gameHandlers.js
│   └── index.js          # Server entry point
└── client/               # React + Vite
    └── src/
        ├── context/
        │   ├── SocketContext.jsx  # Socket.io connection
        │   └── GameContext.jsx    # Global game state
        ├── pages/
        │   ├── Home.jsx    # Create/join room
        │   ├── Lobby.jsx   # Waiting room
        │   └── Game.jsx    # Game screen
        └── components/
            ├── Card/         # Card rendering
            ├── Hand/         # Player's hand
            ├── GameBoard/    # Main game layout
            ├── TrickArea/    # Current trick display
            ├── PlayerInfo/   # Player name/status
            ├── TrumpBanner/  # Trump suit indicator
            ├── ScoringModal/ # Round/game results
            ├── ChatPanel/    # In-game chat
            └── Notification/ # Toast notifications
```

## Socket Events

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `room:create` | `{ name }` | Create a new room |
| `room:join` | `{ name, code }` | Join existing room |
| `room:start` | — | Start the game (host only) |
| `room:chat` | `{ message }` | Send chat message |
| `game:declareTrump` | `{ cardId }` | Declare trump suit |
| `game:discardKitty` | `{ cardIds[] }` | Discard 4 cards to kitty |
| `game:playCard` | `{ cardId }` | Play a card |
| `room:newRound` | — | Start next round (host only) |

### Server → Client
| Event | Description |
|---|---|
| `player:joined` | A player joined the lobby |
| `player:left` | A player disconnected |
| `game:started` | Game has started (includes player's hand) |
| `game:trumpSelected` | Trump has been declared |
| `game:kittyDiscarded` | Kitty cards discarded, play begins |
| `game:cardPlayed` | A card was played (trick in progress) |
| `game:trickComplete` | Trick resolved (includes winner & scores) |
| `game:newRound` | New round started |
| `room:chatMessage` | New chat message |
