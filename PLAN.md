# PLAN

Tracks outstanding work for the Sheng Ji implementation. Update status as you pick items up; add new todos at the bottom. See `CLAUDE.md` for collaboration rules.

Status legend: `[ ]` todo · `[~]` in progress (add name) · `[x]` done

---

## Setup tasks (mostly done)
- [x] Rename `SETUP.md` → `CLAUDE.md`
- [x] Add objective/architecture/conventions to `CLAUDE.md`
- [x] Add collaboration rules for multi-session work
- [x] Create `PLAN.md`

## Rule corrections (current implementation is wrong)

The current code in `server/game/` implements an oversimplified variant. Real Sheng Ji rules require:

- [x] **Add jokers.** Deck must include 2 small + 2 big jokers per game (108 cards total with 2 decks, not 104). Update `Deck.js` and `constants.js`.
- [x] **Kitty size is 8, not 4.** With 108 cards and 4 players, 25 each leaves 8 for the kitty. Update `KITTY_SIZE` and the kitty UI.
- [x] **Winning point threshold is wrong.** Defending team needs to *prevent* the attackers from reaching a threshold that depends on the current trump level (e.g., level 2 → attackers need 80, level A → 120+). The hardcoded `WINNING_THRESHOLD = 100` and `>= 100` check in `Room.startNewRound()` must go.
- [x] **Only the attacking team's points count.** Defending team never accumulates points — they only deny. Current `_resolveTrick()` adds points to whichever team won the trick; should only credit attackers when *defenders* win a trick containing point cards (because attackers lose those points to the kitty multiplier at end), and credit attackers directly when they capture point cards. Re-derive the scoring logic from the real rules before coding.
- [x] **Kitty multiplier depends on the last trick winner *and* the lead card count**, not a flat ×2. Standard rule: kitty points × 2× the number of cards in the last winning play (so a single = ×2, a pair = ×4, a tractor of 3 pairs = ×12). Tied to the multi-card-play feature below. *(multiplier wired up; defaults to ×2 until multi-card plays are implemented)*

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

## Rule corrections (trump declaration with jokers)

- [x] **Joker trump declarations.** `callTrump()` now accepts same-type joker pairs (two small or two big); single jokers and mixed small+big pairs are rejected. When a joker pair wins, `trumpSuit` is set to `null` so only trump-rank cards and jokers count as trump for the round. `autoSelectTrump()`/`finishTrumpSelection()` use `trumpCallStrength > 0` as the signal instead of `trumpSuit` truthiness to respect no-trump-suit declarations.

## UI improvements
- [x] **Hand sorting after trump declaration.** `Hand.jsx` sorts using `isCardTrump(card, trumpSuit, trumpRank)` which groups trump-suit cards, off-suit trump-rank cards, and jokers on the right; jokers sort to the end (big > small).

- [x] **Kitty draw animation.** Client diffs `myHand` on `game:trumpSelected` to detect newly added cards; Hand applies a staggered slide-in keyframe animation (`hand-draw`, 650ms) to those card slots, exposed via `newCardIds` in GameContext.

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
- [x] **Bots take too long to select initial trump.** Added `BotPlayer.chooseTrumpCall()` and `Room.scheduleBotTrumpCall()` — bots now attempt a trump call (single/pair/joker pair, strongest available) within ~700ms of dealing, staggered per bot.
- [x] **Declared cards not re-sorted after trump declaration.** Added `useEffect` in `GameBoard` to clear `selectedCards` on phase change, ensuring cards re-sort correctly when trump suit/rank updates.
- [x] **Display current trump rank per team instead of match points.** `ScoreChip` now shows "Level {rank}" and an "Attacking" badge instead of `{score}pts`. CSS updated accordingly.
- [x] **Increase bot play delay to 0.7s.** `BOT_PLAY_DELAY_MS` changed from 500 to 700 in `constants.js`.
- [x] **Show bot's last played card before starting next turn.** Added extra `BOT_PLAY_DELAY_MS` pause after trick completion before scheduling the next bot lead, giving the client time to display the completed trick.

## UI polish
- [x] **Joker card visuals.** Replaced BJ/SJ text labels with joker emoji. Big joker renders in full color; small joker is grayscale via CSS `filter: grayscale(1)`. Center pip is larger and fully opaque for jokers.
- [x] **Larger card sizes.** Card dimensions increased: sm 56×80, md 84×120, lg 110×154. Font sizes scaled up accordingly.

## Cleanup / follow-ups noticed while reviewing the code
- [x] `Room.startNewRound()` hardcodes `>= 100` instead of using the constant — already fixed in a previous PR; code uses `LEVEL_THRESHOLDS[this.game.trumpRank]`.
- [x] `constants.js` comment vs. old SETUP.md disagreed on team seat numbering (0-indexed vs 1-indexed). Verified: server uses 0-indexed internally, client displays 1-indexed labels ("Team 1"/"Team 2") — consistent and correct.
- [x] No tests anywhere. Added `jest` to server, with 36 tests covering `Card` (constructor, `isTrump`, `effectiveSuit`, `trumpOrder`, `beats`, serialisation) and `GameState` (player management, `callTrump` bidding, follow-suit validation, shape classification, scoring).

## TODO (new)
- [x] **Pass option during trump calling.** Added `game:passTrump` socket event, `GameState.passTrump()` tracking, and "Pass" button in `GameBoard`. Bots auto-pass when they can't call. Once all 4 players pass, trump selection finalizes immediately (auto-select) instead of waiting for the 30s timer.
- [x] **Two-row hand layout.** `Hand.jsx` now splits cards into two rows: top row = trump cards (trump-suit by rank, then off-suit trump-rank grouped by suit, then jokers rightmost), bottom row = non-trump cards grouped by suit. A vertical "Trump" label marks the top row. Overlap calculated independently per row.
- [x] **Bots not playing cards.** Root cause: `BotPlayer.chooseLegalCard()` called `card.isTrump(trumpSuit)` with only one argument — missing `trumpRank`. This caused bots to misidentify trump cards, pick wrong follow-suit cards, and fail server validation. Fixed by passing `trumpRank` and using `effectiveSuit()` for lead-suit matching.
- [x] **Auto-dismiss error messages after 5 seconds.** Added a `useEffect` in `GameProvider` that watches `state.error` and auto-dispatches `CLEAR_ERROR` after 5 seconds.
- [x] **Bot paused indefinitely after human plays a card.** Root cause: the `game:playCards` socket handler in `gameHandlers.js` was missing the `room.scheduleBotPlay()` call after a successful play — only the legacy `game:playCard` handler had it. Added the missing call.
- [x] **Pairs of different suits allowed as combos.** `classifyPlay()` now returns `'invalid'` for cross-suit combos and non-pair 2-card plays. `_validateLead()` rejects invalid shapes with an error message. All combos must share the same effective suit.
- [x] **Bot pauses indefinitely on combo plays / follow-combo logic broken.** Replaced `chooseLegalCard` with `chooseLegalCards` in `BotPlayer.js` — bots now pick N cards matching the lead count, prioritizing lead-suit cards and matching pair shapes. `Room._executeBotTurn()` updated to use `chooseLegalCards`. Follow validation updated for throws (must include a pair from lead suit if available).
- [x] **Clarify and enforce combo rules.** Implemented:
  - **Single:** 1 card.
  - **Pair:** 2 identical cards (same suit + rank). Cross-suit rejected.
  - **Tractor:** consecutive pairs, same effective suit. `tractorValue()` rewritten so trump rank is adjacent to Aces (below) and small jokers (above), enabling A,A+trumpRank,trumpRank and trumpRank,trumpRank+SJ,SJ and SJ,SJ+BJ,BJ tractors.
  - **Throw (single+pair):** 3 cards, same effective suit, 1 single + 1 pair. Beaten when opponent beats both components. **Penalty:** if throw is beaten by opponent, attacker team loses 30 pts (or gains 30 if defender led).
  Added `isThrow()`, `splitThrowComponents()`, updated `beatsTrickEntry()` for throw comparison, and added throw penalty in `_resolveTrick()`. 3 new unit tests for combo validation.
- [x] **Fix win condition: level progression 2→A, not "3 rounds".** The game should be won by progressing from level 2 through to Ace and then winning the round at Ace level. Replace any "first to 3 round-wins" logic with the level progression system (which is partially implemented via `teamLevels` and `advanceLevel()`). Key changes:
  - A team wins the match only after winning a round while at level A (levelling past A).
  - Ranks can be skipped based on point differential (both attacking and defending):
    - [x] **Determine point thresholds for rank skipping.** Attackers score 0 → defenders jump 3; attackers < threshold−40 → defenders jump 2; attackers ≥ threshold+40 → attackers jump 2; attackers ≥ threshold+80 → attackers jump 3.
  - **Mandatory stop ranks:** 5, 10, K, and A cannot be skipped the first time a team reaches them. `MANDATORY_STOP_RANKS` in constants, `visitedRanks` per-team tracking in GameState, `advanceLevel()` respects stops.
- [x] **Improve joker card contrast.** BJ/SJ text labels with ★/☆ center symbols. Big joker = red (#ff6b6b) on purple gradient, small joker = light gray (#e0e0e0) on dark blue gradient with high-contrast borders and text-shadows.
- [x] **Responsive card sizing to fit screen.** Dynamic card size (lg/md/sm) based on largest row count. Dynamic overlap via `calcOverlap()` targeting 900px width. Two-row layout inherits independent overlap per row.
- [x] **Display multi-card plays horizontally.** TrickSlot renders cards in a flex row with -28px margin overlap. Cards > 2 use 'sm' size to fit. `.trick-area__combo` CSS handles layout.

## Dealing & gameplay feel
- [x] **Animated card dealing (draw-style).** New `DEALING` phase: server drip-feeds cards one at a time via `game:cardDealt` events at 120ms intervals. Client renders a deck in the center and animates each card into the player's hand. Trump can be called during dealing with cards already in hand. `game:dealComplete` fires when all 100 cards are dealt, then transitions to `TRUMP_SELECTION`. Bots attempt trump calls every 4 cards during dealing.
- [x] **Captured-points pile.** Point pile section now shows the actual captured point cards (miniature Card components) alongside the progress bar, not just a number. Cards accumulate visually throughout the round.
- [x] **Trick display delay.** After the last card in a trick, all 4 plays stay visible for 2.5s (`TRICK_DISPLAY_DELAY_MS`) with a golden glow on the winner's cards and a "Winner" badge. Bots wait for the delay before playing next. Client holds `completedTrick` in state and delays the game state update.

## Visual clarity
- [x] **Attacking/defending team indicators.** `PlayerInfo` now shows ATK/DEF role badges (red for attacking, blue for defending) on every player. `ScoreChip` shows "Attacking"/"Defending" labels with colored backgrounds. Player info panels have colored borders matching their role.
- [x] **Responsive layout for 100% browser zoom.** Card sizes scaled down (md: 84×120 → 62×88, sm: 56×80 → 42×60), grid gaps and padding tightened, font sizes reduced across all components. Game fits at 100% zoom on a standard 1080p screen.
