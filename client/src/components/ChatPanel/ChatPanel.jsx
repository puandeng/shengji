import React, { useState, useRef, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import './ChatPanel.css';

export default function ChatPanel() {
  const { chatMessages, sendChat, myPlayer } = useGame();
  const [open,    setOpen]    = useState(false);
  const [message, setMessage] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, open]);

  function handleSend(e) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    sendChat(trimmed);
    setMessage('');
  }

  return (
    <div className={`chat-panel ${open ? 'chat-panel--open' : ''}`}>
      <button className="chat-toggle" onClick={() => setOpen(o => !o)}>
        💬 {!open && chatMessages.length > 0 && <span className="chat-badge">{Math.min(chatMessages.length, 9)}</span>}
      </button>

      {open && (
        <div className="chat-window">
          <div className="chat-messages">
            {chatMessages.length === 0 && (
              <p className="chat-empty">No messages yet</p>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.name === myPlayer?.name ? 'chat-message--mine' : ''}`}>
                <span className="chat-message__name">{msg.name}</span>
                <span className="chat-message__text">{msg.message}</span>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form className="chat-input" onSubmit={handleSend}>
            <input
              type="text"
              placeholder="Type a message…"
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={200}
            />
            <button type="submit" className="btn-primary chat-send">Send</button>
          </form>
        </div>
      )}
    </div>
  );
}
