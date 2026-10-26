const Card  = require('./Card');
const { SUITS, RANKS, JOKER_RANKS } = require('./constants');

/**
 * Normalise a numeric or string seed into an unsigned 32-bit integer.
 * String seeds are hashed with FNV-1a 32-bit.
 */
function seedToUint32(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed >>> 0;
  }
  const str = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Mulberry32 — fast, deterministic 32-bit PRNG returning floats in [0, 1).
 */
function createRng(seed) {
  let state = seedToUint32(seed);
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate a random 32-bit unsigned integer seed when none is supplied. */
function randomSeed() {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

class Deck {
  constructor(seed = null) {
    this._initialSeed = seed !== undefined ? seed : null;
    this.seed         = this._initialSeed;
    this.cards        = [];
    this._shuffled    = false;
    this._build();
  }

  /** Build 2 standard 52-card decks + 2 small jokers + 2 big jokers = 108 cards */
  _build() {
    this.cards = [];
    for (let deckIndex = 0; deckIndex < 2; deckIndex++) {
      for (const suit of Object.values(SUITS)) {
        for (const rank of RANKS) {
          this.cards.push(new Card(suit, rank, deckIndex));
        }
      }
      // One small joker and one big joker per deck
      this.cards.push(new Card('JOKER', JOKER_RANKS.SMALL, deckIndex));
      this.cards.push(new Card('JOKER', JOKER_RANKS.BIG,   deckIndex));
    }
    this._shuffled = false;
  }

  /**
   * Fisher-Yates shuffle driven by a deterministic PRNG.
   * When no seed is passed, a random 32-bit seed is generated and stored on
   * `this.seed` so even an unseeded shuffle can be replayed from its seed.
   */
  shuffle(seed) {
    if (this._shuffled) {
      this._build();
    }

    const effectiveSeed = (seed !== undefined && seed !== null)
      ? seed
      : (this._initialSeed !== null ? this._initialSeed : randomSeed());
    this.seed = effectiveSeed;
    const rng = createRng(effectiveSeed);

    const arr = this.cards;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    this._shuffled = true;
    return this;
  }

  /** Deal cards to `numPlayers` players, returning { hands, kitty, seed } */
  deal(numPlayers, cardsPerPlayer, kittySize, seed) {
    this.shuffle(seed);

    const hands = Array.from({ length: numPlayers }, () => []);

    // Deal cards round-robin
    for (let i = 0; i < numPlayers * cardsPerPlayer; i++) {
      hands[i % numPlayers].push(this.cards[i]);
    }

    const kitty = this.cards.slice(numPlayers * cardsPerPlayer, numPlayers * cardsPerPlayer + kittySize);

    return { hands, kitty, seed: this.seed };
  }

  get size() {
    return this.cards.length;
  }
}

Deck.createRng    = createRng;
Deck.seedToUint32 = seedToUint32;
Deck.randomSeed   = randomSeed;

module.exports = Deck;
