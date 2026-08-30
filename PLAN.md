# PLAN

Tracks outstanding work for the Sheng Ji implementation. Update status as you pick items up; add new todos at the bottom. See `CLAUDE.md` for collaboration rules.

Status legend: `[ ]` todo · `[~]` in progress (add name) · `[x]` done

---

## Open

### Refactor
- [ ] **Swap attacking/defending team semantics.** The team that calls trump and plays first is the *defending* team (they protect the kitty and try to prevent the other team from scoring). The other team is the *attacking* team (they try to collect points to reach threshold). Currently the codebase has this backwards: `attackingTeam` is set to the trump caller's team. Rename throughout server and client so the labels match traditional Sheng Ji terminology. Round transitions: when the defending team wins, they advance in levels and continue defending next round. When the attacking team beats the defending team, the attacking team becomes the new defending team (roles swap).

### Bugs
- [ ] **Trump auto-select can deadlock the round.** `autoSelectTrump()` picks a suit from the kitty but sets `trumpDeclarer = null`. `giveKittyToDeclarer()` then returns `{ error: 'No trump declarer' }`, and both callers (`Room.scheduleBotTrumpCall()` on all-pass, and the trump timer path) ignore the error. Nobody holds the kitty, nobody can discard, and the game sits in `KITTY` forever. Reproduced with `GAME_LOG` + a headless 4-bot round where no player held a trump-rank card. Fix: fall back to a real seat as declarer (seat 0, or the last player to act) instead of `null`.
- [ ] **Home page "How to play" copy is stale.** It still says "First team to win 3 rounds wins the match!" — the win condition is level progression 2→A. Same drift that was just fixed in `CLAUDE.md`.
- [ ] **~~Bots spam `game:passTrump` during dealing.~~** Fixed by the slow-motion deal — bots now act once per call window instead of on every dealt card. A live 4-bot round logged 14 `trump_pass` events across 4 seats (seat 3 passed six times), including a pass from the seat that had already made a winning strength-3 call. `scheduleBotTrumpCall()` re-fires as cards are dealt and re-passes each time. `trumpPasses` is a `Set`, so game logic is unaffected — but the log is noisy and the `(all passed)` marker prints while a live call stands, which misleads anyone reviewing the log. Fix: skip bots that have already passed or currently hold the winning call.
- [x] **Can't select more than one card for trump declaration.** Fixed: `handleCallTrump()` is now a pure toggle (max 2 cards) and a `Call trump (1 card / pair)` button submits, matching the kitty-discard and play flows. The old auto-submit sent the single to the server before a second card could be picked, and the resulting strength-1 call then blocked the strength-2 one it should have become.
- [x] **Hand and play button overlap the macOS dock.** `GameBoard.css` and `Game.css` use `height: 100vh` with no bottom inset, so the hand row and play button sit under the dock. Fixed: flex layout with `env(safe-area-inset-bottom)` padding.

### Done this pass
- [x] **Follow-suit rejections were unactionable.** `Must play as many S cards as possible` named a raw suit letter, never said how many you hold or how many are required, and never explained that trump-rank cards and jokers are trump regardless of printed suit. Now: `Spades led. You hold 2 spade cards and played 0 — you must play 1. You can only play trump or another suit once you are out of spades.` plus a parenthetical when a lookalike is involved: `(Your 2 of spades counts as trump, not spades.)` Pair/tractor/throw rejections name the shape and the count too. 4 tests added.
- [x] **Slow-motion deal with explicit call windows.** The deal pauses for a 5s window whenever a dealt joker/trump-rank card gives its recipient a call that beats the standing one, plus an interval backstop every 20 cards, with pauses kept ≥4 cards apart. Visible countdown; the badge reads `You can call!` only for players who actually can, so the reason for a pause is not broadcast. Closes early once all have acted; passes are window-scoped. A standing joker-pair call (strength 3) cannot be outranked, so it suppresses all further windows and skips the 30s trump timer straight to the kitty. New events `game:dealPaused` / `game:dealResumed`; constants `DEAL_PAUSE_EVERY_CARDS`, `DEAL_PAUSE_MS`, `DEAL_PAUSE_MIN_GAP_CARDS`; windows are recorded in the game log.
- [x] **Hand clipped off the bottom of the screen.** `.game-root` was `100vh` *and* contained a 22px dev banner plus a `100vh` board, with `overflow:hidden` silently clipping the difference — the hand's bottom row was cut off by 17px before the macOS dock was even involved. Now a flex column on `100dvh` with the board as `flex:1`, plus `env(safe-area-inset-bottom)` padding. Measured: hand went from 17px clipped to 30px of clearance.
- [x] **Too much dead space around the trick area.** `.gameboard__sides` was taking 399px of a 900px viewport (44%) to show a small deck icon. Now 231px (26%).
- [x] **Game logging for post-hoc review.** `server/game/GameLogger.js` writes a JSONL event stream plus chess-style notation to `logs/` per room. Captures deal (all hands), trump bidding incl. rejected calls, every play, and per-trick scoring with a `credited` vs `trickPoints` split and a `reason` when they differ. See the Game Logs section of `CLAUDE.md`. Disable with `GAME_LOG=0`.
- [x] **`CLAUDE.md` is stale vs. the implementation.** It still documents the pre-refactor rules and protocol. At minimum: win condition is level progression 2→A (not "first to 3 rounds"), kitty discard is 8 (not 4), kitty multiplier is 2× the winning play's card count (not flat ×2), and the socket protocol is missing `game:playCards`, `game:callTrump`, `game:passTrump`, `game:cardDealt`, `game:dealComplete`, plus the `DEALING` phase. Also missing from the file tree: `server/game/BotPlayer.js`, `server/game/__tests__/`, `client/src/sounds.js`.

---

## Completed

Condensed; full rationale for each item is in git history and the PRs that landed them.

### Rules engine
- Jokers added — 108-card deck (2 × 52 + 4 jokers), 25 per player, kitty 8.
- Level-based thresholds (`LEVEL_THRESHOLDS`: 80 for 2–K, 120 for A) replaced the hardcoded 100.
- Trump caller's team = **defending team** (picks up kitty, tries to deny points). Other team = **attacking team** (accumulates points, tries to reach threshold).
- Kitty: defending team winning last trick protects the kitty (no bonus). Attacking team winning last trick → kitty points × (2 × cards in winning play) added to score.
- Trump ordering: regular trump < off-suit trump-rank < in-suit trump-rank < small joker < big joker. `Card.beats()` takes `trumpRank`.
- Level progression 2→A. Defenders hold (attackers below threshold) → defenders advance +1 to +3 levels and keep defending. Attackers break through (≥ threshold) → attackers advance +1 to +3 levels and become new defenders. Skip margins: attackers 0 → defenders +3; < threshold−40 → defenders +2; ≥ threshold+40 → attackers +2; ≥ threshold+80 → attackers +3. `MANDATORY_STOP_RANKS` (5, 10, K, A) can't be skipped on first visit; `visitedRanks` tracked per team.
- Jack demotion: if defending team is at level J and attacking team wins last trick with a Jack card, defenders demoted to level 2.
- Multi-card plays: single / pair / tractor / throw, with shape detection and follow-suit enforcement for combos. Cross-suit pairs rejected. Tractors allow A+trumpRank, trumpRank+SJ, SJ+BJ adjacency. Beaten throws cost the throwing team 30 pts.
- Trump calling: `game:callTrump` with strengths 1 (single rank card), 2 (pair), 3 (joker pair); higher overrides lower, ties go to first caller. Joker pairs must be same-type and set `trumpSuit = null`. `game:passTrump` finalizes early once all 4 pass.

### Server
- `constants.js`, `Deck.js`, `Card.js`, `GameState.js`, `gameHandlers.js`, `roomHandlers.js` all updated for the above. Legacy `game:playCard` / `game:declareTrump` still work as wrappers.
- Disconnect no longer breaks the room; reconnection by name + room code supported.
- Single-player dev mode with bots (`BotPlayer.js`) — bots call trump, pass, and play legal singles/combos.
- Jest suite: 36 tests over `Card` and `GameState`.

### Client
- Two-row hand layout (trump row on top), multi-select, "Play N cards", responsive card sizing and overlap.
- Animated dealing (`DEALING` phase, card-by-card drip at 120ms), kitty draw animation, directional card-play slide-in, 2.5s trick display delay with winner glow.
- Trump banner showing suit/rank/strength and the declaring cards; captured point pile with progress bar vs. threshold; card-based level indicator; ATK/DEF role badges.
- Opponent face-down hand stacks that shrink as cards are played.
- Web Audio sound effects with a localStorage-persisted mute toggle.
- Mobile/portrait layout at 768px and 480px breakpoints; fits 1080p at 100% zoom.
- Fixed: cards disappearing / dealing animation breaking / trump cards not re-sorting — all one root cause, `game:trumpCalled` replacing the whole client gameState mid-deal; now uses `UPDATE_GAME_STATE`.
- Fixed: kitty discard UI hardcoded 4, `ScoringModal` hardcoded `>= 100`, jokers not grouped with trump when sorting, dev-mode banner overlapping the trump banner.
- Fixed: trump pair selection — auto-submit prevented selecting a second card; now uses toggle + explicit submit button.
- Fixed: hand/play button overlapping macOS dock — `flex:1` layout with `env(safe-area-inset-bottom)` padding.
- Fixed: play button still cut off — grid row `minmax(0, 1fr)` for sides, prompt `min-height: 0`.
- Kitty rotation and attack persistence across rounds — `kittyPickerSeat` tracks rotation, `callTrump()` only sets trump suit after round 1.
