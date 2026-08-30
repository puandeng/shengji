import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { suitLabel } from '../../suits';
import Card from '../Card/Card';
import Hand from '../Hand/Hand';
import TrickArea from '../TrickArea/TrickArea';
import PlayerInfo from '../PlayerInfo/PlayerInfo';
import TrumpBanner from '../TrumpBanner/TrumpBanner';
import { isMuted, setMuted } from '../../sounds';
import './GameBoard.css';


export default function GameBoard() {
  const { gameState, myPlayer, declareTrump, callTrump, passTrump, discardKitty, playCards, error, newCardIds, completedTrick, trickWinner, dealPause } = useGame();
  const [selectedCards, setSelectedCards] = useState([]);
  const [secondsLeft, setSecondsLeft]     = useState(0);
  const [hasPassed, setHasPassed] = useState(false);
  const [muted, setMutedState] = useState(isMuted());

  if (!gameState || !myPlayer) return null;

  const {
    phase, players, currentSeat, trumpSuit, trumpRank, trumpCallStrength,
    trumpDeclareCards,
    myHand, currentTrick, handCounts, attackingTeam, attackerPointPile,
    scores, threshold,
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
  // 0 when leading — the leader picks the shape and so the count.
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
    handSelectionMode = 'play';
  }

  // Point pile summary
  const pileTotal = (attackerPointPile || []).reduce((s, c) => s + (c.points || 0), 0);
  const thresh    = threshold ?? 80;

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
            {players.find(p => p.socketId === gameState.trumpDeclarer)?.name ?? 'Player'} declared:
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
        <div className="gameboard__opp-cards">
          {Array.from({ length: Math.min(handCounts?.[getPlayer(oppositeSeat)?.socketId] ?? 0, 7) }).map((_, i) => (
            <Card key={i} card={{ id: `back-${i}`, suit: 'S', rank: '?' }} faceDown size="sm" />
          ))}
        </div>
      </div>

      {/* Left & right players */}
      <div className="gameboard__sides">
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

        {/* Centre: trick area + point pile */}
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

          {/* Show completed trick during display delay */}
          {showTrickDisplay && (
            <TrickArea
              trick={completedTrick}
              players={players}
              mySeat={mySeat}
              oppositeSeat={oppositeSeat}
              leftSeat={leftSeat}
              rightSeat={rightSeat}
              winnerSocketId={trickWinner}
              frozen
            />
          )}

          {/* Show current trick when not frozen */}
          {!showTrickDisplay && !isDealing && (
            <TrickArea
              trick={currentTrick}
              players={players}
              mySeat={mySeat}
              oppositeSeat={oppositeSeat}
              leftSeat={leftSeat}
              rightSeat={rightSeat}
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

        {/* Attacker point pile with captured cards */}
        {(phase === 'PLAYING' || showTrickDisplay) && (
          <div className="gameboard__point-pile">
            <div className="point-pile__header">
              <span>Captured pts: </span>
              <span className={`point-pile__total ${pileTotal >= thresh ? 'point-pile__total--won' : ''}`}>
                {pileTotal} / {thresh}
              </span>
            </div>
            <div className="point-pile__bar">
              <div
                className="point-pile__fill"
                style={{ width: `${Math.min(100, (pileTotal / thresh) * 100)}%` }}
              />
            </div>
            {(attackerPointPile || []).length > 0 && (
              <div className="point-pile__cards">
                {(attackerPointPile || []).map((card, i) => (
                  <Card key={card.id || i} card={card} size="sm" />
                ))}
              </div>
            )}
          </div>
        )}

      {/* Action prompt */}
      <div className="gameboard__prompt">
        {error && <p className="error-text">{error}</p>}
        {isDealing && dealPause && !hasPassed && (
          <div className="trump-actions trump-actions--paused">
            <span className={`deal-window-badge${dealPause.youCanCall ? ' deal-window-badge--can-call' : ''}`}>
              {dealPause.youCanCall ? 'You can call!' : `Call window ${dealPause.windowIndex}`}
            </span>
            <p className="prompt-text">
              {dealPause.youCanCall
                ? <>Deal paused — pick a <strong>{trumpRank}</strong> to call{selectedCards.length === 1 ? ', or a matching second card for a stronger pair call' : ''}</>
                : <>Deal paused — nothing to call with yet</>}
            </p>
            {selectedCards.length > 0 && (
              <button className="btn-primary" onClick={handleSubmitTrumpCall}>
                Call trump ({selectedCards.length === 2 ? 'pair' : '1 card'})
              </button>
            )}
            <button className="btn-secondary" onClick={handlePassTrump}>
              Pass
            </button>
            <span className="deal-window-timer">{secondsLeft}s</span>
          </div>
        )}
        {isDealing && dealPause && hasPassed && (
          <p className="prompt-text">Passed this window — dealing resumes in {secondsLeft}s</p>
        )}
        {isDealing && !dealPause && (
          <p className="prompt-text">Dealing… next call window shortly</p>
        )}
        {isTrumpPhase && !isDealing && !hasPassed && (
          <div className="trump-actions">
            <p className="prompt-text">
              {selectedCards.length > 0
                ? <>{selectedCards.length} card selected — click another for a pair, or call now</>
                : trumpSuit
                  ? <>{suitLabel(trumpSuit)} called — click a stronger combo to override, or pass</>
                  : <>Click a <strong>{trumpRank}</strong> to call trump, or a pair for a stronger call</>
              }
            </p>
            {selectedCards.length > 0 && (
              <button className="btn-primary" onClick={handleSubmitTrumpCall}>
                Call trump ({selectedCards.length === 2 ? 'pair' : '1 card'})
              </button>
            )}
            <button className="btn-secondary" onClick={handlePassTrump}>
              Pass
            </button>
          </div>
        )}
        {isTrumpPhase && !isDealing && hasPassed && (
          <p className="prompt-text">You passed — waiting for other players…</p>
        )}
        {showTrickDisplay && (
          <p className="prompt-text prompt-text--trick-display">Trick complete — reviewing cards…</p>
        )}
        {isKittyPhase && isKittyDeclarer && (
          <div className="kitty-actions">
            <p className="prompt-text">Select 8 cards to discard ({selectedCards.length}/8 selected)</p>
            <button className="btn-primary" onClick={handleDiscardKitty} disabled={selectedCards.length !== 8}>
              Discard Selected
            </button>
          </div>
        )}
        {isKittyPhase && !isKittyDeclarer && (
          <p className="prompt-text">Waiting for trump declarer to discard to kitty…</p>
        )}
        {phase === 'PLAYING' && !showTrickDisplay && isMyTurn && leadCount > 0 && selectedCards.length > 0 && (
          <p className="prompt-text">
            {selectedCards.length} of {leadCount} selected
          </p>
        )}
        {phase === 'PLAYING' && !showTrickDisplay && isMyTurn && selectedCards.length === 0 && (
          <p className="prompt-text">Your turn — select card(s) and press Play</p>
        )}
        {phase === 'PLAYING' && !showTrickDisplay && isMyTurn && leadCount === 0 && selectedCards.length > 0 && (
          <p className="prompt-text">{selectedCards.length} card{selectedCards.length !== 1 ? 's' : ''} selected — you are leading</p>
        )}
        {phase === 'PLAYING' && !showTrickDisplay && !isMyTurn && (
          <p className="prompt-text">Waiting for {getPlayer(currentSeat)?.name ?? '…'}…</p>
        )}
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
        onPlaySelected={phase === 'PLAYING' && isMyTurn ? handlePlaySelected : undefined}
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
