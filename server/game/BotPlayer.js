/**
 * BotPlayer — server-side helpers for stub bot players in DEV_MODE.
 *
 * Bots have no real socket connections. They use fake IDs like "bot-0"
 * and auto-play legal moves with no strategy — just enough to exercise
 * the full game loop with a single human player.
 */

const BOT_ID_PREFIX = 'bot-';

function isBot(socketId) {
    return socketId && socketId.startsWith(BOT_ID_PREFIX);
}

function generateBotId(seatIndex) {
    return `${BOT_ID_PREFIX}${seatIndex}`;
}

function generateBotName(seatIndex) {
    return `Bot ${seatIndex + 1}`;
}

/**
 * Pick legal card(s) to play. Returns an array of card IDs.
 *
 * When leading: plays a single card.
 * When following: plays the same number of cards as the lead,
 * prioritizing lead-suit cards and matching shapes where possible.
 */
function chooseLegalCards(hand, currentTrick, trumpSuit, trumpRank) {
    if (hand.length === 0) return [];

    // Leading: play a single card
    if (currentTrick.length === 0) {
        return [hand[0].id];
    }

    const leadEntry = currentTrick[0];
    const leadCards = leadEntry.cards || [];
    const n = leadCards.length;
    const leadCard = leadCards[0] || leadEntry.card;
    if (!leadCard) return [hand[0].id];

    const leadEffSuit = leadCard.effectiveSuit
        ? leadCard.effectiveSuit(trumpSuit, trumpRank)
        : (leadCard.isTrump && leadCard.isTrump(trumpSuit, trumpRank) ? 'TRUMP' : leadCard.suit);

    // Separate hand into lead-suit cards and other cards
    const suitCards = hand.filter(c => c.effectiveSuit(trumpSuit, trumpRank) === leadEffSuit);
    const otherCards = hand.filter(c => c.effectiveSuit(trumpSuit, trumpRank) !== leadEffSuit);

    const selected = [];

    // Try to match shapes: if lead is a pair, play a pair from lead suit if possible
    if (leadEntry.shape === 'pair' && suitCards.length >= 2) {
        const pair = findPairInCards(suitCards);
        if (pair) return pair.map(c => c.id);
    }

    // For throws (single+pair, 3 cards): try to provide a pair + single from lead suit
    if (leadEntry.shape === 'throw' && suitCards.length >= 3) {
        const pair = findPairInCards(suitCards);
        if (pair) {
            const pairIds = new Set(pair.map(c => c.id));
            const single = suitCards.find(c => !pairIds.has(c.id));
            if (single) return [...pair.map(c => c.id), single.id];
        }
    }

    // For tractors: try to play pairs from lead suit, else fill with suit cards
    // (simplified — just play lead-suit cards first)

    // General: play as many lead-suit cards as possible, fill rest with anything
    const suitToUse = suitCards.slice(0, Math.min(n, suitCards.length));
    selected.push(...suitToUse);

    // Fill remaining with other cards
    const remaining = n - selected.length;
    if (remaining > 0) {
        selected.push(...otherCards.slice(0, remaining));
    }

    // Fallback: if we still don't have enough, just grab from hand
    if (selected.length < n) {
        const selectedIds = new Set(selected.map(c => c.id));
        for (const c of hand) {
            if (selected.length >= n) break;
            if (!selectedIds.has(c.id)) {
                selected.push(c);
                selectedIds.add(c.id);
            }
        }
    }

    return selected.slice(0, n).map(c => c.id);
}

/**
 * Find a pair (two cards with same suit+rank) in a list of cards.
 * Returns [card1, card2] or null.
 */
function findPairInCards(cards) {
    const seen = {};
    for (const c of cards) {
        const key = `${c.suit}_${c.rank}`;
        if (seen[key]) return [seen[key], c];
        seen[key] = c;
    }
    return null;
}

/**
 * Legacy single-card chooser — wraps chooseLegalCards for backward compat.
 */
function chooseLegalCard(hand, currentTrick, trumpSuit, trumpRank) {
    const ids = chooseLegalCards(hand, currentTrick, trumpSuit, trumpRank);
    return ids.length > 0 ? ids[0] : null;
}

/**
 * Choose cards to discard from kitty. Returns array of card IDs.
 * No strategy — just picks the first N cards.
 */
function chooseKittyDiscard(hand, kittySize) {
    return hand.slice(0, kittySize).map(c => c.id);
}

/**
 * Choose cards to call trump with, if possible.
 * Returns an array of card IDs (1 for single, 2 for pair/joker pair), or null if no valid call.
 * Prefers strongest call: joker pair > rank pair > single rank card.
 */
function chooseTrumpCall(hand, trumpRank, currentStrength) {
    // Try joker pair (strength 3) — two small or two big
    if (currentStrength < 3) {
        const smallJokers = hand.filter(c => c.isSmallJoker);
        if (smallJokers.length >= 2) return [smallJokers[0].id, smallJokers[1].id];
        const bigJokers = hand.filter(c => c.isBigJoker);
        if (bigJokers.length >= 2) return [bigJokers[0].id, bigJokers[1].id];
    }

    // Try rank pair (strength 2)
    if (currentStrength < 2) {
        const rankCards = hand.filter(c => c.rank === trumpRank && !c.isJoker);
        // Group by suit to find a pair
        const bySuit = {};
        rankCards.forEach(c => {
            if (!bySuit[c.suit]) bySuit[c.suit] = [];
            bySuit[c.suit].push(c);
        });
        for (const suit in bySuit) {
            if (bySuit[suit].length >= 2) {
                return [bySuit[suit][0].id, bySuit[suit][1].id];
            }
        }
    }

    // Try single rank card (strength 1)
    if (currentStrength < 1) {
        const rankCard = hand.find(c => c.rank === trumpRank && !c.isJoker);
        if (rankCard) return [rankCard.id];
    }

    return null;
}

module.exports = {
    isBot,
    generateBotId,
    generateBotName,
    chooseLegalCard,
    chooseLegalCards,
    chooseKittyDiscard,
    chooseTrumpCall,
};
