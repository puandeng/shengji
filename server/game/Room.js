const { v4: uuidv4 } = require('uuid');
const GameState = require('./GameState');
const BotPlayer = require('./BotPlayer');
const { GameLogger } = require('./GameLogger');
const { GAME_PHASES, PLAYERS_PER_ROOM, TRUMP_DECLARATION_TIMEOUT, LEVEL_THRESHOLDS, BOT_PLAY_DELAY_MS, KITTY_SIZE, DEAL_CARD_INTERVAL_MS, TRICK_DISPLAY_DELAY_MS } = require('./constants');

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
    this.logger    = new GameLogger(roomCode);
    this.game.logger = this.logger;
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

  /**
   * Animate dealing: drip-feed cards one at a time to all clients.
   * Calls `onDealCard(entry, index)` for each card dealt,
   * and `onDealComplete()` when all cards are dealt.
   */
  startAnimatedDeal(onDealCard, onDealComplete) {
    if (!this.game.dealQueue || this.game.phase !== GAME_PHASES.DEALING) return;

    this._clearDealTimer();
    const queue = this.game.dealQueue;
    let idx = 0;

    const dealNext = () => {
      if (idx >= queue.length) {
        this.game.finishDealing();
        onDealComplete();
        return;
      }

      this.game.dealIndex = idx + 1;
      const entry = queue[idx];
      onDealCard(entry, idx);
      idx++;

      // Every 4 cards (one full round), let bots try to call trump
      if (idx % 4 === 0 && this.game.phase === GAME_PHASES.DEALING) {
        this.scheduleBotTrumpCall();
      }

      this._dealTimer = setTimeout(dealNext, DEAL_CARD_INTERVAL_MS);
    };

    dealNext();
  }

  _clearDealTimer() {
    if (this._dealTimer) {
      clearTimeout(this._dealTimer);
      this._dealTimer = null;
    }
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
    const result = this.game.callTrump(socketId, cardIds);
    if (result.error) {
      this.logger.trumpRejected({ seatIndex: this.game._seat(socketId), cardIds, error: result.error });
    }
    return result;
  }

  passTrump(socketId) {
    return this.game.passTrump(socketId);
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
    const result = this.game.playCards(socketId, cardIds);
    if (result.error) {
      this.logger.playRejected({ seatIndex: this.game._seat(socketId), cardIds, error: result.error });
    }
    return result;
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
  // Bot / disconnected player auto-play
  // ─────────────────────────────────────────────

  /** Schedule bot trump calls shortly after dealing. */
  scheduleBotTrumpCall() {
    if (this.game.phase !== GAME_PHASES.TRUMP_SELECTION && this.game.phase !== GAME_PHASES.DEALING) return;

    // Stagger bot calls with a short delay so it feels natural
    const botPlayers = this.game.players.filter(p => BotPlayer.isBot(p.socketId));
    botPlayers.forEach((bot, i) => {
      const timer = setTimeout(() => {
        if (this.game.phase !== GAME_PHASES.TRUMP_SELECTION && this.game.phase !== GAME_PHASES.DEALING) return;

        const hand = this.game.phase === GAME_PHASES.DEALING
          ? this.game.getDealtHand(bot.socketId)
          : this.game.hands[bot.socketId];
        if (!hand || hand.length === 0) return;

        const cardIds = BotPlayer.chooseTrumpCall(hand, this.game.trumpRank, this.game.trumpCallStrength);
        if (!cardIds) {
          // Bot can't call — pass instead (but don't pass during dealing; wait until trump selection)
          if (this.game.phase === GAME_PHASES.DEALING) return;

          const passResult = this.game.passTrump(bot.socketId);
          if (passResult.allPassed) {
            this._clearTrumpTimer();
            this.game.finishTrumpSelection();
            this.game.giveKittyToDeclarer();
            if (this._io) {
              this.game.players.forEach(p => {
                this._io.to(p.socketId).emit('game:trumpSelected', {
                  trumpSuit:     this.game.trumpSuit,
                  trumpDeclarer: this.game.trumpDeclarer,
                  auto:          true,
                  ...this.toGameStateFor(p.socketId),
                });
              });
            }
            this.scheduleBotKittyDiscard();
          }
          return;
        }

        const result = this.game.callTrump(bot.socketId, cardIds);
        if (result.error) return;

        // Broadcast the call
        if (this._io) {
          this.game.players.forEach(p => {
            this._io.to(p.socketId).emit('game:trumpCalled', {
              trumpSuit:     result.trumpSuit,
              trumpRank:     result.trumpRank,
              strength:      result.strength,
              declarerName:  result.declarer,
              callerCardIds: result.callerCardIds,
              ...this.toGameStateFor(p.socketId),
            });
          });
        }
      }, BOT_PLAY_DELAY_MS * (i + 1)); // Stagger: 700ms, 1400ms, 2100ms
      this._botTimers.push(timer);
    });
  }

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
    const cardIds = BotPlayer.chooseLegalCards(hand, this.game.currentTrick, this.game.trumpSuit, this.game.trumpRank);
    if (!cardIds || cardIds.length === 0) return;

    const result = this.game.playCards(socketId, cardIds);
    if (result.error) {
      console.error(`[Bot] Error playing cards: ${result.error}`);
      return;
    }

    this._broadcastAfterPlay(result, socketId, cardIds[0]);

    if (!result.trickComplete) {
      this.scheduleBotPlay();
    } else if (!result.roundOver && !result.gameOver) {
      // Wait for trick display delay before starting next trick
      const timer = setTimeout(() => this.scheduleBotPlay(), TRICK_DISPLAY_DELAY_MS + BOT_PLAY_DELAY_MS);
      this._botTimers.push(timer);
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
            cards:    e.cards.map(c => c.toJSON()),
            card:     e.cards[0]?.toJSON(),
            shape:    e.shape,
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
