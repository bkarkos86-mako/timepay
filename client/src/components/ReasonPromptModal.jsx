import { useState } from 'react';

// Replaces window.prompt() for capturing a reason before an action (reject,
// deny, force clock-out). Native prompt()/confirm()/alert() are unreliable
// in PWA standalone mode on iOS/Android — often a silent no-op or throw —
// which made these actions appear to do nothing when tapped from an
// installed home-screen app.
export default function ReasonPromptModal({ title, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm(reason);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={onCancel}
    >
      <div className="card" style={{ width: '100%', maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="field">
          <label>Reason</label>
          <textarea rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={handleConfirm} disabled={busy || !reason.trim()}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
