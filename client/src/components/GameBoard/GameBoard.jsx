import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import Card from '../Card/Card';
import Hand from '../Hand/Hand';
import TrickArea from '../TrickArea/TrickArea';
import PlayerInfo from '../PlayerInfo/PlayerInfo';
import TrumpBanner from '../TrumpBanner/TrumpBanner';
import { isMuted, setMuted } from '../../sounds';
import './GameBoard.css';

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };

export default function GameBoard() {
  const { gameState, myPlayer, declareTrump, callTrump, passTrump, discardKitty, playCards, error, newCardIds, completedTrick, trickWinner } = useGame();
  const [selectedCards, setSelectedCards] = useState([]);
  const [hasPassed, setHasPassed] = useState(false);
  const [muted, setMutedState] = useState(isMuted());

  if (!gameState || !myPlayer) return null;

  const {
    phase, players, currentSeat, trumpSuit, trumpRank, trumpCallStrength,
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

  const getPlayer = (seat) => players.find(p => p.seatIndex === seat);

  const isMyTurn        = currentSeat === mySeat && phase === 'PLAYING';
  const isKittyPhase    = phase === 'KITTY';
  const isTrumpPhase    = phase === 'TRUMP_SELECTION' || isDealing;
  const isKittyDeclarer = isKittyPhase && gameState.trumpDeclarer === myPlayer.socketId;
  const showTrickDisplay = !!completedTrick;

  // ── Trump calling ─────────────────────────────────────────────────────────
  function handleCallTrump(card) {
    if (!isTrumpPhase) return;
    const alreadySelected = selectedCards.includes(card.id);
    if (alreadySelected) {
      // Deselect
      setSelectedCards(prev => prev.filter(id => id !== card.id));
    } else if (selectedCards.length < 2) {
      const newSel = [...selectedCards, card.id];
      // Auto-submit on first valid selection (single or joker pair)
      const isJoker = card.isJoker || card.suit === 'JOKER';
      if (newSel.length === 1 && !isJoker) {
        // Single non-joker call — submit immediately
        callTrump(newSel).then(() => setSelectedCards([])).catch(() => {});
      } else if (newSel.length === 2) {
        // Pair — submit
        callTrump(newSel).then(() => setSelectedCards([])).catch(() => {});
      } else {
        setSelectedCards(newSel);
      }
    }
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
  function togglePlaySelect(card) {
    if (!isMyTurn) return;
    setSelectedCards(prev =>
      prev.includes(card.id)
        ? prev.filter(id => id !== card.id)
        : [...prev, card.id]
    );
  }

  function handlePlaySelected() {
    if (selectedCards.length === 0) return;
    playCards(selectedCards).then(() => setSelectedCards([])).catch(() => {});
  }

  // Determine click handler and selection mode for the Hand
  let handClickHandler, handSelectionMode, handMaxSel;

  if (isTrumpPhase && !isDealing) {
    handClickHandler  = handleCallTrump;
    handSelectionMode = null;
  } else if (isDealing) {
    handClickHandler  = handleCallTrump;
    handSelectionMode = null;
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
        <ScoreChip
          label="Team 1"
          level={gameState.teamLevels?.[0] ?? '2'}
          isAttacking={attackingTeam === 0}
          teamIdx={0}
        />
        <span className="gameboard__round">Round {gameState.roundNumber || 1}</span>
        <ScoreChip
          label="Team 2"
          level={gameState.teamLevels?.[1] ?? '2'}
          isAttacking={attackingTeam === 1}
          teamIdx={1}
        />
      </div>

      {/* Opposite player */}
      <div className="gameboard__opposite">
        <PlayerInfo
          player={getPlayer(oppositeSeat)}
          cardCount={handCounts?.[getPlayer(oppositeSeat)?.socketId] ?? 0}
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
            cardCount={handCounts?.[getPlayer(leftSeat)?.socketId] ?? 0}
            isActive={currentSeat === leftSeat}
            trumpSuit={trumpSuit}
            attackingTeam={attackingTeam}
            vertical
          />
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
        </div>

        <div className="gameboard__right">
          <PlayerInfo
            player={getPlayer(rightSeat)}
            cardCount={handCounts?.[getPlayer(rightSeat)?.socketId] ?? 0}
            isActive={currentSeat === rightSeat}
            trumpSuit={trumpSuit}
            attackingTeam={attackingTeam}
            vertical
          />
        </div>
      </div>

      {/* Action prompt */}
      <div className="gameboard__prompt">
        {error && <p className="error-text">{error}</p>}
        {isDealing && !hasPassed && (
          <div className="trump-actions">
            <p className="prompt-text">
              Cards are being dealt — click a <strong>{trumpRank}</strong> to call trump
            </p>
            <button
              className="btn-secondary"
              onClick={() => { passTrump().then(() => setHasPassed(true)).catch(() => {}); }}
            >
              Pass
            </button>
          </div>
        )}
        {isDealing && hasPassed && (
          <p className="prompt-text">Cards being dealt… you passed on trump</p>
        )}
        {isTrumpPhase && !isDealing && !hasPassed && (
          <div className="trump-actions">
            <p className="prompt-text">
              {trumpSuit
                ? <>{SUIT_SYMBOLS[trumpSuit]} {trumpSuit} called — click a stronger combo to override, or pass</>
                : <>Click a <strong>{trumpRank}</strong> to call trump, or a pair for a stronger call</>
              }
            </p>
            <button
              className="btn-secondary"
              onClick={() => { passTrump().then(() => setHasPassed(true)).catch(() => {}); }}
            >
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
        {phase === 'PLAYING' && !showTrickDisplay && isMyTurn && selectedCards.length === 0 && (
          <p className="prompt-text">Your turn — select card(s) and press Play</p>
        )}
        {phase === 'PLAYING' && !showTrickDisplay && isMyTurn && selectedCards.length > 0 && (
          <p className="prompt-text">{selectedCards.length} card{selectedCards.length !== 1 ? 's' : ''} selected</p>
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
      />
    </div>
  );
}

function ScoreChip({ label, level = '2', isAttacking, teamIdx }) {
  const colors = ['var(--color-team0)', 'var(--color-team1)'];
  return (
    <div className={`score-chip ${isAttacking ? 'score-chip--attacking' : 'score-chip--defending'}`} style={{ borderColor: colors[teamIdx] }}>
      <span className="score-chip__label">{label}</span>
      <span className="score-chip__level-display" style={{ color: colors[teamIdx] }}>Level {level}</span>
      <span className={`score-chip__role ${isAttacking ? 'score-chip__role--atk' : 'score-chip__role--def'}`}>
        {isAttacking ? 'Attacking' : 'Defending'}
      </span>
    </div>
  );
}
