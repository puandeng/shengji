# PLAN

Tracks outstanding work for the Sheng Ji implementation. Update status as you pick items up; add new todos at the bottom. See `CLAUDE.md` for collaboration rules.

Status legend: `[ ]` todo · `[~]` in progress (add name) · `[x]` done

---

## Open

### Bugs
- [ ] **Can't select more than one card for trump declaration.** `GameBoard.handleCallTrump()` auto-submits a single non-joker card the moment it's clicked, so a trump-rank pair can never be assembled — only joker pairs wait for a second card. Needs an explicit "Call trump" confirm step, or a short debounce/second-click window before submitting a single.
- [ ] **Hand and play button overlap the macOS dock.** `GameBoard.css` and `Game.css` use `height: 100vh` with no bottom inset, so the hand row and play button sit under the dock. Use `100dvh` and add `env(safe-area-inset-bottom)` padding.

### Docs
- [x] **`CLAUDE.md` is stale vs. the implementation.** It still documents the pre-refactor rules and protocol. At minimum: win condition is level progression 2→A (not "first to 3 rounds"), kitty discard is 8 (not 4), kitty multiplier is 2× the winning play's card count (not flat ×2), and the socket protocol is missing `game:playCards`, `game:callTrump`, `game:passTrump`, `game:cardDealt`, `game:dealComplete`, plus the `DEALING` phase. Also missing from the file tree: `server/game/BotPlayer.js`, `server/game/__tests__/`, `client/src/sounds.js`.

---

## Completed

Condensed; full rationale for each item is in git history and the PRs that landed them.

### Rules engine
- Jokers added — 108-card deck (2 × 52 + 4 jokers), 25 per player, kitty 8.
- Level-based thresholds (`LEVEL_THRESHOLDS`: 80 for 2–K, 120 for A) replaced the hardcoded 100.
- Only the attacking team accumulates points; defenders deny only.
- Kitty multiplier = 2 × card count of the last winning play (single ×2, pair ×4, tractor of 3 pairs ×12).
- Trump ordering: regular trump < off-suit trump-rank < in-suit trump-rank < small joker < big joker. `Card.beats()` takes `trumpRank`.
- Level progression 2→A replaced "first to 3 rounds". Rank skipping by point differential (attackers 0 → defenders +3; < threshold−40 → defenders +2; ≥ threshold+40 → attackers +2; ≥ threshold+80 → attackers +3). `MANDATORY_STOP_RANKS` (5, 10, K, A) can't be skipped on first visit; `visitedRanks` tracked per team.
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
