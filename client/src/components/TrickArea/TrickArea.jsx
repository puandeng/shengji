import React from 'react';
import Card from '../Card/Card';
import './TrickArea.css';

/**
 * TrickArea shows the 4 cards currently played in the trick,
 * positioned relative to the current player's perspective.
 * Props: mySeat, oppositeSeat, leftSeat, rightSeat are the actual seat indices.
 */
export default function TrickArea({ trick = [], players = [], mySeat = 0, oppositeSeat = 2, leftSeat = 3, rightSeat = 1 }) {
  // Map socketId → card
  const cardBySocket = {};
  trick.forEach(({ socketId, card }) => { cardBySocket[socketId] = card; });

  const getCardForSeat = (seat) => {
    const player = players.find(p => p.seatIndex === seat);
    return player ? cardBySocket[player.socketId] : null;
  };

  return (
    <div className="trick-area">
      {/* Top: player opposite */}
      <div className="trick-area__slot trick-area__top">
        <TrickCard card={getCardForSeat(oppositeSeat)} />
      </div>

      {/* Middle row: left player, centre, right player */}
      <div className="trick-area__middle">
        <div className="trick-area__slot trick-area__left">
          <TrickCard card={getCardForSeat(leftSeat)} />
        </div>
        <div className="trick-area__centre" />
        <div className="trick-area__slot trick-area__right">
          <TrickCard card={getCardForSeat(rightSeat)} />
        </div>
      </div>

      {/* Bottom: me */}
      <div className="trick-area__slot trick-area__bottom">
        <TrickCard card={getCardForSeat(mySeat)} />
      </div>
    </div>
  );
}

function TrickCard({ card }) {
  if (!card) {
    return <div className="trick-area__placeholder" />;
  }
  return <Card card={card} size="md" />;
}
