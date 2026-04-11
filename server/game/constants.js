/**
 * Game Constants for 200 Card Game (Sheng Ji Variant)
 *
 * Game Overview:
 * - 4 players split into 2 teams (Team 0: seats 0&2, Team 1: seats 1&3)
 * - Uses 2 standard 52-card decks + 4 jokers (108 cards total)
 * - Point cards: 5=5pts, 10=10pts, K=10pts → 200 total points in play
 * - Attacking team tries to collect points; defending team tries to block
 * - Only the attacking team's captured points count toward the round threshold
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

// Ordered level progression — index 0 = starting level, index 12 = highest
const LEVEL_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Joker ranks — suit is always 'JOKER'
const JOKER_RANKS = {
  SMALL: 'SJ',
  BIG:   'BJ',
};

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

const PLAYERS_PER_ROOM = 4;
const CARDS_PER_PLAYER = 25;  // 4 players × 25 = 100, leaving 8 for kitty
const KITTY_SIZE       = 8;   // 108 cards − (4 × 25) = 8
const TOTAL_POINTS     = 200; // Total point cards across 2 decks

// Trump rank/level starts at '2' and advances toward 'A' as teams win rounds.
const STARTING_LEVEL = '2';

// Points the attacking team must reach to win the round, keyed by current trump rank.
// Defending team never accumulates points — they only deny the attackers.
const LEVEL_THRESHOLDS = {
  '2':  80,
  '3':  80,
  '4':  80,
  '5':  80,
  '6':  80,
  '7':  80,
  '8':  80,
  '9':  80,
  '10': 80,
  'J':  80,
  'Q':  80,
  'K':  80,
  'A':  120,
};

// Trump declaration time limit (seconds)
const TRUMP_DECLARATION_TIMEOUT = 30;

// Delay before a bot auto-plays (ms) — gives humans time to follow the action
const BOT_PLAY_DELAY_MS = 500;

module.exports = {
  SUITS,
  SUIT_NAMES,
  SUIT_SYMBOLS,
  RANKS,
  LEVEL_ORDER,
  JOKER_RANKS,
  POINT_VALUES,
  RANK_ORDER,
  GAME_PHASES,
  TEAM_ASSIGNMENTS,
  PLAYERS_PER_ROOM,
  CARDS_PER_PLAYER,
  KITTY_SIZE,
  TOTAL_POINTS,
  STARTING_LEVEL,
  LEVEL_THRESHOLDS,
  TRUMP_DECLARATION_TIMEOUT,
  BOT_PLAY_DELAY_MS,
};
