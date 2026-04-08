import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { useSocket } from '../context/SocketContext';
import './Home.css';

export default function Home() {
  const { createRoom, joinRoom, error, clearError } = useGame();
  const { connected } = useSocket();

  const [tab,      setTab]      = useState('create'); // 'create' | 'join'
  const [name,     setName]     = useState('');
  const [code,     setCode]     = useState('');
  const [loading,  setLoading]  = useState(false);

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

        <div className="home-rules">
          <h3>How to Play</h3>
          <p>
            200 is a 4-player trick-taking game played in 2 teams of 2.
            The attacking team tries to collect <strong>5s (5pts)</strong>,{' '}
            <strong>10s (10pts)</strong>, and <strong>Kings (10pts)</strong>{' '}
            for a total of 200 points. First team to win 3 rounds wins the match!
          </p>
        </div>
      </div>
    </div>
  );
}
