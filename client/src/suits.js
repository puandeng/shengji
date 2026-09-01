/**
 * Suit display for the UI. Never render a bare suit code (`S`, `H`, `D`, `C`)
 * to a player — those are wire/log identifiers, not names. Use a symbol in
 * compact spots (chips, badges, inline references) and the full word in prose.
 *
 * The log notation in `server/game/GameLogger.js` deliberately keeps the
 * letters: it is read with a monospace font by people and tools, where `S5`
 * beats `♠5` for grepping and alignment.
 */
export const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAMES   = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };

/** Compact form for chips and inline references: ♣ */
export function suitSymbol(suit) {
    if (!suit) return 'NT';           // joker-pair call — no trump suit
    return SUIT_SYMBOLS[suit] || '';
}

/** Prose form: Clubs */
export function suitName(suit) {
    if (!suit) return 'No trump';
    return SUIT_NAMES[suit] || '';
}

/** Symbol plus word, for headline spots: ♣ Clubs */
export function suitLabel(suit) {
    if (!suit) return 'No trump';
    return `${suitSymbol(suit)} ${suitName(suit)}`;
}
