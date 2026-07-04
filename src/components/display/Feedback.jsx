import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icon.jsx';
import { Button } from '../forms/Button.jsx';
import { Input } from '../forms/Input.jsx';
import { SegmentedControl } from '../forms/SegmentedControl.jsx';
import { submitFeedback } from '../../lib/feedback.js';

const TYPES = [
  { value: 'bug', label: 'Bug', icon: <Icon n="circle-alert" s={15} /> },
  { value: 'idea', label: 'Idea', icon: <Icon n="sparkles" s={15} /> },
  { value: 'praise', label: 'Praise', icon: <Icon n="star" s={15} /> },
];
const PLACEHOLDER = {
  bug: 'What happened, and what did you expect? Steps to reproduce help a lot.',
  idea: 'What would you like to see? A feature, a change, an upgrade…',
  praise: 'What’s working well for you?',
};

// Floating trigger — shown on mobile (the desktop sidebar has its own button).
export function FeedbackFab({ onClick }) {
  return (
    <button className="fc-fab" onClick={onClick} aria-label="Send feedback">
      <Icon n="message-square" s={18} />
      <span>Feedback</span>
    </button>
  );
}

// The feedback form. `context` = { page, song } describing where the user is; the
// rest of the environment (build, theme, device) is attached at submit time.
export function FeedbackModal({ open, context = {}, onClose, onSent, onError }) {
  const [type, setType] = useState('idea');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const genRef = useRef(0); // bumps each open, so a stale in-flight submit can tell it's stale

  // Fresh message + type each time it opens (name is kept on purpose so repeat
  // testers don't retype it). Also wires Esc-to-close.
  useEffect(() => {
    if (!open) return;
    genRef.current += 1;
    setType('idea'); setMessage(''); setSending(false);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const submit = async () => {
    const text = message.trim();
    if (!text || sending) return;
    const g = genRef.current;
    setSending(true);
    const res = await submitFeedback({ type, message: text, name: name.trim(), page: context.page, song: context.song });
    // If the user closed and reopened while this was in flight, it's a new
    // session now — the note already sent/queued, so don't disturb it.
    if (g !== genRef.current) return;
    setSending(false);
    if (res.ok) onSent && onSent('Thanks — your feedback was sent');
    else if (res.queued) onSent && onSent('Saved — we’ll send it once you’re back online');
    else { onError && onError('Couldn’t send that — please try again'); return; }
    onClose();
  };

  return (
    <div className="fc-fb-backdrop" onClick={onClose}>
      <div className="fc-fb" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Send feedback">
        <div className="fc-fb-head">
          <span className="fc-fb-title">Send feedback</span>
          <button className="fc-fb-x" aria-label="Close" onClick={onClose}><Icon n="x" s={18} /></button>
        </div>
        <p className="fc-fb-sub">Bugs, ideas, requests — anything at all. It goes straight to Alex &amp; Clinton.</p>

        <SegmentedControl block options={TYPES} value={type} onChange={setType} />

        <Input
          multiline
          rows={5}
          autoFocus
          aria-label="Your feedback"
          placeholder={PLACEHOLDER[type]}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <Input
          aria-label="Your name (optional)"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {context.page && (
          <div className="fc-fb-ctx"><Icon n="map-pin" s={13} />Sent from <b>{context.page}</b></div>
        )}

        <div className="fc-fb-actions">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!message.trim() || sending} iconLeft={<Icon n="send" s={16} />} onClick={submit}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}
