import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// Shared by TimeClock.js and Timesheets.js: worked hours for a shift,
// excluding any break. Returns null for a shift that's still open (no
// clock_out yet) rather than a misleading 0.
export function computeWorkedHours(entry) {
  if (!entry.clock_out) return null;
  const start = new Date(entry.clock_in).getTime();
  const end = new Date(entry.clock_out).getTime();
  let breakMs = 0;
  if (entry.break_start && entry.break_end) {
    breakMs = Math.max(0, new Date(entry.break_end).getTime() - new Date(entry.break_start).getTime());
  }
  return Math.max(0, (end - start) - breakMs) / 3600000;
}

function elapsedLabel(startIso) {
  const ms = Date.now() - new Date(startIso).getTime();
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Compact clock in/out widget, meant to live in the Hub's sidebar so it's
// visible to a staff member no matter what page they're on.
export function TimeClockWidget({ currentUser }) {
  const [entry, setEntry] = useState(null); // the current OPEN shift, or null if clocked out
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const [, setTick] = useState(0); // re-renders the elapsed-time label periodically

  const loadOpenEntry = async () => {
    const { data, error } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', currentUser.id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) console.error('[timeclock] load open entry error:', error);
    setEntry(data || null);
    setLoading(false);
  };

  useEffect(() => {
    if (currentUser?.id) loadOpenEntry();
  }, [currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const clockIn = async () => {
    setBusy(true);
    const { error } = await supabase.from('time_entries').insert([{ user_id: currentUser.id }]);
    if (error) alert('Error clocking in: ' + error.message);
    await loadOpenEntry();
    setBusy(false);
  };

  const startBreak = async () => {
    if (!entry) return;
    setBusy(true);
    const { error } = await supabase.from('time_entries').update({ break_start: new Date().toISOString() }).eq('id', entry.id);
    if (error) alert('Error starting break: ' + error.message);
    await loadOpenEntry();
    setBusy(false);
  };

  const endBreak = async () => {
    if (!entry) return;
    setBusy(true);
    const { error } = await supabase.from('time_entries').update({ break_end: new Date().toISOString() }).eq('id', entry.id);
    if (error) alert('Error ending break: ' + error.message);
    await loadOpenEntry();
    setBusy(false);
  };

  const clockOut = async () => {
    if (!entry) return;
    setBusy(true);
    const { error } = await supabase.from('time_entries')
      .update({ clock_out: new Date().toISOString(), note: note.trim() || null })
      .eq('id', entry.id);
    if (error) { alert('Error clocking out: ' + error.message); setBusy(false); return; }
    setNote('');
    setShowNote(false);
    await loadOpenEntry();
    setBusy(false);
  };

  if (loading || !currentUser?.id) return null;

  const onBreak = !!(entry?.break_start && !entry?.break_end);
  const status = !entry ? 'out' : onBreak ? 'break' : 'in';

  const statusLabel = status === 'out'
    ? 'Clocked out'
    : status === 'break'
      ? `On break since ${new Date(entry.break_start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      : `Clocked in • ${elapsedLabel(entry.clock_in)}`;

  const primaryBtn = { width: '100%', border: '1px solid rgba(178,34,34,0.4)', background: 'rgba(178,34,34,0.15)', color: '#b22222', padding: '8px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 };
  const secondaryBtn = { ...primaryBtn, background: 'transparent', border: '1px solid #b8b8bf', color: '#52525b' };

  return (
    <div style={{ padding: '14px 20px', borderTop: '1px solid #e4e4e8', borderBottom: '1px solid #e4e4e8' }}>
      <p style={{ color: '#4b5563', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px 0' }}>Time Clock</p>
      <p style={{ color: status === 'out' ? '#71717a' : '#16a34a', fontSize: '13px', fontWeight: '600', margin: '0 0 8px 0' }}>{statusLabel}</p>

      {status === 'out' && (
        <button onClick={clockIn} disabled={busy} style={primaryBtn}>Clock In</button>
      )}

      {status === 'in' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button onClick={startBreak} disabled={busy} style={secondaryBtn}>Start Break</button>
          {showNote ? (
            <input autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #b8b8bf', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', color: '#18181b' }} />
          ) : (
            <button onClick={() => setShowNote(true)}
              style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', padding: 0, textAlign: 'left' }}>
              + Add a note
            </button>
          )}
          <button onClick={clockOut} disabled={busy} style={primaryBtn}>Clock Out</button>
        </div>
      )}

      {status === 'break' && (
        <button onClick={endBreak} disabled={busy} style={primaryBtn}>End Break</button>
      )}
    </div>
  );
}
