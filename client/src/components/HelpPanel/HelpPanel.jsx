import React, { useState } from 'react';
import './HelpPanel.css';

/**
 * The rules, inside the game.
 *
 * Everything a newcomer got was ~90 words on the home page, which they leave
 * the moment they create a room — and which never mentioned trump, tricks,
 * following suit, the kitty, or the fact that calling trump means defending.
 * Every other explanation in the product lived inside an error message, so the
 * only way to learn a rule was to break it first.
 */
export default function HelpPanel({ trumpRank = '2', threshold = 80 }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="help-toggle"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        title="How this game works"
      >
        ?
      </button>

      {open && (
        <div className="help-panel" role="dialog" aria-label="How to play">
          <div className="help-panel__head">
            <h3>How this game works</h3>
            <button className="help-panel__close" onClick={() => setOpen(false)} title="Close">×</button>
          </div>

          <section>
            <h4>The one thing that surprises everyone</h4>
            <p>
              The team that <strong>calls trump declares</strong>, and declaring means
              <strong> defending</strong>. Declarers take the kitty and try to <em>deny</em> points.
              The other team attacks: they collect points and need <strong>{threshold}</strong> to
              take the bank.
            </p>
          </section>

          <section>
            <h4>Points</h4>
            <p>
              Only 5s (5), 10s (10) and Kings (10) score — 200 in the deck.
              Only the attacking team banks them; a defender winning a trick
              denies those points rather than collecting them.
            </p>
          </section>

          <section>
            <h4>What counts as trump</h4>
            <p>
              Big joker, small joker, every card of rank <strong>{trumpRank}</strong> in
              any suit, then the trump suit itself. A {trumpRank} is trump even
              when it shows another suit&rsquo;s pip — which is why it sits in the
              trump group of your hand.
            </p>
          </section>

          <section>
            <h4>Calling trump</h4>
            <p>
              Reveal a {trumpRank} to call its suit. A matched pair of {trumpRank}s beats
              a single; a matched joker pair beats everything and means <em>no trump</em>.
              Equal calls go to whoever called first.
            </p>
          </section>

          <section>
            <h4>Following</h4>
            <p>
              You must play the same number of cards as the lead, and as many of
              the led suit as you hold. Cards you cannot legally play are dimmed.
              Pairs and tractors (consecutive pairs) must be answered in kind
              where you can.
            </p>
          </section>

          <section>
            <h4>The kitty</h4>
            <p>
              The declarer buries 8 cards. If the <em>attackers</em> take the last
              trick they capture the bury at double or more, so burying point
              cards is a real risk. Otherwise it is protected and pays nobody.
            </p>
          </section>

          <section>
            <h4>Winning</h4>
            <p>
              Both teams start at 2 and climb toward A; first past A takes the
              match. Attackers reaching the target take the bank, and climb
              further the bigger the margin. Defenders climb by holding them
              short.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
