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

## Core gameplay features missing

- [ ] **Multi-card plays.** Players must be able to play singles, **pairs** (two identical cards — same suit + rank + deck), **tractors** (consecutive same-rank pairs in the same suit, e.g. 7♠7♠–8♠8♠), and **throws** (a forced multi-card lead the opponents can't beat). Current `playCard` only accepts a single `cardId`. Needs:
  - New socket event payload: `{ cardIds: string[] }`
  - Lead-shape detection (single / pair / tractor / throw)
  - Follow-suit logic: must match the lead shape if possible (e.g., if lead is a pair, must play a pair of the lead suit if you have one)
  - Trick comparison that compares same-shape plays
- [ ] **Custom card ordering with trump level.** In Sheng Ji the trump suit is a *combination* of (trump suit, trump rank/level). The trump rank card is elevated above all other ranks in its suit, and the off-suit trump-rank cards are also trump (ranked just below the in-suit trump-rank card). Full ordering, low → high:
  1. Non-trump cards by normal rank
  2. Off-suit trump-rank cards (any of the 3 non-trump suits)
  3. In-suit trump-rank card
  4. Small joker
  5. Big joker
  Update `Card.beats()` and probably introduce a `compareCards(a, b, trumpSuit, trumpRank)` helper.
- [ ] **Trump level progression.** Each team has a "level" starting at 2. Winning a round advances your team's level by an amount based on margin of victory (e.g., +1, +2, +3). The trump *rank* for the next round is the attacking team's current level. Match is won when a team levels past A. Replaces the current "first to 3 rounds" win condition.
- [ ] **Draw / dynamic trump calling mechanic.** Replace the timed `TRUMP_SELECTION` phase with the real bidding mechanic:
  - Cards are dealt **one at a time** to each player in turn order. During dealing, any player (not just the host) may declare trump by revealing one or more cards matching the current trump *rank*.
  - A declaration must show more trump-rank cards than the current standing declaration. E.g., if player A declared with 1 card, player B can only override by declaring with 2 cards of a (possibly different) suit.
  - The player whose declaration stands at the end of dealing wins the bid — their team becomes the attacking team and that player picks up the kitty.
  - If nobody declares by the end of the deal, fall back to a forced call (e.g., dealer must declare, or the kitty's first card determines trump — pick one rule and document it).
  - **Current bug:** only the host (seat 0) can declare trump, and the timer-based `TRUMP_SELECTION` phase doesn't deal cards one at a time. Both need to be replaced.
- [ ] **Point collection pile in the middle.** When the attacking team wins a trick that contains point cards (5/10/K), animate those point cards moving to a shared pile in the center of the board. This makes it visually clear that:
  - Only attacking-team captures count
  - The running point total is visible to everyone
  - The defending team can see how close attackers are to the threshold

  Server side: track `attackerPointPile: Card[]` on `GameState`. Client side: `GameBoard` renders the pile with running total.

## Server changes implied
- [ ] `server/game/constants.js` — add `JOKER_SMALL`/`JOKER_BIG`, raise `KITTY_SIZE` to 8, add `STARTING_LEVEL = 2`, remove `WINNING_THRESHOLD`, add level → threshold table.
- [ ] `server/game/Deck.js` — include jokers, deal one at a time to support the draw/call mechanic.
- [ ] `server/game/Card.js` — joker support, rewrite `beats()` for trump-rank elevation.
- [ ] `server/game/GameState.js` — multi-card plays, shape matching, attacker-only point pile, level-based round end, trump-call bidding state machine.
- [ ] `server/socket/gameHandlers.js` — `game:playCards` (plural), `game:callTrump` (with override semantics).

## Client changes implied
- [ ] Multi-select in `Hand` component, "Play" button to confirm
- [ ] Trump banner shows both **suit and level**
- [ ] Bidding UI during dealing — show "X called ♠ with single 2", allow override
- [ ] Point pile component in the middle of `GameBoard` with running total + threshold marker
- [ ] Score display shows team levels (2 → 3 → … → A) instead of round count

## Dev experience
- [ ] **Single-player dev mode.** Testing currently requires 4 browser tabs. Add a `DEV_MODE` env var (server) that lets `Room.startGame()` proceed with <4 players, filling empty seats with stub/bot players that auto-play legal moves. Make it obvious in the UI when dev mode is active.

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
