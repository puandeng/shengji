import React from 'react';
import Card from '../Card/Card';
import './TrickArea.css';

/**
 * TrickArea shows the cards played in the current trick.
 * Each player position shows all cards they played (supporting multi-card plays).
 */
export default function TrickArea({ trick = [], players = [], mySeat = 0, oppositeSeat = 2, leftSeat = 3, rightSeat = 1, winnerSocketId = null }) {
  // Map socketId → cards[] (multi-card support)
  const cardsBySocket = {};
  trick.forEach(({ socketId, cards, card }) => {
    // Support both new `cards` array and legacy `card` single
    cardsBySocket[socketId] = cards || (card ? [card] : []);
  });

  const getCardsForSeat = (seat) => {
    const player = players.find(p => p.seatIndex === seat);
    return player ? (cardsBySocket[player.socketId] || []) : [];
  };

  const isWinner = (seat) => {
    if (!winnerSocketId) return false;
    const player = players.find(p => p.seatIndex === seat);
    return player?.socketId === winnerSocketId;
  };

  return (
    <div className="trick-area">
      <div className={`trick-area__slot trick-area__top ${isWinner(oppositeSeat) ? 'trick-area__slot--winner' : ''}`}>
        <TrickSlot cards={getCardsForSeat(oppositeSeat)} />
        {isWinner(oppositeSeat) && <span className="trick-area__winner-badge">&#9733;</span>}
      </div>

      <div className="trick-area__middle">
        <div className={`trick-area__slot trick-area__left ${isWinner(leftSeat) ? 'trick-area__slot--winner' : ''}`}>
          <TrickSlot cards={getCardsForSeat(leftSeat)} />
          {isWinner(leftSeat) && <span className="trick-area__winner-badge">&#9733;</span>}
        </div>
        <div className="trick-area__centre" />
        <div className={`trick-area__slot trick-area__right ${isWinner(rightSeat) ? 'trick-area__slot--winner' : ''}`}>
          <TrickSlot cards={getCardsForSeat(rightSeat)} />
          {isWinner(rightSeat) && <span className="trick-area__winner-badge">&#9733;</span>}
        </div>
      </div>

      <div className={`trick-area__slot trick-area__bottom ${isWinner(mySeat) ? 'trick-area__slot--winner' : ''}`}>
        <TrickSlot cards={getCardsForSeat(mySeat)} />
        {isWinner(mySeat) && <span className="trick-area__winner-badge">&#9733;</span>}
      </div>
    </div>
  );
}

function TrickSlot({ cards }) {
  if (!cards || cards.length === 0) {
    return <div className="trick-area__placeholder" />;
  }
  const size = cards.length > 2 ? 'sm' : 'md';
  return (
    <div className="trick-area__combo">
      {cards.map((card, i) => (
        <Card key={card?.id ?? i} card={card} size={size} />
      ))}
    </div>
  );
}
