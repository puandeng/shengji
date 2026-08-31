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
function chooseLegalCards(hand, currentTrick, trumpSuit, trumpRank, ctx = {}) {
    if (hand.length === 0) return [];

    const { partnerWinning = false } = ctx;
    const isTrumpCard = c => c.isTrump(trumpSuit, trumpRank);
    const byRankAsc   = (a, b) => (a.rankValue || 0) - (b.rankValue || 0);

    // ── Leading ──────────────────────────────────────────────────────────────
    // Bots used to lead hand[0] of an unsorted hand, so a pair or tractor never
    // appeared in a solo game and the human never had to follow one.
    if (currentTrick.length === 0) {
        const sideCards = hand.filter(c => !isTrumpCard(c));
        const pool = sideCards.length > 0 ? sideCards : hand;

        const pair = findPairInCards(pool);
        if (pair && pool.length > 2) return pair.map(c => c.id);

        // Otherwise lead a middling side card and keep the top ones back.
        const sorted = [...pool].sort(byRankAsc);
        return [sorted[Math.floor(sorted.length / 2)].id];
    }

    const leadEntry = currentTrick[0];
    const leadCards = leadEntry.cards || [];
    const n = leadCards.length;
    const leadCard = leadCards[0] || leadEntry.card;
    if (!leadCard) return [hand[0].id];

    const leadEffSuit = leadCard.effectiveSuit
        ? leadCard.effectiveSuit(trumpSuit, trumpRank)
        : (leadCard.isTrump && leadCard.isTrump(trumpSuit, trumpRank) ? 'TRUMP' : leadCard.suit);

    const suitCards  = hand.filter(c => c.effectiveSuit(trumpSuit, trumpRank) === leadEffSuit);
    const otherCards = hand.filter(c => c.effectiveSuit(trumpSuit, trumpRank) !== leadEffSuit);

    // Shape obligations come first — they are enforced by the server anyway.
    if (leadEntry.shape === 'pair' && suitCards.length >= 2) {
        const pair = findPairInCards(suitCards);
        if (pair) return pair.map(c => c.id);
    }
    if (leadEntry.shape === 'throw' && suitCards.length >= 3) {
        const pair = findPairInCards(suitCards);
        if (pair) {
            const pairIds = new Set(pair.map(c => c.id));
            const single = suitCards.find(c => !pairIds.has(c.id));
            if (single) return [...pair.map(c => c.id), single.id];
        }
    }

    const selected = [];

    if (suitCards.length >= n) {
        // Must follow suit. Feed points to a partner who is taking the trick;
        // otherwise throw the cheapest cards and keep points off the table.
        const sorted = [...suitCards].sort(partnerWinning
            ? (a, b) => (b.points - a.points) || byRankAsc(a, b)   // points first
            : (a, b) => (a.points - b.points) || byRankAsc(a, b)); // points last
        selected.push(...sorted.slice(0, n));
    } else {
        selected.push(...suitCards);
        const remaining = n - selected.length;

        // Void in the lead suit. Never ruff a trick the partner already has —
        // bots used to trump their own winner, including with the big joker.
        const discardPool = partnerWinning
            ? [...otherCards].sort((a, b) => (b.points - a.points) || byRankAsc(a, b))
            : [...otherCards].sort((a, b) => (a.points - b.points) || byRankAsc(a, b));

        const noRuff = partnerWinning
            ? discardPool.filter(c => !isTrumpCard(c))
            : discardPool;

        selected.push(...(noRuff.length >= remaining ? noRuff : discardPool).slice(0, remaining));
    }

    // Fallback: top up from anywhere if the rules above came up short.
    if (selected.length < n) {
        const chosen = new Set(selected.map(c => c.id));
        for (const c of hand) {
            if (selected.length >= n) break;
            if (!chosen.has(c.id)) { selected.push(c); chosen.add(c.id); }
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
/**
 * Choose 8 cards to bury. Previously `hand.slice(0, kittySize)` off an unsorted
 * hand, which routinely buried the bot's own jokers, trumps and point cards —
 * the three things a declarer must never bury. Points in the kitty are captured
 * by the attackers at a multiplier, and buried trump is a hole in the defence.
 *
 * Preference order: junk from the shortest side suits first (burying a suit dry
 * creates a void to ruff from), never trump, never a joker, points only if
 * there is genuinely nothing else left.
 */
function chooseKittyDiscard(hand, kittySize, trumpSuit = null, trumpRank = null) {
    if (!hand || hand.length === 0) return [];

    const isTrumpCard = c =>
        c.isJoker || c.isBigJoker || c.isSmallJoker ||
        (trumpRank !== null && c.rank === trumpRank) ||
        (trumpSuit !== null && c.suit === trumpSuit);

    // How many cards the bot holds in each side suit — shorter suits are the
    // cheapest to empty out.
    const suitLength = {};
    hand.forEach(c => {
        if (isTrumpCard(c)) return;
        suitLength[c.suit] = (suitLength[c.suit] || 0) + 1;
    });

    const scored = hand.map(c => {
        let score = 0;
        if (isTrumpCard(c)) score += 1000;         // never, unless forced
        if (c.points > 0)   score += 100 + c.points;
        score += (suitLength[c.suit] || 0);        // prefer emptying short suits
        score += (c.rankValue || 0) / 100;         // shed low cards first
        return { card: c, score };
    });

    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, kittySize).map(e => e.card.id);
}

function chooseTrumpCall(hand, trumpRank, currentStrength) {
    // Group the trump-rank cards by suit, and measure how long the bot is in
    // each suit — a call names the trump suit, so it should name a good one.
    const rankCards = hand.filter(c => c.rank === trumpRank && !c.isJoker);
    const bySuit = {};
    rankCards.forEach(c => {
        if (!bySuit[c.suit]) bySuit[c.suit] = [];
        bySuit[c.suit].push(c);
    });
    const suitLength = {};
    hand.forEach(c => { if (!c.isJoker) suitLength[c.suit] = (suitLength[c.suit] || 0) + 1; });

    const pairSuits = Object.keys(bySuit).filter(su => bySuit[su].length >= 2);
    const bestPairSuit = pairSuits.sort((a, b) => (suitLength[b] || 0) - (suitLength[a] || 0))[0];

    // A joker pair calls NO TRUMP, which throws away the bot's own suit length.
    // Bots used to take it reflexively, so a third of solo rounds were played
    // with no trump suit at all. Only call it without a decent suit to name.
    const GOOD_SUIT = 5;
    const hasGoodSuitPair = bestPairSuit && (suitLength[bestPairSuit] || 0) >= GOOD_SUIT;

    if (currentStrength < 2 && hasGoodSuitPair) {
        return [bySuit[bestPairSuit][0].id, bySuit[bestPairSuit][1].id];
    }

    if (currentStrength < 3) {
        const smallJokers = hand.filter(c => c.isSmallJoker);
        if (smallJokers.length >= 2) return [smallJokers[0].id, smallJokers[1].id];
        const bigJokers = hand.filter(c => c.isBigJoker);
        if (bigJokers.length >= 2) return [bigJokers[0].id, bigJokers[1].id];
    }

    if (currentStrength < 2 && bestPairSuit) {
        return [bySuit[bestPairSuit][0].id, bySuit[bestPairSuit][1].id];
    }

    // Single rank card (strength 1) — name the longest suit available.
    if (currentStrength < 1 && rankCards.length > 0) {
        const best = [...rankCards].sort((a, b) => (suitLength[b.suit] || 0) - (suitLength[a.suit] || 0))[0];
        return [best.id];
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
