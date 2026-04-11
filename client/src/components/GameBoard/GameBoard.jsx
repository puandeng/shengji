import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import Card from '../Card/Card';
import Hand from '../Hand/Hand';
import TrickArea from '../TrickArea/TrickArea';
import PlayerInfo from '../PlayerInfo/PlayerInfo';
import TrumpBanner from '../TrumpBanner/TrumpBanner';
import './GameBoard.css';

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };

export default function GameBoard() {
  const { gameState, myPlayer, declareTrump, callTrump, discardKitty, playCards, error } = useGame();
  const [selectedCards, setSelectedCards] = useState([]);

  if (!gameState || !myPlayer) return null;

  const {
    phase, players, currentSeat, trumpSuit, trumpRank, trumpCallStrength,
    myHand, currentTrick, handCounts, attackingTeam, attackerPointPile,
    scores, threshold,
  } = gameState;

  const mySeat       = myPlayer.seatIndex;
  const oppositeSeat = (mySeat + 2) % 4;
  const leftSeat     = (mySeat + 3) % 4;
  const rightSeat    = (mySeat + 1) % 4;

  const getPlayer = (seat) => players.find(p => p.seatIndex === seat);

  const isMyTurn        = currentSeat === mySeat && phase === 'PLAYING';
  const isKittyPhase    = phase === 'KITTY';
  const isTrumpPhase    = phase === 'TRUMP_SELECTION';
  const isKittyDeclarer = isKittyPhase && gameState.trumpDeclarer === myPlayer.socketId;

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

  if (isTrumpPhase) {
    handClickHandler  = handleCallTrump;
    handSelectionMode = null; // Trump selection uses its own visual cue
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

  return (
    <div className="gameboard">
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
          score={scores?.[0]}
          level={gameState.teamLevels?.[0]}
          teamIdx={0}
        />
        <span className="gameboard__round">Round {gameState.roundNumber || 1}</span>
        <ScoreChip
          label="Team 2"
          score={scores?.[1]}
          level={gameState.teamLevels?.[1]}
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
            vertical
          />
        </div>

        {/* Centre: trick area + point pile */}
        <div className="gameboard__centre-col">
          <TrickArea
            trick={currentTrick}
            players={players}
            mySeat={mySeat}
            oppositeSeat={oppositeSeat}
            leftSeat={leftSeat}
            rightSeat={rightSeat}
          />

          {/* Attacker point pile */}
          {phase === 'PLAYING' && (
            <div className="gameboard__point-pile">
              <div className="point-pile__header">
                <span>Attacker pts: </span>
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
            </div>
          )}
        </div>

        <div className="gameboard__right">
          <PlayerInfo
            player={getPlayer(rightSeat)}
            cardCount={handCounts?.[getPlayer(rightSeat)?.socketId] ?? 0}
            isActive={currentSeat === rightSeat}
            trumpSuit={trumpSuit}
            vertical
          />
        </div>
      </div>

      {/* Action prompt */}
      <div className="gameboard__prompt">
        {error && <p className="error-text">{error}</p>}
        {isTrumpPhase && !trumpSuit && (
          <p className="prompt-text">
            Click a <strong>{trumpRank}</strong> to call trump, or a pair for a stronger call
          </p>
        )}
        {isTrumpPhase && trumpSuit && (
          <p className="prompt-text">
            {SUIT_SYMBOLS[trumpSuit]} {trumpSuit} called — click a stronger combo to override, or wait
          </p>
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
        {phase === 'PLAYING' && isMyTurn && selectedCards.length === 0 && (
          <p className="prompt-text">Your turn — select card(s) and press Play</p>
        )}
        {phase === 'PLAYING' && isMyTurn && selectedCards.length > 0 && (
          <p className="prompt-text">{selectedCards.length} card{selectedCards.length !== 1 ? 's' : ''} selected</p>
        )}
        {phase === 'PLAYING' && !isMyTurn && (
          <p className="prompt-text">Waiting for {getPlayer(currentSeat)?.name ?? '…'}…</p>
        )}
      </div>

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
      />
    </div>
  );
}

function ScoreChip({ label, score = 0, level, teamIdx }) {
  const colors = ['var(--color-team0)', 'var(--color-team1)'];
  return (
    <div className="score-chip" style={{ borderColor: colors[teamIdx] }}>
      <span className="score-chip__label">{label}</span>
      <span className="score-chip__pts" style={{ color: colors[teamIdx] }}>{score}pts</span>
      {level && <span className="score-chip__level">Lv {level}</span>}
    </div>
  );
}
