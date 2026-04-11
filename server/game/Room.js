const { v4: uuidv4 } = require('uuid');
const GameState = require('./GameState');
const { GAME_PHASES, PLAYERS_PER_ROOM, TRUMP_DECLARATION_TIMEOUT, LEVEL_THRESHOLDS } = require('./constants');

/**
 * Room encapsulates a single game lobby + game session.
 * It acts as the bridge between socket events and GameState.
 */
class Room {
  constructor(roomCode) {
    this.id        = uuidv4();
    this.code      = roomCode;            // Short human-readable code (e.g. "ABCD")
    this.createdAt = Date.now();
    this.game      = new GameState(this.id);
    this.chatLog   = [];                  // [{ name, message, timestamp }]
    this._trumpTimer = null;
  }

  // ─────────────────────────────────────────────
  // Player management
  // ─────────────────────────────────────────────

  addPlayer(socketId, name) {
    return this.game.addPlayer(socketId, name);
  }

  removePlayer(socketId) {
    this.game.removePlayer(socketId);
  }

  get playerCount() {
    return this.game.players.length;
  }

  get isFull() {
    return this.playerCount >= PLAYERS_PER_ROOM;
  }

  get isEmpty() {
    return this.playerCount === 0;
  }

  // ─────────────────────────────────────────────
  // Game flow
  // ─────────────────────────────────────────────

  startGame() {
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

  /**
   * A player calls trump during the TRUMP_SELECTION phase.
   * Higher-strength calls (pair > single, joker pair > pair) override weaker ones.
   * Does NOT immediately move to the kitty phase — the timer continues so others
   * can attempt to override. Call finishTrumpSelection() when the timer fires.
   */
  callTrump(socketId, cardIds) {
    return this.game.callTrump(socketId, cardIds);
  }

  declareTrump(socketId, cardId) {
    // Legacy single-card declare — delegate to callTrump
    const result = this.game.callTrump(socketId, [cardId]);
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

  /** Play one or more cards (single / pair / tractor / throw). */
  playCards(socketId, cardIds) {
    return this.game.playCards(socketId, cardIds);
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

    // Trump rank for next round = attacking team's current level
    this.game.trumpRank = this.game.teamLevels[this.game.attackingTeam];

    return this.game.deal();
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
    };
  }

  toGameStateFor(socketId) {
    return {
      ...this.game.toPlayerJSON(socketId),
      roomCode: this.code,
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
