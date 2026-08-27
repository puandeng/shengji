import React from 'react';
import Card from '../Card/Card';
import './TrickArea.css';

/**
 * TrickArea shows the cards played in the current trick.
 * Each player position shows all cards they played (supporting multi-card plays).
 */
export default function TrickArea({ trick = [], players = [], mySeat = 0, oppositeSeat = 2, leftSeat = 3, rightSeat = 1, winnerSocketId = null, frozen }) {
  const cardsBySocket = {};
  trick.forEach(({ socketId, cards, card }) => {
    cardsBySocket[socketId] = cards || (card ? [card] : []);
  });

  const getCardsForSeat = (seat) => {
    const player = players.find(p => p.seatIndex === seat);
    return player ? (cardsBySocket[player.socketId] || []) : [];
  };

  const isWinner = (seat) => {
    if (!winnerSocketId) return false;
    const player = players.find(p => p.seatIndex === seat);
    return player && player.socketId === winnerSocketId;
  };

  return (
    <div className={`trick-area ${frozen ? 'trick-area--frozen' : ''}`}>
      <div className="trick-area__slot trick-area__top">
        <TrickSlot cards={getCardsForSeat(oppositeSeat)} isWinner={isWinner(oppositeSeat)} />
      </div>

      <div className="trick-area__middle">
        <div className="trick-area__slot trick-area__left">
          <TrickSlot cards={getCardsForSeat(leftSeat)} isWinner={isWinner(leftSeat)} />
        </div>
        <div className="trick-area__centre" />
        <div className="trick-area__slot trick-area__right">
          <TrickSlot cards={getCardsForSeat(rightSeat)} isWinner={isWinner(rightSeat)} />
        </div>
      </div>

      <div className="trick-area__slot trick-area__bottom">
        <TrickSlot cards={getCardsForSeat(mySeat)} isWinner={isWinner(mySeat)} />
      </div>
    </div>
  );
}

function TrickSlot({ cards, isWinner }) {
  if (!cards || cards.length === 0) {
    return <div className="trick-area__placeholder" />;
  }
  const size = cards.length > 2 ? 'sm' : 'md';
  return (
    <div className={`trick-area__combo ${isWinner ? 'trick-area__combo--winner' : ''}`}>
      {cards.map((card, i) => (
        <Card key={card?.id ?? i} card={card} size={size} />
      ))}
      {isWinner && <div className="trick-area__winner-badge">Winner</div>}
    </div>
  );
}
