import React from 'react';
import { suitName } from '../../suits';
import './TrumpBanner.css';

const RED_SUITS    = new Set(['H', 'D']);

export default function TrumpBanner({ trumpSuit, trumpRank, trumpCallStrength, attackingTeam, players, phase }) {
  const isTrumpSelection = phase === 'TRUMP_SELECTION' || phase === 'DEALING';
  // A joker-pair call sets trumpSuit to null FOR THE WHOLE ROUND — that is what
  // "no trump" means here. Using !trumpSuit as a stand-in for "nobody has
  // called yet" left the banner reading "Waiting for trump declaration…"
  // through all 25 tricks of a no-trump round, and never showed the rank
  // either, in the one variant where rank cards and jokers are the only trump.
  const noTrumpCalled = !trumpSuit && trumpCallStrength === 3;
  const undecided     = !trumpSuit && !noTrumpCalled;

  if (undecided && isTrumpSelection) {
    return (
      <div className="trump-banner trump-banner--waiting">
        <span>
          Waiting for trump call — reveal a <strong>{trumpRank}</strong> to call trump
        </span>
      </div>
    );
  }

  if (undecided) {
    return (
      <div className="trump-banner trump-banner--waiting">
        <span>Waiting for trump declaration…</span>
      </div>
    );
  }

  if (noTrumpCalled) {
    return (
      <div className="trump-banner">
        <span className="trump-banner__label">Trump</span>
        <span className="trump-banner__suit">No trump</span>
        <span className="trump-banner__divider">·</span>
        <span className="trump-banner__rank">
          Only <strong>{trumpRank}</strong>s and jokers are trump
        </span>
        {attackingTeam != null && (
          <>
            <span className="trump-banner__divider">|</span>
            <span className="trump-banner__attacking">⚔️ Team {attackingTeam + 1} attacking</span>
          </>
        )}
      </div>
    );
  }

  const isRed    = RED_SUITS.has(trumpSuit);
  const teamName = `Team ${(attackingTeam ?? 0) + 1}`;

  return (
    <div className="trump-banner">
      <span className="trump-banner__label">Trump</span>
      <span className={`trump-banner__suit ${isRed ? 'trump-banner__suit--red' : ''}`}>
        {suitName(trumpSuit)}
      </span>
      {trumpRank && (
        <>
          <span className="trump-banner__divider">·</span>
          <span className="trump-banner__rank">Rank: {trumpRank}</span>
        </>
      )}
      <span className="trump-banner__divider">|</span>
      <span className="trump-banner__attacking">
        ⚔️ {teamName} attacking
      </span>
    </div>
  );
}
