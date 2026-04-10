import React from 'react';
import Card from '../Card/Card';
import './TrickArea.css';

/**
 * TrickArea shows the cards played in the current trick.
 * Each player position shows all cards they played (supporting multi-card plays).
 */
export default function TrickArea({ trick = [], players = [], mySeat = 0, oppositeSeat = 2, leftSeat = 3, rightSeat = 1 }) {
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

  return (
    <div className="trick-area">
      <div className="trick-area__slot trick-area__top">
        <TrickSlot cards={getCardsForSeat(oppositeSeat)} />
      </div>

      <div className="trick-area__middle">
        <div className="trick-area__slot trick-area__left">
          <TrickSlot cards={getCardsForSeat(leftSeat)} />
        </div>
        <div className="trick-area__centre" />
        <div className="trick-area__slot trick-area__right">
          <TrickSlot cards={getCardsForSeat(rightSeat)} />
        </div>
      </div>

      <div className="trick-area__slot trick-area__bottom">
        <TrickSlot cards={getCardsForSeat(mySeat)} />
      </div>
    </div>
  );
}

function TrickSlot({ cards }) {
  if (!cards || cards.length === 0) {
    return <div className="trick-area__placeholder" />;
  }
  return (
    <div className="trick-area__combo">
      {cards.map((card, i) => (
        <Card key={card?.id ?? i} card={card} size="md" />
      ))}
    </div>
  );
}
