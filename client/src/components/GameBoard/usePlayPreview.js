import { useEffect, useRef, useState } from 'react';

export const PREVIEW_DEBOUNCE_MS = 150;

/**
 * Live server verdict on the current selection.
 *
 * Every rule — shape, legality, how many cards the lead demands — comes from
 * `game:previewPlay`. Nothing here inspects the cards: a second copy of the
 * rules on the client would drift from the server's.
 *
 * Returns `{ shape, shapeLabel, legal, reason, requiredCount }` for the current
 * selection, `null` while nothing is selected, and `null` when the server does
 * not answer (older server, no handler) so callers can fall back to letting the
 * player press Play and be judged on submit.
 */
export default function usePlayPreview(cardIds, previewPlay, enabled) {
  const [preview, setPreview] = useState(null);
  // Selections change faster than round trips complete. Every request carries a
  // sequence number and only the newest one is allowed to write state, so a slow
  // answer for an abandoned selection can never overwrite a fresh one.
  const seqRef = useRef(0);
  const key = cardIds.join(',');

  useEffect(() => {
    if (!enabled || cardIds.length === 0 || typeof previewPlay !== 'function') {
      seqRef.current += 1;
      setPreview(null);
      return;
    }

    const seq = ++seqRef.current;
    const timer = setTimeout(() => {
      previewPlay(cardIds)
        .then((res) => {
          if (seq !== seqRef.current) return;
          setPreview({ ...res, key });
        })
        .catch(() => {
          if (seq !== seqRef.current) return;
          setPreview(null);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [key, enabled, previewPlay]);

  // Guard against a render where the selection has already moved on but the
  // last answer has not been replaced yet.
  return preview && preview.key === key ? preview : null;
}
