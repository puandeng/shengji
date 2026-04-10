const { v4: uuidv4 } = require('uuid');
const GameState = require('./GameState');
const BotPlayer = require('./BotPlayer');
const { GAME_PHASES, PLAYERS_PER_ROOM, TRUMP_DECLARATION_TIMEOUT, LEVEL_THRESHOLDS, BOT_PLAY_DELAY_MS, KITTY_SIZE } = require('./constants');

/**
 * Room encapsulates a single game lobby + game session.
 * It acts as the bridge between socket events and GameState.
 */
class Room {
  constructor(roomCode) {
    this.id        = uuidv4();
    this.code      = roomCode;            // Short human-readable code (e.g. "ABCD")
    this.createdAt = Date.now();
    this.devMode   = !!process.env.DEV_MODE;
    this.game      = new GameState(this.id);
    this.game.devMode = this.devMode;
    this.chatLog   = [];                  // [{ name, message, timestamp }]
    this._trumpTimer = null;
    this._io         = null;              // Socket.io server instance (set via setIO)
    this._botTimers  = [];
  }

  setIO(io) {
    this._io = io;
  }

  // ─────────────────────────────────────────────
  // Player management
  // ─────────────────────────────────────────────

  addPlayer(socketId, name) {
    return this.game.addPlayer(socketId, name);
  }

  removePlayer(socketId) {
    this.game.removePlayer(socketId);

    // If the disconnected player's turn is now, auto-play for them
    if (this.game.phase === GAME_PHASES.PLAYING && this.game.currentPlayerSocketId === socketId) {
      this.scheduleBotPlay();
    }
  }

  reconnectPlayer(oldSocketId, newSocketId) {
    return this.game.reconnectPlayer(oldSocketId, newSocketId);
  }

  get playerCount() {
    return this.game.players.length;
  }

  get isFull() {
    return this.playerCount >= PLAYERS_PER_ROOM;
  }

  get isEmpty() {
    // Only truly empty if all players are gone (not just disconnected)
    return this.game.players.every(p => p.connected === false) || this.game.players.length === 0;
  }

  // ─────────────────────────────────────────────
  // Game flow
  // ─────────────────────────────────────────────

  fillWithBots() {
    const currentCount = this.game.players.length;
    for (let i = currentCount; i < PLAYERS_PER_ROOM; i++) {
      this.game.addPlayer(BotPlayer.generateBotId(i), BotPlayer.generateBotName(i));
    }
  }

  startGame() {
    if (this.devMode) this.fillWithBots();
    if (!this.game.isReady()) return { error: 'Need 4 players to start' };
    if (this.game.phase !== GAME_PHASES.WAITING) return { error: 'Game already started' };
    return this.game.deal();
  }

  /** Start the trump-selection countdown timer */
  startTrumpTimer(onExpire) {
    this._clearTrumpTimer();
    this._trumpTimer = setTimeout(() => {
      if (this.game.phase === GAME_PHASES.TRUMP_SELECTION) {
        this.game.finishTrumpSelection();
        const kittyResult = this.game.giveKittyToDeclarer();
        onExpire({ kittyResult });
      }
    }, TRUMP_DECLARATION_TIMEOUT * 1000);
  }

  _clearTrumpTimer() {
    if (this._trumpTimer) {
      clearTimeout(this._trumpTimer);
      this._trumpTimer = null;
    }
  }

  declareTrump(socketId, cardId) {
    const result = this.game.declareTrump(socketId, cardId);
    if (result.success) {
      this._clearTrumpTimer();
      this.game.finishTrumpSelection();
      const kittyResult = this.game.giveKittyToDeclarer();
      return { ...result, kittyResult };
    }
    return result;
  }

  discardToKitty(socketId, cardIds) {
    return this.game.discardToKitty(socketId, cardIds);
  }

  playCard(socketId, cardId) {
    return this.game.playCard(socketId, cardId);
  }

  startNewRound() {
    if (this.game.phase !== GAME_PHASES.SCORING) return { error: 'Not in scoring phase' };
    this.game.roundNumber++;
    // Loser of previous round attacks next
    const prevAttacking = this.game.attackingTeam;
    const threshold     = LEVEL_THRESHOLDS[this.game.trumpRank];
    const prevWon       = this.game.scores[prevAttacking] >= threshold;
    if (!prevWon) {
      this.game.attackingTeam = prevAttacking === 0 ? 1 : 0;
    }
    return this.game.deal();
  }

  // ─────────────────────────────────────────────
  // Bot / disconnected player auto-play
  // ─────────────────────────────────────────────

  /** Whether a player should be auto-played (bot or disconnected human). */
  _shouldAutoPlay(socketId) {
    if (BotPlayer.isBot(socketId)) return true;
    const player = this.game.getPlayer(socketId);
    return player && player.connected === false;
  }

  /** If the current player needs auto-play, schedule their move after a short delay. */
  scheduleBotPlay() {
    if (this.game.phase !== GAME_PHASES.PLAYING) return;

    const currentSocketId = this.game.currentPlayerSocketId;
    if (!this._shouldAutoPlay(currentSocketId)) return;

    const timer = setTimeout(() => {
      this._executeBotTurn();
    }, BOT_PLAY_DELAY_MS);
    this._botTimers.push(timer);
  }

  _executeBotTurn() {
    if (this.game.phase !== GAME_PHASES.PLAYING) return;

    const socketId = this.game.currentPlayerSocketId;
    if (!this._shouldAutoPlay(socketId)) return;

    const hand = this.game.hands[socketId];
    const cardId = BotPlayer.chooseLegalCard(hand, this.game.currentTrick, this.game.trumpSuit);
    if (!cardId) return;

    const result = this.game.playCard(socketId, cardId);
    if (result.error) {
      console.error(`[Bot] Error playing card: ${result.error}`);
      return;
    }

    this._broadcastAfterPlay(result, socketId, cardId);

    // Chain to next bot if the game is still going
    if (!result.trickComplete) {
      this.scheduleBotPlay();
    } else if (!result.roundOver && !result.gameOver) {
      this.scheduleBotPlay();
    }
  }

  _broadcastAfterPlay(result, socketId, cardId) {
    if (!this._io) return;

    if (result.trickComplete) {
      this.game.players.forEach(p => {
        this._io.to(p.socketId).emit('game:trickComplete', {
          completedTrick: result.completedTrick,
          roundOver:      !!result.roundOver,
          gameOver:       !!result.gameOver,
          attackingWon:   result.attackingWon,
          scores:         result.scores || this.game.scores,
          roundScores:    result.roundScores || this.game.roundScores,
          winnerTeam:     result.winner,
          ...this.toGameStateFor(p.socketId),
        });
      });
    } else {
      this.game.players.forEach(p => {
        this._io.to(p.socketId).emit('game:cardPlayed', {
          socketId,
          cardId,
          currentSeat: this.game.currentSeat,
          trick: this.game.currentTrick.map(e => ({
            socketId: e.socketId,
            card:     e.card.toJSON(),
          })),
        });
      });
    }
  }

  /** If the trump declarer is a bot or disconnected, auto-discard kitty cards. */
  scheduleBotKittyDiscard() {
    if (!this._shouldAutoPlay(this.game.trumpDeclarer)) return;

    const timer = setTimeout(() => {
      const hand = this.game.hands[this.game.trumpDeclarer];
      const cardIds = BotPlayer.chooseKittyDiscard(hand, KITTY_SIZE);
      const result = this.game.discardToKitty(this.game.trumpDeclarer, cardIds);
      if (result.error) {
        console.error(`[Bot] Kitty discard error: ${result.error}`);
        return;
      }

      if (this._io) {
        this.game.players.forEach(p => {
          this._io.to(p.socketId).emit('game:kittyDiscarded', this.toGameStateFor(p.socketId));
        });
      }

      this.scheduleBotPlay();
    }, BOT_PLAY_DELAY_MS);
    this._botTimers.push(timer);
  }

  // ─────────────────────────────────────────────
  // Chat
  // ─────────────────────────────────────────────

  addChatMessage(socketId, message) {
    const player = this.game.getPlayer(socketId);
    if (!player) return null;
    const entry = { name: player.name, message: message.slice(0, 200), timestamp: Date.now() };
    this.chatLog.push(entry);
    if (this.chatLog.length > 100) this.chatLog.shift();
    return entry;
  }

  // ─────────────────────────────────────────────
  // Serialisation
  // ─────────────────────────────────────────────

  toLobbyJSON() {
    return {
      id:          this.id,
      code:        this.code,
      playerCount: this.playerCount,
      isFull:      this.isFull,
      phase:       this.game.phase,
      players:     this.game.players.map(p => ({ name: p.name, seatIndex: p.seatIndex, teamIndex: p.teamIndex })),
      devMode:     this.devMode,
    };
  }

  toGameStateFor(socketId) {
    return {
      ...this.game.toPlayerJSON(socketId),
      roomCode: this.code,
      devMode:  this.devMode,
    };
  }
}

// ─────────────────────────────────────────────
// Room registry (in-memory store)
// ─────────────────────────────────────────────

class RoomRegistry {
  constructor() {
    this._rooms   = new Map(); // code → Room
    this._byId    = new Map(); // id   → Room
    this._players = new Map(); // socketId → roomCode
  }

  create() {
    const code = this._generateCode();
    const room = new Room(code);
    this._rooms.set(code, room);
    this._byId.set(room.id, room);
    return room;
  }

  get(code) {
    return this._rooms.get(code.toUpperCase()) || null;
  }

  getById(id) {
    return this._byId.get(id) || null;
  }

  /** Find the room a given socket is currently in */
  getRoomForSocket(socketId) {
    const code = this._players.get(socketId);
    return code ? this._rooms.get(code) : null;
  }

  trackPlayer(socketId, roomCode) {
    this._players.set(socketId, roomCode.toUpperCase());
  }

  untrackPlayer(socketId) {
    this._players.delete(socketId);
  }

  delete(code) {
    const room = this._rooms.get(code);
    if (!room) return;
    this._rooms.delete(code);
    this._byId.delete(room.id);
  }

  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I/O to avoid confusion
    let code;
    do {
      code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (this._rooms.has(code));
    return code;
  }

  get size() {
    return this._rooms.size;
  }
}

module.exports = { Room, RoomRegistry };
