import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';
import ClientPayments from './ClientPayments';

const PAGE_SIZE = 25;
const TIMELINE_PAGE_SIZE = 50;
const SUPABASE_URL = 'https://pmvxnetpbxuzkrxitioc.supabase.co';

const LISTS = ['DOC Men', 'Community Men', 'Treatment Men', 'DOC Women', 'Community Women', 'Treatment Women'];

const STATUS_FLOW = {
  'Applied': ['Accepted', 'Waiting List', 'Pending', 'Active', 'Discharged', 'Denied'],
  'Accepted': ['Applied', 'Waiting List', 'Pending', 'Active', 'Discharged', 'Denied'],
  'Waiting List': ['Applied', 'Accepted', 'Pending', 'Active', 'Discharged', 'Denied'],
  'Pending': ['Applied', 'Accepted', 'Waiting List', 'Active', 'Discharged', 'Denied'],
  'Active': ['Applied', 'Accepted', 'Waiting List', 'Pending', 'Discharged', 'Denied'],
  'Discharged': ['Applied', 'Accepted', 'Waiting List', 'Pending', 'Active', 'Denied'],
  'Denied': ['Applied', 'Accepted', 'Waiting List', 'Pending', 'Active', 'Discharged'],
};

const ENTRY_TYPES = ['UA', 'Crisis', 'Meeting', 'Chores', 'Mood Check-In', 'Check-In', 'General Note', 'Weekly Reflection'];

const reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    if (data && data.display_name) {
      const a = data.address || {};
      const parts = [
        a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road,
        a.city || a.town || a.village,
        a.state,
      ].filter(Boolean);
      return parts.join(', ') || data.display_name;
    }
    return null;
  } catch { return null; }
};

const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatWeekLabel = (weekStart) => {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${weekStart.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
};

const groupByWeek = (entries) => {
  const weeks = {};
  entries.forEach((entry) => {
    const weekStart = getWeekStart(new Date(entry.created_at));
    const key = weekStart.toISOString();
    if (!weeks[key]) weeks[key] = { weekStart, entries: [] };
    weeks[key].entries.push(entry);
  });
  return Object.values(weeks).sort((a, b) => b.weekStart - a.weekStart);
};

// ── Invite to Portal Button ───────────────────────────────────────────────────
function InvitePortalButton({ client }) {
  const [status, setStatus] = useState('idle');

  const handleInvite = async (e) => {
    e.stopPropagation();
    if (status === 'sent') return;
    if (!window.confirm(`Send a portal invite to ${client.email}?`)) return;
    setStatus('sending');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: client.email }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Invite failed');
      setStatus('sent');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const btnStyles = {
    idle:    { background: 'transparent', border: '1px solid #444', color: '#aaa' },
    sending: { background: 'transparent', border: '1px solid #444', color: '#aaa', opacity: 0.6 },
    sent:    { background: '#1e3a2f', border: '1px solid #1D9E75', color: '#4ade80' },
    error:   { background: '#3a1e1e', border: '1px solid #f87171', color: '#f87171' },
  };
  const btnLabel = { idle: '✉ Invite to Portal', sending: 'Sending...', sent: '✓ Invite Sent', error: 'Error — retry?' };

  return (
    <button onClick={handleInvite} style={{ ...btnStyles[status], fontSize: '12px', padding: '4px 12px', borderRadius: '8px', cursor: status === 'sent' ? 'default' : 'pointer', fontWeight: '500', transition: 'all 0.2s' }}>
      {btnLabel[status]}
    </button>
  );
}

// ── Weekly Reflection Form ────────────────────────────────────────────────────
function WeeklyReflectionForm({ entryForm, setEntryForm }) {
  return (
    <>
      <div style={{ marginBottom: '12px' }}>
        <label style={sf.label}>Overall mood this week (1–10): {entryForm.reflection_mood || 5}</label>
        <input type="range" min="1" max="10" value={entryForm.reflection_mood || 5}
          onChange={e => setEntryForm(p => ({ ...p, reflection_mood: e.target.value }))} style={{ width: '100%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#555', marginTop: '2px' }}>
          <span>1 — Rough</span><span>10 — Great</span>
        </div>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={sf.label}>Biggest challenge this week</label>
        <textarea value={entryForm.reflection_challenge || ''} onChange={e => setEntryForm(p => ({ ...p, reflection_challenge: e.target.value }))}
          style={{ ...sf.input, resize: 'vertical' }} rows={2} placeholder="What was hard this week?" />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={sf.label}>A win or something you're proud of</label>
        <textarea value={entryForm.reflection_win || ''} onChange={e => setEntryForm(p => ({ ...p, reflection_win: e.target.value }))}
          style={{ ...sf.input, resize: 'vertical' }} rows={2} placeholder="What went well or what are you proud of?" />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={sf.label}>Goals for next week</label>
        <textarea value={entryForm.reflection_goals || ''} onChange={e => setEntryForm(p => ({ ...p, reflection_goals: e.target.value }))}
          style={{ ...sf.input, resize: 'vertical' }} rows={2} placeholder="What do you want to focus on next week?" />
      </div>
    </>
  );
}

// ── Weekly Reflection Display ─────────────────────────────────────────────────
function WeeklyReflectionCard({ entry }) {
  let data = null;
  try { data = entry.reflection_data ? JSON.parse(entry.reflection_data) : null; } catch { data = null; }
  return (
    <div style={{ marginTop: '6px' }}>
      {data?.mood && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: '#555' }}>Mood:</span>
          <span style={{ ...st.badge, background: '#3a2d1e', color: '#fb923c' }}>{data.mood}/10</span>
        </div>
      )}
      {data?.challenge && <div style={{ marginBottom: '8px' }}><p style={{ fontSize: '11px', color: '#555', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Challenge</p><p style={{ fontSize: '13px', color: '#aaa', margin: 0, lineHeight: 1.5 }}>{data.challenge}</p></div>}
      {data?.win && <div style={{ marginBottom: '8px' }}><p style={{ fontSize: '11px', color: '#555', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Win</p><p style={{ fontSize: '13px', color: '#aaa', margin: 0, lineHeight: 1.5 }}>{data.win}</p></div>}
      {data?.goals && <div style={{ marginBottom: '8px' }}><p style={{ fontSize: '11px', color: '#555', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Goals for next week</p><p style={{ fontSize: '13px', color: '#aaa', margin: 0, lineHeight: 1.5 }}>{data.goals}</p></div>}
      {entry.notes && <div><p style={{ fontSize: '11px', color: '#555', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Additional notes</p><p style={{ fontSize: '13px', color: '#aaa', margin: 0, lineHeight: 1.5 }}>{entry.notes}</p></div>}
    </div>
  );
}

function Clients() {
  const { hasFullAccess, isHouseManagerRole, assignedHouseIds, user } = useUser();

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [viewMode, setViewMode] = useState('operational');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [statusModal, setStatusModal] = useState(null);
  const [statusForm, setStatusForm] = useState({
    list_type: 'DOC Men', move_in_date: '', discharge_reason: '', discharge_notes: '', house_id: '',
  });

  const [houses, setHouses] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineLoadingMore, setTimelineLoadingMore] = useState(false);

  const [uaRecords, setUaRecords] = useState([]);
  const [meetingRecords, setMeetingRecords] = useState([]);
  const [choreRecords, setChoreRecords] = useState([]);

  const [locationLabels, setLocationLabels] = useState({});
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [entryType, setEntryType] = useState('General Note');
  const [entryForm, setEntryForm] = useState({
    author: '', notes: '', severity: 'Low', meeting_name: '', chore_name: '',
    chore_status: 'Completed', mood_value: '5', ua_result: 'Negative',
    checkin_status: 'Here', latitude: '', longitude: '', pinDropped: false,
    reflection_mood: '5', reflection_challenge: '', reflection_win: '', reflection_goals: '',
  });
  const [editingField, setEditingField] = useState(null);
  const [expandedWeeks, setExpandedWeeks] = useState({});

  const debounceTimer = useRef(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { setDebouncedSearch(search.trim()); setCurrentPage(1); }, 300);
    return () => clearTimeout(debounceTimer.current);
  }, [search]);

  useEffect(() => { setCurrentPage(1); }, [statusFilter]);

  const applyClientFilters = useCallback((query) => {
    if (debouncedSearch) query = query.ilike('full_name', `%${debouncedSearch}%`);
    if (statusFilter !== 'All') query = query.eq('status', statusFilter);
    if (isHouseManagerRole && assignedHouseIds.length > 0) query = query.in('house_id', assignedHouseIds);
    return query;
  }, [debouncedSearch, statusFilter, isHouseManagerRole, assignedHouseIds]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      if (isHouseManagerRole && assignedHouseIds.length === 0) { setClients([]); setTotalCount(0); setLoading(false); return; }
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let countQuery = supabase.from('clients').select('id', { count: 'exact', head: true });
      countQuery = applyClientFilters(countQuery);
      const { count, error: countError } = await countQuery;
      if (countError) { console.error(countError); setClients([]); setTotalCount(0); return; }
      setTotalCount(count || 0);
      let dataQuery = supabase.from('clients').select('*, houses(name, house_manager)').order('created_at', { ascending: false }).range(from, to);
      dataQuery = applyClientFilters(dataQuery);
      const { data, error: dataError } = await dataQuery;
      if (dataError) { console.error(dataError); setClients([]); return; }
      setClients((data || []).map(c => ({ ...c, house_name: c.houses?.name || null, house_manager: c.houses?.house_manager || null })));
    } catch (err) { console.error(err); setClients([]); setTotalCount(0); }
    finally { setLoading(false); }
  }, [currentPage, isHouseManagerRole, assignedHouseIds, applyClientFilters]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const fetchHouses = useCallback(async () => {
    const { data } = await supabase.from('houses').select('id, name, type').order('name');
    setHouses(data || []);
  }, []);

  useEffect(() => { fetchHouses(); }, [fetchHouses]);

  const fetchTimeline = async (clientId, append = false) => {
    if (append) setTimelineLoadingMore(true);
    else setTimelineLoading(true);
    try {
      if (!append) {
        const { count } = await supabase.from('client_timeline').select('id', { count: 'exact', head: true }).eq('client_id', clientId);
        setTimelineTotal(count || 0);
      }
      const from = append ? timeline.length : 0;
      const to = from + TIMELINE_PAGE_SIZE - 1;
      const { data, error } = await supabase.from('client_timeline').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).range(from, to);
      if (error) { console.error(error); return; }
      const entries = data || [];
      if (append) { setTimeline(prev => [...prev, ...entries]); }
      else {
        setTimeline(entries);
        setLocationLabels({});
        const thisWeekKey = getWeekStart(new Date()).toISOString();
        setExpandedWeeks({ [thisWeekKey]: true });
      }
      entries.forEach(async entry => {
        if (entry.latitude && entry.longitude) {
          const address = await reverseGeocode(entry.latitude, entry.longitude);
          if (address) setLocationLabels(prev => ({ ...prev, [entry.id]: address }));
        }
      });
    } catch (err) { console.error(err); }
    finally { setTimelineLoading(false); setTimelineLoadingMore(false); }
  };

  const fetchFullHistory = async (clientId) => {
    const { data } = await supabase.from('client_timeline').select('*').eq('client_id', clientId).in('entry_type', ['UA', 'Meeting', 'Chores']).order('created_at', { ascending: false });
    const all = data || [];
    setUaRecords(all.filter(e => e.entry_type === 'UA'));
    setMeetingRecords(all.filter(e => e.entry_type === 'Meeting'));
    setChoreRecords(all.filter(e => e.entry_type === 'Chores'));
  };

  const toggleWeek = (key) => setExpandedWeeks(prev => ({ ...prev, [key]: !prev[key] }));

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasMoreTimeline = timeline.length < timelineTotal;

  const statusFilters = hasFullAccess
    ? viewMode === 'operational' ? ['All', 'Applied', 'Accepted', 'Waiting List', 'Pending', 'Active'] : ['All', 'Discharged', 'Denied']
    : ['All', 'Active', 'Pending'];

  const statusColor = (s) => {
    if (s === 'Applied') return { bg: '#1e3a2f', color: '#4ade80' };
    if (s === 'Accepted') return { bg: '#1e2d3a', color: '#60a5fa' };
    if (s === 'Waiting List') return { bg: '#3a2d1e', color: '#fb923c' };
    if (s === 'Pending') return { bg: '#2d2d1e', color: '#facc15' };
    if (s === 'Active') return { bg: '#2d1e3a', color: '#c084fc' };
    if (s === 'Discharged') return { bg: '#3a1e1e', color: '#f87171' };
    if (s === 'Denied') return { bg: '#2a2a2a', color: '#888' };
    return { bg: '#2a2a2a', color: '#aaa' };
  };

  const uaResultColor = (result) => {
    if (result === 'Negative') return { bg: '#1e3a2f', color: '#4ade80' };
    if (result === 'Positive') return { bg: '#3a1e1e', color: '#f87171' };
    if (result === 'Inconclusive') return { bg: '#3a2d1e', color: '#fb923c' };
    if (result === 'Refused') return { bg: '#2a2a2a', color: '#888' };
    return { bg: '#2a2a2a', color: '#aaa' };
  };

  const choreStatusColor = (status) => {
    if (status === 'Completed') return { bg: '#1e3a2f', color: '#4ade80' };
    if (status === 'Not Completed') return { bg: '#3a1e1e', color: '#f87171' };
    if (status === 'Partial') return { bg: '#3a2d1e', color: '#fb923c' };
    return { bg: '#2a2a2a', color: '#aaa' };
  };

  const entryColor = (type) => {
    if (type === 'House Check-In') return '#7F77DD';
    if (type === 'Batch UA') return '#1D9E75';
    if (type === 'Crisis') return '#E24B4A';
    if (type === 'Event Attendance') return '#378ADD';
    if (type === 'Meeting') return '#60a5fa';
    if (type === 'Mood Check-In') return '#BA7517';
    if (type === 'Check-In') return '#c084fc';
    if (type === 'UA') return '#f472b6';
    if (type === 'General Note') return '#f59e0b';
    if (type === 'Chores') return '#34d399';
    if (type === 'Weekly Reflection') return '#a78bfa';
    return '#888';
  };

  const initials = (name) => name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '??';
  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const formatDateShort = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const openStatusModal = (client, newStatus) => {
    setStatusModal({ client, newStatus });
    setStatusForm({ list_type: 'DOC Men', move_in_date: '', discharge_reason: '', discharge_notes: '', house_id: client.house_id || '' });
  };

  const confirmStatusChange = async () => {
    const { client, newStatus } = statusModal;
    const updates = { status: newStatus };

    if (newStatus === 'Waiting List') {
      const { error: wlError } = await supabase.from('waiting_list').insert([{
        full_name: client.full_name, email: client.email || null, phone: client.phone || null,
        list_type: statusForm.list_type, position: 999, status: 'waiting', application_id: client.application_id || null,
      }]);
      if (wlError) { alert('Error adding to waiting list: ' + wlError.message); return; }
    }

    if (newStatus === 'Pending') {
      if (!statusForm.house_id) { alert('Please select a house.'); return; }
      updates.house_id = statusForm.house_id;
      updates.expected_move_in_date = statusForm.expected_move_in_date || null;
      const { data: houseData } = await supabase.from('houses').select('occupied_beds').eq('id', statusForm.house_id).single();
      if (houseData) await supabase.from('houses').update({ occupied_beds: (houseData.occupied_beds || 0) + 1 }).eq('id', statusForm.house_id);
    }

    if (newStatus === 'Active') {
      updates.start_date = statusForm.move_in_date || null;
      updates.level = 1;
      updates.expected_move_in_date = null; // clear it once they actually move in
      const houseId = statusForm.house_id || client.house_id;
      if (houseId) {
        updates.house_id = houseId;
        if (houseId !== client.house_id || client.status !== 'Pending') {
          const { data: houseData } = await supabase.from('houses').select('occupied_beds').eq('id', houseId).single();
          if (houseData) await supabase.from('houses').update({ occupied_beds: (houseData.occupied_beds || 0) + 1 }).eq('id', houseId);
        }
      }
      const roomType = client.room_type || 'Double';
      const feeAmounts = { 'Single': 150, 'Double': 150, 'Houseperson': 150, 'Live-Out': 0 };
      const moveInAmount = feeAmounts[roomType] ?? 150;
      if (moveInAmount > 0) {
        await supabase.from('charges').insert([{
          client_id: client.id, charge_type: 'move_in_fee', amount: moveInAmount,
          due_date: statusForm.move_in_date || new Date().toISOString().split('T')[0],
          description: 'Move-in fee', status: 'unpaid', amount_paid: 0, created_by: user?.email || null,
        }]);
      }
    }

    if (newStatus === 'Discharged') {
      if (!statusForm.discharge_reason) { alert('Please select a reason for discharge.'); return; }
      updates.discharge_date = new Date().toISOString().split('T')[0];
      updates.reason_for_discharge = statusForm.discharge_reason;
      updates.discharge_notes = statusForm.discharge_notes || null;
      updates.discharged_by = user?.email || user?.id || null;
      updates.level = null;
      if (client.house_id) {
        const { data: houseData } = await supabase.from('houses').select('occupied_beds').eq('id', client.house_id).single();
        if (houseData) await supabase.from('houses').update({ occupied_beds: Math.max((houseData.occupied_beds || 0) - 1, 0) }).eq('id', client.house_id);
      }
    }

    const { error } = await supabase.from('clients').update(updates).eq('id', client.id);
    if (error) { alert('Error updating status: ' + error.message); return; }
    setStatusModal(null);
    fetchClients();
    if (selected?.id === client.id) setSelected({ ...selected, ...updates });
  };

  const dropPin = () => {
    if (!navigator.geolocation) { alert('Geolocation is not supported by your browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setEntryForm(p => ({ ...p, latitude: pos.coords.latitude.toString(), longitude: pos.coords.longitude.toString(), pinDropped: true })),
      () => alert('Unable to get location. Please allow location access.')
    );
  };

  const saveTimelineEntry = async () => {
    if (!entryForm.author) { alert('Author is required.'); return; }
    let reflectionData = null;
    if (entryType === 'Weekly Reflection') {
      reflectionData = JSON.stringify({
        mood: entryForm.reflection_mood, challenge: entryForm.reflection_challenge,
        win: entryForm.reflection_win, goals: entryForm.reflection_goals,
      });
    }
    const { error } = await supabase.from('client_timeline').insert([{
      client_id: selected.id, entry_type: entryType, author: entryForm.author,
      notes: entryForm.notes || null, severity: entryType === 'Crisis' ? entryForm.severity : null,
      event_name: entryType === 'UA' ? entryForm.ua_result : entryType === 'Chores' ? entryForm.chore_status : null,
      meeting_name: entryType === 'Meeting' ? entryForm.meeting_name : entryType === 'Chores' ? entryForm.chore_name : null,
      mood_value: entryType === 'Mood Check-In' ? parseInt(entryForm.mood_value) : null,
      reflection_data: reflectionData,
      latitude: entryForm.latitude ? parseFloat(entryForm.latitude) : null,
      longitude: entryForm.longitude ? parseFloat(entryForm.longitude) : null,
      source: 'staff',
    }]);
    if (error) { alert('Error saving entry: ' + error.message); return; }
    setShowAddEntry(false);
    setEntryForm({ author: '', notes: '', severity: 'Low', meeting_name: '', chore_name: '', chore_status: 'Completed', mood_value: '5', ua_result: 'Negative', checkin_status: 'Here', latitude: '', longitude: '', pinDropped: false, reflection_mood: '5', reflection_challenge: '', reflection_win: '', reflection_goals: '' });
    setEntryType('General Note');
    fetchTimeline(selected.id);
    fetchFullHistory(selected.id);
  };

  const deleteTimelineEntry = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    await supabase.from('client_timeline').delete().eq('id', id);
    fetchTimeline(selected.id);
    fetchFullHistory(selected.id);
  };

  const openProfile = (client) => {
    setSelected(client);
    setActiveTab('overview');
    setEditingField(null);
    setTimeline([]);
    setTimelineTotal(0);
    fetchTimeline(client.id);
    fetchFullHistory(client.id);
  };

  const updateLevel = async (clientId, lvl) => {
    await supabase.from('clients').update({ level: lvl }).eq('id', clientId);
    fetchClients();
    setSelected(prev => prev ? { ...prev, level: lvl } : prev);
  };

  const saveNotes = async (e) => {
    const newNotes = e.target.value;
    await supabase.from('clients').update({ client_notes: newNotes || null }).eq('id', selected.id);
    setSelected(prev => ({ ...prev, client_notes: newNotes }));
    setClients(prev => prev.map(c => c.id === selected.id ? { ...c, client_notes: newNotes } : c));
  };

  const startEdit = (field, currentValue) => setEditingField({ field, value: currentValue || '' });

  const saveField = async () => {
    if (!editingField) return;
    const { field, value } = editingField;
    await supabase.from('clients').update({ [field]: value || null }).eq('id', selected.id);
    setSelected(prev => ({ ...prev, [field]: value }));
    setClients(prev => prev.map(c => c.id === selected.id ? { ...c, [field]: value } : c));
    setEditingField(null);
  };

  const EditableField = ({ label, field, value, alert: isAlert, options }) => {
    const isEditing = editingField?.field === field;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #333', gap: '12px' }}>
        <span style={{ fontSize: '12px', color: '#666', flexShrink: 0 }}>{label}</span>
        {isEditing ? (
          options ? (
            <select autoFocus value={editingField.value} onChange={e => setEditingField(p => ({ ...p, value: e.target.value }))} onBlur={saveField}
              style={{ background: '#111', border: '1px solid #555', borderRadius: '4px', color: '#fff', fontSize: '13px', padding: '1px 6px', outline: 'none', maxWidth: '200px' }}>
              <option value="">—</option>
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input autoFocus value={editingField.value} onChange={e => setEditingField(p => ({ ...p, value: e.target.value }))} onBlur={saveField}
              onKeyDown={e => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') setEditingField(null); }}
              style={{ background: '#111', border: '1px solid #555', borderRadius: '4px', color: '#fff', fontSize: '13px', padding: '1px 6px', outline: 'none', width: '100%', maxWidth: '200px', textAlign: 'right' }} />
          )
        ) : (
          <span onClick={() => startEdit(field, value)} title="Click to edit"
            style={{ fontSize: '13px', color: isAlert ? '#f87171' : value ? '#ddd' : '#444', textAlign: 'right', wordBreak: 'break-word', cursor: 'text', padding: '1px 4px', borderRadius: '4px', border: '1px solid transparent', transition: 'border-color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#444'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
            {value || '—'}
          </span>
        )}
      </div>
    );
  };

  const ReadField = ({ label, value, alert: isAlert }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #333', gap: '12px' }}>
      <span style={{ fontSize: '12px', color: '#666', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '13px', color: isAlert ? '#f87171' : value ? '#ddd' : '#444', textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  );

  const Avatar = ({ name, photoUrl, size = 34, fontSize = 13 }) => (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#1e3a2f', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize, fontWeight: '500', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
      {photoUrl ? <img src={photoUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, borderRadius: '50%' }} /> : initials(name)}
    </div>
  );

  const LocationPin = ({ entryId, lat, lng }) => {
    const address = locationLabels[entryId];
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    return (
      <div style={{ background: '#222', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span>📍</span>
          <span style={{ fontSize: '12px', color: '#aaa', lineHeight: '1.4' }}>{address || `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`}</span>
        </div>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#60a5fa', textDecoration: 'none', whiteSpace: 'nowrap', padding: '3px 8px', border: '1px solid #2a3d52', borderRadius: '4px', flexShrink: 0 }}>View map →</a>
      </div>
    );
  };

  const MeetingWeek = ({ weekStart, entries }) => {
    const key = weekStart.toISOString();
    const isExpanded = expandedWeeks[key];
    const isThisWeek = getWeekStart(new Date()).toISOString() === key;
    const count = entries.length;
    const meetsGoal = count >= 4;
    return (
      <div style={{ background: '#1a1a1a', borderRadius: '10px', border: `1px solid ${isThisWeek ? '#2a3d52' : '#333'}`, marginBottom: '10px', overflow: 'hidden' }}>
        <div onClick={() => toggleWeek(key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: '#ddd', fontWeight: '500' }}>{formatWeekLabel(weekStart)}</span>
            {isThisWeek && <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', background: '#1e2d3a', color: '#60a5fa', fontWeight: '600' }}>This week</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: meetsGoal ? '#4ade80' : '#f87171' }}>{count} / 4 meetings</span>
            <span style={{ fontSize: '11px', color: meetsGoal ? '#4ade80' : '#f87171' }}>{meetsGoal ? '✓' : '✗'}</span>
            <span style={{ color: '#555', fontSize: '13px' }}>{isExpanded ? '▲' : '▼'}</span>
          </div>
        </div>
        {isExpanded && (
          <div style={{ borderTop: '1px solid #333', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {entries.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', color: '#60a5fa', fontWeight: '500' }}>{m.meeting_name || 'Meeting'}</span>
                    <span style={{ fontSize: '11px', color: '#555' }}>by {m.author}</span>
                  </div>
                  {m.latitude && m.longitude && <LocationPin entryId={m.id} lat={m.latitude} lng={m.longitude} />}
                  {m.notes && <p style={{ color: '#888', fontSize: '12px', margin: '4px 0 0 0', lineHeight: '1.4' }}>{m.notes}</p>}
                </div>
                <span style={{ fontSize: '11px', color: '#555', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatDateShort(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const ChoreWeek = ({ weekStart, entries }) => {
    const key = weekStart.toISOString();
    const isExpanded = expandedWeeks[key];
    const isThisWeek = getWeekStart(new Date()).toISOString() === key;
    const completed = entries.filter(c => c.event_name === 'Completed').length;
    const notCompleted = entries.filter(c => c.event_name === 'Not Completed').length;
    const partial = entries.filter(c => c.event_name === 'Partial').length;
    const total = entries.length;
    const allDone = total > 0 && notCompleted === 0 && partial === 0;
    return (
      <div style={{ background: '#1a1a1a', borderRadius: '10px', border: `1px solid ${isThisWeek ? '#1a3a2a' : '#333'}`, marginBottom: '10px', overflow: 'hidden' }}>
        <div onClick={() => toggleWeek(key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: '#ddd', fontWeight: '500' }}>{formatWeekLabel(weekStart)}</span>
            {isThisWeek && <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', background: '#1e3a2f', color: '#4ade80', fontWeight: '600' }}>This week</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {completed > 0 && <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#1e3a2f', color: '#4ade80' }}>{completed} done</span>}
              {partial > 0 && <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#3a2d1e', color: '#fb923c' }}>{partial} partial</span>}
              {notCompleted > 0 && <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#3a1e1e', color: '#f87171' }}>{notCompleted} missed</span>}
            </div>
            <span style={{ color: allDone ? '#4ade80' : notCompleted > 0 ? '#f87171' : '#fb923c', fontSize: '11px' }}>{allDone ? '✓' : '✗'}</span>
            <span style={{ color: '#555', fontSize: '13px' }}>{isExpanded ? '▲' : '▼'}</span>
          </div>
        </div>
        {isExpanded && (
          <div style={{ borderTop: '1px solid #333', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {entries.map(c => {
              const col = choreStatusColor(c.event_name);
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, flexWrap: 'wrap' }}>
                    <span style={{ ...st.badge, background: col.bg, color: col.color, fontSize: '11px' }}>{c.event_name}</span>
                    {c.meeting_name && <span style={{ fontSize: '13px', color: '#ddd', fontWeight: '500' }}>{c.meeting_name}</span>}
                    <span style={{ fontSize: '11px', color: '#555' }}>by {c.author}</span>
                    {c.notes && <span style={{ fontSize: '11px', color: '#666' }}>— {c.notes}</span>}
                  </div>
                  <span style={{ fontSize: '11px', color: '#555', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatDateShort(c.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const TABS = ['overview', 'payments', 'UAs', 'meetings', 'chores', 'medications', 'timeline', 'application', 'documents', 'notes'];
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalCount);

  return (
    <div style={st.page}>
      <div style={st.header}>
        <h2 style={st.title}>Clients</h2>
        <p style={st.sub}>
          {totalCount > 0
            ? `Showing ${rangeStart}–${rangeEnd} of ${totalCount} ${statusFilter === 'All' ? (viewMode === 'archive' ? 'archived' : 'total') : statusFilter.toLowerCase()}`
            : `0 ${statusFilter === 'All' ? (viewMode === 'archive' ? 'archived' : 'total') : statusFilter.toLowerCase()}`}
          {isHouseManagerRole ? ' in your house(s)' : ''}
        </p>
      </div>

      <div style={st.toolbar}>
        <input placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)} style={st.search} />
        {hasFullAccess && (
          <div style={st.viewToggleWrap}>
            <button onClick={() => { setViewMode('operational'); setStatusFilter('Active'); setCurrentPage(1); }} style={{ ...st.filterBtn, ...(viewMode === 'operational' ? st.filterActive : {}) }}>Operational</button>
            <button onClick={() => { setViewMode('archive'); setStatusFilter('Discharged'); setCurrentPage(1); }} style={{ ...st.filterBtn, ...(viewMode === 'archive' ? st.filterActive : {}) }}>Archive</button>
          </div>
        )}
        <div style={st.filters}>
          {statusFilters.map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{ ...st.filterBtn, ...(statusFilter === f ? st.filterActive : {}) }}>{f}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#888', padding: '20px' }}>Loading clients...</p>
      ) : clients.length === 0 ? (
        <p style={{ color: '#888', padding: '20px' }}>{isHouseManagerRole ? 'No clients found in your assigned house(s).' : 'No clients found.'}</p>
      ) : (
        <>
          <div style={st.table}>
            <div style={st.tableHeader}>
              <span style={{ flex: 2 }}>Name</span>
              <span style={{ flex: 1 }}>Status</span>
              <span style={{ flex: 1 }}>Level</span>
              <span style={{ flex: 2 }}>House</span>
              <span style={{ flex: 1 }}>Start Date</span>
            </div>
            {clients.map(c => (
              <div key={c.id} style={st.row} onClick={() => openProfile(c)}>
                <span style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Avatar name={c.full_name} photoUrl={c.photo_url} size={34} fontSize={13} />
                  <span style={{ color: '#fff', fontWeight: '500' }}>{c.full_name}</span>
                </span>
                <span style={{ flex: 1 }}><span style={{ ...st.badge, background: statusColor(c.status).bg, color: statusColor(c.status).color }}>{c.status || '—'}</span></span>
                <span style={{ flex: 1, color: '#aaa' }}>{c.status === 'Active' && c.level ? `Level ${c.level}` : '—'}</span>
                <span style={{ flex: 2, color: '#aaa' }}>{c.house_name || '—'}</span>
                <span style={{ flex: 1, color: '#aaa' }}>{c.start_date || '—'}</span>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div style={st.pagination}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ ...st.pageBtn, ...(currentPage === 1 ? st.pageBtnDisabled : {}) }}>← Previous</button>
              <div style={st.pageNumbers}>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                  .reduce((acc, p, idx, arr) => { if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...'); acc.push(p); return acc; }, [])
                  .map((p, i) => p === '...' ? (
                    <span key={`ellipsis-${i}`} style={st.ellipsis}>…</span>
                  ) : (
                    <button key={p} onClick={() => setCurrentPage(p)} style={{ ...st.pageBtn, ...(currentPage === p ? st.pageBtnActive : {}) }}>{p}</button>
                  ))}
              </div>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ ...st.pageBtn, ...(currentPage === totalPages ? st.pageBtnDisabled : {}) }}>Next →</button>
            </div>
          )}
        </>
      )}

      {selected && (
        <div style={st.overlay} onClick={() => { setSelected(null); setEditingField(null); }}>
          <div style={st.modal} onClick={e => e.stopPropagation()}>
            <div style={st.modalHeader}>
              <Avatar name={selected.full_name} photoUrl={selected.photo_url} size={52} fontSize={16} />
              <div style={{ flex: 1 }}>
                <h2 style={st.modalName}>{selected.full_name}</h2>
                <p style={st.modalSub}>{selected.house_name || 'No house assigned'} &nbsp;·&nbsp; {selected.start_date ? `Started ${selected.start_date}` : 'No start date'}</p>
                <div style={st.badges}>
                  <span style={{ ...st.badge, background: statusColor(selected.status).bg, color: statusColor(selected.status).color }}>{selected.status || 'Applied'}</span>
                  {selected.status === 'Active' && (
                    <select value={selected.level || 1} onChange={e => updateLevel(selected.id, parseInt(e.target.value))} onClick={e => e.stopPropagation()}
                      style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '20px', fontWeight: '500', background: '#1e2d3a', color: '#60a5fa', border: '1px solid #2a3d52', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', outline: 'none' }}>
                      <option value={1}>Level 1</option><option value={2}>Level 2</option><option value={3}>Level 3</option><option value={4}>Level 4</option>
                    </select>
                  )}
                  {selected.sor_grant && <span style={{ ...st.badge, background: '#3a2d1e', color: '#fb923c' }}>SOR grant</span>}
                </div>
                {hasFullAccess && STATUS_FLOW[selected.status]?.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: '#666' }}>Move to:</span>
                    <select defaultValue="" onChange={e => { if (e.target.value) openStatusModal(selected, e.target.value); e.target.value = ''; }}
                      style={{ backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '4px 10px', color: '#fff', fontSize: '12px', cursor: 'pointer' }}>
                      <option value="">Select status...</option>
                      {STATUS_FLOW[selected.status].map(ns => <option key={ns} value={ns}>{ns}</option>)}
                    </select>
                    {selected.email && <InvitePortalButton client={selected} />}
                  </div>
                )}
              </div>
              <button onClick={() => { setSelected(null); setEditingField(null); }} style={st.closeBtn}>×</button>
            </div>

            <div style={st.tabs}>
              {TABS.map(t => (
                <button key={t} onClick={() => { setActiveTab(t); setEditingField(null); }} style={{ ...st.tab, ...(activeTab === t ? st.tabActive : {}) }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div style={st.modalBody}>
              {activeTab === 'overview' && (
                <>
                  <p style={{ fontSize: '11px', color: '#555', margin: '0 0 12px 0', fontStyle: 'italic' }}>Click any field to edit. Changes save automatically.</p>
                  <div style={st.grid}>
                    <Card title="Contact info">
                      <EditableField label="Phone" field="phone" value={selected.phone} />
                      <EditableField label="Email" field="email" value={selected.email} />
                      <EditableField label="DOB" field="date_of_birth" value={selected.date_of_birth} />
                      <EditableField label="Gender" field="gender" value={selected.gender} options={['Male', 'Female', 'Non-binary', 'No Response']} />
                      <EditableField label="Ethnicity" field="ethnicity" value={selected.ethnicity} options={['American Indian or Alaska Native', 'Asian', 'Black or African American', 'Hispanic or Latino', 'Native Hawaiian or Other Pacific Islander', 'White', 'Two or More Races', 'No Response']} />
                      <EditableField label="Marital status" field="marital_status" value={selected.marital_status} options={['Single', 'Married', 'Divorced', 'Widowed', 'Separated']} />
                      <EditableField label="Emergency contact" field="emergency_contact_name" value={selected.emergency_contact_name} />
                    </Card>
                    <Card title="House assignment">
                      <ReadField label="House" value={selected.house_name} />
                      <EditableField label="Room type" field="room_type" value={selected.room_type} options={['Single', 'Double', 'Houseperson']} />
                      <ReadField label="House manager" value={selected.house_manager} />
                      <ReadField label="Move-in date" value={selected.start_date} />
                      {/* Show expected move-in date for Pending clients */}
                      {selected.status === 'Pending' && (
                        <EditableField label="Expected move-in" field="expected_move_in_date" value={selected.expected_move_in_date} />
                      )}
                    </Card>
                    <Card title="PO & legal">
                      <EditableField label="PO name" field="po_name" value={selected.po_name} />
                      <EditableField label="PO phone" field="po_phone" value={selected.po_phone} />
                      <EditableField label="Personal status" field="personal_status" value={selected.personal_status} alert={selected.personal_status === 'Currently Incarcerated'} options={['Currently Incarcerated', 'Homeless', 'Housing Insecure', 'Currently staying at Inpatient Treatment', 'Currently being referred by Recovery Community Center']} />
                      <EditableField label="Sex offense" field="sex_offender" value={selected.sex_offender} options={['Yes', 'No']} />
                      <EditableField label="On probation" field="on_probation" value={selected.on_probation} options={['Yes', 'No']} />
                      <EditableField label="On parole" field="on_parole" value={selected.on_parole} options={['Yes', 'No']} />
                    </Card>
                    <Card title="Sponsor">
                      <EditableField label="Sponsor name" field="sponsor_name" value={selected.sponsor_name} />
                      <EditableField label="Sponsor phone" field="sponsor_phone" value={selected.sponsor_phone} />
                      <EditableField label="Recovery meetings" field="recovery_meetings" value={selected.recovery_meetings} options={['AA', 'NA', 'Both AA & NA', 'Smart Recovery', 'Other', 'None']} />
                    </Card>
                    <Card title="Recovery">
                      <EditableField label="Substance history" field="substance_history" value={selected.substance_history} options={['Yes', 'No']} />
                      <EditableField label="Drug of choice" field="drug_of_choice" value={selected.drug_of_choice} />
                      <EditableField label="Sober date" field="sober_date" value={selected.sober_date} />
                      <EditableField label="Treatment history" field="treatment_history" value={selected.treatment_history} options={['Yes', 'No']} />
                      <EditableField label="OUD" field="oud" value={selected.oud} options={['Yes', 'No']} />
                    </Card>
                    <Card title="Goals">
                      <EditableField label="Goal 1" field="goal_1" value={selected.goal_1} />
                      <EditableField label="Goal 2" field="goal_2" value={selected.goal_2} />
                      <EditableField label="Goal 3" field="goal_3" value={selected.goal_3} />
                    </Card>
                  </div>
                </>
              )}

              {activeTab === 'UAs' && (
                <Card title="UA Records" full>
                  {uaRecords.length === 0 ? <p style={{ color: '#666', fontSize: '14px' }}>No UA records yet.</p> : (
                    <>
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {['Negative', 'Positive', 'Inconclusive', 'Refused'].map(result => {
                          const count = uaRecords.filter(u => u.event_name === result).length;
                          if (count === 0) return null;
                          const col = uaResultColor(result);
                          return (
                            <div key={result} style={{ background: col.bg, borderRadius: '8px', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ color: col.color, fontSize: '18px', fontWeight: '700' }}>{count}</span>
                              <span style={{ color: col.color, fontSize: '11px', opacity: 0.8 }}>{result}</span>
                            </div>
                          );
                        })}
                        <div style={{ background: '#2a2a2a', borderRadius: '8px', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ color: '#fff', fontSize: '18px', fontWeight: '700' }}>{uaRecords.length}</span>
                          <span style={{ color: '#888', fontSize: '11px' }}>Total</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {uaRecords.map(ua => {
                          const col = uaResultColor(ua.event_name);
                          return (
                            <div key={ua.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#1a1a1a', borderRadius: '8px', border: '1px solid #333' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ ...st.badge, background: col.bg, color: col.color, fontSize: '12px', padding: '3px 10px' }}>{ua.event_name || 'Unknown'}</span>
                                <span style={{ color: '#aaa', fontSize: '12px' }}>By {ua.author}</span>
                                {ua.source === 'house' && <span style={{ ...st.badge, background: '#1e2d3a', color: '#60a5fa', fontSize: '10px' }}>House</span>}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                <span style={{ color: '#555', fontSize: '12px' }}>{formatDateShort(ua.created_at)}</span>
                                {ua.notes && <span style={{ color: '#666', fontSize: '11px', maxWidth: '200px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ua.notes}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </Card>
              )}

              {activeTab === 'meetings' && (
                <Card title="Meeting Records" full>
                  {meetingRecords.length === 0 ? <p style={{ color: '#666', fontSize: '14px' }}>No meeting records yet.</p> : (
                    <>
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <div style={{ background: '#1e2d3a', borderRadius: '8px', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ color: '#60a5fa', fontSize: '18px', fontWeight: '700' }}>{meetingRecords.length}</span>
                          <span style={{ color: '#60a5fa', fontSize: '11px', opacity: 0.8 }}>Total Meetings</span>
                        </div>
                      </div>
                      <p style={{ fontSize: '11px', color: '#555', margin: '0 0 12px 0' }}>Goal: 4 meetings per week. Current week expands automatically.</p>
                      {groupByWeek(meetingRecords).map(({ weekStart, entries }) => (
                        <MeetingWeek key={weekStart.toISOString()} weekStart={weekStart} entries={entries} />
                      ))}
                    </>
                  )}
                </Card>
              )}

              {activeTab === 'chores' && (
                <Card title="Chore Records" full>
                  {choreRecords.length === 0 ? <p style={{ color: '#666', fontSize: '14px' }}>No chore records yet.</p> : (
                    <>
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {['Completed', 'Not Completed', 'Partial'].map(status => {
                          const count = choreRecords.filter(c => c.event_name === status).length;
                          if (count === 0) return null;
                          const col = choreStatusColor(status);
                          return (
                            <div key={status} style={{ background: col.bg, borderRadius: '8px', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ color: col.color, fontSize: '18px', fontWeight: '700' }}>{count}</span>
                              <span style={{ color: col.color, fontSize: '11px', opacity: 0.8 }}>{status}</span>
                            </div>
                          );
                        })}
                        <div style={{ background: '#2a2a2a', borderRadius: '8px', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ color: '#fff', fontSize: '18px', fontWeight: '700' }}>{choreRecords.length}</span>
                          <span style={{ color: '#888', fontSize: '11px' }}>Total</span>
                        </div>
                      </div>
                      <p style={{ fontSize: '11px', color: '#555', margin: '0 0 12px 0' }}>Current week expands automatically. ✓ = all chores completed that week.</p>
                      {groupByWeek(choreRecords).map(({ weekStart, entries }) => (
                        <ChoreWeek key={weekStart.toISOString()} weekStart={weekStart} entries={entries} />
                      ))}
                    </>
                  )}
                </Card>
              )}

              {activeTab === 'medications' && (
                <Card title="Medications" full>
                  {selected.medication_details ? (
                    (() => {
                      try {
                        const meds = JSON.parse(selected.medication_details);
                        return meds.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {meds.map((med, i) => (
                              <div key={i} style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px 14px', border: '1px solid #333' }}>
                                <p style={{ color: '#fff', fontSize: '14px', fontWeight: '500', margin: '0 0 8px 0' }}>{med.name || 'Unnamed medication'}</p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                                  {med.dosage && <div><span style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>Dosage</span><p style={{ color: '#ddd', fontSize: '13px', margin: '2px 0 0 0' }}>{med.dosage}</p></div>}
                                  {med.intake && <div><span style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>Frequency</span><p style={{ color: '#ddd', fontSize: '13px', margin: '2px 0 0 0' }}>{med.intake}x/day</p></div>}
                                  {med.count && <div><span style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>Count</span><p style={{ color: '#ddd', fontSize: '13px', margin: '2px 0 0 0' }}>{med.count}</p></div>}
                                  {med.notes && <div style={{ gridColumn: 'span 2' }}><span style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>Notes</span><p style={{ color: '#ddd', fontSize: '13px', margin: '2px 0 0 0' }}>{med.notes}</p></div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : <p style={{ color: '#666', fontSize: '14px' }}>No medications listed on application.</p>;
                      } catch { return <p style={{ color: '#666', fontSize: '14px' }}>No medications listed on application.</p>; }
                    })()
                  ) : <p style={{ color: '#666', fontSize: '14px' }}>No medications listed on application.</p>}
                </Card>
              )}

              {activeTab === 'timeline' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                      <p style={{ ...st.sectionLabel, margin: 0 }}>Timeline</p>
                      {timelineTotal > 0 && <p style={{ color: '#555', fontSize: '11px', margin: '4px 0 0 0' }}>Showing {timeline.length} of {timelineTotal} entries</p>}
                    </div>
                    <button onClick={() => setShowAddEntry(!showAddEntry)} style={st.smallAddBtn}>{showAddEntry ? 'Cancel' : '+ Add Entry'}</button>
                  </div>
                  {showAddEntry && (
                    <div style={st.miniForm}>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={sf.label}>Entry Type</label>
                        <select value={entryType} onChange={e => setEntryType(e.target.value)} style={sf.input}>
                          {ENTRY_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      {entryType === 'UA' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={sf.label}>Result</label>
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            {['Positive', 'Negative', 'Inconclusive', 'Refused'].map(opt => (
                              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}>
                                <input type="radio" name="ua_result" value={opt} checked={entryForm.ua_result === opt} onChange={() => setEntryForm(p => ({ ...p, ua_result: opt }))} />{opt}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {entryType === 'Crisis' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={sf.label}>Severity</label>
                          <div style={{ display: 'flex', gap: '16px' }}>
                            {['Low', 'Medium', 'High'].map(sv => (
                              <label key={sv} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}>
                                <input type="radio" name="severity" value={sv} checked={entryForm.severity === sv} onChange={() => setEntryForm(p => ({ ...p, severity: sv }))} />{sv}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {entryType === 'Meeting' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={sf.label}>Meeting Name</label>
                          <input value={entryForm.meeting_name} onChange={e => setEntryForm(p => ({ ...p, meeting_name: e.target.value }))} style={sf.input} placeholder="e.g. New Beginnings, Ground Zero" />
                        </div>
                      )}
                      {entryType === 'Chores' && (
                        <>
                          <div style={{ marginBottom: '12px' }}>
                            <label style={sf.label}>Chore Name</label>
                            <input value={entryForm.chore_name} onChange={e => setEntryForm(p => ({ ...p, chore_name: e.target.value }))} style={sf.input} placeholder="e.g. Kitchen, Bathroom, Yard" />
                          </div>
                          <div style={{ marginBottom: '12px' }}>
                            <label style={sf.label}>Status</label>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                              {['Completed', 'Not Completed', 'Partial'].map(opt => (
                                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}>
                                  <input type="radio" name="chore_status" value={opt} checked={entryForm.chore_status === opt} onChange={() => setEntryForm(p => ({ ...p, chore_status: opt }))} />{opt}
                                </label>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                      {entryType === 'Mood Check-In' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={sf.label}>Mood Value (1–10): {entryForm.mood_value}</label>
                          <input type="range" min="1" max="10" value={entryForm.mood_value} onChange={e => setEntryForm(p => ({ ...p, mood_value: e.target.value }))} style={{ width: '100%' }} />
                        </div>
                      )}
                      {entryType === 'Check-In' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={sf.label}>Status</label>
                          <div style={{ display: 'flex', gap: '16px' }}>
                            {['Here', 'Not Here'].map(opt => (
                              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}>
                                <input type="radio" name="checkin" value={opt} checked={entryForm.checkin_status === opt} onChange={() => setEntryForm(p => ({ ...p, checkin_status: opt }))} />{opt}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {(entryType === 'Meeting' || entryType === 'Check-In') && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={sf.label}>Location</label>
                          <button type="button" onClick={dropPin}
                            style={{ ...sf.input, background: entryForm.pinDropped ? '#1e3a2f' : '#1a1a1a', color: entryForm.pinDropped ? '#4ade80' : '#aaa', cursor: 'pointer', textAlign: 'left', border: entryForm.pinDropped ? '1px solid #1D9E75' : '1px solid #444' }}>
                            {entryForm.pinDropped ? '📍 Pin dropped' : '📍 Drop pin (uses your current location)'}
                          </button>
                        </div>
                      )}
                      {entryType === 'Weekly Reflection' && (
                        <WeeklyReflectionForm entryForm={entryForm} setEntryForm={setEntryForm} />
                      )}
                      <div style={{ marginBottom: '12px' }}>
                        <label style={sf.label}>Author *</label>
                        <input value={entryForm.author} onChange={e => setEntryForm(p => ({ ...p, author: e.target.value }))} style={sf.input} placeholder="Your name" />
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={sf.label}>{entryType === 'Weekly Reflection' ? 'Additional notes (optional)' : 'Notes'}</label>
                        <textarea value={entryForm.notes} onChange={e => setEntryForm(p => ({ ...p, notes: e.target.value }))} style={{ ...sf.input, resize: 'vertical' }} rows={3} placeholder="Add any notes..." />
                      </div>
                      <button onClick={saveTimelineEntry} style={sf.confirmBtn}>Save Entry</button>
                    </div>
                  )}
                  {timelineLoading ? (
                    <p style={{ color: '#666', fontSize: '14px' }}>Loading timeline...</p>
                  ) : timeline.length === 0 ? (
                    <p style={{ color: '#666', fontSize: '14px' }}>No timeline entries yet.</p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {timeline.map(entry => (
                          <div key={entry.id} style={st.timelineCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: entryColor(entry.entry_type), flexShrink: 0 }} />
                                <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{entry.entry_type}</span>
                                {entry.meeting_name && <span style={{ color: '#60a5fa', fontSize: '13px' }}>{entry.meeting_name}</span>}
                                {entry.event_name && <span style={{ color: '#60a5fa', fontSize: '13px' }}>{entry.event_name}</span>}
                                {entry.mood_value && <span style={{ ...st.badge, background: '#3a2d1e', color: '#fb923c' }}>Mood: {entry.mood_value}/10</span>}
                                {entry.severity && <span style={{ ...st.badge, background: entry.severity === 'High' ? '#3a1e1e' : entry.severity === 'Medium' ? '#3a2d1e' : '#1e3a2f', color: entry.severity === 'High' ? '#f87171' : entry.severity === 'Medium' ? '#fb923c' : '#4ade80' }}>{entry.severity}</span>}
                                {entry.source === 'house' && <span style={{ ...st.badge, background: '#1e2d3a', color: '#60a5fa', fontSize: '10px' }}>House</span>}
                                {entry.source === 'client' && <span style={{ ...st.badge, background: '#2d1e3a', color: '#c084fc', fontSize: '10px' }}>Self</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ color: '#555', fontSize: '11px', whiteSpace: 'nowrap' }}>{formatDate(entry.created_at)}</span>
                                <button onClick={() => deleteTimelineEntry(entry.id)} style={{ background: 'transparent', border: '1px solid #444', color: '#666', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}>×</button>
                              </div>
                            </div>
                            {entry.latitude && entry.longitude && <LocationPin entryId={entry.id} lat={entry.latitude} lng={entry.longitude} />}
                            {entry.entry_type === 'Weekly Reflection'
                              ? <WeeklyReflectionCard entry={entry} />
                              : entry.notes && <p style={{ color: '#aaa', fontSize: '13px', margin: '4px 0 0 0', lineHeight: '1.5' }}>{entry.notes}</p>
                            }
                            <p style={{ color: '#555', fontSize: '11px', margin: '6px 0 0 0' }}>By {entry.author}</p>
                          </div>
                        ))}
                      </div>
                      {hasMoreTimeline && (
                        <div style={{ textAlign: 'center', marginTop: '16px' }}>
                          <button onClick={() => fetchTimeline(selected.id, true)} disabled={timelineLoadingMore}
                            style={{ background: 'transparent', border: '1px solid #444', color: '#aaa', padding: '8px 20px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                            {timelineLoadingMore ? 'Loading...' : `Load more (${timelineTotal - timeline.length} remaining)`}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {activeTab === 'application' && (
                <div style={st.grid}>
                  <Card title="Application details">
                    <ReadField label="Application type" value={selected.application_type} />
                    <ReadField label="Present residence" value={selected.present_residence} />
                    <ReadField label="Has ID" value={selected.has_id} />
                    <ReadField label="Has SS card" value={selected.has_ss_card} />
                    <ReadField label="Employment" value={selected.employment_status} />
                    <ReadField label="On disability" value={selected.on_disability} />
                    <ReadField label="Criminal history" value={selected.criminal_history} />
                    <ReadField label="Discharge reason" value={selected.reason_for_discharge} />
                    <ReadField label="Discharge date" value={selected.discharge_date} />
                    <ReadField label="Discharge notes" value={selected.discharge_notes} />
                    <ReadField label="Discharged by" value={selected.discharged_by} />
                  </Card>
                </div>
              )}

              {activeTab === 'notes' && (
                <Card title="Staff notes" full>
                  <textarea defaultValue={selected.client_notes || ''} onBlur={saveNotes} placeholder="Add staff notes here..."
                    style={{ width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '12px 14px', color: '#fff', fontSize: '14px', lineHeight: '1.6', resize: 'vertical', boxSizing: 'border-box', minHeight: '220px', outline: 'none', fontFamily: 'sans-serif' }} />
                  <p style={{ color: '#555', fontSize: '11px', marginTop: '8px' }}>Changes save automatically when you click away.</p>
                </Card>
              )}

              {activeTab === 'payments' && (
                <Card title="Payments" full>
                  <ClientPayments client={selected} />
                </Card>
              )}

              {activeTab === 'documents' && <Card title="Documents" full><p style={{ color: '#666', fontSize: '14px' }}>Documents will appear here once file uploads are set up.</p></Card>}
            </div>
          </div>
        </div>
      )}

      {statusModal && (
        <div style={{ ...st.overlay, zIndex: 2000 }} onClick={() => setStatusModal(null)}>
          <div style={{ ...st.modal, maxWidth: '420px', marginTop: '120px' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #333' }}>
              <h3 style={{ color: '#fff', margin: 0, fontSize: '16px' }}>Move to {statusModal.newStatus}</h3>
              <p style={{ color: '#666', fontSize: '13px', margin: '4px 0 0 0' }}>{statusModal.client.full_name}</p>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {statusModal.newStatus === 'Waiting List' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={sf.label}>Select waiting list</label>
                  <select value={statusForm.list_type} onChange={e => setStatusForm(p => ({ ...p, list_type: e.target.value }))} style={sf.input}>
                    {LISTS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              )}
              {statusModal.newStatus === 'Pending' && (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Assign to house</label>
                    <select value={statusForm.house_id} onChange={e => setStatusForm(p => ({ ...p, house_id: e.target.value }))} style={sf.input}>
                      <option value="">Select a house</option>
                      {houses.map(h => <option key={h.id} value={h.id}>{h.name} ({h.type})</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Expected move-in date (optional)</label>
                    <input type="date" value={statusForm.expected_move_in_date || ''} onChange={e => setStatusForm(p => ({ ...p, expected_move_in_date: e.target.value }))} style={sf.input} />
                  </div>
                </>
              )}
              {statusModal.newStatus === 'Active' && (
                <>
                  {!statusModal.client.house_id && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={sf.label}>Assign to house</label>
                      <select value={statusForm.house_id} onChange={e => setStatusForm(p => ({ ...p, house_id: e.target.value }))} style={sf.input}>
                        <option value="">Select a house</option>
                        {houses.map(h => <option key={h.id} value={h.id}>{h.name} ({h.type})</option>)}
                      </select>
                    </div>
                  )}
                  {statusModal.client.house_id && (
                    <div style={{ marginBottom: '16px', padding: '10px 12px', background: '#1e2d3a', borderRadius: '8px', border: '1px solid #2a3d52' }}>
                      <span style={{ fontSize: '12px', color: '#60a5fa' }}>🏠 Already assigned: </span>
                      <span style={{ fontSize: '12px', color: '#ddd' }}>{statusModal.client.house_name || 'Assigned house'}</span>
                    </div>
                  )}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Move-in date</label>
                    <input type="date" value={statusForm.move_in_date} onChange={e => setStatusForm(p => ({ ...p, move_in_date: e.target.value }))} style={sf.input} />
                  </div>
                </>
              )}
              {statusModal.newStatus === 'Discharged' && (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Reason for discharge *</label>
                    <select value={statusForm.discharge_reason} onChange={e => setStatusForm(p => ({ ...p, discharge_reason: e.target.value }))} style={sf.input}>
                      <option value="">Select reason</option>
                      <option>Completed program</option>
                      <option>Voluntary departure</option>
                      <option>Rule violation</option>
                      <option>Relapse</option>
                      <option>Medical</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Discharge notes</label>
                    <textarea value={statusForm.discharge_notes} onChange={e => setStatusForm(p => ({ ...p, discharge_notes: e.target.value }))} style={{ ...sf.input, resize: 'vertical' }} rows={4} placeholder="Add any details about why the client was discharged..." />
                  </div>
                </>
              )}
              {!['Waiting List', 'Pending', 'Active', 'Discharged'].includes(statusModal.newStatus) && (
                <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 16px 0' }}>This will update the client's status to {statusModal.newStatus}.</p>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setStatusModal(null)} style={sf.cancelBtn}>Cancel</button>
                <button onClick={confirmStatusChange} style={sf.confirmBtn}>Confirm</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, children, full }) {
  return (
    <div style={{ background: '#2a2a2a', border: '1px solid #333', borderRadius: '12px', padding: '14px 16px', gridColumn: full ? '1 / -1' : undefined }}>
      <p style={{ fontSize: '11px', fontWeight: '500', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>{title}</p>
      {children}
    </div>
  );
}

const st = {
  page: { padding: '32px', fontFamily: 'sans-serif', color: '#fff' },
  header: { marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: '700', margin: 0 },
  sub: { color: '#666', fontSize: '14px', margin: '4px 0 0 0' },
  toolbar: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' },
  search: { width: '100%', maxWidth: '360px', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 14px', color: '#fff', fontSize: '14px' },
  viewToggleWrap: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  filters: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  filterBtn: { padding: '6px 14px', borderRadius: '20px', border: '1px solid #444', background: 'transparent', color: '#888', fontSize: '13px', cursor: 'pointer' },
  filterActive: { background: '#b22222', borderColor: '#b22222', color: '#fff' },
  table: { background: '#2a2a2a', borderRadius: '12px', overflow: 'hidden', border: '1px solid #333' },
  tableHeader: { display: 'flex', padding: '12px 16px', borderBottom: '1px solid #333', fontSize: '12px', color: '#666', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' },
  row: { display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #222', cursor: 'pointer' },
  badge: { fontSize: '11px', padding: '3px 8px', borderRadius: '20px', fontWeight: '500' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: '#1a1a1a', borderRadius: '16px', border: '1px solid #333', width: '100%', maxWidth: '860px', overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '16px 20px', borderBottom: '1px solid #333' },
  modalName: { fontSize: '18px', fontWeight: '500', margin: 0, color: '#fff' },
  modalSub: { fontSize: '13px', color: '#666', margin: '2px 0 0 0' },
  badges: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px', alignItems: 'center' },
  closeBtn: { width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #444', background: 'transparent', cursor: 'pointer', color: '#888', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tabs: { display: 'flex', borderBottom: '1px solid #333', padding: '0 20px', overflowX: 'auto' },
  tab: { padding: '10px 14px', fontSize: '13px', cursor: 'pointer', color: '#666', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', whiteSpace: 'nowrap' },
  tabActive: { color: '#fff', borderBottomColor: '#fff' },
  modalBody: { padding: '20px', maxHeight: '520px', overflowY: 'auto' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' },
  sectionLabel: { fontSize: '11px', fontWeight: '500', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px 0' },
  timelineCard: { background: '#2a2a2a', borderRadius: '10px', padding: '12px 14px', border: '1px solid #333' },
  miniForm: { background: '#222', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', border: '1px solid #333' },
  smallAddBtn: { backgroundColor: 'transparent', border: '1px solid #444', color: '#aaa', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '20px', flexWrap: 'wrap' },
  pageBtn: { padding: '6px 12px', borderRadius: '8px', border: '1px solid #444', background: 'transparent', color: '#aaa', fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s' },
  pageBtnActive: { background: '#b22222', borderColor: '#b22222', color: '#fff', fontWeight: '600' },
  pageBtnDisabled: { opacity: 0.3, cursor: 'not-allowed' },
  ellipsis: { color: '#555', fontSize: '13px', padding: '0 4px' },
  pageNumbers: { display: 'flex', alignItems: 'center', gap: '6px' },
};

const sf = {
  label: { display: 'block', color: '#aaa', fontSize: '13px', marginBottom: '6px' },
  input: { width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  cancelBtn: { backgroundColor: 'transparent', border: '1px solid #444', color: '#aaa', padding: '8px 18px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' },
  confirmBtn: { backgroundColor: '#b22222', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' },
};

export default Clients;