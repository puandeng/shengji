import { useCallback, useState } from 'react';

/**
 * Hand sort preferences.
 *
 * With all 25 cards permanently on screen, sort order *is* how a player finds a
 * card — so it is a setting, not a hard-coded rule. Stored under a single
 * localStorage key so one read/write covers the whole set.
 *
 * Every storage access is wrapped: localStorage throws outright in some
 * contexts (Safari private mode, embedded webviews, cookies-blocked), and a
 * sort preference is never worth taking the hand down for.
 */
const STORAGE_KEY = 'shengji-hand-prefs';

export const ALL_SUITS = ['S', 'H', 'D', 'C'];

/** Defaults reproduce the previous hard-coded behaviour exactly. */
export const DEFAULT_PREFS = {
    suitOrder: ['S', 'H', 'D', 'C'],
    trumpEnd: 'right',      // which end of the hand the trump row sits at
    rankDirection: 'asc',   // 'asc' = low→high, 'desc' = high→low, within each group
};

/** Never trust what came out of storage — it survives across app versions. */
function sanitize(raw) {
    const prefs = { ...DEFAULT_PREFS };
    if (!raw || typeof raw !== 'object') return prefs;

    if (Array.isArray(raw.suitOrder)) {
        const order = [];
        raw.suitOrder.forEach(suit => {
            if (ALL_SUITS.includes(suit) && !order.includes(suit)) order.push(suit);
        });
        ALL_SUITS.forEach(suit => {
            if (!order.includes(suit)) order.push(suit);
        });
        prefs.suitOrder = order;
    }
    if (raw.trumpEnd === 'left' || raw.trumpEnd === 'right') {
        prefs.trumpEnd = raw.trumpEnd;
    }
    if (raw.rankDirection === 'asc' || raw.rankDirection === 'desc') {
        prefs.rankDirection = raw.rankDirection;
    }
    return prefs;
}

export function loadHandPrefs() {
    try {
        return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch {
        return { ...DEFAULT_PREFS };
    }
}

export function saveHandPrefs(prefs) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        // Storage unavailable — the choice still applies for this session.
    }
}

/** Prefs state seeded from storage and written back on every change. */
export function useHandPrefs() {
    const [prefs, setPrefs] = useState(loadHandPrefs);

    const updatePrefs = useCallback(patch => {
        setPrefs(prev => {
            const next = sanitize({ ...prev, ...patch });
            saveHandPrefs(next);
            return next;
        });
    }, []);

    return [prefs, updatePrefs];
}
