# PLAN

Tracks outstanding work for the Sheng Ji implementation. Update status as you pick items up; add new todos at the bottom. See `CLAUDE.md` for collaboration rules.

Status legend: `[ ]` todo · `[~]` in progress (add name) · `[x]` done

---

## Rule corrections (current implementation is wrong)

The current code in `server/game/` implements an oversimplified variant. Real Sheng Ji rules require:

- [x] **Add jokers.** Deck must include 2 small + 2 big jokers per game (108 cards total with 2 decks, not 104). Update `Deck.js` and `constants.js`.
- [x] **Kitty size is 8, not 4.** With 108 cards and 4 players, 25 each leaves 8 for the kitty. Update `KITTY_SIZE` and the kitty UI.
- [x] **Winning point threshold is wrong.** Defending team needs to *prevent* the attackers from reaching a threshold that depends on the current trump level (e.g., level 2 → attackers need 80, level A → 120+). The hardcoded `WINNING_THRESHOLD = 100` and `>= 100` check in `Room.startNewRound()` must go.
- [x] **Only the attacking team's points count.** Defending team never accumulates points — they only deny. Current `_resolveTrick()` adds points to whichever team won the trick; should only credit attackers when *defenders* win a trick containing point cards (because attackers lose those points to the kitty multiplier at end), and credit attackers directly when they capture point cards. Re-derive the scoring logic from the real rules before coding.
- [x] **Kitty multiplier depends on the last trick winner *and* the lead card count**, not a flat ×2. Standard rule: kitty points × 2× the number of cards in the last winning play (so a single = ×2, a pair = ×4, a tractor of 3 pairs = ×12). Tied to the multi-card-play feature below. *(multiplier wired up; defaults to ×2 until multi-card plays are implemented)*

## Rule corrections (trump declaration with jokers)

- [ ] **Joker trump declarations.** During trump calling, players may also declare using a pair of the *same* joker (two small or two big) — single jokers and mixed small+big joker pairs are **not** allowed. A joker pair overrides even a pair of trump-rank cards (the strongest non-joker call). When a joker pair wins the declaration, there is **no trump suit** for that round — only trump-rank cards and jokers count as trump.

## Core gameplay features missing

- [x] **Multi-card plays.** `playCards(socketId, cardIds[])` replaces `playCard`. Shape detection (single/pair/tractor/throw), follow-suit enforcement for combos, and trick resolution all updated. Socket event `game:playCards`. Legacy `game:playCard` still works (wraps to `playCards`).
- [x] **Custom card ordering with trump level.** `Card.isTrump(trumpSuit, trumpRank)` now includes off-suit trump-rank cards. `Card.trumpOrder()` implements the full ordering: regular trump < off-suit trump-rank < in-suit trump-rank < small joker < big joker. `Card.beats()` now takes `trumpRank` as a 4th arg.
- [x] **Trump level progression.** `GameState.teamLevels` (`{ 0: '2', 1: '2' }`). Margin-based advancement (+1/+2/+3 levels). Trump rank for next round = attacking team's level. Win condition: team levels past A. `roundScores` kept for backward compat.
- [x] **Dynamic trump calling mechanic.** `game:callTrump` event. Call strengths: 1 = single rank card, 2 = pair, 3 = joker pair. Higher strength overrides lower; same strength = first caller wins. Timer still runs so others can try to override. Auto-select falls back to first kitty card's suit. Legacy `game:declareTrump` still works (strength-1 call + immediate finalize).
- [x] **Point collection pile.** `GameState.attackerPointPile` tracks point cards captured by attackers. Sent in every state snapshot. `GameBoard` renders a progress bar showing attacker pts vs threshold.

## Server changes implied
- [x] `server/game/constants.js` — `JOKER_RANKS`, `KITTY_SIZE=8`, `STARTING_LEVEL`, `LEVEL_ORDER`, `LEVEL_THRESHOLDS`.
- [x] `server/game/Deck.js` — 108 cards with jokers.
- [x] `server/game/Card.js` — joker support, `isTrump(suit,rank)`, `trumpOrder()`, `effectiveSuit()`, updated `beats()`.
- [x] `server/game/GameState.js` — multi-card plays, shape detection, follow-suit enforcement, attacker point pile, level progression, trump-call bidding.
- [x] `server/socket/gameHandlers.js` — `game:playCards`, `game:callTrump`, legacy events kept.

## Client changes implied
- [x] Multi-select in `Hand`, "Play N cards" button in play mode
- [x] `TrumpBanner` shows suit, rank, and call strength; prompt guides calling
- [x] Trump calling UI in `GameBoard` — click to call, pair auto-submits
- [x] Point pile progress bar in `GameBoard` centre column
- [x] `ScoringModal` shows team levels (2→A) with progress pip bar

## UI improvements
- [ ] **Hand sorting after trump declaration.** When the trump suit has been declared, reorder cards in each player's hand so that trump suit cards, trump rank cards, and jokers are on the rightmost side of the hand.

- [ ] **Kitty draw animation.** After dealing finishes and the declarer receives the kitty, animate the kitty cards being drawn into the player's hand before sorting them into position.

## Dev experience
- [x] **Single-player dev mode.** Testing currently requires 4 browser tabs. Add a `DEV_MODE` env var (server) that lets `Room.startGame()` proceed with <4 players, filling empty seats with stub/bot players that auto-play legal moves. Make it obvious in the UI when dev mode is active.

## Bug fixes
- [x] **Kitty discard UI hardcodes 4 instead of 8.** `GameBoard.jsx` limits card selection to 4 (`prev.length < 4`) and requires exactly 4 to discard (`selectedCards.length !== 4`). The prompt text also says "4 cards". But `KITTY_SIZE` is 8. The declarer picks up 8 kitty cards and must discard 8 back.
- [x] **ScoringModal hardcodes `>= 100` threshold.** `ScoringModal.jsx:15` uses `attackingScore >= 100` to determine the round winner, but the actual threshold varies by trump rank (80 for levels 2–K, 120 for A). The server already sends `threshold` in the game state — use it instead.
- [x] **Hand sorting doesn't group jokers with trump.** In `Hand.jsx`, the trump sort check is `a.suit === trumpSuit`, but jokers have `suit: 'JOKER'`, so they fall through to the `SUIT_ORDER` lookup (getting 99) and sort to the far end, separated from other trump cards. Jokers should be grouped with the trump suit.
- [x] **Disconnect mid-game breaks the room.** `handleDisconnect` in `server/socket/index.js` calls `room.removePlayer()` which splices the player from the array and deletes their hand. This breaks trick completion (expects 4 plays), seat advancement, and the `currentPlayerSocketId` getter. The game becomes unplayable for remaining players with no error message or recovery.
- [x] **No reconnection support.** If a player refreshes, they get a new socket ID and lose their seat. The `room:state` handler only works if the original socket ID is still tracked. There's no mechanism to rejoin a game in progress (e.g., by name + room code).
- [x] **Dev mode banner overlaps trump/team info.** The fixed-position "DEV MODE" indicator bar at the top of the game screen (`Game.css .dev-mode-indicator`) sits on top of the `TrumpBanner` component, hiding the trump suit and attacking team info. Needs either a top margin/padding on the game board when dev mode is active, or the banner should be positioned within the layout flow instead of `position: fixed`.
- [x] **Scores display shows both teams' points but only attackers score.** `ScoringModal.jsx` shows "Team 1 points" and "Team 2 points" side by side, but the defending team's score is always 0 by design. This is confusing — should show attacker score vs. threshold instead, or at minimum label which team is attacking/defending.

## TODO
- [ ] **Display current trump rank per team instead of match points.** Replace the round-win stars (★/☆) in the score UI with each team's current trump card rank (e.g., "Team 1: Level 5", "Team 2: Level 3"). This reflects the real Sheng Ji progression system where teams advance their level rather than accumulating match points.
- [ ] **Increase bot play delay to 0.7s.** Change `BOT_PLAY_DELAY_MS` from 500 to 700 so there's more time to follow the action in dev mode.
- [ ] **Show bot's last played card before starting next turn.** When a bot plays a card, ensure the card is visually displayed in the trick area for the full delay duration before the next bot takes its turn. Currently bot plays may chain too fast for the client to render each card individually.

## UI polish
- [ ] **Joker card visuals.** Replace the current "BJ"/"SJ" text labels with proper joker imagery. Big joker should display a **colored** joker image; small joker should display a **black-and-white** joker image. This makes them instantly distinguishable at a glance.
- [ ] **Larger card sizes.** Increase card dimensions so they fill more of the screen, reducing the amount of empty green background. Cards should feel prominent and easy to interact with.

## Cleanup / follow-ups noticed while reviewing the code
- [ ] `Room.startNewRound()` hardcodes `>= 100` instead of using the constant — moot once the threshold logic is rewritten, but flag it.
- [ ] `constants.js` comment vs. old SETUP.md disagreed on team seat numbering (0-indexed vs 1-indexed). CLAUDE.md now uses 0-indexed; double-check the client UI labels match.
- [ ] No tests anywhere. Once trick/scoring rules are rewritten, add unit tests for `Card.beats()`, follow-suit validation, and shape matching — these are the highest-leverage things to lock down.

## Setup tasks (mostly done)
- [x] Rename `SETUP.md` → `CLAUDE.md`
- [x] Add objective/architecture/conventions to `CLAUDE.md`
- [x] Add collaboration rules for multi-session work
- [x] Create `PLAN.md`
