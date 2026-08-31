import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import { suitLabel } from '../../suits';
import Card from '../Card/Card';
import Hand from '../Hand/Hand';
import TrickArea from '../TrickArea/TrickArea';
import PlayerInfo from '../PlayerInfo/PlayerInfo';
import TrumpBanner from '../TrumpBanner/TrumpBanner';
import ScoreLadder from '../ScoreLadder/ScoreLadder';
import ActionBar from '../ActionBar/ActionBar';
import usePlayPreview from './usePlayPreview';
import { isMuted, setMuted } from '../../sounds';
import './GameBoard.css';


export default function GameBoard() {
  const {
    gameState, myPlayer, declareTrump, callTrump, passTrump, discardKitty, playCards,
    previewPlay, error, newCardIds, completedTrick, trickWinner, lastTrick, dealPause,
  } = useGame();
  const [selectedCards, setSelectedCards] = useState([]);
  const [secondsLeft, setSecondsLeft]     = useState(0);
  const [hasPassed, setHasPassed] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [showLastTrick, setShowLastTrick] = useState(false);

  // Live server verdict on the selection. Enabled only while the selection could
  // actually be played, so idle phases make no round trips.
  const previewEnabled = gameState?.phase === 'PLAYING'
    && gameState?.currentSeat === myPlayer?.seatIndex
    && !completedTrick;
  const preview = usePlayPreview(selectedCards, previewPlay, previewEnabled);

  // A reopened trick must not sit over the table while the next one is played.
  useEffect(() => {
    if (completedTrick) setShowLastTrick(false);
  }, [completedTrick]);

  // The trick is drawn as large as its row can hold. Card sizes are fixed pixels,
  // so without measuring, a four-card trick overflows the row on a short window
  // and paints over the ladder below it. Measure the row itself, not the centre
  // column: the column is sized by its own content, which would be circular.
  const sidesRef = useRef(null);
  const [sidesHeight, setSidesHeight] = useState(0);
  useEffect(() => {
    const el = sidesRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setSidesHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // On a short window the row above eats the trick's space with a decorative
  // stack of face-down cards, while PlayerInfo already states the hand count.
  // Hysteresis matters here: dropping the stack gives the trick ~66px back, so
  // a single threshold would flip between the two states forever.
  const [hideOppBacks, setHideOppBacks] = useState(false);
  useEffect(() => {
    if (!sidesHeight) return;
    setHideOppBacks(prev => (prev ? sidesHeight < 220 : sidesHeight < 140));
  }, [sidesHeight]);

  if (!gameState || !myPlayer) return null;

  const {
    phase, players, currentSeat, trumpSuit, trumpRank, trumpCallStrength,
    trumpDeclareCards,
    myHand, currentTrick, handCounts, attackingTeam, attackerPointPile,
    scores, threshold, levelBands, pointsRemaining,
  } = gameState;

  const isDealing = phase === 'DEALING';

  // Clear selected cards and pass state when game phase changes
  useEffect(() => {
    setSelectedCards([]);
    setHasPassed(false);
  }, [phase]);

  const mySeat       = myPlayer.seatIndex;
  const oppositeSeat = (mySeat + 2) % 4;
  const leftSeat     = (mySeat + 3) % 4;
  const rightSeat    = (mySeat + 1) % 4;

  // Each pause window is a fresh decision — a pass only skips the window it was
  // made in, so the prompt has to come back when the next one opens.
  useEffect(() => {
    if (!dealPause) return;
    setHasPassed(false);
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((dealPause.deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [dealPause?.windowIndex]);

  const getPlayer = (seat) => players.find(p => p.seatIndex === seat);

  const isMyTurn        = currentSeat === mySeat && phase === 'PLAYING';
  const isKittyPhase    = phase === 'KITTY';
  const isTrumpPhase    = phase === 'TRUMP_SELECTION' || isDealing;
  const isKittyDeclarer = isKittyPhase && gameState.trumpDeclarer === myPlayer.socketId;
  const showTrickDisplay = !!completedTrick;
  // 0 when leading — the leader picks the shape and so the count. The server's
  // requiredCount says the same thing and wins when it is available.
  const leadCount = currentTrick?.[0]?.cards?.length || 0;

  // ── Trump calling ─────────────────────────────────────────────────────────
  // Selecting a card never submits on its own. Auto-submitting the first click
  // made a pair impossible to assemble: the single went to the server before a
  // second card could be picked, and the resulting strength-1 call then blocked
  // the strength-2 one it should have become.
  function handleCallTrump(card) {
    if (!isTrumpPhase) return;
    setSelectedCards(prev => {
      if (prev.includes(card.id)) return prev.filter(id => id !== card.id);
      if (prev.length >= 2) return prev;
      return [...prev, card.id];
    });
  }

  function handleSubmitTrumpCall() {
    if (selectedCards.length === 0) return;
    callTrump(selectedCards).then(() => setSelectedCards([])).catch(() => {});
  }

  function handlePassTrump() {
    setSelectedCards([]);
    passTrump().then(() => setHasPassed(true)).catch(() => {});
  }

  // ── Kitty discard ──────────────────────────────────────────────────────────
  function toggleKittySelect(card) {
    setSelectedCards(prev =>
      prev.includes(card.id)
        ? prev.filter(id => id !== card.id)
        : prev.length < 8 ? [...prev, card.id] : prev
    );
  }

  function handleDiscardKitty() {
    if (selectedCards.length !== 8) return;
    discardKitty(selectedCards).then(() => setSelectedCards([])).catch(() => {});
  }

  // ── Multi-card play ────────────────────────────────────────────────────────
  // When following, the lead fixes how many cards everyone plays — there is no
  // passing and no choosing a different count. Cap the selection at that number
  // rather than letting an unplayable selection be assembled and refused.
  function togglePlaySelect(card) {
    if (!isMyTurn) return;
    setSelectedCards(prev => {
      if (prev.includes(card.id)) return prev.filter(id => id !== card.id);
      if (leadCount && prev.length >= leadCount) return prev;
      return [...prev, card.id];
    });
  }

  function handlePlaySelected() {
    if (selectedCards.length === 0) return;
    playCards(selectedCards).then(() => setSelectedCards([])).catch(() => {});
  }

  // Determine click handler and selection mode for the Hand
  let handClickHandler, handSelectionMode, handMaxSel;

  if (isTrumpPhase && !isDealing) {
    handClickHandler  = handleCallTrump;
    handSelectionMode = 'trump';
  } else if (isDealing) {
    handClickHandler  = handleCallTrump;
    handSelectionMode = 'trump';
  } else if (isKittyDeclarer) {
    handClickHandler  = toggleKittySelect;
    handSelectionMode = 'kitty';
    handMaxSel        = 8;
  } else if (phase === 'PLAYING' && isMyTurn) {
    handClickHandler  = togglePlaySelect;
    // Deliberately not 'play': that mode makes Hand render its own Play button,
    // and the Play verb now lives in the fixed action bar. Cards stay clickable
    // because it is this player's turn.
    handSelectionMode = null;
  }

  // Point pile summary
  const pileTotal = (attackerPointPile || []).reduce((s, c) => s + (c.points || 0), 0);
  // The authoritative round score: captured cards plus the kitty capture and any
  // throw penalty. pileTotal is only the visible pile of cards.
  const attackerScore = scores?.[attackingTeam] ?? pileTotal;
  const thresh    = threshold ?? 80;
  const myRole    = attackingTeam == null
    ? null
    : (myPlayer.teamIndex === attackingTeam ? 'attackers' : 'defenders');

  // ── Action bar model ───────────────────────────────────────────────────────
  const selCount   = selectedCards.length;
  const required   = preview?.requiredCount ?? leadCount;
  const canReview  = (lastTrick?.cards?.length ?? 0) > 0;

  function playDisabledReason() {
    if (!isMyTurn) return `Not your turn — waiting for ${getPlayer(currentSeat)?.name ?? '…'}`;
    if (selCount === 0) return 'Select cards to play';
    if (required > 0 && selCount !== required) {
      return `The lead needs ${required} card${required !== 1 ? 's' : ''}`;
    }
    if (preview && preview.legal === false) return preview.reason || 'Not a legal play';
    return null;
  }

  function buildBar() {
    // ── Trump calling (during the deal and in the 30s window) ──
    if (isTrumpPhase) {
      const windowOpen  = !isDealing || !!dealPause;
      const blocked     = hasPassed
        ? 'You passed this window'
        : !windowOpen ? 'Wait for the next call window' : null;

      let status = 'Call trump';
      let statusTone = 'muted';
      let detail;

      if (isDealing && !dealPause) {
        status = 'Dealing…';
        detail = 'Next call window shortly';
      } else if (hasPassed) {
        status = 'Passed';
        detail = isDealing ? `Dealing resumes in ${secondsLeft}s` : 'Waiting for other players…';
      } else if (isDealing && dealPause) {
        status     = dealPause.youCanCall ? 'You can call' : 'Deal paused';
        statusTone = dealPause.youCanCall ? 'gold' : 'muted';
        detail     = dealPause.youCanCall
          ? (selCount === 1
              ? `Add a matching ${trumpRank} for a stronger pair call`
              : `Pick a ${trumpRank} to call trump`)
          : 'Nothing to call with yet';
      } else if (trumpSuit) {
        status = `${suitLabel(trumpSuit)} called`;
        detail = 'Click a stronger combo to override, or pass';
      } else {
        detail = `Click a ${trumpRank} to call, or a pair for a stronger call`;
      }

      return {
        status,
        statusTone,
        detail,
        actions: [
          {
            key: 'call',
            label: selCount === 2 ? 'Call (pair)' : selCount === 1 ? 'Call (1 card)' : 'Call trump',
            variant: 'primary',
            onClick: handleSubmitTrumpCall,
            disabled: !!blocked || selCount === 0,
            disabledReason: blocked || `Select a ${trumpRank} first`,
          },
          {
            key: 'pass',
            label: 'Pass',
            onClick: handlePassTrump,
            disabled: !!blocked,
            disabledReason: blocked,
          },
        ],
        aside: isDealing && dealPause
          ? (
            <span className={`deal-window-timer${dealPause.youCanCall && !hasPassed ? ' deal-window-timer--urgent' : ''}`}>
              {secondsLeft}s
            </span>
          )
          : null,
      };
    }

    // ── Kitty discard ──
    if (isKittyPhase) {
      const blocked = isKittyDeclarer ? null : 'Only the trump declarer discards';
      return {
        status: isKittyDeclarer
          ? `${selCount} of 8 selected`
          : `Waiting for ${players.find(p => p.socketId === gameState.trumpDeclarer)?.name ?? 'the declarer'}…`,
        detail: isKittyDeclarer
          ? (selCount === 8 ? 'Ready to bury' : 'Pick the 8 cards to bury in the kitty')
          : 'They are burying 8 cards in the kitty',
        detailTone: isKittyDeclarer && selCount === 8 ? 'good' : 'muted',
        actions: [
          {
            key: 'discard',
            label: 'Discard 8',
            variant: 'primary',
            onClick: handleDiscardKitty,
            disabled: !!blocked || selCount !== 8,
            disabledReason: blocked || (selCount < 8
              ? `Select ${8 - selCount} more`
              : 'Select exactly 8'),
          },
          {
            key: 'clear',
            label: 'Clear',
            onClick: () => setSelectedCards([]),
            disabled: !!blocked || selCount === 0,
            disabledReason: blocked || 'Nothing selected',
          },
        ],
      };
    }

    // ── Playing: one verb, Play. There is no passing on your turn — the lead
    //    fixes how many cards everyone plays. ──
    if (phase === 'PLAYING') {
      const reason = playDisabledReason();

      let status;
      let statusTone = 'muted';
      let detail;
      let detailTone = 'muted';

      if (!isMyTurn) {
        status = showTrickDisplay
          ? 'Trick complete'
          : `Waiting for ${getPlayer(currentSeat)?.name ?? '…'}…`;
        statusTone = showTrickDisplay ? 'gold' : 'muted';
        detail = required > 0 && !showTrickDisplay
          ? `${required} card${required !== 1 ? 's' : ''} to follow`
          : null;
      } else if (required > 0) {
        status     = `${selCount} of ${required} selected`;
        statusTone = selCount === required ? 'good' : 'muted';
      } else {
        status = selCount > 0
          ? `${selCount} card${selCount !== 1 ? 's' : ''} selected — you lead`
          : 'Your lead';
      }

      if (isMyTurn) {
        if (preview) {
          const parts = [preview.shapeLabel, preview.legal ? null : preview.reason]
            .filter(Boolean)
            .filter((p, i, all) => all.indexOf(p) === i);
          detail     = parts.join(' — ');
          detailTone = preview.legal ? 'good' : 'bad';
        } else if (reason) {
          detail     = reason;
          detailTone = selCount > 0 ? 'bad' : 'muted';
        }
      }

      return {
        status,
        statusTone,
        detail,
        detailTone,
        actions: [
          {
            key: 'play',
            label: 'Play',
            variant: 'primary',
            onClick: handlePlaySelected,
            disabled: !!reason,
            disabledReason: reason,
          },
          {
            key: 'clear',
            label: 'Clear',
            onClick: () => setSelectedCards([]),
            disabled: selCount === 0,
            disabledReason: 'Nothing selected',
          },
        ],
        aside: (
          <button
            className={`action-bar__ghost${showLastTrick ? ' action-bar__ghost--on' : ''}`}
            onClick={() => setShowLastTrick(v => !v)}
            disabled={!canReview}
            title={canReview ? 'Reopen the previous trick' : 'No trick played yet'}
          >
            {showLastTrick ? 'Hide last trick' : 'Last trick'}
          </button>
        ),
      };
    }

    return { status: 'Round complete', statusTone: 'gold', actions: [] };
  }

  const bar = buildBar();
  const reviewing = showLastTrick && canReview;

  // Worst case is all four seats holding a card, i.e. three stacked card rows.
  // Sized against that so the trick does not resize as cards land.
  const trickScale  = sidesHeight >= 362 ? 'lg'
    : sidesHeight >= 268 ? 'md'
    : sidesHeight >= 190 ? 'sm'
    : 'xs';                     // xs lays the four plays out in a single strip
  // The review panel spends a little height on its badge and border.
  const reviewScale = trickScale === 'lg' ? 'md' : trickScale === 'md' ? 'sm' : 'xs';

  function toggleMute() {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
  }

  return (
    <div className="gameboard">
      <button className="gameboard__mute-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
        {muted ? '🔇' : '🔊'}
      </button>

      <TrumpBanner
        trumpSuit={trumpSuit}
        trumpRank={trumpRank}
        trumpCallStrength={trumpCallStrength}
        attackingTeam={attackingTeam}
        players={players}
        phase={phase}
      />

      {/* Score bar */}
      <div className="gameboard__scores">
        <LevelCard
          label="Team 1"
          level={gameState.teamLevels?.[0] ?? '2'}
          isAttacking={attackingTeam === 0}
          teamIdx={0}
        />
        <span className="gameboard__round">Round {gameState.roundNumber || 1}</span>
        <LevelCard
          label="Team 2"
          level={gameState.teamLevels?.[1] ?? '2'}
          isAttacking={attackingTeam === 1}
          teamIdx={1}
        />
      </div>

      {/* Trump declaration cards */}
      {(trumpDeclareCards || []).length > 0 && (isTrumpPhase) && (
        <div className="gameboard__trump-declare">
          <span className="trump-declare__label">
            {/* The revealer, not the declarer. From round 2 the declarer is
                pre-assigned to the kitty picker, so captioning their name over
                somebody else's cards credited the call to the wrong player. */}
            {(players.find(p => p.seatIndex === gameState.trumpCallerSeat)
              ?? players.find(p => p.socketId === gameState.trumpDeclarer))?.name ?? 'Player'} called:
          </span>
          <div className="trump-declare__cards">
            {trumpDeclareCards.map((card, i) => (
              <Card key={card.id || i} card={card} size="md" />
            ))}
          </div>
        </div>
      )}

      {/* Opposite player */}
      <div className="gameboard__opposite">
        <PlayerInfo
          player={getPlayer(oppositeSeat)}
          isActive={currentSeat === oppositeSeat}
          trumpSuit={trumpSuit}
          attackingTeam={attackingTeam}
        />
        {!hideOppBacks && (
          <div className="gameboard__opp-cards">
            {Array.from({ length: Math.min(handCounts?.[getPlayer(oppositeSeat)?.socketId] ?? 0, 7) }).map((_, i) => (
              <Card key={i} card={{ id: `back-${i}`, suit: 'S', rank: '?' }} faceDown size="sm" />
            ))}
          </div>
        )}
      </div>

      {/* Left & right players */}
      <div className="gameboard__sides" ref={sidesRef}>
        <div className="gameboard__left">
          <PlayerInfo
            player={getPlayer(leftSeat)}
            isActive={currentSeat === leftSeat}
            trumpSuit={trumpSuit}
            attackingTeam={attackingTeam}
            vertical
          />
          <div className="gameboard__side-cards">
            {Array.from({ length: Math.min(handCounts?.[getPlayer(leftSeat)?.socketId] ?? 0, 10) }).map((_, i) => (
              <Card key={i} card={{ id: `left-${i}`, suit: 'S', rank: '?' }} faceDown size="sm" />
            ))}
          </div>
        </div>

        {/* Centre: the trick */}
        <div className="gameboard__centre-col">
          {/* Dealing deck animation */}
          {isDealing && (
            <div className="gameboard__dealing">
              <div className="dealing__deck">
                <Card card={{ id: 'deck', suit: 'S', rank: '?' }} faceDown size="md" />
              </div>
              <div className="dealing__progress">
                Dealing cards… {gameState.dealIndex || 0} / {gameState.dealTotal || 100}
              </div>
            </div>
          )}

          {/* Reopened previous trick — available at any time, not a forced pause */}
          {reviewing && (
            <div className="gameboard__review">
              <span className="gameboard__review-badge">Last trick</span>
              <TrickArea
                trick={lastTrick.cards}
                players={players}
                mySeat={mySeat}
                oppositeSeat={oppositeSeat}
                leftSeat={leftSeat}
                rightSeat={rightSeat}
                winnerSocketId={lastTrick.winner}
                scale={reviewScale}
              />
            </div>
          )}

          {/* Show completed trick during the (now short) display delay */}
          {!reviewing && showTrickDisplay && (
            <TrickArea
              trick={completedTrick}
              players={players}
              mySeat={mySeat}
              oppositeSeat={oppositeSeat}
              leftSeat={leftSeat}
              rightSeat={rightSeat}
              winnerSocketId={trickWinner}
              scale={trickScale}
              frozen
            />
          )}

          {/* Show current trick when not frozen */}
          {!reviewing && !showTrickDisplay && !isDealing && (
            <TrickArea
              trick={currentTrick}
              players={players}
              mySeat={mySeat}
              oppositeSeat={oppositeSeat}
              leftSeat={leftSeat}
              rightSeat={rightSeat}
              scale={trickScale}
            />
          )}

        </div>

        <div className="gameboard__right">
          <PlayerInfo
            player={getPlayer(rightSeat)}
            isActive={currentSeat === rightSeat}
            trumpSuit={trumpSuit}
            attackingTeam={attackingTeam}
            vertical
          />
          <div className="gameboard__side-cards">
            {Array.from({ length: Math.min(handCounts?.[getPlayer(rightSeat)?.socketId] ?? 0, 10) }).map((_, i) => (
              <Card key={i} card={{ id: `right-${i}`, suit: 'S', rank: '?' }} faceDown size="sm" />
            ))}
          </div>
        </div>
      </div>

        {/* Where the round stands: every level band, not a bar to one threshold */}
        {(phase === 'PLAYING' || showTrickDisplay) && (
          <div className="gameboard__point-pile">
            {/* score is the authoritative round score, not pileTotal: it also
                carries the kitty capture and the throw penalty, so the pile
                alone could sit a whole band away from how the round resolves. */}
            <ScoreLadder
              score={attackerScore}
              bands={levelBands}
              threshold={thresh}
              pointsRemaining={pointsRemaining}
              myRole={myRole}
            />
            {(attackerPointPile || []).length > 0 && (
              <div className="point-pile__cards">
                {(attackerPointPile || []).map((card, i) => (
                  <Card key={card.id || i} card={card} size="sm" />
                ))}
              </div>
            )}
          </div>
        )}

      {/* Fixed action bar — the phase's verbs always live here */}
      <div className="gameboard__prompt">
        {error && <p className="error-text">{error}</p>}
        <ActionBar {...bar} />
      </div>

      {/* Team role badge */}
      {phase !== 'TRUMP_SELECTION' && attackingTeam != null && (
        <div className={`gameboard__team-role ${myPlayer.teamIndex === attackingTeam ? 'gameboard__team-role--attacking' : 'gameboard__team-role--defending'}`}>
          {myPlayer.teamIndex === attackingTeam ? 'ATTACKING' : 'DEFENDING'}
        </div>
      )}

      {/* My hand */}
      <Hand
        cards={myHand || []}
        selectedCards={selectedCards}
        onCardClick={handClickHandler}
        isMyTurn={isMyTurn || isTrumpPhase || isKittyDeclarer}
        trumpSuit={trumpSuit}
        trumpRank={trumpRank}
        selectionMode={handSelectionMode}
        maxSelection={handMaxSel}
        newCardIds={newCardIds}
        capacity={Math.round((gameState.dealTotal || 100) / (players.length || 4))}
      />
    </div>
  );
}

function LevelCard({ label, level = '2', isAttacking, teamIdx }) {
  const suit = teamIdx === 0 ? 'S' : 'H';
  const card = { id: `level-${teamIdx}`, suit, rank: level, isJoker: false };
  return (
    <div className={`level-card ${isAttacking ? 'level-card--attacking' : 'level-card--defending'}`}>
      <span className="level-card__label">{label}</span>
      <Card card={card} size="sm" />
      <span className={`level-card__role ${isAttacking ? 'level-card__role--atk' : 'level-card__role--def'}`}>
        {isAttacking ? 'ATK' : 'DEF'}
      </span>
    </div>
  );
}
