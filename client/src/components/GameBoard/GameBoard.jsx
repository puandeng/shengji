import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import Card from '../Card/Card';
import Hand from '../Hand/Hand';
import TrickArea from '../TrickArea/TrickArea';
import PlayerInfo from '../PlayerInfo/PlayerInfo';
import TrumpBanner from '../TrumpBanner/TrumpBanner';
import './GameBoard.css';

/**
 * GameBoard lays out the 4-player table:
 *
 *        [Opponent — seat across from me]
 *  [Left]        [TRICK AREA]         [Right]
 *               [MY HAND]
 *
 * Seat layout (me = seat 0 for illustration):
 *   - Opposite: seat 2
 *   - Left:     seat 3
 *   - Right:    seat 1
 *
 * The layout rotates based on which seat the local player occupies.
 */
export default function GameBoard() {
  const { gameState, myPlayer, declareTrump, discardKitty, playCard, error } = useGame();
  const [selectedCards, setSelectedCards] = useState([]);

  if (!gameState || !myPlayer) return null;

  const { phase, players, currentSeat, trumpSuit, myHand, currentTrick, handCounts, attackingTeam } = gameState;

  const mySeat      = myPlayer.seatIndex;
  const oppositeSeat = (mySeat + 2) % 4;
  const leftSeat     = (mySeat + 3) % 4;
  const rightSeat    = (mySeat + 1) % 4;

  const getPlayer = (seat) => players.find(p => p.seatIndex === seat);

  const isMyTurn = currentSeat === mySeat && phase === 'PLAYING';

  // ── Trump selection ─────────────────────────────────────────────────────
  function handleDeclareTrump(card) {
    declareTrump(card.id).catch(() => {});
  }

  // ── Kitty discard ────────────────────────────────────────────────────────
  function toggleCardSelect(card) {
    setSelectedCards(prev =>
      prev.includes(card.id)
        ? prev.filter(id => id !== card.id)
        : prev.length < 4 ? [...prev, card.id] : prev
    );
  }

  function handleDiscardKitty() {
    if (selectedCards.length !== 4) return;
    discardKitty(selectedCards).then(() => setSelectedCards([])).catch(() => {});
  }

  // ── Play card ────────────────────────────────────────────────────────────
  function handlePlayCard(card) {
    if (!isMyTurn) return;
    playCard(card.id).catch(() => {});
  }

  const isKittyPhase    = phase === 'KITTY';
  const isTrumpPhase    = phase === 'TRUMP_SELECTION';
  const isKittyDeclarer = isKittyPhase && gameState.trumpDeclarer === myPlayer.socketId;

  return (
    <div className="gameboard">
      {/* Trump indicator */}
      <TrumpBanner trumpSuit={trumpSuit} attackingTeam={attackingTeam} players={players} />

      {/* Score bar */}
      <div className="gameboard__scores">
        <ScoreChip label="Team 1" score={gameState.scores?.[0]} rounds={gameState.roundScores?.[0]} teamIdx={0} />
        <span className="gameboard__round">Round {gameState.roundNumber || 1}</span>
        <ScoreChip label="Team 2" score={gameState.scores?.[1]} rounds={gameState.roundScores?.[1]} teamIdx={1} />
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

        {/* Centre: current trick */}
        <TrickArea
          trick={currentTrick}
          players={players}
          mySeat={mySeat}
          oppositeSeat={oppositeSeat}
          leftSeat={leftSeat}
          rightSeat={rightSeat}
        />

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
        {isTrumpPhase && (
          <p className="prompt-text">🃏 Click a card to declare it as trump suit — or wait for auto-select</p>
        )}
        {isKittyPhase && isKittyDeclarer && (
          <div className="kitty-actions">
            <p className="prompt-text">Select 4 cards to discard to the kitty ({selectedCards.length}/4 selected)</p>
            <button className="btn-primary" onClick={handleDiscardKitty} disabled={selectedCards.length !== 4}>
              Discard Selected
            </button>
          </div>
        )}
        {isKittyPhase && !isKittyDeclarer && (
          <p className="prompt-text">⏳ Waiting for trump declarer to discard to kitty…</p>
        )}
        {phase === 'PLAYING' && isMyTurn && (
          <p className="prompt-text">🎯 Your turn — play a card!</p>
        )}
        {phase === 'PLAYING' && !isMyTurn && (
          <p className="prompt-text">Waiting for {getPlayer(currentSeat)?.name ?? '…'}…</p>
        )}
      </div>

      {/* My hand */}
      <Hand
        cards={myHand || []}
        selectedCards={selectedCards}
        onCardClick={
          isTrumpPhase ? handleDeclareTrump :
          isKittyDeclarer ? toggleCardSelect :
          phase === 'PLAYING' ? handlePlayCard :
          undefined
        }
        isMyTurn={isMyTurn || isTrumpPhase || isKittyDeclarer}
        trumpSuit={trumpSuit}
        selectionMode={isKittyDeclarer}
      />
    </div>
  );
}

function ScoreChip({ label, score = 0, rounds = 0, teamIdx }) {
  const colors = ['var(--color-team0)', 'var(--color-team1)'];
  return (
    <div className="score-chip" style={{ borderColor: colors[teamIdx] }}>
      <span className="score-chip__label">{label}</span>
      <span className="score-chip__pts" style={{ color: colors[teamIdx] }}>{score}pts</span>
      <span className="score-chip__rounds">{'★'.repeat(rounds)}{'☆'.repeat(Math.max(0, 3 - rounds))}</span>
    </div>
  );
}
