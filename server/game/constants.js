/**
 * Game Constants for 200 Card Game (Sheng Ji Variant)
 *
 * Game Overview:
 * - 4 players split into 2 teams (Team 0: seats 0&2, Team 1: seats 1&3)
 * - Uses 2 standard 52-card decks (104 cards total)
 * - Point cards: 5=5pts, 10=10pts, K=10pts → 200 total points in play
 * - Attacking team tries to collect points; defending team tries to block
 * - Attacking team wins if they score >= 200 points (or threshold)
 */

const SUITS = {
  SPADES:   'S',
  HEARTS:   'H',
  DIAMONDS: 'D',
  CLUBS:    'C',
};

const SUIT_NAMES = {
  S: 'Spades',
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
};

const SUIT_SYMBOLS = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Point values for scoring cards
const POINT_VALUES = {
  '5':  5,
  '10': 10,
  'K':  10,
};

// Standard rank order for trick comparison (higher = stronger)
const RANK_ORDER = {
  '2':  2,
  '3':  3,
  '4':  4,
  '5':  5,
  '6':  6,
  '7':  7,
  '8':  8,
  '9':  9,
  '10': 10,
  'J':  11,
  'Q':  12,
  'K':  13,
  'A':  14,
};

const GAME_PHASES = {
  WAITING:         'WAITING',         // Waiting for players to join
  DEALING:         'DEALING',         // Cards being dealt
  TRUMP_SELECTION: 'TRUMP_SELECTION', // Players may declare trump
  KITTY:           'KITTY',           // Attacker picks up kitty & discards
  PLAYING:         'PLAYING',         // Trick-taking phase
  SCORING:         'SCORING',         // Round over, showing scores
  GAME_OVER:       'GAME_OVER',       // Match complete
};

// Team assignments by seat index
// Seat 0 & 2 → Team 0 | Seat 1 & 3 → Team 1
const TEAM_ASSIGNMENTS = {
  0: 0,
  1: 1,
  2: 0,
  3: 1,
};

const PLAYERS_PER_ROOM  = 4;
const CARDS_PER_PLAYER  = 25; // 4 players × 25 = 100, leaving 4 for kitty
const KITTY_SIZE        = 4;
const TOTAL_POINTS      = 200; // Total point cards in 2 decks
const WINNING_THRESHOLD = 100; // Attacking team needs ≥ 100 to win a round

// Trump declaration time limit (seconds)
const TRUMP_DECLARATION_TIMEOUT = 30;

module.exports = {
  SUITS,
  SUIT_NAMES,
  SUIT_SYMBOLS,
  RANKS,
  POINT_VALUES,
  RANK_ORDER,
  GAME_PHASES,
  TEAM_ASSIGNMENTS,
  PLAYERS_PER_ROOM,
  CARDS_PER_PLAYER,
  KITTY_SIZE,
  TOTAL_POINTS,
  WINNING_THRESHOLD,
  TRUMP_DECLARATION_TIMEOUT,
};
