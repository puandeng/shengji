import React, { useMemo } from 'react';
import Card from '../Card/Card';
import './Hand.css';

const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3, JOKER: 4 };
const RANK_ORDER = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14,'SJ':15,'BJ':16 };

function isCardTrump(card, trumpSuit, trumpRank) {
  return card.isJoker || card.suit === trumpSuit || card.rank === trumpRank;
}

/**
 * Hand renders the current player's cards.
 * Props:
 *   cards           — Card[]
 *   selectedCards   — string[] of selected card IDs
 *   onCardClick     — (card) => void
 *   isMyTurn        — bool
 *   trumpSuit       — string | null
 *   trumpRank       — string | null
 *   selectionMode   — 'kitty' | 'play' | null
 *   maxSelection    — number (for kitty discard)
 *   onPlaySelected  — () => void  (called when Play button is clicked in 'play' mode)
 */
export default function Hand({
  cards = [],
  selectedCards = [],
  onCardClick,
  isMyTurn,
  trumpSuit,
  trumpRank,
  selectionMode,
  maxSelection,
  onPlaySelected,
}) {
  const sorted = useMemo(() => {
    return [...cards].sort((a, b) => {
      const aTrump = isCardTrump(a, trumpSuit, trumpRank) ? 1 : 0;
      const bTrump = isCardTrump(b, trumpSuit, trumpRank) ? 1 : 0;
      if (aTrump !== bTrump) return aTrump - bTrump;
      // Within trump group, jokers sort to the end (highest)
      if (aTrump && bTrump) {
        if (a.isJoker && !b.isJoker) return 1;
        if (!a.isJoker && b.isJoker) return -1;
        if (a.isJoker && b.isJoker) return a.isBigJoker ? 1 : -1;
      }
      const suitDiff = (SUIT_ORDER[a.suit] ?? 99) - (SUIT_ORDER[b.suit] ?? 99);
      if (suitDiff !== 0) return suitDiff;
      return (RANK_ORDER[a.rank] ?? 0) - (RANK_ORDER[b.rank] ?? 0);
    });
  }, [cards, trumpSuit, trumpRank]);

  const overlap = Math.max(8, Math.min(32, Math.floor(600 / Math.max(sorted.length, 1))));

  const showPlayButton = selectionMode === 'play' && selectedCards.length > 0;

  return (
    <div className="hand">
      <div className="hand__cards" style={{ '--overlap': `${overlap}px` }}>
        {sorted.map((card) => {
          const isSelected    = selectedCards.includes(card.id);
          const isHighlighted = card.points > 0;
          const isTrumpCard   = isCardTrump(card, trumpSuit, trumpRank);

          return (
            <Card
              key={card.id}
              card={card}
              size="md"
              selected={isSelected}
              onClick={onCardClick ? () => onCardClick(card) : undefined}
              disabled={!isMyTurn && !selectionMode}
              highlight={isHighlighted}
              isTrump={isTrumpCard}
            />
          );
        })}
      </div>

      {showPlayButton && (
        <div className="hand__play-btn-row">
          <button className="btn-primary" onClick={onPlaySelected}>
            Play {selectedCards.length} card{selectedCards.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {sorted.length === 0 && (
        <p className="hand__empty">No cards in hand</p>
      )}
    </div>
  );
}
