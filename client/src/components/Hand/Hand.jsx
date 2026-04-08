import React, { useMemo } from 'react';
import Card from '../Card/Card';
import './Hand.css';

const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 };
const RANK_ORDER = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };

/**
 * Hand renders the current player's cards, sorted by suit then rank.
 * Props:
 *   cards         — Card[]
 *   selectedCards — string[] of selected card IDs (for kitty discard)
 *   onCardClick   — (card) => void
 *   isMyTurn      — bool
 *   trumpSuit     — string | null
 *   selectionMode — bool (kitty discard mode)
 */
export default function Hand({ cards = [], selectedCards = [], onCardClick, isMyTurn, trumpSuit, selectionMode }) {

  const sorted = useMemo(() => {
    return [...cards].sort((a, b) => {
      // Trump cards go to the right
      const aTrump = trumpSuit && a.suit === trumpSuit ? 1 : 0;
      const bTrump = trumpSuit && b.suit === trumpSuit ? 1 : 0;
      if (aTrump !== bTrump) return aTrump - bTrump;
      const suitDiff = (SUIT_ORDER[a.suit] ?? 99) - (SUIT_ORDER[b.suit] ?? 99);
      if (suitDiff !== 0) return suitDiff;
      return (RANK_ORDER[a.rank] ?? 0) - (RANK_ORDER[b.rank] ?? 0);
    });
  }, [cards, trumpSuit]);

  const overlap = Math.max(8, Math.min(32, Math.floor(600 / Math.max(sorted.length, 1))));

  return (
    <div className="hand">
      <div className="hand__cards" style={{ '--overlap': `${overlap}px` }}>
        {sorted.map((card) => {
          const isSelected   = selectedCards.includes(card.id);
          const isHighlighted = card.points > 0;
          const isTrump      = trumpSuit && card.suit === trumpSuit;

          return (
            <Card
              key={card.id}
              card={card}
              size="md"
              selected={isSelected}
              onClick={onCardClick ? () => onCardClick(card) : undefined}
              disabled={!isMyTurn && !selectionMode}
              highlight={isHighlighted}
            />
          );
        })}
      </div>
      {sorted.length === 0 && (
        <p className="hand__empty">No cards in hand</p>
      )}
    </div>
  );
}
