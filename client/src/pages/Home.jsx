import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { useSocket } from '../context/SocketContext';
import './Home.css';

export default function Home() {
  const { createRoom, joinRoom, error, clearError } = useGame();
  const { connected } = useSocket();

  const [tab,        setTab]        = useState('create'); // 'create' | 'join'
  const [name,       setName]       = useState('');
  const [code,       setCode]       = useState('');
  const [loading,    setLoading]    = useState(false);
  const [showRules,  setShowRules]  = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try { await createRoom(name.trim()); }
    catch (_) { /* error handled by context */ }
    finally { setLoading(false); }
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    setLoading(true);
    try { await joinRoom(name.trim(), code.trim().toUpperCase()); }
    catch (_) { /* error handled by context */ }
    finally { setLoading(false); }
  }

  return (
    <div className="home-container">
      <div className="home-card">
        <h1 className="home-title">🃏 200</h1>
        <p className="home-subtitle">Multiplayer Card Game</p>

        {!connected && (
          <div className="home-disconnected">⚠️ Connecting to server…</div>
        )}

        <div className="home-tabs">
          <button
            className={tab === 'create' ? 'tab active' : 'tab'}
            onClick={() => { setTab('create'); clearError(); }}
          >
            Create Room
          </button>
          <button
            className={tab === 'join' ? 'tab active' : 'tab'}
            onClick={() => { setTab('join'); clearError(); }}
          >
            Join Room
          </button>
        </div>

        {tab === 'create' ? (
          <form className="home-form" onSubmit={handleCreate}>
            <label>Your Name</label>
            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={20}
              autoFocus
            />
            {error && <p className="error-text">{error}</p>}
            <button
              type="submit"
              className="btn-primary"
              disabled={!connected || loading || !name.trim()}
            >
              {loading ? 'Creating…' : 'Create Room'}
            </button>
          </form>
        ) : (
          <form className="home-form" onSubmit={handleJoin}>
            <label>Your Name</label>
            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={20}
              autoFocus
            />
            <label>Room Code</label>
            <input
              type="text"
              placeholder="4-letter code (e.g. ABCD)"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              maxLength={4}
            />
            {error && <p className="error-text">{error}</p>}
            <button
              type="submit"
              className="btn-primary"
              disabled={!connected || loading || !name.trim() || code.length < 4}
            >
              {loading ? 'Joining…' : 'Join Room'}
            </button>
          </form>
        )}

        <button
          className="btn-secondary home-rules-btn"
          onClick={() => setShowRules(v => !v)}
        >
          {showRules ? 'Hide Rules' : 'Rules'}
        </button>

        {showRules && (
          <div className="home-rules">
            <h3>Overview</h3>
            <p>
              200 (Sheng Ji) is a 4-player trick-taking game in 2 fixed teams.
              Two decks + 4 jokers = 108 cards. Each player gets 25; 8 go to the kitty.
            </p>

            <h3>Point Cards</h3>
            <p>
              <strong>5</strong> = 5 pts, <strong>10</strong> = 10 pts,{' '}
              <strong>K</strong> = 10 pts. Total: 200 points across both decks.
            </p>

            <h3>Trump Calling</h3>
            <p>
              During the deal, reveal a card matching the round&rsquo;s rank to call
              trump. A pair overrides a single; a joker pair overrides everything.
              The caller&rsquo;s team <strong>defends</strong> (takes the kitty and
              tries to deny points). The other team <strong>attacks</strong> (collects
              points to reach the threshold).
            </p>

            <h3>Kitty</h3>
            <p>
              The declarer picks up the 8 kitty cards, then buries 8 back. If the
              attacking team wins the <strong>last trick</strong>, they capture the
              kitty at kitty points &times; (2 &times; cards in the winning play).
            </p>

            <h3>Trick-Taking</h3>
            <p>
              Play singles, pairs, tractors (consecutive pairs), or throws
              (single + pair). Must follow the lead suit if held.
              Trump order: Big Joker &gt; Small Joker &gt; in-suit rank card &gt;
              off-suit rank card &gt; trump suit by rank.
            </p>

            <h3>Scoring &amp; Levels</h3>
            <p>
              Attackers need <strong>80 pts</strong> (120 at level A) to break
              through. The margin decides how many levels the winner advances
              (1&ndash;3). Both teams start at <strong>2</strong> and climb
              toward <strong>A</strong>. First team past A wins.
              Levels 5, 10, K, and A cannot be skipped on first visit.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
