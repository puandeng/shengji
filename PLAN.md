# PLAN

Tracks outstanding work for the Sheng Ji implementation. Update status as you pick items up; add new todos at the bottom. See `CLAUDE.md` for collaboration rules.

Status legend: `[ ]` todo · `[~]` in progress (add name) · `[x]` done

---

## Open

### From the three-lens UX audit — implemented
All findings from the review are addressed. Highlights, with the evidence that they were real:

- [x] **Mandatory stops were skippable.** `advanceLevel` returned "match won" before scanning, so Q+3 took the match past K and A. Now Q+3 stops at K, K+2 at A; a team already at A still wins.
- [x] **Jack demotion punished the wrong team** after the role swap — it keyed off `attackingTeam` and could only fire in rounds that were not J rounds.
- [x] **The level ladder was one step generous** at every attacker band versus the ladder documented here. Making the threshold now takes the bank and earns no level.
- [x] **Three combo rules**: side-suit tractors ignored the trump-rank gap; a scattered ruff beat a throw; followers could break pairs against a tractor lead.
- [x] **Round-2 trump calling**: an opponent could name the declarer's suit, and the board captioned the declarer's name over cards somebody else revealed.
- [x] **Bots played by array position.** They buried their own jokers and points every round, trumped their partner's winners, never led a pair, and called no-trump reflexively. All four fixed; verified a live bury of `S3 C6 S7 C8 C9 CJ SJ CQ` — no trump, no jokers, no points.
- [x] **The hand took two rows** and starved the trick. One row now; sides 255→379px, trick cards 42×60→62×88. The row-height ResizeObserver was also attached to a stale node, pinning the trick at its smallest size regardless.
- [x] **Type had no scale**: 22 chrome styles, 11 under 11px, largest label 13.6px. Now 5 sizes, none under 12px, score at 24px. `--color-text-muted` failed AA on felt (3.47:1) and was fixed.
- [x] **Legality was invisible.** Cards that cannot follow are dimmed, driven by a server-computed set; the mid-trick broadcasts now carry it per seat.
- [x] **The kitty was invisible at both ends** — no point total while burying, no reveal when it swung the round by 90.
- [x] **The action bar moved 254px** when a refusal wrapped. Pinned to a grid.
- [x] Point badge moved off the occluded corner; roles no longer shown before they exist; no-trump rounds no longer read "Waiting for trump declaration…" for 25 tricks; trick results are narrated; in-game help panel added; tap targets meet 24px (44px mobile).

### AI agent (planned)
The playing logic is to be learned rather than hand-written; `BotPlayer` is a
placeholder. Division of labour:

- **Logs are for reviewing games**, not for training. `logs/*.jsonl` records who
  acted (`isBot`), the actor's hand, the legal subset the rules allowed, and the
  action taken — enough to ask "why that card" of any decision after the fact.
- **The simulator is for learning the rules and strategy.** `server/game/GameState.js`
  is already a complete, deterministic, I/O-free engine, so self-play runs at
  process speed rather than being gated on animation delays and bot timers, and
  reaches positions no logged game ever will.

- [ ] **Headless self-play harness.** A seeded runner that plays N games in-process
  against `GameState` (no sockets, no delays) and emits transitions — state, legal
  action mask, action, reward. `GameState.playableCardIds()` already provides the
  mask; `_finishRound()` provides the reward via `levelBands()`.
- [ ] **Reproducibility.** `Deck` shuffles without a seed today, so a run cannot be
  replayed exactly. Thread a seed through `deal()` before generating training data.
- [ ] **Then swap `BotPlayer` for the learned policy** behind the same interface
  (`chooseLegalCards`, `chooseTrumpCall`, `chooseKittyDiscard`), so dev mode and
  disconnect auto-play pick it up unchanged.

**Prerequisite, and the reason ordering matters:** an agent trained against a wrong
engine learns the wrong game. Three combo rules were broken until this week (a
scattered ruff beat a throw, side-suit tractors ignored the trump-rank gap,
followers could break pairs against a tractor lead) and the level ladder could skip
mandatory stops. Rules correctness should be considered settled — and covered by
tests — before any training run is worth the compute.

### Dev scenarios — implemented
- [x] **`DEV_MODE` scenario menu.** Lobby panel and in-game bar that rebuild the
  room in a chosen situation: fresh deal, mid-game, or an endgame two cards from
  the finish, on either side, with either team's level dialled anywhere from 2 to
  A. Setup drives the real engine (deal → call → bury → `playCards` for every
  seat), so it cannot produce a position the rules disallow. `dev:scenario`,
  `server/game/DevScenario.js`, `client/src/components/DevMenu/`; covered by
  `server/game/__tests__/devScenario.test.js` over 15 shuffles per assertion.
- [x] **The round result never reached the scoring modal.** `TRICK_COMPLETE`
  spread `...state` *after* `roundResult`, so the previous value overwrote the
  new one and the modal fell back to its defaults — no kitty arithmetic, no level
  change, no Jack demotion. Found while building the endgame scenarios, which
  exist to look at exactly that modal.

### Playing-area pass — implemented
- [x] **The trick was half the size of your own hand.** Eight grid rows spent 373px
  of a 720px board on chrome and left the trick 182px, which pinned it to the
  smallest card size. The board is five rows now, the opponents sit around the
  felt, and the trick's box measures 449px — cards at 84×118, the same as the
  hand, on a drawn table surface.
- [x] **The scoring bar carried eight numbers at once.** It is a one-line strip —
  your role, score against target, a band bar, and what the current band pays —
  that opens the full ladder, the deltas, the points remaining and the captured
  cards on click.
- [x] **Every seat was badged DEF before anyone had called.** `PlayerInfo` read the
  deliberate `undefined` for "roles not settled" as "not attacking".
- [x] **A stray `}` in `GameBoard.css`** had been breaking the CSS minifier for
  weeks (`Unexpected "}"` on every build).

### Still open
- [x] **Any player can call trump, not just the defending team.** Already works correctly: in round 1 any player can call trump and become the declarer. In rounds 2+ only the declaring team can call, because the trump rank is their team's level — letting opponents pick the suit would be unfair. This is correct traditional Sheng Ji behavior.
- [x] **Bots should be available outside dev mode.** Done — the host can add/remove bots from the lobby via `+ Add Bot` / `- Remove Bot` buttons. Starting with fewer than 4 humans auto-fills remaining seats with bots. No `DEV_MODE` required. Bot players show a robot avatar and BOT badge in the lobby. Socket events: `room:addBot`, `room:removeBot`.
- [x] **Trick review has no seat attribution** — done. The panel is now a centred
  overlay showing the plays in play order with each player's name, `led` /
  `took it` / point tags, the trick total and the narration, instead of a
  scrollable sliver of four anonymous cards.
- [x] **Lobby polish** — team panels now use `align-items: stretch` so both sides always match height; the room code dropped the standalone `Courier New` font to match the rest of the app.
- [x] **Button styles have not been consolidated** — reviewed: three base variants (`btn-primary`, `btn-secondary`, `btn-danger`) with contextual size overrides per component. The overrides are intentional (action bar buttons are compact, lobby start is large) and scoped to their CSS modules.
- [ ] **Cards are not keyboard reachable.** They are `div`s with `onClick`; the accessibility tree contains no cards.
- [x] **Round 2+ has never been played to completion.** Done — integration test plays two full rounds end to end via the Room class: deal → trump call → kitty discard → all 25 tricks → scoring → `startNewRound()` → repeat. Verifies round number, phase transitions, kitty picker assignment, and hand sizes.



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
