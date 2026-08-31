import React, { useMemo, useRef, useState, useEffect } from 'react';
import Card from '../Card/Card';
import HandSettings from '../HandSettings/HandSettings';
import { useHandPrefs } from '../HandSettings/handPrefs';
import './Hand.css';

const RANK_ORDER = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14,'SJ':15,'BJ':16 };

// Trump-row groups, left to right. The gutters in the trump row sit on these
// boundaries; `TRUMP_RANK_TOP` ranks the in-suit trump-rank card (e.g. S2 when
// trump is S/2) above the ace, at the top of the trump-suit group.
const GROUP_TRUMP_SUIT = 0;
const GROUP_OFF_RANK   = 1;
const GROUP_JOKER      = 2;
const TRUMP_RANK_TOP   = 100;

function isJokerCard(card) {
  return Boolean(card.isJoker || card.suit === 'JOKER');
}

function isCardTrump(card, trumpSuit, trumpRank) {
  return isJokerCard(card) || card.suit === trumpSuit || card.rank === trumpRank;
}

function trumpGroup(card, trumpSuit, trumpRank) {
  if (isJokerCard(card)) return GROUP_JOKER;
  if (card.suit === trumpSuit) return GROUP_TRUMP_SUIT;
  if (card.rank === trumpRank) return GROUP_OFF_RANK;
  return GROUP_TRUMP_SUIT;
}

/** Rank position within a card's own group; the group itself is ordered separately. */
function trumpSortKey(card, trumpSuit, trumpRank, suitPos) {
  const group = trumpGroup(card, trumpSuit, trumpRank);
  if (group === GROUP_JOKER) {
    return card.isBigJoker || card.rank === 'BJ' ? 1 : 0;
  }
  if (group === GROUP_OFF_RANK) {
    // All the same rank, so suit is the only meaningful ordering.
    return suitPos(card.suit);
  }
  if (card.rank === trumpRank) return TRUMP_RANK_TOP;
  return RANK_ORDER[card.rank] ?? 0;
}

// Card widths mirror Card.css. `sliver` is the exposed strip that still shows
// the top-left corner index (rank + suit) legibly at that size — it grew with
// the corner index, since in a fan the corner is all you get to read.
// `gutter` is the extra advance inserted where the suit group changes.
const SIZES = [
  { name: 'lg', width: 84, sliver: 27, gutter: 16 },
  { name: 'md', width: 62, sliver: 23, gutter: 13 },
  { name: 'sm', width: 42, sliver: 19, gutter: 10 },
];

// Card.css shrinks every card under 480px. The arithmetic has to shrink with
// it: solving the fan against desktop widths on a phone puts the cards at a
// different pitch than the one that was solved for.
const NARROW_SIZES = [
  { name: 'lg', width: 66, sliver: 22, gutter: 13 },
  { name: 'md', width: 50, sliver: 19, gutter: 11 },
  { name: 'sm', width: 36, sliver: 16, gutter: 9 },
];
const NARROW_QUERY = '(max-width: 480px)';

const DEFAULT_HAND_WIDTH = 900;

// Worst case is the pre-trump hand: four suits in the non-trump row, so three
// group boundaries. The trump row tops out at two (suit | off-suit rank |
// jokers). Sizing against the fixed maximum keeps the card size stable for the
// whole round instead of jumping as suits get exhausted.
const MAX_GUTTERS = 3;

// The trump row spends a little width on its vertical "Trump" label.
const LABEL_RESERVE = 18;

// Hard floor on the per-card advance. `sliver` is what we *want* to expose;
// this is what we settle for when even the smallest card at its sliver does not
// fit. Squeezing the fan keeps all 25 cards on screen, which beats letting the
// row run off the edge where the overflow is clipped away entirely.
const MIN_ADVANCE = 8;

/** Largest card size whose fanned row — gutters included — still fits the width. */
function pickSize(sizes, count, width) {
  if (count <= 1) return sizes[0];
  for (const size of sizes) {
    if ((count - 1) * size.sliver + size.width + MAX_GUTTERS * size.gutter <= width) return size;
  }
  return sizes[sizes.length - 1];
}

/** Tracks the one Card.css breakpoint that changes card dimensions. */
function useNarrowCards() {
  const query = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(NARROW_QUERY)
      : null;

  const [narrow, setNarrow] = useState(() => Boolean(query()?.matches));

  useEffect(() => {
    const mq = query();
    if (!mq) return undefined;
    const onChange = e => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return narrow;
}

/**
 * Hand renders the current player's cards in two rows:
 *   Top row:    Trump cards (trump suit, then off-suit trump rank, then jokers)
 *   Bottom row: Non-trump cards grouped by suit
 * Both rows are gapped wherever the group changes, so a suit can be counted
 * without reading every rank.
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
  capacity = 25,
  playableIds = null,
}) {
  const newIdSet = new Set(newCardIds);
  // Which cards can legally begin a play, straight from the server. Null means
  // "no restriction known", so nothing is dimmed.
  const playableSet = playableIds ? new Set(playableIds) : null;
  const [prefs, updatePrefs] = useHandPrefs();
  const narrow = useNarrowCards();

  // Fan width depends on the real container, not a guessed constant. Measured
  // on the row column, which excludes the settings gutter beside it.
  const rowsRef = useRef(null);
  const [availWidth, setAvailWidth] = useState(DEFAULT_HAND_WIDTH);
  useEffect(() => {
    const el = rowsRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setAvailWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { suitOrder, trumpEnd, rankDirection } = prefs;
  const suitOrderKey = suitOrder.join('');

  const { row, trumpCount, trumpFirst } = useMemo(() => {
    const suitPos = suit => {
      const i = suitOrder.indexOf(suit);
      return i === -1 ? 99 : i;
    };
    const dir = rankDirection === 'desc' ? -1 : 1;

    const trump = [];
    const nonTrump = [];
    cards.forEach(card => {
      (isCardTrump(card, trumpSuit, trumpRank) ? trump : nonTrump).push(card);
    });

    // Group order is fixed; the rank direction flips ordering *inside* a group.
    trump.sort((a, b) => {
      const groupDiff = trumpGroup(a, trumpSuit, trumpRank) - trumpGroup(b, trumpSuit, trumpRank);
      if (groupDiff !== 0) return groupDiff;
      const ka = trumpSortKey(a, trumpSuit, trumpRank, suitPos);
      const kb = trumpSortKey(b, trumpSuit, trumpRank, suitPos);
      // Off-suit trump-rank cards are ordered by the chosen suit order, which
      // the rank direction has no business reversing.
      const scale = trumpGroup(a, trumpSuit, trumpRank) === GROUP_OFF_RANK ? 1 : dir;
      return scale * (ka - kb);
    });

    nonTrump.sort((a, b) => {
      const suitDiff = suitPos(a.suit) - suitPos(b.suit);
      if (suitDiff !== 0) return suitDiff;
      return dir * ((RANK_ORDER[a.rank] ?? 0) - (RANK_ORDER[b.rank] ?? 0));
    });

    // Tag the first card of each group — that is where the gutter goes.
    const withGutters = (list, groupOf) => list.map((card, i) => ({
      card,
      gutter: i > 0 && groupOf(card) !== groupOf(list[i - 1]),
    }));

    const trumpEntries = withGutters(trump, c => trumpGroup(c, trumpSuit, trumpRank));
    const otherEntries = withGutters(nonTrump, c => c.suit);

    // One row, not two. A 25-card fan needs far less width than is available,
    // so the second row bought nothing horizontally while costing ~118px of
    // height — exactly what the trick area needed to render cards at a
    // readable size instead of half the size of the cards in your own hand.
    // The trump group keeps its separation as a wider "major" gutter.
    const [first, second] = trumpEnd === 'left'
      ? [trumpEntries, otherEntries]
      : [otherEntries, trumpEntries];

    const row = [...first, ...second].map((entry, i) => ({
      ...entry,
      major: i === first.length && first.length > 0 && second.length > 0,
    }));

    return { row, trumpCount: trump.length, trumpFirst: trumpEnd === 'left' };
  }, [cards, trumpSuit, trumpRank, suitOrderKey, rankDirection]);

  // A fanned hand only needs each card's top-left corner showing — rank and
  // suit — the way you hold real cards. That means a card costs its `sliver`
  // of width, not its full width, so a full hand can use *larger* cards than
  // it could laid out edge to edge.
  const layoutCount = Math.max(row.length, capacity);
  const size        = pickSize(narrow ? NARROW_SIZES : SIZES, layoutCount, availWidth);
  const cardSize    = size.name;

  // Advance = how far each card sits from the previous one. Gutters are paid
  // for out of the same width budget before the advance is solved, so adding
  // them tightens the fan rather than overflowing the row. Spread to fill when
  // there is room, tighten when there is not, and never gap (advance is capped
  // at the full card width).
  const calcOverlap = (count, gutters, reserve = 0) => {
    if (count <= 1) return 0;
    const budget  = availWidth - reserve - gutters * size.gutter;
    const fill    = (budget - size.width) / (count - 1);
    const advance = Math.min(size.width, Math.max(MIN_ADVANCE, fill));
    return size.width - advance;
  };

  // A major gutter costs two ordinary ones; count it twice in the budget.
  const gutterCount = row.filter(e => e.gutter && !e.major).length
                    + row.filter(e => e.major).length * 2;
  const overlap = calcOverlap(row.length, gutterCount, LABEL_RESERVE);

  const showPlayButton = selectionMode === 'play' && selectedCards.length > 0;

  function renderRow(rowEntries, overlap, rowIdx) {
    const style = { '--overlap': `${overlap}px`, '--gutter': `${size.gutter}px` };
    return (
      <div className="hand__cards" style={style}>
        {rowEntries.map(({ card, gutter, major }, idx) => {
          const isSelected    = selectedCards.includes(card.id);
          const isHighlighted = card.points > 0;
          const isTrumpCard   = isCardTrump(card, trumpSuit, trumpRank);
          const isDrawing     = newIdSet.has(card.id);
          const isUnplayable  = !!playableSet && !playableSet.has(card.id);

          const slotClasses = [
            'hand__card-slot',
            gutter       ? 'hand__card-slot--gutter'     : '',
            major        ? 'hand__card-slot--major'      : '',
            isUnplayable ? 'hand__card-slot--unplayable' : '',
            isDrawing ? 'hand__card-slot--drawing'  : '',
          ].filter(Boolean).join(' ');

          return (
            <div
              key={card.id}
              className={slotClasses}
              style={isDrawing ? { animationDelay: `${(rowIdx * 20 + idx) * 60}ms` } : undefined}
            >
              <Card
                card={card}
                size={cardSize}
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
      <div className={`hand__main hand__main--${trumpEnd}`} ref={rowsRef}>
        {row.length > 0 && (
          <div className={`hand__row hand__row--single${trumpFirst ? ' hand__row--trump-first' : ''}`}>
            {trumpCount > 0 && (
              <span
                className={`hand__row-label${trumpSuit ? '' : ' hand__row-label--pending'}`}
                title={trumpSuit
                  ? 'Trump: the trump suit, off-suit trump-rank cards, and jokers'
                  : 'No trump suit called yet — only trump-rank cards and jokers are trump so far. A suit joins the trump group once someone declares.'}
              >
                {trumpSuit ? 'Trump' : 'Trump so far'}
              </span>
            )}
            {renderRow(row, overlap, 0)}
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

      <HandSettings prefs={prefs} onChange={updatePrefs} />
    </div>
  );
}
