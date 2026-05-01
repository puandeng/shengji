import React, { useMemo } from 'react';
import Card from '../Card/Card';
import './Hand.css';

const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3, JOKER: 4 };
const RANK_ORDER = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14,'SJ':15,'BJ':16 };

function isCardTrump(card, trumpSuit, trumpRank) {
  return card.isJoker || card.suit === trumpSuit || card.rank === trumpRank;
}

/**
 * Sort key for trump cards:
 *   - Regular trump-suit cards: sorted by rank (lowest first)
 *   - Off-suit trump-rank cards: after regular trump, grouped by suit
 *   - Jokers: rightmost (small then big)
 */
function trumpSortKey(card, trumpSuit, trumpRank) {
  if (card.isBigJoker) return 9000;
  if (card.isSmallJoker) return 8999;
  // In-suit trump-rank (e.g., S2 when trump is S/2)
  if (card.suit === trumpSuit && card.rank === trumpRank) return 5000 + (SUIT_ORDER[card.suit] ?? 0);
  // Off-suit trump-rank cards — group right of regular trump
  if (card.rank === trumpRank) return 6000 + (SUIT_ORDER[card.suit] ?? 0);
  // Regular trump-suit card
  return (RANK_ORDER[card.rank] ?? 0);
}

/**
 * Hand renders the current player's cards in two rows:
 *   Top row:    Trump cards (trump suit, then off-suit trump rank, then jokers)
 *   Bottom row: Non-trump cards grouped by suit
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
  newCardIds = [],
}) {
  const newIdSet = new Set(newCardIds);

  const { trumpCards, nonTrumpCards } = useMemo(() => {
    const trump = [];
    const nonTrump = [];

    cards.forEach(card => {
      if (isCardTrump(card, trumpSuit, trumpRank)) {
        trump.push(card);
      } else {
        nonTrump.push(card);
      }
    });

    // Sort trump row: regular trump by rank → off-suit trump-rank by suit → jokers
    trump.sort((a, b) => trumpSortKey(a, trumpSuit, trumpRank) - trumpSortKey(b, trumpSuit, trumpRank));

    // Sort non-trump row: by suit, then by rank within suit
    nonTrump.sort((a, b) => {
      const suitDiff = (SUIT_ORDER[a.suit] ?? 99) - (SUIT_ORDER[b.suit] ?? 99);
      if (suitDiff !== 0) return suitDiff;
      return (RANK_ORDER[a.rank] ?? 0) - (RANK_ORDER[b.rank] ?? 0);
    });

    return { trumpCards: trump, nonTrumpCards: nonTrump };
  }, [cards, trumpSuit, trumpRank]);

  const overlapTrump = Math.max(8, Math.min(32, Math.floor(600 / Math.max(trumpCards.length, 1))));
  const overlapNon   = Math.max(8, Math.min(32, Math.floor(600 / Math.max(nonTrumpCards.length, 1))));

  const showPlayButton = selectionMode === 'play' && selectedCards.length > 0;

  function renderRow(rowCards, overlap, rowIdx) {
    return (
      <div className="hand__cards" style={{ '--overlap': `${overlap}px` }}>
        {rowCards.map((card, idx) => {
          const isSelected    = selectedCards.includes(card.id);
          const isHighlighted = card.points > 0;
          const isTrumpCard   = isCardTrump(card, trumpSuit, trumpRank);
          const isDrawing     = newIdSet.has(card.id);

          return (
            <div
              key={card.id}
              className={isDrawing ? 'hand__card-slot hand__card-slot--drawing' : 'hand__card-slot'}
              style={isDrawing ? { animationDelay: `${(rowIdx * 20 + idx) * 60}ms` } : undefined}
            >
              <Card
                card={card}
                size="md"
                selected={isSelected}
                onClick={onCardClick ? () => onCardClick(card) : undefined}
                disabled={!isMyTurn && !selectionMode}
                highlight={isHighlighted}
                isTrump={isTrumpCard}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="hand">
      {trumpCards.length > 0 && (
        <div className="hand__row hand__row--trump">
          <span className="hand__row-label">Trump</span>
          {renderRow(trumpCards, overlapTrump, 0)}
        </div>
      )}
      {nonTrumpCards.length > 0 && (
        <div className="hand__row hand__row--non-trump">
          {renderRow(nonTrumpCards, overlapNon, 1)}
        </div>
      )}

      {showPlayButton && (
        <div className="hand__play-btn-row">
          <button className="btn-primary" onClick={onPlaySelected}>
            Play {selectedCards.length} card{selectedCards.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {cards.length === 0 && (
        <p className="hand__empty">No cards in hand</p>
      )}
    </div>
  );
}
