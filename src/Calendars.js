import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDaysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfMonth(year, month) { return new Date(year, month, 1).getDay(); }
function toYMD(date) { return date.toISOString().split('T')[0]; }
function todayYMD() { return toYMD(new Date()); }
function fmtMonthYear(year, month) { return new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' }); }
function fmtDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RECURRENCE_OPTIONS = ['weekly', 'biweekly', 'monthly'];

// ─── Shared styles ────────────────────────────────────────────────────────────
const s = {
  tabBtn: (active) => ({ padding: '8px 18px', borderRadius: 8, border: '1px solid #444', cursor: 'pointer', fontSize: 13, background: active ? '#2a2a2a' : 'transparent', color: active ? '#fff' : '#888', fontWeight: active ? 600 : 400 }),
  card: { background: '#2a2a2a', borderRadius: 12, padding: '20px 22px', border: '1px solid #333', marginBottom: 20 },
  label: { fontSize: 12, color: '#888', marginBottom: 5, display: 'block' },
  input: { background: '#1a1a1a', border: '1px solid #444', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  select: { background: '#1a1a1a', border: '1px solid #444', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  btn: (color) => ({ padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: color || '#b22222', color: '#fff' }),
  ghost: { padding: '7px 14px', borderRadius: 8, border: '1px solid #444', cursor: 'pointer', fontSize: 13, background: 'transparent', color: '#aaa' },
  badge: (color) => ({ display: 'inline-block', background: color || '#b22222', color: '#fff', borderRadius: 4, fontSize: 10, fontWeight: 700, padding: '2px 6px', marginLeft: 4 }),
};

// ─── Calendar Grid ────────────────────────────────────────────────────────────
function CalendarGrid({ year, month, eventsByDate, onDayClick, onPrev, onNext, renderDot }) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = todayYMD();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={onPrev} style={s.ghost}>‹</button>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{fmtMonthYear(year, month)}</span>
        <button onClick={onNext} style={s.ghost}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {DAYS.map(d => <div key={d} style={{ fontSize: 11, color: '#555', textAlign: 'center', fontWeight: 600 }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const events = eventsByDate[ymd] || [];
          const isToday = ymd === today;
          return (
            <div key={ymd} onClick={() => onDayClick && onDayClick(ymd, events)}
              style={{ minHeight: 64, background: isToday ? '#2e1a1a' : '#1e1e1e', borderRadius: 8, padding: '6px 8px', cursor: onDayClick ? 'pointer' : 'default', border: isToday ? '1px solid #b22222' : '1px solid #2a2a2a' }}>
              <div style={{ fontSize: 12, color: isToday ? '#b22222' : '#666', fontWeight: isToday ? 700 : 400, marginBottom: 4 }}>{day}</div>
              {events.slice(0, 3).map((ev, j) => renderDot ? renderDot(ev, j) : (
                <div key={j} style={{ fontSize: 10, color: '#fff', background: ev.color || '#b22222', borderRadius: 3, padding: '1px 4px', marginBottom: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{ev.label}</div>
              ))}
              {events.length > 3 && <div style={{ fontSize: 10, color: '#666' }}>+{events.length - 3} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#1e1e1e', borderRadius: 14, padding: 28, width: 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #333' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVE-IN CALENDAR
// ═══════════════════════════════════════════════════════════════════════════════
function MoveInCalendar() {
  const { isHouseManagerRole, assignedHouseIds } = useUser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [clients, setClients] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedEvents, setSelectedEvents] = useState([]);

  const fetchClients = useCallback(async () => {
    let query = supabase.from('clients').select('id, full_name, start_date, house_id, houses(name), gender, status').not('start_date', 'is', null).order('start_date');
    if (isHouseManagerRole && assignedHouseIds.length > 0) query = query.in('house_id', assignedHouseIds);
    const { data } = await query;
    setClients(data || []);
  }, [isHouseManagerRole, assignedHouseIds]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const eventsByDate = {};
  clients.forEach(c => {
    if (!c.start_date) return;
    if (!eventsByDate[c.start_date]) eventsByDate[c.start_date] = [];
    eventsByDate[c.start_date].push({ label: c.full_name, house: c.houses?.name || '', gender: c.gender, status: c.status, color: c.status === 'Active' ? '#10b981' : '#3b82f6' });
  });

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>Clients with a move-in date appear here automatically. Set a client's start date in their profile to add them.</p>
      <div style={s.card}>
        <CalendarGrid year={year} month={month} eventsByDate={eventsByDate}
          onDayClick={(ymd, evs) => { if (evs.length) { setSelectedDay(ymd); setSelectedEvents(evs); } }}
          onPrev={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
          onNext={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }} />
      </div>
      {selectedDay && (
        <Modal title={`Move-ins on ${fmtDate(selectedDay)}`} onClose={() => setSelectedDay(null)}>
          {selectedEvents.map((ev, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #333' }}>
              <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{ev.label}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{ev.house} · {ev.gender}</div>
              <span style={{ ...s.badge(ev.color), marginTop: 4 }}>{ev.status}</span>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORG-WIDE HOUSE EVENTS CALENDAR
// Shows one event per org-wide event (scoped to All / Men's / Women's)
// ═══════════════════════════════════════════════════════════════════════════════
function OrgEventsCalendar() {
  const { user, canAddOrgEvents } = useUser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [events, setEvents] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', event_date: '', start_time: '', end_time: '', scope: 'all', is_recurring: false, recurrence: 'weekly' });
  const [saving, setSaving] = useState(false);

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase.from('house_events').select('*').is('house_id', null).order('event_date');
    setEvents(data || []);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const SCOPE_COLORS = { all: '#b22222', mens: '#3b82f6', womens: '#ec4899' };
  const SCOPE_LABELS = { all: 'All Houses', mens: "Men's Houses", womens: "Women's Houses" };

  // Expand recurring events for current month
  const daysInMonth = getDaysInMonth(year, month);
  const eventsByDate = {};

  events.forEach(ev => {
    const addToDate = (ymd) => {
      if (!eventsByDate[ymd]) eventsByDate[ymd] = [];
      eventsByDate[ymd].push({ ...ev, label: ev.title, color: SCOPE_COLORS[ev.scope] || '#b22222' });
    };

    if (!ev.is_recurring || ev.recurrence === 'none') {
      if (ev.event_date) addToDate(ev.event_date);
    } else {
      const originDate = new Date(ev.event_date);
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (ev.recurrence === 'weekly' && date.getDay() === originDate.getDay()) addToDate(ymd);
        else if (ev.recurrence === 'biweekly' && date.getDay() === originDate.getDay()) {
          const diffWeeks = Math.round((date - originDate) / (7 * 24 * 60 * 60 * 1000));
          if (diffWeeks % 2 === 0) addToDate(ymd);
        } else if (ev.recurrence === 'monthly' && date.getDate() === originDate.getDate()) addToDate(ymd);
      }
    }
  });

  const saveEvent = async () => {
    if (!form.title || !form.event_date) return alert('Title and date are required.');
    setSaving(true);
    await supabase.from('house_events').insert([{
      title: form.title, description: form.description || null,
      event_date: form.event_date, start_time: form.start_time || null, end_time: form.end_time || null,
      house_id: null, // null = org-wide
      scope: form.scope,
      is_recurring: form.is_recurring,
      recurrence: form.is_recurring ? form.recurrence : 'none',
      created_by: user?.id,
    }]);
    setSaving(false);
    setShowAddModal(false);
    setForm({ title: '', description: '', event_date: '', start_time: '', end_time: '', scope: 'all', is_recurring: false, recurrence: 'weekly' });
    fetchEvents();
  };

  const deleteEvent = async (id) => {
    if (!window.confirm('Delete this event?')) return;
    await supabase.from('house_events').delete().eq('id', id);
    fetchEvents();
    setSelectedDay(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(SCOPE_LABELS).map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: SCOPE_COLORS[key] }} />
              <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
            </div>
          ))}
        </div>
        {canAddOrgEvents && <button style={s.btn()} onClick={() => setShowAddModal(true)}>+ Add Org Event</button>}
      </div>

      {!canAddOrgEvents && (
        <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#666' }}>
          Contact an admin to add org-wide events.
        </div>
      )}

      <div style={s.card}>
        <CalendarGrid year={year} month={month} eventsByDate={eventsByDate}
          onDayClick={(ymd, evs) => { if (evs.length) { setSelectedDay(ymd); setSelectedEvents(evs); } }}
          onPrev={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
          onNext={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}
          renderDot={(ev, j) => (
            <div key={j} style={{ fontSize: 10, color: '#fff', background: SCOPE_COLORS[ev.scope] || '#b22222', borderRadius: 3, padding: '1px 4px', marginBottom: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{ev.label}</div>
          )}
        />
      </div>

      {selectedDay && (
        <Modal title={fmtDate(selectedDay)} onClose={() => setSelectedDay(null)}>
          {selectedEvents.map((ev, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #333' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{ev.title}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{SCOPE_LABELS[ev.scope] || ev.scope}</div>
                  {ev.start_time && <div style={{ fontSize: 12, color: '#888' }}>{ev.start_time}{ev.end_time ? ` – ${ev.end_time}` : ''}</div>}
                  {ev.description && <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>{ev.description}</div>}
                  {ev.is_recurring && <span style={s.badge('#8b5cf6')}>Recurring · {ev.recurrence}</span>}
                </div>
                {canAddOrgEvents && (
                  <button onClick={() => deleteEvent(ev.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                )}
              </div>
            </div>
          ))}
        </Modal>
      )}

      {showAddModal && (
        <Modal title="Add Org-Wide Event" onClose={() => setShowAddModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={s.label}>Applies To *</label>
              <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} style={s.select}>
                <option value="all">All Houses</option>
                <option value="mens">Men's Houses Only</option>
                <option value="womens">Women's Houses Only</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Event Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={s.input} placeholder="e.g. House Meeting, AA Meeting" />
            </div>
            <div>
              <label style={s.label}>Date *</label>
              <input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} style={s.input} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={s.label}>Start Time</label><input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={s.input} /></div>
              <div><label style={s.label}>End Time</label><input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={s.input} /></div>
            </div>
            <div>
              <label style={s.label}>Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...s.input, height: 70, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="recurring" checked={form.is_recurring} onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))} />
              <label htmlFor="recurring" style={{ color: '#aaa', fontSize: 14, cursor: 'pointer' }}>Recurring event</label>
            </div>
            {form.is_recurring && (
              <div>
                <label style={s.label}>Recurrence</label>
                <select value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))} style={s.select}>
                  {RECURRENCE_OPTIONS.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddModal(false)} style={s.ghost}>Cancel</button>
              <button onClick={saveEvent} disabled={saving} style={s.btn()}>{saving ? 'Saving...' : 'Save Event'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOUSE-SPECIFIC CALENDAR (used inside Houses.js modal tab)
// ═══════════════════════════════════════════════════════════════════════════════
export function HouseCalendarTab({ houseId, houseType }) {
  const { user, isHouseManagerRole, assignedHouseIds, hasFullAccess } = useUser();
  const canEdit = hasFullAccess || (isHouseManagerRole && assignedHouseIds.includes(houseId));
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [events, setEvents] = useState([]);
  const [orgEvents, setOrgEvents] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', event_date: '', start_time: '', end_time: '', is_recurring: false, recurrence: 'weekly' });
  const [saving, setSaving] = useState(false);

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase.from('house_events').select('*').eq('house_id', houseId).order('event_date');
    setEvents(data || []);
  }, [houseId]);

  const fetchOrgEvents = useCallback(async () => {
    // Pull org-wide events that match this house type (all or matching gender)
    const scope = houseType === 'Women' ? ['all', 'womens'] : ['all', 'mens'];
    const { data } = await supabase.from('house_events').select('*').is('house_id', null).in('scope', scope).order('event_date');
    setOrgEvents(data || []);
  }, [houseType]);

  useEffect(() => { fetchEvents(); fetchOrgEvents(); }, [fetchEvents, fetchOrgEvents]);

  const daysInMonth = getDaysInMonth(year, month);

  const expandRecurring = (evList, isOrg) => {
    const result = {};
    evList.forEach(ev => {
      const addToDate = (ymd) => {
        if (!result[ymd]) result[ymd] = [];
        result[ymd].push({ ...ev, label: ev.title, color: isOrg ? '#f59e0b' : '#3b82f6', isOrg });
      };
      if (!ev.is_recurring || ev.recurrence === 'none') {
        if (ev.event_date) addToDate(ev.event_date);
      } else {
        const originDate = new Date(ev.event_date);
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(year, month, d);
          const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          if (ev.recurrence === 'weekly' && date.getDay() === originDate.getDay()) addToDate(ymd);
          else if (ev.recurrence === 'biweekly' && date.getDay() === originDate.getDay()) {
            const diffWeeks = Math.round((date - originDate) / (7 * 24 * 60 * 60 * 1000));
            if (diffWeeks % 2 === 0) addToDate(ymd);
          } else if (ev.recurrence === 'monthly' && date.getDate() === originDate.getDate()) addToDate(ymd);
        }
      }
    });
    return result;
  };

  // Merge house-specific and org events
  const houseExpanded = expandRecurring(events, false);
  const orgExpanded = expandRecurring(orgEvents, true);
  const eventsByDate = {};
  [...Object.keys(houseExpanded), ...Object.keys(orgExpanded)].forEach(ymd => {
    eventsByDate[ymd] = [...(houseExpanded[ymd] || []), ...(orgExpanded[ymd] || [])];
  });

  const saveEvent = async () => {
    if (!form.title || !form.event_date) return alert('Title and date are required.');
    setSaving(true);
    await supabase.from('house_events').insert([{
      title: form.title, description: form.description || null,
      event_date: form.event_date, start_time: form.start_time || null, end_time: form.end_time || null,
      house_id: houseId, scope: null, is_recurring: form.is_recurring,
      recurrence: form.is_recurring ? form.recurrence : 'none', created_by: user?.id,
    }]);
    setSaving(false);
    setShowAddModal(false);
    setForm({ title: '', description: '', event_date: '', start_time: '', end_time: '', is_recurring: false, recurrence: 'weekly' });
    fetchEvents();
  };

  const deleteEvent = async (id) => {
    if (!window.confirm('Delete this event?')) return;
    await supabase.from('house_events').delete().eq('id', id);
    fetchEvents();
    setSelectedDay(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: '#3b82f6' }} /><span style={{ fontSize: 12, color: '#888' }}>This House</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b' }} /><span style={{ fontSize: 12, color: '#888' }}>Org-Wide</span></div>
        </div>
        {canEdit && <button style={{ ...s.btn(), padding: '6px 14px', fontSize: 12 }} onClick={() => setShowAddModal(true)}>+ Add Event</button>}
      </div>

      <CalendarGrid year={year} month={month} eventsByDate={eventsByDate}
        onDayClick={(ymd, evs) => { if (evs.length) { setSelectedDay(ymd); setSelectedEvents(evs); } }}
        onPrev={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
        onNext={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}
        renderDot={(ev, j) => (
          <div key={j} style={{ fontSize: 10, color: '#fff', background: ev.color, borderRadius: 3, padding: '1px 4px', marginBottom: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{ev.label}</div>
        )}
      />

      {selectedDay && (
        <Modal title={fmtDate(selectedDay)} onClose={() => setSelectedDay(null)}>
          {selectedEvents.map((ev, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #333' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{ev.title}</div>
                  {ev.isOrg && <span style={s.badge('#f59e0b')}>Org-Wide</span>}
                  {ev.start_time && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{ev.start_time}{ev.end_time ? ` – ${ev.end_time}` : ''}</div>}
                  {ev.description && <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>{ev.description}</div>}
                  {ev.is_recurring && <span style={s.badge('#8b5cf6')}>Recurring · {ev.recurrence}</span>}
                </div>
                {canEdit && !ev.isOrg && (
                  <button onClick={() => deleteEvent(ev.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                )}
              </div>
            </div>
          ))}
        </Modal>
      )}

      {showAddModal && (
        <Modal title="Add House Event" onClose={() => setShowAddModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={s.label}>Event Title *</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={s.input} placeholder="e.g. House Meeting" /></div>
            <div><label style={s.label}>Date *</label><input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} style={s.input} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={s.label}>Start Time</label><input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={s.input} /></div>
              <div><label style={s.label}>End Time</label><input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={s.input} /></div>
            </div>
            <div><label style={s.label}>Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...s.input, height: 70, resize: 'vertical' }} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="recHouse" checked={form.is_recurring} onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))} />
              <label htmlFor="recHouse" style={{ color: '#aaa', fontSize: 14, cursor: 'pointer' }}>Recurring event</label>
            </div>
            {form.is_recurring && (
              <div><label style={s.label}>Recurrence</label>
                <select value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))} style={s.select}>
                  {RECURRENCE_OPTIONS.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddModal(false)} style={s.ghost}>Cancel</button>
              <button onClick={saveEvent} disabled={saving} style={s.btn()}>{saving ? 'Saving...' : 'Save Event'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAFF VACATION CALENDAR
// ═══════════════════════════════════════════════════════════════════════════════
function VacationCalendar() {
  const { user, hasFullAccess, isUpperManagement, isAdmin } = useUser();
  const canApprove = hasFullAccess || isUpperManagement || isAdmin;
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [requests, setRequests] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [form, setForm] = useState({ start_date: '', end_date: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState('calendar');

  const fetchRequests = useCallback(async () => {
    const { data } = await supabase.from('vacation_requests').select('*').order('created_at', { ascending: false });
    setRequests(data || []);
  }, []);

  const fetchStaff = useCallback(async () => {
    const { data } = await supabase.from('user_profiles').select('id, full_name, email, role');
    setStaffList(data || []);
  }, []);

  useEffect(() => { fetchRequests(); fetchStaff(); }, [fetchRequests, fetchStaff]);

  const eventsByDate = {};
  requests.filter(r => r.status === 'approved').forEach(r => {
    const start = new Date(r.start_date + 'T00:00:00');
    const end = new Date(r.end_date + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ymd = toYMD(d);
      if (!eventsByDate[ymd]) eventsByDate[ymd] = [];
      eventsByDate[ymd].push({ label: r.user_name || 'Staff', ...r });
    }
  });

  const submitRequest = async () => {
    if (!form.start_date || !form.end_date) return alert('Start and end date required.');
    if (form.end_date < form.start_date) return alert('End date must be after start date.');
    setSaving(true);
    const { data: profile } = await supabase.from('user_profiles').select('full_name, email').eq('id', user.id).single();
    await supabase.from('vacation_requests').insert([{
      user_id: user.id, user_name: profile?.full_name || profile?.email || user.email,
      start_date: form.start_date, end_date: form.end_date, notes: form.notes || null, status: 'pending',
    }]);
    const managers = staffList.filter(s => s.role === 'upper_management' || s.role === 'admin');
    if (managers.length > 0) {
      await supabase.from('notifications').insert(managers.map(m => ({
        user_id: m.id,
        message: `${profile?.full_name || user.email} submitted a vacation request for ${fmtDate(form.start_date)} – ${fmtDate(form.end_date)}`,
      })));
    }
    setSaving(false);
    setShowRequestModal(false);
    setForm({ start_date: '', end_date: '', notes: '' });
    fetchRequests();
  };

  const reviewRequest = async (id, status, requestUserId, userName, startDate, endDate) => {
    const { data: me } = await supabase.from('user_profiles').select('full_name, email').eq('id', user.id).single();
    await supabase.from('vacation_requests').update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', id);
    await supabase.from('notifications').insert([{
      user_id: requestUserId,
      message: `Your vacation request (${fmtDate(startDate)} – ${fmtDate(endDate)}) was ${status} by ${me?.full_name || me?.email || 'management'}.`,
    }]);
    fetchRequests();
  };

  const statusColor = (st) => st === 'approved' ? '#10b981' : st === 'denied' ? '#ef4444' : '#f59e0b';
  const pendingRequests = requests.filter(r => r.status === 'pending');
  const myRequests = requests.filter(r => r.user_id === user?.id);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.tabBtn(activeView === 'calendar')} onClick={() => setActiveView('calendar')}>Calendar</button>
          <button style={s.tabBtn(activeView === 'requests')} onClick={() => setActiveView('requests')}>
            Requests {pendingRequests.length > 0 && <span style={s.badge('#f59e0b')}>{pendingRequests.length}</span>}
          </button>
          <button style={s.tabBtn(activeView === 'mine')} onClick={() => setActiveView('mine')}>My Requests</button>
        </div>
        <button style={s.btn()} onClick={() => setShowRequestModal(true)}>+ Request Time Off</button>
      </div>

      {activeView === 'calendar' && (
        <div style={s.card}>
          <CalendarGrid year={year} month={month} eventsByDate={eventsByDate}
            onDayClick={(ymd, evs) => { if (evs.length) { setSelectedDay(ymd); setSelectedEvents(evs); } }}
            onPrev={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
            onNext={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }} />
        </div>
      )}

      {activeView === 'requests' && (
        <div style={s.card}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>{canApprove ? 'All submitted vacation requests' : 'You do not have permission to review requests.'}</div>
          {requests.length === 0 && <div style={{ color: '#555', fontSize: 14 }}>No requests yet.</div>}
          {requests.map(r => (
            <div key={r.id} style={{ padding: '14px 0', borderBottom: '1px solid #333' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{r.user_name}</div>
                  <div style={{ fontSize: 13, color: '#aaa', marginTop: 2 }}>{fmtDate(r.start_date)} – {fmtDate(r.end_date)}</div>
                  {r.notes && <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>{r.notes}</div>}
                  <span style={{ ...s.badge(statusColor(r.status)), marginTop: 4 }}>{r.status}</span>
                </div>
                {canApprove && r.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => reviewRequest(r.id, 'approved', r.user_id, r.user_name, r.start_date, r.end_date)} style={{ ...s.btn('#10b981'), padding: '6px 14px', fontSize: 12 }}>Approve</button>
                    <button onClick={() => reviewRequest(r.id, 'denied', r.user_id, r.user_name, r.start_date, r.end_date)} style={{ ...s.btn('#ef4444'), padding: '6px 14px', fontSize: 12 }}>Deny</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeView === 'mine' && (
        <div style={s.card}>
          {myRequests.length === 0 && <div style={{ color: '#555', fontSize: 14 }}>No requests submitted yet.</div>}
          {myRequests.map(r => (
            <div key={r.id} style={{ padding: '14px 0', borderBottom: '1px solid #333' }}>
              <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{fmtDate(r.start_date)} – {fmtDate(r.end_date)}</div>
              {r.notes && <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>{r.notes}</div>}
              <span style={{ ...s.badge(statusColor(r.status)), marginTop: 4 }}>{r.status}</span>
            </div>
          ))}
        </div>
      )}

      {selectedDay && (
        <Modal title={`Approved time off — ${fmtDate(selectedDay)}`} onClose={() => setSelectedDay(null)}>
          {selectedEvents.map((ev, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid #333' }}>
              <div style={{ fontWeight: 600, color: '#fff' }}>{ev.label}</div>
              <div style={{ fontSize: 12, color: '#888' }}>{fmtDate(ev.start_date)} – {fmtDate(ev.end_date)}</div>
            </div>
          ))}
        </Modal>
      )}

      {showRequestModal && (
        <Modal title="Request Time Off" onClose={() => setShowRequestModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={s.label}>Start Date *</label><input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={s.input} /></div>
            <div><label style={s.label}>End Date *</label><input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={s.input} /></div>
            <div><label style={s.label}>Notes (optional)</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...s.input, height: 70, resize: 'vertical' }} placeholder="Any details..." /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowRequestModal(false)} style={s.ghost}>Cancel</button>
              <button onClick={submitRequest} disabled={saving} style={s.btn()}>{saving ? 'Submitting...' : 'Submit Request'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS BELL
// ═══════════════════════════════════════════════════════════════════════════════
export function NotificationsBell({ userId }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
    setNotifications(data || []);
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markRead = async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    fetchNotifications();
  };

  const markAllRead = async () => {
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    fetchNotifications();
  };

  const unread = notifications.filter(n => !n.read).length;

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 20, position: 'relative', padding: '4px 8px' }}>
        🔔
        {unread > 0 && <span style={{ position: 'absolute', top: 0, right: 0, background: '#b22222', color: '#fff', borderRadius: '50%', fontSize: 10, fontWeight: 700, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 36, width: 320, background: '#1e1e1e', border: '1px solid #333', borderRadius: 12, zIndex: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Notifications</span>
            {unread > 0 && <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer' }}>Mark all read</button>}
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.length === 0 && <div style={{ padding: 16, color: '#555', fontSize: 13 }}>No notifications</div>}
            {notifications.map(n => (
              <div key={n.id} onClick={() => markRead(n.id)} style={{ padding: '12px 16px', borderBottom: '1px solid #2a2a2a', background: n.read ? 'transparent' : '#2a1a1a', cursor: 'pointer' }}>
                <div style={{ fontSize: 13, color: n.read ? '#888' : '#fff' }}>{n.message}</div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{new Date(n.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CALENDARS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Calendars() {
  const [activeTab, setActiveTab] = useState('movein');
  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        <button style={s.tabBtn(activeTab === 'movein')} onClick={() => setActiveTab('movein')}>Move-In Calendar</button>
        <button style={s.tabBtn(activeTab === 'org')} onClick={() => setActiveTab('org')}>Org Events</button>
        <button style={s.tabBtn(activeTab === 'vacation')} onClick={() => setActiveTab('vacation')}>Staff Vacation</button>
      </div>
      {activeTab === 'movein' && <MoveInCalendar />}
      {activeTab === 'org' && <OrgEventsCalendar />}
      {activeTab === 'vacation' && <VacationCalendar />}
    </div>
  );
}