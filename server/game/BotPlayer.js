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
 * Pick a legal card to play. No strategy — just follows suit rules.
 * Returns the card's id.
 */
function chooseLegalCard(hand, currentTrick, trumpSuit) {
    if (hand.length === 0) return null;

    // Leading: play the first card
    if (currentTrick.length === 0) {
        return hand[0].id;
    }

    const leadCard = currentTrick[0].card;
    const leadIsTrump = leadCard.isTrump(trumpSuit);

    if (leadIsTrump) {
        // Must follow trump if possible
        const trumpCards = hand.filter(c => c.isTrump(trumpSuit));
        if (trumpCards.length > 0) return trumpCards[0].id;
    } else {
        // Must follow lead suit if possible
        const suitCards = hand.filter(c => c.suit === leadCard.suit);
        if (suitCards.length > 0) return suitCards[0].id;
    }

    // Can't follow — play anything
    return hand[0].id;
}

/**
 * Choose cards to discard from kitty. Returns array of card IDs.
 * No strategy — just picks the first N cards.
 */
function chooseKittyDiscard(hand, kittySize) {
    return hand.slice(0, kittySize).map(c => c.id);
}

module.exports = {
    isBot,
    generateBotId,
    generateBotName,
    chooseLegalCard,
    chooseKittyDiscard,
};
