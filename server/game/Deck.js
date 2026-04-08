const Card  = require('./Card');
const { SUITS, RANKS } = require('./constants');

class Deck {
  constructor() {
    this.cards = [];
    this._build();
  }

  /** Build 2 standard 52-card decks (104 cards total) */
  _build() {
    this.cards = [];
    for (let deckIndex = 0; deckIndex < 2; deckIndex++) {
      for (const suit of Object.values(SUITS)) {
        for (const rank of RANKS) {
          this.cards.push(new Card(suit, rank, deckIndex));
        }
      }
    }
  }

  /** Fisher-Yates shuffle */
  shuffle() {
    const arr = this.cards;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return this;
  }

  /** Deal cards to `numPlayers` players, returning { hands, kitty } */
  deal(numPlayers, cardsPerPlayer, kittySize) {
    this.shuffle();

    const hands = Array.from({ length: numPlayers }, () => []);

    // Deal cards round-robin
    for (let i = 0; i < numPlayers * cardsPerPlayer; i++) {
      hands[i % numPlayers].push(this.cards[i]);
    }

    const kitty = this.cards.slice(numPlayers * cardsPerPlayer, numPlayers * cardsPerPlayer + kittySize);

    return { hands, kitty };
  }

  get size() {
    return this.cards.length;
  }
}

module.exports = Deck;
