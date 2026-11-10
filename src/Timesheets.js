import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { computeWorkedHours } from './TimeClock';

function mondayOf(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().split('T')[0];
}

// <input type="datetime-local"> needs "YYYY-MM-DDTHH:mm" in LOCAL time, not
// the UTC ISO string Supabase returns/expects — these two convert between them.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (val) => (val ? new Date(val).toISOString() : null);

const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const fmtHours = (h) => h == null ? '—' : h.toFixed(2);

function Timesheets() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(mondayOf(new Date()));
  const [endDate, setEndDate] = useState(todayStr);
  const [staff, setStaff] = useState([]);
  const [staffFilter, setStaffFilter] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const nameMap = {};
  staff.forEach(s => { nameMap[s.id] = s.full_name || s.email || 'Staff'; });

  const fetchStaff = useCallback(async () => {
    // Parole Officers get Hub accounts for messaging/visibility but don't
    // clock in/out — leave them off the staff filter dropdown.
    const { data, error } = await supabase.from('user_profiles').select('id, full_name, email, role').order('full_name');
    if (error) console.error('[timesheets] staff fetch error:', error);
    setStaff((data || []).filter(s => s.role !== 'parole_officer'));
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('time_entries').select('*')
      .gte('clock_in', new Date(startDate + 'T00:00:00').toISOString())
      .lte('clock_in', new Date(endDate + 'T23:59:59').toISOString())
      .order('clock_in', { ascending: false });
    if (staffFilter) query = query.eq('user_id', staffFilter);
    const { data, error } = await query;
    if (error) console.error('[timesheets] entries fetch error:', error);
    setEntries(data || []);
    setLoading(false);
  }, [startDate, endDate, staffFilter]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);
  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setEditForm({
      clock_in: toLocalInput(entry.clock_in),
      clock_out: toLocalInput(entry.clock_out),
      break_start: toLocalInput(entry.break_start),
      break_end: toLocalInput(entry.break_end),
      note: entry.note || '',
    });
  };

  const saveEdit = async () => {
    const clockIn = fromLocalInput(editForm.clock_in);
    if (!clockIn) { alert('Clock in time is required.'); return; }
    setSaving(true);
    const updates = {
      clock_in: clockIn,
      clock_out: fromLocalInput(editForm.clock_out),
      break_start: fromLocalInput(editForm.break_start),
      break_end: fromLocalInput(editForm.break_end),
      note: editForm.note.trim() || null,
    };
    const { error } = await supabase.from('time_entries').update(updates).eq('id', editingId);
    if (error) { alert('Error saving: ' + error.message); setSaving(false); return; }
    setEditingId(null);
    setSaving(false);
    fetchEntries();
  };

  const deleteEntry = async (id) => {
    if (!window.confirm('Delete this time entry? This cannot be undone.')) return;
    const { error } = await supabase.from('time_entries').delete().eq('id', id);
    if (error) { alert('Error deleting: ' + error.message); return; }
    fetchEntries();
  };

  const isStaleOpenShift = (entry) => !entry.clock_out && (Date.now() - new Date(entry.clock_in).getTime()) > 16 * 3600 * 1000;

  const exportCSV = () => {
    const rows = [['Staff', 'Clock In', 'Clock Out', 'Break (min)', 'Hours', 'Note']];
    entries.forEach(e => {
      const breakMin = e.break_start && e.break_end
        ? Math.round((new Date(e.break_end) - new Date(e.break_start)) / 60000)
        : 0;
      const hours = computeWorkedHours(e);
      rows.push([
        nameMap[e.user_id] || e.user_id,
        e.clock_in ? new Date(e.clock_in).toLocaleString('en-US') : '',
        e.clock_out ? new Date(e.clock_out).toLocaleString('en-US') : 'Still clocked in',
        breakMin,
        hours != null ? hours.toFixed(2) : '',
        (e.note || '').replace(/"/g, '""'),
      ]);
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timesheets_${startDate}_to_${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const totalHours = entries.reduce((sum, e) => sum + (computeWorkedHours(e) || 0), 0);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', marginBottom: '20px' }}>
        <div>
          <label style={lbl}>From</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>To</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>Staff</label>
          <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} style={inp}>
            <option value="">All staff</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
          </select>
        </div>
        <button onClick={exportCSV} disabled={entries.length === 0}
          style={{ background: 'transparent', border: '1px solid #0d9488', color: '#16a34a', padding: '9px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: entries.length === 0 ? 'default' : 'pointer', opacity: entries.length === 0 ? 0.5 : 1 }}>
          📄 Export CSV
        </button>
        <p style={{ marginLeft: 'auto', color: '#4b5563', fontSize: '14px' }}>
          Total: <strong style={{ color: '#18181b' }}>{totalHours.toFixed(2)} hrs</strong> across {entries.length} shift{entries.length === 1 ? '' : 's'}
        </p>
      </div>

      {loading ? <p style={{ color: '#4b5563' }}>Loading...</p> : entries.length === 0 ? (
        <p style={{ color: '#4b5563' }}>No time entries in this range.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {entries.map(entry => {
            const stale = isStaleOpenShift(entry);
            const hours = computeWorkedHours(entry);
            const isEditing = editingId === entry.id;
            return (
              <div key={entry.id} style={{ background: stale ? '#fffbeb' : '#ffffff', border: `1px solid ${stale ? '#f59e0b' : '#c9c9cf'}`, borderRadius: '10px', padding: '12px 16px' }}>
                {!isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: '140px', fontWeight: '600', color: '#18181b', fontSize: '14px' }}>{nameMap[entry.user_id] || 'Unknown staff'}</div>
                    <div style={{ fontSize: '13px', color: '#52525b' }}>In: {fmtDateTime(entry.clock_in)}</div>
                    <div style={{ fontSize: '13px', color: stale ? '#b45309' : '#52525b', fontWeight: stale ? '600' : '400' }}>
                      Out: {entry.clock_out ? fmtDateTime(entry.clock_out) : (stale ? '⚠ Still clocked in' : 'Still clocked in')}
                    </div>
                    {entry.break_start && (
                      <div style={{ fontSize: '13px', color: '#52525b' }}>
                        Break: {fmtDateTime(entry.break_start)}{entry.break_end ? ` – ${fmtDateTime(entry.break_end)}` : ' (ongoing)'}
                      </div>
                    )}
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#16a34a' }}>{fmtHours(hours)} hrs</div>
                    {entry.note && <div style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>"{entry.note}"</div>}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                      <button onClick={() => startEdit(entry)} style={smallBtn}>Edit</button>
                      <button onClick={() => deleteEntry(entry.id)} style={{ ...smallBtn, borderColor: '#dc2626', color: '#dc2626' }}>Delete</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                      <div><label style={lbl}>Clock In</label><input type="datetime-local" value={editForm.clock_in} onChange={e => setEditForm(p => ({ ...p, clock_in: e.target.value }))} style={inp} /></div>
                      <div><label style={lbl}>Clock Out</label><input type="datetime-local" value={editForm.clock_out} onChange={e => setEditForm(p => ({ ...p, clock_out: e.target.value }))} style={inp} /></div>
                      <div><label style={lbl}>Break Start</label><input type="datetime-local" value={editForm.break_start} onChange={e => setEditForm(p => ({ ...p, break_start: e.target.value }))} style={inp} /></div>
                      <div><label style={lbl}>Break End</label><input type="datetime-local" value={editForm.break_end} onChange={e => setEditForm(p => ({ ...p, break_end: e.target.value }))} style={inp} /></div>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                      <label style={lbl}>Note</label>
                      <input value={editForm.note} onChange={e => setEditForm(p => ({ ...p, note: e.target.value }))} style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={saveEdit} disabled={saving}
                        style={{ background: 'rgba(178,34,34,0.15)', border: '1px solid rgba(178,34,34,0.4)', color: '#b22222', padding: '7px 16px', borderRadius: '7px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => setEditingId(null)} style={{ background: 'transparent', border: '1px solid #b8b8bf', color: '#52525b', padding: '7px 16px', borderRadius: '7px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const lbl = { display: 'block', fontSize: '11px', fontWeight: '600', color: '#52525b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp = { background: '#ffffff', border: '1px solid #b8b8bf', borderRadius: '7px', padding: '7px 10px', fontSize: '13px', color: '#18181b' };
const smallBtn = { background: 'transparent', border: '1px solid #b8b8bf', color: '#52525b', padding: '5px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' };

export default Timesheets;