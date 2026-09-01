# PLAN

Tracks outstanding work for the Sheng Ji implementation. Update status as you pick items up; add new todos at the bottom. See `CLAUDE.md` for collaboration rules.

Status legend: `[ ]` todo · `[~]` in progress (add name) · `[x]` done

---

## Open

### Kitty bury
- [x] **The bury mechanism already existed** — `giveKittyToDeclarer()` takes the declarer 25 → 33, `discardToKitty()` takes 8 cards of their choosing back to 25, gated to the declarer and to exactly 8. Three tests now pin it, including that the buried cards are the ones chosen and that they leave the hand.
- [x] **Humans practically never became declarer, so nobody ever saw it.** Bots called 700ms into a 5s window (`BOT_PLAY_DELAY_MS * (i+1)`), and since an equal-strength call never overrides, any bot holding a trump-rank card declared before a human could finish reading their hand. Bots now deliberate `BOT_CALL_REACTION_MS` (2500ms) before calling, leaving the human first refusal; a bot can still override with a genuinely stronger call.


### Refactor
- [x] **Swap attacking/defending team semantics.** Done. The trump caller is the declarer and *defends*; `attackingTeam` is now the other team — the collectors chasing the threshold. The scoring logic already read `attackingTeam` as "the team that collects and needs the threshold", so this was mostly re-pointing who gets assigned to it, plus: the round handover (the bank passes to the attackers when they make the threshold, rotates to the partner when the declarers hold), the trump rank now taken from the declaring team's level, and the kitty reverting to a traditional capture. 2 tests pin the convention.
  - Swap which team accumulates points (non-caller should accumulate, not caller)
  - Fix the threshold check (non-caller's score vs threshold, not caller's)
  - Level advancement — defenders hold: attackers scored 0 → defenders +3, attackers < threshold−40 → +2, else +1
  - Level advancement — attackers break through: at threshold → +0 (role swap only), ≥ threshold+40 → +1, ≥ threshold+80 → +2, ≥ threshold+120 → +3
  - Round transitions: defenders hold → advance and keep defending. Attackers break through → become new defenders
  - Rename `attackingTeam` / `defendingTeam` / `attackingWon` / `attackerPointPile` etc. across server + client
  - Update UI labels (ATK/DEF badges, scoring modal, notifications)

### Bugs
- [x] **Trump auto-select can deadlock the round.** Fixed — `autoSelectTrump()` now names seat 0 as declarer in the kitty branch instead of `null`, so `giveKittyToDeclarer()` succeeds and the round proceeds. Test added.
- [x] **Home page "How to play" copy is stale.** Fixed — now describes level progression 2→A and margin-based level gains.
- [x] **Bots spam `game:passTrump` during dealing.** Fixed by the slow-motion deal — bots act once per call window instead of on every dealt card. Previously a 4-bot round logged 14 `trump_pass` events across 4 seats, one of them from the seat already holding the winning call.
- [x] **Can't select more than one card for trump declaration.** Fixed: `handleCallTrump()` is now a pure toggle (max 2 cards) and a `Call trump (1 card / pair)` button submits, matching the kitty-discard and play flows. The old auto-submit sent the single to the server before a second card could be picked, and the resulting strength-1 call then blocked the strength-2 one it should have become.
- [x] **Hand and play button overlap the macOS dock.** Fixed — `.game-root` is a flex column on `100dvh` with the board as `flex:1`, plus `env(safe-area-inset-bottom)` padding. Measured: the hand went from 17px clipped to 30px of clearance.

### Done this pass — the design review, built
- [x] **The kitty paid the team that buried it.** The declarer picks the 8 buried cards *and* collects points here, so the kitty bonus was free profit — and the condition read `!attackerWonTrick`, so it paid out for **losing** the last trick. Verified before the fix: bury 40 points, throw the last trick, gain 80 — clearing the threshold unaided. Buried points are now a liability (win the last trick and lose nothing; lose it and the bury is captured at the multiplier, floored at 0). 4 tests. **Note:** `CLAUDE.md` previously described the traditional model here while the code did the opposite; the docs now describe the code, and the full swap remains the open item above.
All seven proposals from the "Reading the Table" review are now implemented.
- [x] **Selection feedback before commit.** New non-mutating `GameState.previewPlay()` + `game:previewPlay` (ack-only, never broadcast — it would leak a selection). The client shows the shape and legality live via a 150ms-debounced, sequence-guarded hook; a stale ack can never overwrite a fresh one. No rule logic on the client: `reason` is the verbatim validator error, and a test asserts `preview.reason === playCards().error`.
- [x] **Scoring ladder.** `levelBands()` is the single source of truth — `_finishRound()` derives its verdict from it, so display and scoring cannot drift. `ScoreLadder` renders six bands, the marker, out-of-reach bands, and distance in both directions. Also `pointsPlayed` / `pointsRemaining`.
- [x] **Fixed action bar.** Verbs always rendered, disabled with a visible reason. PLAYING has Play + Clear only — no pass on your turn. Readout is a target (`2 of 2 selected`).
- [x] **Hand sort preferences.** Suit order, trump end, rank direction; persisted to `localStorage` under `shengji-hand-prefs`, sanitised on load and update.
- [x] **Legibility.** Suit gutters folded into the fan width budget; corner index ~+50% with the centre pip dropped at small sizes.
- [x] **Last trick on demand.** Reopen the previous trick any time; forced freeze cut from 2500ms to 1100ms.
- [x] **Centre region reclaimed.** `.gameboard__sides` used `align-items: center`, so the centre column sized from its own content and could never be bounded — the trick row had 23px at a 720px window. Now `stretch`, with a measured scale for the trick cards.

### Done earlier this pass
- [x] **Play selection was uncapped.** `togglePlaySelect()` accepted any number of cards, so an unplayable selection could be assembled and was only refused after pressing Play. The lead fixes the count for everyone — there is no passing on your turn — so selection is now capped at the lead count and the prompt reads `N of M selected`.
- [x] **Hand never overlapped; cards shrank while dealing.** `.hand__card-slot` used `display: contents`, making the card the flex item, so `.card:first-child` matched every card and zeroed every margin. With overlap impossible, a full hand could only fit by shrinking. Slot is now a real box carrying the fan overlap; card size is fixed for the round from the known final hand size. Cards went 42px → 84px.
- [x] **Point pile rendered on top of the action prompt.** 32px of overlap measured at 900×800; the pile now has its own grid row.
- [x] **Raw suit codes shown to players.** The trump prompt read `♥ H called`. Added `client/src/suits.js`; log notation keeps letters deliberately.
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
- Level progression 2→A. Defenders hold (attackers below threshold) → defenders advance +1 to +3 and keep defending. Attackers break through (≥ threshold) → become new defenders, no level advance unless margin ≥ 40. Defender skip margins: attackers 0 → +3; < threshold−40 → +2; else +1. Attacker skip margins: ≥ threshold → +0 (role swap only); ≥ threshold+40 → +1; ≥ threshold+80 → +2; ≥ threshold+120 → +3. `MANDATORY_STOP_RANKS` (5, 10, K, A) can't be skipped on first visit; `visitedRanks` tracked per team.
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
