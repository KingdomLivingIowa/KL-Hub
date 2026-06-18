import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';
import { HouseCalendarTab } from './Calendars';

const ENTRY_TYPES = ['House Check-In', 'Batch UA', 'Crisis', 'Event Attendance', 'General Note', 'House Inspection', 'House Meeting Notes', 'Supplies/Inventory', 'Maintenance Request'];

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

function HouseWeeklyReflectionForm({ entryForm, setEntryForm }) {
  return (
    <>
      <div style={{ marginBottom: '12px' }}>
        <label style={s.label}>Overall mood this week (1–10): {entryForm.reflection_mood || 5}</label>
        <input type="range" min="1" max="10" value={entryForm.reflection_mood || 5}
          onChange={e => setEntryForm(p => ({ ...p, reflection_mood: e.target.value }))} style={{ width: '100%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#bbb', marginTop: '2px' }}>
          <span>1 — Rough</span><span>10 — Great</span>
        </div>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={s.label}>Biggest challenge this week</label>
        <textarea value={entryForm.reflection_challenge || ''} onChange={e => setEntryForm(p => ({ ...p, reflection_challenge: e.target.value }))}
          style={{ ...s.input, resize: 'vertical' }} rows={2} placeholder="What was hard this week?" />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={s.label}>A win or something to be proud of</label>
        <textarea value={entryForm.reflection_win || ''} onChange={e => setEntryForm(p => ({ ...p, reflection_win: e.target.value }))}
          style={{ ...s.input, resize: 'vertical' }} rows={2} placeholder="What went well?" />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={s.label}>Goals for next week</label>
        <textarea value={entryForm.reflection_goals || ''} onChange={e => setEntryForm(p => ({ ...p, reflection_goals: e.target.value }))}
          style={{ ...s.input, resize: 'vertical' }} rows={2} placeholder="What do you want to focus on next week?" />
      </div>
    </>
  );
}

function HouseWeeklyReflectionCard({ entry }) {
  let data = null;
  try { data = entry.reflection_data ? JSON.parse(entry.reflection_data) : null; } catch { data = null; }
  return (
    <div style={{ marginTop: '6px' }}>
      {data?.mood && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px', color: '#bbb' }}>Mood:</span>
          <span style={{ fontSize: '14px', padding: '2px 8px', borderRadius: '20px', background: '#3a2d1e', color: '#fb923c', fontWeight: '500' }}>{data.mood}/10</span>
        </div>
      )}
      {data?.challenge && <div style={{ marginBottom: '8px' }}><p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Challenge</p><p style={{ fontSize: '14px', color: '#aaa', margin: 0, lineHeight: 1.5 }}>{data.challenge}</p></div>}
      {data?.win && <div style={{ marginBottom: '8px' }}><p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Win</p><p style={{ fontSize: '14px', color: '#aaa', margin: 0, lineHeight: 1.5 }}>{data.win}</p></div>}
      {data?.goals && <div style={{ marginBottom: '8px' }}><p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Goals for next week</p><p style={{ fontSize: '14px', color: '#aaa', margin: 0, lineHeight: 1.5 }}>{data.goals}</p></div>}
      {entry.notes && <div><p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Additional notes</p><p style={{ fontSize: '14px', color: '#aaa', margin: 0, lineHeight: 1.5 }}>{entry.notes}</p></div>}
    </div>
  );
}

function Houses({ onOpenClient }) {
  const { hasFullAccess, isHouseManagerRole, assignedHouseIds, user } = useUser();

  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [residents, setResidents] = useState([]);
  const [activeTab, setActiveTab] = useState('residents');
  const [rooms, setRooms] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [locationLabels, setLocationLabels] = useState({});
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [roomForm, setRoomForm] = useState({ name: '', type: 'Double', beds: '2' });
  const [editingHouse, setEditingHouse] = useState(false);
  const [houseEditForm, setHouseEditForm] = useState({});
  const [entryType, setEntryType] = useState('House Check-In');
  const [entryForm, setEntryForm] = useState({
    author: '', notes: '', severity: 'Low', event_name: '',
    reflection_mood: '5', reflection_challenge: '', reflection_win: '', reflection_goals: '',
  });
  const [residentChecks, setResidentChecks] = useState({});
  const [mainView, setMainView] = useState('houses');
  const [allResidents, setAllResidents] = useState([]);
  const [editingNotes, setEditingNotes] = useState({});
  const [form, setForm] = useState({
    name: '', address: '', city: '', zip: '', type: 'Men',
    total_beds: '', house_manager: '', phone: '', notes: '',
  });
  const [moveInModal, setMoveInModal] = useState(null);
  const [moveInRoomType, setMoveInRoomType] = useState('Double');
  const [savingMoveIn, setSavingMoveIn] = useState(false);
  const [didNotMoveInMode, setDidNotMoveInMode] = useState(false);
  const [didNotMoveInReason, setDidNotMoveInReason] = useState('');

  const loadAllData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      let query = supabase.from('houses').select('*').order('name');
      if (isHouseManagerRole && assignedHouseIds.length > 0) {
        query = query.in('id', assignedHouseIds);
      } else if (isHouseManagerRole && assignedHouseIds.length === 0) {
        setHouses([]); setAllResidents([]);
        return;
      }
      const [{ data: housesData }, { data: clientsData }] = await Promise.all([
        query,
        supabase.from('clients').select('id, full_name, status, level, start_date, phone, staff_notes, house_id, room_type, expected_move_in_date').in('status', ['Active', 'Pending']).order('full_name'),
      ]);

      // Calculate real balances from charges and payments
      const clientIds = (clientsData || []).map(c => c.id);
      let balanceMap = {};
      if (clientIds.length > 0) {
        const [{ data: chargesData, error: chargesErr }, { data: paymentsData, error: paymentsErr }] = await Promise.all([
          supabase.from('charges').select('client_id, amount').in('client_id', clientIds),
          supabase.from('payments').select('client_id, amount').in('client_id', clientIds),
        ]);
        if (chargesErr) console.error('Charges fetch error:', chargesErr);
        if (paymentsErr) console.error('Payments fetch error:', paymentsErr);
        clientIds.forEach(id => {
          const charged = (chargesData || []).filter(c => c.client_id === id).reduce((s, c) => s + parseFloat(c.amount || 0), 0);
          const paid = (paymentsData || []).filter(p => p.client_id === id).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
          balanceMap[id] = charged - paid;
        });
      }

      const clientsWithBalance = (clientsData || []).map(c => ({ ...c, balance: balanceMap[c.id] ?? 0 }));
      const enriched = (housesData || []).map(h => ({
        ...h,
        occupied_beds: clientsWithBalance.filter(c => c.house_id === h.id && c.status === 'Active').length,
        pending_count: clientsWithBalance.filter(c => c.house_id === h.id && c.status === 'Pending').length,
      }));
      setHouses(enriched);
      setAllResidents(clientsWithBalance);
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isHouseManagerRole, assignedHouseIds]);

  useEffect(() => {
    loadAllData();
    const interval = setInterval(() => loadAllData(true), 60000);
    return () => clearInterval(interval);
  }, [loadAllData]);

  const fetchResidents = useCallback(async (houseId) => {
    const { data } = await supabase.from('clients').select('id, full_name, status, level, start_date, room_type, phone, staff_notes, email, date_of_birth, house_id, expected_move_in_date').eq('house_id', houseId).in('status', ['Active', 'Pending']);
    const clientIds = (data || []).map(c => c.id);
    let balanceMap = {};
    if (clientIds.length > 0) {
      const [{ data: chargesData }, { data: paymentsData }] = await Promise.all([
        supabase.from('charges').select('client_id, amount').in('client_id', clientIds),
        supabase.from('payments').select('client_id, amount').in('client_id', clientIds),
      ]);
      clientIds.forEach(id => {
        const charged = (chargesData || []).filter(c => c.client_id === id).reduce((s, c) => s + parseFloat(c.amount || 0), 0);
        const paid = (paymentsData || []).filter(p => p.client_id === id).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
        balanceMap[id] = charged - paid;
      });
    }
    const residentsWithBalance = (data || []).map(c => ({ ...c, balance: balanceMap[c.id] ?? 0 }));
    setResidents(residentsWithBalance);
    const checks = {};
    (residentsWithBalance).forEach(r => { checks[r.id] = { name: r.full_name, value: '' }; });
    setResidentChecks(checks);
  }, []);

  const fetchRooms = useCallback(async (houseId) => {
    const { data } = await supabase.from('rooms').select('*').eq('house_id', houseId).order('name');
    setRooms(data || []);
  }, []);

  const fetchTimeline = useCallback(async (houseId) => {
    const { data } = await supabase.from('house_timeline').select('*').eq('house_id', houseId).order('created_at', { ascending: false });
    setTimeline(data || []);
    setLocationLabels({});
  }, []);

  const openHouse = (house) => {
    setSelected(house);
    setActiveTab('residents');
    setShowAddEntry(false);
    setEntryType('House Check-In');
    setEntryForm({ author: user?.user_metadata?.full_name || user?.email || '', notes: '', severity: 'Low', event_name: '', reflection_mood: '5', reflection_challenge: '', reflection_win: '', reflection_goals: '' });
    fetchResidents(house.id);
    fetchRooms(house.id);
    fetchTimeline(house.id);
  };

  const openClientProfile = (client) => {
    if (onOpenClient) {
      onOpenClient(client.id);
    }
  };

  const confirmMoveIn = async () => {
    if (!moveInModal) return;
    setSavingMoveIn(true);
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('clients').update({
      status: 'Active', start_date: today, room_type: moveInRoomType,
    }).eq('id', moveInModal.id);

    // Remove from waiting list
    await supabase.from('waiting_list')
      .update({ status: 'removed' })
      .eq('client_id', moveInModal.id)
      .eq('status', 'waiting');
    if (error) { alert('Error confirming move-in: ' + error.message); setSavingMoveIn(false); return; }
    await supabase.from('charges').insert([{
      client_id: moveInModal.id, charge_type: 'move_in_fee', amount: 150, due_date: today,
      description: 'Move-in fee', status: 'unpaid', amount_paid: 0, created_by: user?.email || null,
    }]);
    await supabase.from('client_timeline').insert([{
      client_id: moveInModal.id, entry_type: 'General Note', author: user?.email || 'Staff',
      notes: `Move-in confirmed. Room type: ${moveInRoomType}.`,
      source: 'staff',
    }]);

    // Fire confirmed move-in email notification
    const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdnhuZXRwYnh1emtyeGl0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjE1NDcsImV4cCI6MjA5MDgzNzU0N30.IRRDTmFc3Ew1GWk69q0pSRTezsJOskK43yklIK4h2Xc';
    try {
      await fetch('https://pmvxnetpbxuzkrxitioc.supabase.co/functions/v1/confirmed-move-in-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          client_name: moveInModal.full_name,
          house_name: selected?.name || 'Unknown House',
          move_in_date: new Date(today).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          level: 1,
          early_admission: false,
        }),
      });
    } catch (err) { console.error('Move-in notify error:', err); }

    setMoveInModal(null);
    setMoveInRoomType('Double');
    setSavingMoveIn(false);
    loadAllData(true);
    if (selected) fetchResidents(selected.id);
  };

  const handleDidNotMoveIn = async () => {
    if (!moveInModal) return;
    if (!didNotMoveInReason.trim()) { alert('Please provide a reason.'); return; }
    setSavingMoveIn(true);

    const SUPABASE_URL = 'https://pmvxnetpbxuzkrxitioc.supabase.co';
    const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdnhuZXRwYnh1emtyeGl0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjE1NDcsImV4cCI6MjA5MDgzNzU0N30.IRRDTmFc3Ew1GWk69q0pSRTezsJOskK43yklIK4h2Xc';

    // Revert client to Archived status
    await supabase.from('clients').update({
      status: 'Archived',
      house_id: null,
      start_date: null,
      room_type: null,
    }).eq('id', moveInModal.id);

    // Record in client_stays
    await supabase.from('client_stays').insert([{
      client_id: moveInModal.id,
      house_id: selected?.id || null,
      house_name: selected?.name || null,
      discharge_reason: 'Did Not Move In',
      discharge_notes: didNotMoveInReason.trim(),
      discharge_date: new Date().toISOString().split('T')[0],
      balance_at_discharge: 0,
      successful_discharge: false,
    }]);

    // Remove from waiting list
    await supabase.from('waiting_list')
      .update({ status: 'removed' })
      .eq('client_id', moveInModal.id)
      .eq('status', 'waiting');

    // Log to client timeline
    await supabase.from('client_timeline').insert([{
      client_id: moveInModal.id,
      entry_type: 'General Note',
      author: user?.email || 'Staff',
      notes: `Did not move in. Reason: ${didNotMoveInReason.trim()}`,
      source: 'staff',
    }]);

    // Send email notification
    fetch(`${SUPABASE_URL}/functions/v1/did-not-move-in-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
      body: JSON.stringify({
        client_name: moveInModal.full_name || `${moveInModal.first_name || ''} ${moveInModal.last_name || ''}`.trim(),
        house_name: selected?.name || 'Unknown House',
        reason: didNotMoveInReason.trim(),
      }),
    }).catch(err => console.error('did-not-move-in-notify error:', err));

    setMoveInModal(null);
    setMoveInRoomType('Double');
    setDidNotMoveInMode(false);
    setDidNotMoveInReason('');
    setSavingMoveIn(false);
    loadAllData(true);
    if (selected) fetchResidents(selected.id);
  };

  const deleteHouse = async (e, houseId) => {
    e.stopPropagation();
    if (!hasFullAccess) return;
    const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true }).eq('house_id', houseId);
    if (count > 0) { alert('This house still has clients linked to it. Please reassign or discharge all residents first.'); return; }
    if (!window.confirm('Are you sure you want to delete this house? This cannot be undone.')) return;
    await supabase.from('rooms').delete().eq('house_id', houseId);
    await supabase.from('house_timeline').delete().eq('house_id', houseId);
    const { error } = await supabase.from('houses').delete().eq('id', houseId);
    if (error) { alert('Error deleting: ' + error.message); return; }
    loadAllData(true);
  };

  const handleEntryTypeChange = (newType) => {
    setEntryType(newType);
    setEntryForm(prev => ({
      author: prev.author, notes: '', severity: 'Low', event_name: '',
      reflection_mood: '5', reflection_challenge: '', reflection_win: '', reflection_goals: '',
    }));
    setResidentChecks(prev => {
      const reset = {};
      Object.keys(prev).forEach(id => { reset[id] = { name: prev[id].name, value: '' }; });
      return reset;
    });
  };

  const set = (field, val) => setForm(p => ({ ...p, [field]: val }));

  const addHouse = async () => {
    if (!hasFullAccess) return;
    if (!form.name) { alert('House name is required.'); return; }
    if (!form.total_beds) { alert('Number of beds is required.'); return; }
    const { error } = await supabase.from('houses').insert([{
      name: form.name, address: form.address || null, city: form.city || null,
      zip: form.zip || null, type: form.type, total_beds: parseInt(form.total_beds),
      house_manager: form.house_manager || null, phone: form.phone || null, notes: form.notes || null,
    }]);
    if (error) { alert('Error: ' + error.message); return; }
    setForm({ name: '', address: '', city: '', zip: '', type: 'Men', total_beds: '', house_manager: '', phone: '', notes: '' });
    setShowAdd(false);
    loadAllData(true);
  };

  const saveHouseEdit = async () => {
    if (!selected) return;
    const { error } = await supabase.from('houses').update({
      type: houseEditForm.type,
      total_beds: parseInt(houseEditForm.total_beds) || selected.total_beds,
      house_manager: houseEditForm.house_manager || null,
      phone: houseEditForm.phone || null,
    }).eq('id', selected.id);
    if (error) { alert('Error saving: ' + error.message); return; }
    setSelected(prev => ({ ...prev, ...houseEditForm, total_beds: parseInt(houseEditForm.total_beds) || prev.total_beds }));
    loadAllData(true);
    setEditingHouse(false);
  };

  const addRoom = async () => {
    if (!roomForm.name) { alert('Room name is required.'); return; }
    const { error } = await supabase.from('rooms').insert([{ house_id: selected.id, name: roomForm.name, type: roomForm.type, beds: parseInt(roomForm.beds) || 1 }]);
    if (error) { alert('Error: ' + error.message); return; }
    setRoomForm({ name: '', type: 'Double', beds: '2' });
    setShowAddRoom(false);
    fetchRooms(selected.id);
  };

  const deleteRoom = async (id) => {
    if (!window.confirm('Delete this room?')) return;
    await supabase.from('rooms').delete().eq('id', id);
    fetchRooms(selected.id);
  };

  const saveEntry = async () => {
    if (!entryForm.author) { alert('Author is required.'); return; }
    if (entryType === 'Crisis' && !entryForm.severity) { alert('Severity is required.'); return; }
    if (entryType === 'Event Attendance' && !entryForm.event_name) { alert('Event name is required.'); return; }
    const resData = Object.entries(residentChecks).map(([id, v]) => ({ id, name: v.name, value: v.value }));
    if ((entryType === 'House Check-In' || entryType === 'Batch UA') && resData.every(r => !r.value)) { alert('Please fill in at least one resident.'); return; }
    if (entryType === 'Event Attendance' && resData.every(r => r.value !== 'Attended')) { alert('Please select at least one resident.'); return; }
    let reflectionData = null;
    // eslint-disable-next-line no-unused-vars
const { error: insertError } = await supabase.from('house_timeline').insert([{
      house_id: selected.id, entry_type: entryType, author: entryForm.author,
      notes: entryForm.notes || null,
      severity: entryType === 'Crisis' ? entryForm.severity : null,
      event_name: entryType === 'Event Attendance' ? entryForm.event_name : null,
      resident_data: resData.length ? resData : null,
      reflection_data: reflectionData,
      inspection_result: entryType === 'House Inspection' ? entryForm.inspection_result : null,
      maintenance_status: null,
    }]);

    // If Maintenance Request, also create in maintenance_requests table
    if (entryType === 'Maintenance Request') {
      await supabase.from('maintenance_requests').insert([{
        house_id: selected.id,
        house_name: selected.name,
        issue_type: entryForm.issue_type || null,
        issue_location: entryForm.issue_location || null,
        description: entryForm.notes || null,
        previously_submitted: entryForm.previously_submitted || 'No',
        submitted_by: entryForm.author,
        status: 'Open',
      }]);

      // Fire email notification
      const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdnhuZXRwYnh1emtyeGl0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjE1NDcsImV4cCI6MjA5MDgzNzU0N30.IRRDTmFc3Ew1GWk69q0pSRTezsJOskK43yklIK4h2Xc';
      fetch('https://pmvxnetpbxuzkrxitioc.supabase.co/functions/v1/maintenance-request-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          house_name: selected.name,
          issue_type: entryForm.issue_type,
          issue_location: entryForm.issue_location,
          description: entryForm.notes,
          submitted_by: entryForm.author,
          previously_submitted: entryForm.previously_submitted,
        }),
      }).catch(err => console.error('Maintenance notify error:', err));
    }

    // If Supplies/Inventory, fire email notification
    if (entryType === 'Supplies/Inventory') {
      const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdnhuZXRwYnh1emtyeGl0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjE1NDcsImV4cCI6MjA5MDgzNzU0N30.IRRDTmFc3Ew1GWk69q0pSRTezsJOskK43yklIK4h2Xc';
      fetch('https://pmvxnetpbxuzkrxitioc.supabase.co/functions/v1/supplies-inventory-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          house_name: selected.name,
          notes: entryForm.notes,
          submitted_by: entryForm.author,
        }),
      }).catch(err => console.error('Supplies notify error:', err));
    }
    if (insertError) { alert('Error: ' + insertError.message); return; }

    if (['House Check-In', 'Batch UA', 'Event Attendance'].includes(entryType)) {
      const relevantResidents = resData.filter(r => r.value);
      for (const res of relevantResidents) {
        const { data: clientData } = await supabase.from('clients').select('id').eq('full_name', res.name).single();
        if (clientData) {
          await supabase.from('client_timeline').insert([{
            client_id: clientData.id,
            entry_type: entryType === 'Batch UA' ? 'UA' : entryType,
            author: entryForm.author, notes: entryForm.notes || null,
            event_name: entryType === 'Event Attendance' ? entryForm.event_name : res.value,
            source: 'house',
          }]);
        }
      }
    }
    setShowAddEntry(false);
    setEntryType('House Check-In');
    setEntryForm({ author: user?.user_metadata?.full_name || user?.email || '', notes: '', severity: 'Low', event_name: '', reflection_mood: '5', reflection_challenge: '', reflection_win: '', reflection_goals: '' });
    setResidentChecks(prev => {
      const reset = {};
      Object.keys(prev).forEach(id => { reset[id] = { name: prev[id].name, value: '' }; });
      return reset;
    });
    fetchTimeline(selected.id);
  };

  const deleteEntry = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    await supabase.from('house_timeline').delete().eq('id', id);
    fetchTimeline(selected.id);
  };

  const setResCheck = (resId, val) => setResidentChecks(p => ({ ...p, [resId]: { ...p[resId], value: val } }));
  const startEditingNotes = (residentId, currentNotes) => setEditingNotes(prev => ({ ...prev, [residentId]: currentNotes || '' }));

  const saveNotes = async (residentId) => {
    const newNotes = editingNotes[residentId];
    await supabase.from('clients').update({ staff_notes: newNotes || null }).eq('id', residentId);
    setAllResidents(prev => prev.map(r => r.id === residentId ? { ...r, staff_notes: newNotes } : r));
    setEditingNotes(prev => { const updated = { ...prev }; delete updated[residentId]; return updated; });
  };

  useEffect(() => {
    timeline.forEach(async entry => {
      if (entry.latitude && entry.longitude && !locationLabels[entry.id]) {
        const address = await reverseGeocode(entry.latitude, entry.longitude);
        if (address) setLocationLabels(prev => ({ ...prev, [entry.id]: address }));
      }
    });
  }, [timeline]); // eslint-disable-line react-hooks/exhaustive-deps

  const entryColor = (type) => {
    if (type === 'House Check-In') return '#7F77DD';
    if (type === 'Batch UA') return '#1D9E75';
    if (type === 'Crisis') return '#E24B4A';
    if (type === 'Event Attendance') return '#378ADD';
    if (type === 'General Note') return '#f59e0b';
    if (type === 'Weekly Reflection') return '#a78bfa';
    if (type === 'Maintenance/Repair') return '#f97316';
    if (type === 'House Inspection') return '#06b6d4';
    if (type === 'House Meeting Notes') return '#84cc16';
    if (type === 'Supplies/Inventory') return '#e879f9';
    if (type === 'Maintenance Update') return '#60a5fa';
    return '#bbb';
  };

  const severityColor = (sv) => {
    if (sv === 'High') return { bg: '#3a1e1e99', color: '#f87171' };
    if (sv === 'Medium') return { bg: '#3a2d1e', color: '#fb923c' };
    return { bg: '#1e3a2f', color: '#4ade80' };
  };

  const statusColor = (st) => {
    if (st === 'Active') return { bg: '#2d1e3a', color: '#c084fc' };
    if (st === 'Pending') return { bg: '#2d2d1e', color: '#facc15' };
    return { bg: '#333', color: '#aaa' };
  };

  const initials = (name) => name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '??';
  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const formatBalance = (b) => { if (b == null) return '—'; const num = parseFloat(b); return (num < 0 ? '-$' : '$') + Math.abs(num).toFixed(2); };

  const LocationPin = ({ entryId, lat, lng }) => {
    const address = locationLabels[entryId];
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    return (
      <div style={{ background: '#1c1c24', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span>📍</span>
          <span style={{ fontSize: '14px', color: '#aaa', lineHeight: '1.4' }}>{address || `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`}</span>
        </div>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: '#60a5fa', textDecoration: 'none', whiteSpace: 'nowrap', padding: '3px 8px', border: '1px solid #2a3d52', borderRadius: '4px', flexShrink: 0 }}>View map →</a>
      </div>
    );
  };

  const weeklyRateForType = (rt) => {
    if (rt === 'Single') return '$160';
    if (rt === 'Houseperson') return '$110';
    return '$135';
  };

  const formatRefreshed = () => {
    if (!lastRefreshed) return '';
    return `Updated ${lastRefreshed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const canSeeHouseChat = selected && (hasFullAccess || (isHouseManagerRole && assignedHouseIds.includes(selected.id)));

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <p style={s.sub}>{houses.length} {isHouseManagerRole ? 'assigned' : 'total'}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {lastRefreshed && (
            <span style={{ fontSize: '14px', color: '#bbb' }}>{formatRefreshed()}</span>
          )}
          <button onClick={() => loadAllData(true)} disabled={refreshing}
            style={{ background: 'transparent', border: '1px solid #3a3a48', color: refreshing ? '#bbb' : '#aaa', padding: '7px 14px', borderRadius: '8px', fontSize: '14px', cursor: refreshing ? 'not-allowed' : 'pointer' }}>
            {refreshing ? '↻ Refreshing...' : '↻ Refresh'}
          </button>
          <div style={s.viewToggle}>
            <button onClick={() => setMainView('houses')} style={{ ...s.toggleBtn, ...(mainView === 'houses' ? s.toggleBtnActive : {}) }}>Houses</button>
            <button onClick={() => setMainView('residents')} style={{ ...s.toggleBtn, ...(mainView === 'residents' ? s.toggleBtnActive : {}) }}>All Residents</button>
          </div>
          {hasFullAccess && <button onClick={() => setShowAdd(!showAdd)} style={s.addBtn}>{showAdd ? 'Cancel' : '+ Add House'}</button>}
        </div>
      </div>

      {showAdd && hasFullAccess && (
        <div style={s.addForm}>
          <p style={s.addTitle}>New House</p>
          <div style={s.grid2}>
            <div><label style={s.label}>House Name *</label><input value={form.name} onChange={e => set('name', e.target.value)} style={s.input} /></div>
            <div><label style={s.label}>Type</label><select value={form.type} onChange={e => set('type', e.target.value)} style={s.input}><option>Men</option><option>Women</option></select></div>
            <div><label style={s.label}>Address</label><input value={form.address} onChange={e => set('address', e.target.value)} style={s.input} /></div>
            <div><label style={s.label}>City</label><input value={form.city} onChange={e => set('city', e.target.value)} style={s.input} /></div>
            <div><label style={s.label}>Zip</label><input value={form.zip} onChange={e => set('zip', e.target.value)} style={s.input} /></div>
            <div><label style={s.label}>Total Beds *</label><input type="number" value={form.total_beds} onChange={e => set('total_beds', e.target.value)} style={s.input} /></div>
            <div><label style={s.label}>House Manager</label><input value={form.house_manager} onChange={e => set('house_manager', e.target.value)} style={s.input} /></div>
            <div><label style={s.label}>Phone</label><input value={form.phone} onChange={e => set('phone', e.target.value)} style={s.input} /></div>
            <div style={{ gridColumn: 'span 2' }}><label style={s.label}>Notes</label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} style={{ ...s.input, resize: 'vertical' }} rows={2} /></div>
          </div>
          <button onClick={addHouse} style={s.saveBtn}>Save House</button>
        </div>
      )}

      {loading ? <p style={{ color: '#bbb' }}>Loading...</p> : (
        <>
          {mainView === 'houses' && (
            houses.length === 0 ? <p style={{ color: '#bbb' }}>{isHouseManagerRole ? 'No houses have been assigned to you yet.' : 'No houses yet.'}</p> : (
              <div style={s.houseGrid}>
                {houses.map(house => (
                  <div key={house.id} style={s.houseCard} onClick={() => openHouse(house)}>
                    <div style={s.houseCardTop}>
                      <div>
                        <p style={s.houseName}>{house.name}</p>
                        <p style={s.houseAddress}>{house.address}{house.city ? `, ${house.city}` : ''}</p>
                      </div>
                      <span style={{ ...s.typeBadge, background: house.type === 'Women' ? '#3a1e2d' : '#1e2d3a', color: house.type === 'Women' ? '#f9a8d4' : '#60a5fa' }}>{house.type}</span>
                    </div>
                    <div style={s.bedBar}><div style={s.bedBarFill(house)} /></div>
                    <div style={s.houseStats}>
                      <span style={s.statItem}><span style={s.statNum}>{house.total_beds || 0}</span><span style={s.statLbl}>Total</span></span>
                      <span style={s.statItem}><span style={{ ...s.statNum, color: '#c084fc' }}>{house.occupied_beds || 0}</span><span style={s.statLbl}>Active</span></span>
                      <span style={s.statItem}><span style={{ ...s.statNum, color: '#facc15' }}>{house.pending_count || 0}</span><span style={s.statLbl}>Pending</span></span>
                      <span style={s.statItem}><span style={{ ...s.statNum, color: '#4ade80' }}>{(house.total_beds || 0) - (house.occupied_beds || 0) - (house.pending_count || 0)}</span><span style={s.statLbl}>Available</span></span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      {house.house_manager ? <p style={s.manager}>Manager: {house.house_manager}{house.phone ? ` · ${house.phone}` : ''}</p> : <span />}
                      {hasFullAccess && <button onClick={e => deleteHouse(e, house.id)} style={s.deleteHouseBtn}>Delete</button>}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {mainView === 'residents' && (
            <div>
              {houses.map(house => {
                const houseResidents = allResidents.filter(r => r.house_id === house.id);
                if (houseResidents.length === 0) return null;
                return (
                  <div key={house.id} style={s.houseGroup}>
                    <div style={s.houseGroupHeader}>
                      <span style={s.houseGroupName}>{house.name}</span>
                      <span style={{ ...s.typeBadge, background: house.type === 'Women' ? '#3a1e2d' : '#1e2d3a', color: house.type === 'Women' ? '#f9a8d4' : '#60a5fa' }}>{house.type}</span>
                      <span style={s.houseGroupCount}>{houseResidents.length} resident{houseResidents.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={s.residentTable}>
                      <div style={s.residentTableHeader}>
                        <span style={{ flex: 2 }}>Name</span>
                        <span style={{ flex: 1 }}>Status</span>
                        <span style={{ flex: 1 }}>Start Date</span>
                        <span style={{ flex: 1 }}>Balance</span>
                        <span style={{ flex: 1 }}>Phone</span>
                        <span style={{ flex: 2 }}>Notes</span>
                      </div>
                      {houseResidents.map(r => (
                        <div key={r.id} style={{ ...s.residentTableRow, cursor: 'pointer' }} onClick={() => openClientProfile(r)}>
                          <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={s.resAvatar}>{initials(r.full_name)}</div>
                            <div>
                              <p style={{ color: '#fff', fontSize: '14px', fontWeight: '500', margin: 0 }}>{r.full_name}</p>
                              <p style={{ color: '#999', fontSize: '14px', margin: '2px 0 0 0' }}>{r.status === 'Active' && r.level ? `Level ${r.level}` : '—'}</p>
                            </div>
                          </div>
                          <span style={{ flex: 1 }}>
                            <span style={{ ...s.typeBadge, background: statusColor(r.status).bg, color: statusColor(r.status).color }}>{r.status}</span>
                          </span>
                          <span style={{ flex: 1, color: '#aaa', fontSize: '14px' }}>{r.start_date || '—'}</span>
                          <span style={{ flex: 1, color: parseFloat(r.balance) > 0 ? '#f87171' : '#4ade80', fontSize: '14px', fontWeight: '500' }}>{formatBalance(r.balance)}</span>
                          <span style={{ flex: 1, color: '#aaa', fontSize: '14px' }}>{r.phone || '—'}</span>
                          <div style={{ flex: 2 }} onClick={e => e.stopPropagation()}>
                            {editingNotes.hasOwnProperty(r.id) ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <textarea autoFocus value={editingNotes[r.id]}
                                  onChange={e => setEditingNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
                                  onBlur={() => saveNotes(r.id)}
                                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNotes(r.id); } }}
                                  rows={2} placeholder="Add a note..."
                                  style={{ width: '100%', backgroundColor: '#1c1c24', border: '1px solid #555', borderRadius: '6px', padding: '6px 8px', color: '#fff', fontSize: '14px', resize: 'none', boxSizing: 'border-box', outline: 'none' }} />
                                <span style={{ color: '#bbb', fontSize: '13px' }}>Enter to save · Shift+Enter for new line</span>
                              </div>
                            ) : (
                              <div onClick={e => { e.stopPropagation(); startEditingNotes(r.id, r.staff_notes); }}
                                style={{ color: r.staff_notes ? '#aaa' : '#999', fontSize: '14px', lineHeight: '1.4', cursor: 'text', minHeight: '20px', padding: '4px 6px', borderRadius: '6px', border: '1px solid transparent', transition: 'border-color 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = '#999'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
                                {r.staff_notes || <span style={{ fontStyle: 'italic' }}>Click to add notes...</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {allResidents.length === 0 && <p style={{ color: '#bbb' }}>{isHouseManagerRole ? 'No residents found in your assigned houses.' : 'No active residents found.'}</p>}
            </div>
          )}
        </>
      )}

      {/* House detail modal */}
      {selected && (
        <div style={s.overlay} onClick={() => setSelected(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div style={{ flex: 1 }}>
                <h2 style={s.modalName}>{selected.name}</h2>
                <p style={s.modalSub}>{selected.address}{selected.city ? `, ${selected.city}` : ''}{selected.zip ? ` ${selected.zip}` : ''}</p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                  <span style={{ ...s.typeBadge, background: selected.type === 'Women' ? '#3a1e2d' : '#1e2d3a', color: selected.type === 'Women' ? '#f9a8d4' : '#60a5fa' }}>{selected.type}</span>
                  <span style={{ ...s.typeBadge, background: '#2d1e3a', color: '#c084fc' }}>{selected.occupied_beds || 0} active</span>
                  <span style={{ ...s.typeBadge, background: '#2d2d1e', color: '#facc15' }}>{selected.pending_count || 0} pending</span>
                  <span style={{ ...s.typeBadge, background: '#1e3a2f', color: '#4ade80' }}>{(selected.total_beds || 0) - (selected.occupied_beds || 0) - (selected.pending_count || 0)} available</span>
                  {selected.house_manager && <span style={{ ...s.typeBadge, background: '#26262e', color: '#aaa' }}>Manager: {selected.house_manager}{selected.phone ? ` · ${selected.phone}` : ''}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button onClick={() => { setHouseEditForm({ type: selected.type, total_beds: selected.total_beds, house_manager: selected.house_manager || '', phone: selected.phone || '' }); setEditingHouse(true); }}
                  style={{ background: '#26262e', border: '1px solid #32323e', color: '#ccc', padding: '6px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  ✏ Edit House
                </button>
                <button onClick={() => setSelected(null)} style={s.closeBtn}>×</button>
              </div>
            </div>

            {editingHouse && (
              <div style={{ background: '#1a1a24', border: '1px solid #32323e', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px' }}>
                <p style={{ color: '#fff', fontSize: '14px', fontWeight: '600', margin: '0 0 14px 0' }}>Edit House Details</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Type</label>
                    <select value={houseEditForm.type} onChange={e => setHouseEditForm(p => ({ ...p, type: e.target.value }))}
                      style={{ width: '100%', background: '#26262e', border: '1px solid #3a3a48', borderRadius: '8px', padding: '8px 10px', color: '#fff', fontSize: '14px' }}>
                      <option value="Men">Men</option>
                      <option value="Women">Women</option>
                      <option value="Co-ed">Co-ed</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Total Beds</label>
                    <input type="number" value={houseEditForm.total_beds} onChange={e => setHouseEditForm(p => ({ ...p, total_beds: e.target.value }))}
                      style={{ width: '100%', background: '#26262e', border: '1px solid #3a3a48', borderRadius: '8px', padding: '8px 10px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '4px' }}>House Manager</label>
                    <input value={houseEditForm.house_manager} onChange={e => setHouseEditForm(p => ({ ...p, house_manager: e.target.value }))}
                      placeholder="Manager name"
                      style={{ width: '100%', background: '#26262e', border: '1px solid #3a3a48', borderRadius: '8px', padding: '8px 10px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Manager Phone</label>
                    <input value={houseEditForm.phone} onChange={e => setHouseEditForm(p => ({ ...p, phone: e.target.value }))}
                      placeholder="Phone number"
                      style={{ width: '100%', background: '#26262e', border: '1px solid #3a3a48', borderRadius: '8px', padding: '8px 10px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={saveHouseEdit}
                    style={{ background: '#1D9E75', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                    Save Changes
                  </button>
                  <button onClick={() => setEditingHouse(false)}
                    style={{ background: 'transparent', border: '1px solid #444', color: '#aaa', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div style={s.tabs}>
              {['residents', 'timeline', 'rooms', 'calendar', 'forms', 'messages'].map(t => (
                <button key={t} onClick={() => setActiveTab(t)} style={{ ...s.tab, ...(activeTab === t ? s.tabActive : {}) }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div style={s.modalBody}>
              {activeTab === 'residents' && (
                <>
                  <p style={s.sectionLabel}>Current residents ({residents.length})</p>
                  {residents.length === 0 ? <p style={{ color: '#999', fontSize: '14px' }}>No current residents.</p> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {residents.map(r => (
                        <div key={r.id} style={{ ...s.residentCard, cursor: 'pointer' }} onClick={() => { setSelected(null); openClientProfile(r); }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: r.status === 'Pending' ? '10px' : '0' }}>
                            <div style={s.resAvatar}>{initials(r.full_name)}</div>
                            <div style={{ flex: 1 }}>
                              <p style={s.resName}>{r.full_name}</p>
                              <p style={s.resMeta}>{r.status === 'Active' && r.level ? `Level ${r.level}` : '—'}{r.room_type ? ` · ${r.room_type}` : ''}</p>
                            </div>
                            <span style={{ ...s.typeBadge, background: statusColor(r.status).bg, color: statusColor(r.status).color }}>{r.status}</span>
                          </div>
                          {r.status === 'Pending' && (
                            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #32323e' }} onClick={e => e.stopPropagation()}>
                              {r.expected_move_in_date && (
                                <div style={{ marginBottom: '8px', padding: '6px 10px', background: '#2d2d1e', borderRadius: '6px', border: '1px solid #3a3a1e' }}>
                                  <span style={{ fontSize: '14px', color: '#bbb' }}>Expected move-in: </span>
                                  <span style={{ fontSize: '14px', color: '#facc15', fontWeight: '600' }}>
                                    {new Date(r.expected_move_in_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </span>
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={e => { e.stopPropagation(); setMoveInModal(r); setMoveInRoomType(r.room_type || 'Double'); setDidNotMoveInMode(false); }}
                                  style={{ background: '#16a34a', border: 'none', color: '#fff', padding: '7px 16px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600', flex: 2 }}>
                                  ✓ Confirm Move-In
                                </button>
                                <button onClick={e => { e.stopPropagation(); setMoveInModal(r); setDidNotMoveInMode(true); }}
                                  style={{ background: 'transparent', border: '1px solid #7f1d1d', color: '#f87171', padding: '7px 12px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', flex: 1 }}>
                                  Did Not Move In
                                </button>
                              </div>
                            </div>
                          )}
                          {r.status === 'Active' && (
                            <div style={s.resDetailGrid}>
                              <div style={s.resDetailItem}><span style={s.resDetailLabel}>Start Date</span><span style={s.resDetailVal}>{r.start_date || '—'}</span></div>
                              <div style={s.resDetailItem}><span style={s.resDetailLabel}>Room Type</span><span style={s.resDetailVal}>{r.room_type || '—'}</span></div>
                              <div style={s.resDetailItem}><span style={s.resDetailLabel}>Phone</span><span style={s.resDetailVal}>{r.phone || '—'}</span></div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {selected.notes && (
                    <>
                      <p style={{ ...s.sectionLabel, marginTop: '20px' }}>House notes</p>
                      <p style={{ color: '#aaa', fontSize: '14px', lineHeight: '1.6' }}>{selected.notes}</p>
                    </>
                  )}
                </>
              )}

              {activeTab === 'timeline' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <p style={{ ...s.sectionLabel, margin: 0 }}>Timeline</p>
                    <button onClick={() => setShowAddEntry(!showAddEntry)} style={s.smallAddBtn}>{showAddEntry ? 'Cancel' : '+ Add Entry'}</button>
                  </div>
                  {showAddEntry && (
                    <div style={s.miniForm}>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={s.label}>Entry Type *</label>
                        <select value={entryType} onChange={e => handleEntryTypeChange(e.target.value)} style={s.input}>
                          {ENTRY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      {entryType === 'Crisis' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={s.label}>Severity *</label>
                          <div style={{ display: 'flex', gap: '16px' }}>
                            {['Low', 'Medium', 'High'].map(sv => (
                              <label key={sv} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>
                                <input type="radio" name="severity" value={sv} checked={entryForm.severity === sv} onChange={() => setEntryForm(p => ({ ...p, severity: sv }))} />{sv}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {entryType === 'House Inspection' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={s.label}>Result *</label>
                          <div style={{ display: 'flex', gap: '16px' }}>
                            {['Pass', 'Fail'].map(opt => (
                              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>
                                <input type="radio" name="inspection_result" value={opt} checked={entryForm.inspection_result === opt} onChange={() => setEntryForm(p => ({ ...p, inspection_result: opt }))} />{opt}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {entryType === 'Maintenance/Repair' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={s.label}>Status</label>
                          <div style={{ display: 'flex', gap: '16px' }}>
                            {['Reported', 'In Progress', 'Completed'].map(opt => (
                              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>
                                <input type="radio" name="maintenance_status" value={opt} checked={entryForm.maintenance_status === opt} onChange={() => setEntryForm(p => ({ ...p, maintenance_status: opt }))} />{opt}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {entryType === 'Maintenance Request' && (
                        <>
                          <div style={{ marginBottom: '12px' }}>
                            <label style={s.label}>Issue Type *</label>
                            <select value={entryForm.issue_type || ''} onChange={e => setEntryForm(p => ({ ...p, issue_type: e.target.value }))} style={s.input}>
                              <option value="">Select issue type...</option>
                              {['Safety & Security', 'Plumbing', 'Electrical', 'HVAC', 'Appliances', 'Other'].map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ marginBottom: '12px' }}>
                            <label style={s.label}>Location in house *</label>
                            <input value={entryForm.issue_location || ''} onChange={e => setEntryForm(p => ({ ...p, issue_location: e.target.value }))} style={s.input} placeholder="e.g. Upstairs bathroom, left bedroom..." />
                          </div>
                          <div style={{ marginBottom: '12px' }}>
                            <label style={s.label}>Previously submitted?</label>
                            <div style={{ display: 'flex', gap: '16px' }}>
                              {['Yes', 'No'].map(opt => (
                                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>
                                  <input type="radio" name="prev_submitted" value={opt} checked={entryForm.previously_submitted === opt} onChange={() => setEntryForm(p => ({ ...p, previously_submitted: opt }))} />{opt}
                                </label>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                      {entryType === 'Event Attendance' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={s.label}>Event Name *</label>
                          <input value={entryForm.event_name} onChange={e => setEntryForm(p => ({ ...p, event_name: e.target.value }))} style={s.input} placeholder="e.g. AA Meeting, Community Dinner" />
                        </div>
                      )}
                      {entryType === 'House Check-In' && residents.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={s.label}>Residents</label>
                          {residents.map(r => (
                            <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #32323e' }}>
                              <span style={{ color: '#ddd', fontSize: '14px' }}>{r.full_name}</span>
                              <div style={{ display: 'flex', gap: '12px' }}>
                                {['Here', 'Not Here'].map(opt => (
                                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>
                                    <input type="radio" name={`checkin-${r.id}`} value={opt} checked={residentChecks[r.id]?.value === opt} onChange={() => setResCheck(r.id, opt)} />{opt}
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {entryType === 'Batch UA' && residents.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={s.label}>Results</label>
                          {residents.map(r => (
                            <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid #32323e' }}>
                              <p style={{ color: '#ddd', fontSize: '14px', margin: '0 0 4px 0' }}>{r.full_name}</p>
                              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                {['Positive', 'Negative', 'Inconclusive', 'Refused'].map(opt => (
                                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>
                                    <input type="radio" name={`ua-${r.id}`} value={opt} checked={residentChecks[r.id]?.value === opt} onChange={() => setResCheck(r.id, opt)} />{opt}
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {entryType === 'Event Attendance' && residents.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={s.label}>Attendance</label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {residents.map(r => (
                              <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={residentChecks[r.id]?.value === 'Attended'} onChange={e => setResCheck(r.id, e.target.checked ? 'Attended' : '')} />{r.full_name}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {entryType === 'Weekly Reflection' && (
                        <HouseWeeklyReflectionForm entryForm={entryForm} setEntryForm={setEntryForm} />
                      )}
                      <div style={{ marginBottom: '12px' }}>
                        <label style={s.label}>Author *</label>
                        <input value={entryForm.author} onChange={e => setEntryForm(p => ({ ...p, author: e.target.value }))} style={s.input} placeholder="Your name" />
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={s.label}>{entryType === 'Weekly Reflection' ? 'Additional notes (optional)' : 'Notes'}</label>
                        <textarea value={entryForm.notes} onChange={e => setEntryForm(p => ({ ...p, notes: e.target.value }))} style={{ ...s.input, resize: 'vertical' }} rows={3} placeholder="Add any notes..." />
                      </div>
                      <button onClick={saveEntry} style={s.saveBtn}>Save Entry</button>
                    </div>
                  )}
                  {timeline.length === 0 ? <p style={{ color: '#999', fontSize: '14px' }}>No timeline entries yet.</p> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {timeline.map(entry => (
                        <div key={entry.id} style={s.timelineCard}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: entryColor(entry.entry_type), flexShrink: 0 }} />
                              <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{entry.entry_type}</span>
                              {entry.severity && <span style={{ ...s.typeBadge, background: severityColor(entry.severity).bg, color: severityColor(entry.severity).color }}>{entry.severity}</span>}
                              {entry.event_name && <span style={{ color: '#60a5fa', fontSize: '14px' }}>{entry.event_name}</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ color: '#bbb', fontSize: '14px' }}>{formatDate(entry.created_at)}</span>
                              <button onClick={() => deleteEntry(entry.id)} style={{ ...s.deleteBtn, padding: '2px 8px', fontSize: '14px' }}>×</button>
                            </div>
                          </div>
                          {entry.latitude && entry.longitude && <LocationPin entryId={entry.id} lat={entry.latitude} lng={entry.longitude} />}
                          {entry.resident_data && entry.resident_data.length > 0 && (
                            <div style={{ marginBottom: '8px' }}>
                              {entry.entry_type === 'House Check-In' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                  {entry.resident_data.filter(r => r.value).map(r => (
                                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 6px', background: '#26262e', borderRadius: '4px' }}>
                                      <span style={{ color: '#aaa', fontSize: '14px' }}>{r.name}</span>
                                      <span style={{ fontSize: '14px', color: r.value === 'Here' ? '#4ade80' : '#f87171', fontWeight: '600' }}>{r.value}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {entry.entry_type === 'Batch UA' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {entry.resident_data.filter(r => r.value).map(r => (
                                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 6px', background: '#26262e', borderRadius: '4px' }}>
                                      <span style={{ color: '#aaa', fontSize: '14px' }}>{r.name}</span>
                                      <span style={{ fontSize: '14px', fontWeight: '600', color: r.value === 'Negative' ? '#4ade80' : r.value === 'Positive' ? '#f87171' : '#fb923c' }}>{r.value}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {entry.entry_type === 'Event Attendance' && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {entry.resident_data.filter(r => r.value === 'Attended').map(r => (
                                    <span key={r.id} style={{ ...s.typeBadge, background: '#1e2d3a', color: '#60a5fa', fontSize: '14px' }}>{r.name}</span>
                                  ))}
                                </div>
                              )}
                              {entry.entry_type === 'House Inspection' && entry.inspection_result && (
                                <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: '600', background: entry.inspection_result === 'Pass' ? '#14532d' : '#7f1d1d', color: entry.inspection_result === 'Pass' ? '#4ade80' : '#f87171' }}>
                                  {entry.inspection_result}
                                </span>
                              )}
                              {entry.entry_type === 'Maintenance/Repair' && entry.maintenance_status && (
                                <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: '600', background: entry.maintenance_status === 'Completed' ? '#14532d' : entry.maintenance_status === 'In Progress' ? '#78350f' : '#1e3a5f', color: entry.maintenance_status === 'Completed' ? '#4ade80' : entry.maintenance_status === 'In Progress' ? '#fb923c' : '#60a5fa' }}>
                                  {entry.maintenance_status}
                                </span>
                              )}
                            </div>
                          )}
                          {entry.entry_type === 'Weekly Reflection'
                            ? <HouseWeeklyReflectionCard entry={entry} />
                            : entry.notes && <p style={{ color: '#aaa', fontSize: '14px', margin: '6px 0 0 0', lineHeight: '1.5' }}>{entry.notes}</p>
                          }
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                            <span style={{ color: '#bbb', fontSize: '14px' }}>By {entry.author}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'rooms' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <p style={{ ...s.sectionLabel, margin: 0 }}>Rooms & beds</p>
                    <button onClick={() => setShowAddRoom(!showAddRoom)} style={s.smallAddBtn}>{showAddRoom ? 'Cancel' : '+ Add Room'}</button>
                  </div>
                  {showAddRoom && (
                    <div style={s.miniForm}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                        <div><label style={s.label}>Room Name *</label><input value={roomForm.name} onChange={e => setRoomForm(p => ({ ...p, name: e.target.value }))} style={s.input} placeholder="e.g. Room 1" /></div>
                        <div><label style={s.label}>Type</label><select value={roomForm.type} onChange={e => setRoomForm(p => ({ ...p, type: e.target.value }))} style={s.input}><option>Single</option><option>Double</option><option>Triple</option></select></div>
                        <div><label style={s.label}>Beds</label><input type="number" value={roomForm.beds} onChange={e => setRoomForm(p => ({ ...p, beds: e.target.value }))} style={s.input} /></div>
                      </div>
                      <button onClick={addRoom} style={s.saveBtn}>Save Room</button>
                    </div>
                  )}
                  {rooms.length === 0 ? <p style={{ color: '#999', fontSize: '14px' }}>No rooms added yet.</p> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {rooms.map(r => (
                        <div key={r.id} style={s.roomRow}>
                          <div style={{ flex: 1 }}>
                            <p style={{ color: '#fff', fontSize: '14px', fontWeight: '500', margin: 0 }}>{r.name}</p>
                            <p style={{ color: '#999', fontSize: '14px', margin: '2px 0 0 0' }}>{r.type} · {r.beds} bed{r.beds !== 1 ? 's' : ''}</p>
                          </div>
                          <button onClick={() => deleteRoom(r.id)} style={s.deleteBtn}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'calendar' && (
                <HouseCalendarTab houseId={selected.id} houseType={selected.type} />
              )}

              {activeTab === 'forms' && (
                <div>
                  <MoveOutRequestsTab houseId={selected.id} houseName={selected.name} />
                  <OvernightRequestsTab houseId={selected.id} houseName={selected.name} />
                </div>
              )}

              {activeTab === 'messages' && (
                canSeeHouseChat ? (
                  <HouseChatTab houseId={selected.id} houseName={selected.name} user={user} />
                ) : (
                  <p style={{ color: '#888', fontSize: '14px' }}>You don't have access to this house's chat.</p>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Move-In modal */}
      {moveInModal && (
        <div style={{ ...s.overlay, zIndex: 2000 }} onClick={() => { setMoveInModal(null); setDidNotMoveInMode(false); setDidNotMoveInReason(''); }}>
          <div style={{ background: '#1c1c24', borderRadius: '16px', border: '1px solid #32323e', width: '100%', maxWidth: '400px', marginTop: '120px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #32323e' }}>
              <h3 style={{ color: '#fff', margin: 0, fontSize: '16px' }}>{didNotMoveInMode ? 'Did Not Move In' : 'Confirm Move-In'}</h3>
              <p style={{ color: '#999', fontSize: '14px', margin: '4px 0 0 0' }}>{moveInModal.full_name}</p>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {!didNotMoveInMode ? (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={s.label}>Room Type *</label>
                    <select value={moveInRoomType} onChange={e => setMoveInRoomType(e.target.value)} style={s.input}>
                      <option value="Single">Single — $160/week</option>
                      <option value="Double">Double — $135/week</option>
                      <option value="Houseperson">Houseperson — $110/week</option>
                    </select>
                  </div>
                  <div style={{ background: '#26262e', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                    <p style={{ color: '#aaa', fontSize: '14px', margin: '0 0 6px 0' }}>This will:</p>
                    <p style={{ color: '#ddd', fontSize: '14px', margin: '0 0 4px 0' }}>✓ Set status to <strong>Active</strong> with today's move-in date</p>
                    <p style={{ color: '#ddd', fontSize: '14px', margin: '0 0 4px 0' }}>✓ Create a <strong>$150 move-in fee</strong> charge</p>
                    <p style={{ color: '#ddd', fontSize: '14px', margin: 0 }}>✓ Weekly charges of <strong>{weeklyRateForType(moveInRoomType)}</strong> start next Sunday</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <button onClick={confirmMoveIn} disabled={savingMoveIn}
                      style={{ flex: 2, background: '#16a34a', border: 'none', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
                      {savingMoveIn ? 'Confirming...' : 'Confirm Move-In'}
                    </button>
                    <button onClick={() => setDidNotMoveInMode(true)}
                      style={{ flex: 1, background: 'transparent', border: '1px solid #7f1d1d', color: '#f87171', padding: '10px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}>
                      Did Not Move In
                    </button>
                  </div>
                  <button onClick={() => setMoveInModal(null)}
                    style={{ width: '100%', background: 'transparent', border: '1px solid #3a3a48', color: '#aaa', padding: '10px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <p style={{ color: '#aaa', fontSize: '14px', margin: '0 0 12px 0' }}>
                    This will revert <strong style={{ color: '#fff' }}>{moveInModal.full_name}</strong> back to Accepted status and log the reason in their stays history.
                  </p>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={s.label}>Reason *</label>
                    <textarea
                      value={didNotMoveInReason}
                      onChange={e => setDidNotMoveInReason(e.target.value)}
                      rows={3}
                      placeholder="e.g. Chose another facility, violated terms before move-in, could not be reached..."
                      style={{ ...s.input, resize: 'vertical', height: 'auto', fontFamily: 'inherit' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleDidNotMoveIn} disabled={savingMoveIn}
                      style={{ flex: 1, background: '#7f1d1d', border: 'none', color: '#f87171', padding: '10px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
                      {savingMoveIn ? 'Saving...' : 'Confirm Did Not Move In'}
                    </button>
                    <button onClick={() => { setDidNotMoveInMode(false); setDidNotMoveInReason(''); }}
                      style={{ flex: 1, background: 'transparent', border: '1px solid #3a3a48', color: '#aaa', padding: '10px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
                      Back
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// Suppress unused warning

const s = {
  page: { padding: '32px', fontFamily: "'Inter', 'system-ui', sans-serif", color: '#fff' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: '700', margin: 0 },
  sub: { color: '#999', fontSize: '14px', margin: '4px 0 0 0' },
  addBtn: { backgroundColor: '#b22222', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '500' },
  smallAddBtn: { backgroundColor: 'transparent', border: '1px solid #3a3a48', color: '#aaa', padding: '6px 14px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' },
  addForm: { background: '#26262e', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px', border: '1px solid #32323e' },
  miniForm: { background: '#26262e', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', border: '1px solid #32323e' },
  addTitle: { color: '#fff', fontSize: '15px', fontWeight: '600', margin: '0 0 16px 0' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' },
  label: { display: 'block', color: '#aaa', fontSize: '14px', marginBottom: '4px' },
  input: { width: '100%', backgroundColor: '#1c1c24', border: '1px solid #3a3a48', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  saveBtn: { backgroundColor: '#16a34a', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' },
  deleteBtn: { backgroundColor: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '4px 10px', borderRadius: '6px', fontSize: '14px', cursor: 'pointer' },
  deleteHouseBtn: { backgroundColor: 'transparent', border: '1px solid #444', color: '#666', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' },
  viewToggle: { display: 'flex', background: '#26262e', borderRadius: '8px', border: '1px solid #32323e', overflow: 'hidden' },
  toggleBtn: { padding: '8px 16px', border: 'none', background: 'transparent', color: '#bbb', cursor: 'pointer', fontSize: '14px' },
  toggleBtnActive: { background: '#999', color: '#fff' },
  houseGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' },
  houseCard: { background: '#26262e', borderRadius: '12px', padding: '18px 20px', border: '1px solid #32323e', cursor: 'pointer' },
  houseCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' },
  houseName: { color: '#fff', fontSize: '15px', fontWeight: '600', margin: '0 0 4px 0' },
  houseAddress: { color: '#999', fontSize: '14px', margin: 0 },
  typeBadge: { fontSize: '14px', padding: '3px 8px', borderRadius: '20px', fontWeight: '500', whiteSpace: 'nowrap' },
  bedBar: { height: '4px', background: '#26262e', borderRadius: '2px', marginBottom: '12px', overflow: 'hidden' },
  bedBarFill: (house) => ({ height: '100%', width: `${Math.min((((house.occupied_beds || 0) + (house.pending_count || 0)) / (house.total_beds || 1)) * 100, 100)}%`, background: '#c084fc', borderRadius: '2px' }),
  houseStats: { display: 'flex', gap: '16px', marginBottom: '10px' },
  statItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  statNum: { fontSize: '18px', fontWeight: '700', color: '#fff' },
  statLbl: { fontSize: '14px', color: '#999' },
  manager: { color: '#bbb', fontSize: '14px', margin: 0 },
  houseGroup: { marginBottom: '32px' },
  houseGroupHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid #32323e' },
  houseGroupName: { fontSize: '16px', fontWeight: '600', color: '#fff' },
  houseGroupCount: { fontSize: '14px', color: '#999', marginLeft: 'auto' },
  residentTable: { background: '#26262e', borderRadius: '10px', overflow: 'hidden', border: '1px solid #32323e' },
  residentTableHeader: { display: 'flex', padding: '10px 16px', background: '#26262e', fontSize: '14px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', gap: '12px' },
  residentTableRow: { display: 'flex', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #32323e', gap: '12px' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: '#1c1c24', borderRadius: '16px', border: '1px solid #32323e', width: '100%', maxWidth: '680px', overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '20px 24px', borderBottom: '1px solid #32323e' },
  modalName: { fontSize: '20px', fontWeight: '600', margin: 0, color: '#fff' },
  modalSub: { fontSize: '14px', color: '#999', margin: '4px 0 0 0' },
  closeBtn: { width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #3a3a48', background: 'transparent', cursor: 'pointer', color: '#bbb', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tabs: { display: 'flex', borderBottom: '1px solid #32323e', padding: '0 20px' },
  tab: { padding: '10px 16px', fontSize: '14px', cursor: 'pointer', color: '#999', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', whiteSpace: 'nowrap' },
  tabActive: { color: '#fff', borderBottomColor: '#fff' },
  modalBody: { padding: '20px 24px', maxHeight: '520px', overflowY: 'auto' },
  sectionLabel: { fontSize: '14px', fontWeight: '500', color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px 0' },
  residentCard: { background: '#26262e', borderRadius: '10px', padding: '14px 16px', border: '1px solid #32323e' },
  resAvatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#2d1e3a', color: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '500', flexShrink: 0 },
  resName: { color: '#fff', fontSize: '14px', fontWeight: '500', margin: 0 },
  resMeta: { color: '#999', fontSize: '14px', margin: '2px 0 0 0' },
  resDetailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '10px' },
  resDetailItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  resDetailLabel: { fontSize: '13px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' },
  resDetailVal: { fontSize: '14px', color: '#ddd' },
  roomRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#26262e', borderRadius: '10px' },
  timelineCard: { background: '#26262e', borderRadius: '10px', padding: '12px 14px', border: '1px solid #32323e' },
};

function MoveOutRequestsTab({ houseId, houseName }) {
  const { isAdmin, isUpperManagement } = useUser();
  const canReview = isAdmin || isUpperManagement;

  const SUPABASE_URL = 'https://pmvxnetpbxuzkrxitioc.supabase.co';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdnhuZXRwYnh1emtyeGl0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjE1NDcsImV4cCI6MjA5MDgzNzU0N30.IRRDTmFc3Ew1GWk69q0pSRTezsJOskK43yklIK4h2Xc';

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [reviewing, setReviewing] = useState(null); // { id, action }
  const [reviewNotes, setReviewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('pending');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('move_out_requests')
      .select('*, clients(full_name, phone, level)')
      .eq('house_id', houseId)
      .order('created_at', { ascending: false });
    if (filter !== 'all') q = q.eq('status', filter);
    const { data } = await q;
    setRequests(data || []);
    setLoading(false);
  }, [houseId, filter]);

  useEffect(() => { fetchRequests(); }, [houseId, filter, fetchRequests]);

  useEffect(() => {
    const channel = supabase.channel(`move_out_requests_${houseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'move_out_requests', filter: `house_id=eq.${houseId}` },
        () => { fetchRequests(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [houseId, fetchRequests]);

  const handleReview = async (request, action) => {
    setSaving(true);
    const { error } = await supabase.from('move_out_requests').update({
      status: action,
      reviewed_at: new Date().toISOString(),
      review_notes: reviewNotes || null,
    }).eq('id', request.id);

    if (error) { alert('Error: ' + error.message); setSaving(false); return; }

    // Send notifications via edge function
    await fetch(`${SUPABASE_URL}/functions/v1/move-out-request-reviewed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
      body: JSON.stringify({
        request_id: request.id,
        client_id: request.client_id,
        house_id: houseId,
        client_name: request.clients?.full_name,
        house_name: houseName,
        action,
        review_notes: reviewNotes || null,
        move_out_date: request.requested_move_out_date,
      }),
    }).catch(err => console.error('Notification error:', err));

    setReviewing(null);
    setReviewNotes('');
    fetchRequests();
    setSaving(false);
  };

  const LEVEL_REQS = [
    'Completed Thursday Night Alive Sessions', '90 days in house residency',
    'Employed (min. 30 hours/week)', 'Sponsor (min. 4 contacts/week)',
    'Attend 4 AA or NA meetings per week', 'Sunday morning house meeting',
    'Participate in weekly house dinner', 'Zero balance',
    'Complete Step 9 with a sponsor', 'Must have a service position in your home group',
  ];

  const statusColor = (s) => s === 'approved' ? '#4ade80' : s === 'denied' ? '#f87171' : '#fb923c';
  const statusBg = (s) => s === 'approved' ? '#14532d' : s === 'denied' ? '#7f1d1d' : '#78350f';
  const statusLabel = (s) => s === 'approved' ? '✓ Approved' : s === 'denied' ? '✗ Denied' : '⏳ Pending';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p style={s.sectionLabel}>Move-Out Requests</p>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['pending', 'approved', 'denied', 'all'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none', background: filter === f ? '#b22222' : '#2a2a2a', color: filter === f ? '#fff' : '#888' }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#888', fontSize: '14px' }}>Loading...</p>
      ) : requests.length === 0 ? (
        <p style={{ color: '#888', fontSize: '14px' }}>No {filter === 'all' ? '' : filter} move-out requests.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {requests.map(r => (
            <div key={r.id} style={{ background: '#1c1c24', border: `1px solid ${r.status === 'pending' ? '#fb923c44' : '#2a2a2a'}`, borderRadius: '10px', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                <div>
                  <p style={{ margin: 0, color: '#fff', fontWeight: '600', fontSize: '15px' }}>{r.clients?.full_name}</p>
                  <p style={{ margin: '3px 0 0', color: '#888', fontSize: '13px' }}>
                    Requested: {r.requested_move_out_date ? new Date(r.requested_move_out_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    &nbsp;·&nbsp; Submitted: {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', background: statusBg(r.status), color: statusColor(r.status) }}>
                    {statusLabel(r.status)}
                  </span>
                  <span style={{ color: '#666', fontSize: '14px' }}>{expanded === r.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded details */}
              {expanded === r.id && (
                <div style={{ borderTop: '1px solid #2a2a2a', padding: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                    {[
                      ['Moving To', r.moving_to],
                      ['PO Name', r.po_name || '—'],
                      ['PO Phone', r.po_phone || '—'],
                      ['Change of Address', r.change_of_address ? 'Yes' : 'No'],
                      ['Continuing Level 4', r.continuing_level_4 ? 'Yes' : 'No'],
                      ['All Requirements Met', r.all_requirements_met ? 'Yes' : 'No'],
                      ['Marketing Permission', r.marketing_permission ? 'Yes' : 'No'],
                    ].map(([label, val]) => (
                      <div key={label} style={{ background: '#1e1e24', borderRadius: '8px', padding: '10px 12px' }}>
                        <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
                        <p style={{ margin: 0, fontSize: '14px', color: '#ddd' }}>{val || '—'}</p>
                      </div>
                    ))}
                  </div>

                  {/* Requirements checklist */}
                  <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Requirements Checked Off</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
                    {LEVEL_REQS.map(req => {
                      const done = (r.requirements_completed || []).includes(req);
                      return (
                        <div key={req} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: done ? '#0f2e1a' : '#111', borderRadius: '6px' }}>
                          <span style={{ color: done ? '#4ade80' : '#444', fontSize: '14px' }}>{done ? '✓' : '○'}</span>
                          <span style={{ fontSize: '14px', color: done ? '#4ade80' : '#555' }}>{req}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Feedback */}
                  {(r.liked || r.disliked || r.other_notes) && (
                    <>
                      {r.liked && <div style={{ marginBottom: '10px' }}><p style={{ margin: '0 0 4px', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>What They Liked</p><p style={{ margin: 0, fontSize: '14px', color: '#aaa', fontStyle: 'italic' }}>{r.liked}</p></div>}
                      {r.disliked && <div style={{ marginBottom: '10px' }}><p style={{ margin: '0 0 4px', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>What They Didn't Like</p><p style={{ margin: 0, fontSize: '14px', color: '#aaa', fontStyle: 'italic' }}>{r.disliked}</p></div>}
                      {r.other_notes && <div style={{ marginBottom: '16px' }}><p style={{ margin: '0 0 4px', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Other Notes</p><p style={{ margin: 0, fontSize: '14px', color: '#aaa', fontStyle: 'italic' }}>{r.other_notes}</p></div>}
                    </>
                  )}

                  {/* Review notes if already reviewed */}
                  {r.status !== 'pending' && r.review_notes && (
                    <div style={{ background: '#1e1e24', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                      <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Review Notes</p>
                      <p style={{ margin: 0, fontSize: '14px', color: '#aaa', fontStyle: 'italic' }}>{r.review_notes}</p>
                    </div>
                  )}

                  {/* Approve/Deny actions */}
                  {canReview && r.status === 'pending' && (
                    reviewing?.id === r.id ? (
                      <div>
                        <p style={{ margin: '0 0 8px', fontSize: '14px', color: '#aaa' }}>
                          {reviewing.action === 'approved' ? '✓ Approving' : '✗ Denying'} — add a note (optional):
                        </p>
                        <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)}
                          rows={3} placeholder="Add a note to the resident..."
                          style={{ width: '100%', background: '#1e1e24', border: '1px solid #32323e', borderRadius: '8px', color: '#fff', fontSize: '14px', padding: '8px 10px', boxSizing: 'border-box', resize: 'none', marginBottom: '10px' }} />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleReview(r, reviewing.action)} disabled={saving}
                            style={{ flex: 1, padding: '9px', borderRadius: '8px', border: 'none', background: reviewing.action === 'approved' ? '#14532d' : '#7f1d1d', color: reviewing.action === 'approved' ? '#4ade80' : '#f87171', fontSize: '14px', fontWeight: '600', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                            {saving ? 'Saving...' : `Confirm ${reviewing.action === 'approved' ? 'Approval' : 'Denial'}`}
                          </button>
                          <button onClick={() => { setReviewing(null); setReviewNotes(''); }}
                            style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #32323e', background: 'transparent', color: '#888', fontSize: '14px', cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => setReviewing({ id: r.id, action: 'approved' })}
                          style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #166534', background: '#14532d', color: '#4ade80', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                          ✓ Approve
                        </button>
                        <button onClick={() => setReviewing({ id: r.id, action: 'denied' })}
                          style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #7f1d1d', background: '#450a0a', color: '#f87171', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                          ✗ Deny
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OvernightRequestsTab({ houseId, houseName }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [reviewing, setReviewing] = useState(null);
  const [reviewForm, setReviewForm] = useState({ decision: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const { user } = useUser();

  const fetchRequests = async () => {
    let q = supabase.from('overnight_requests').select('*').eq('house_id', houseId).order('created_at', { ascending: false });
    if (filter !== 'all') q = q.eq('status', filter);
    const { data } = await q;
    setRequests(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, [houseId, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const channel = supabase.channel(`overnight_requests_${houseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'overnight_requests', filter: `house_id=eq.${houseId}` },
        () => { fetchRequests(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [houseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReview = async (decision) => {
    if (!reviewing) return;
    setSaving(true);
    await supabase.from('overnight_requests').update({
      status: decision,
      review_notes: reviewForm.notes || null,
      reviewed_by: user?.email || null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', reviewing.id);

    // Notify client via in-app notification
    const { data: clientData } = await supabase.from('clients').select('auth_user_id').eq('id', reviewing.client_id).single();
    if (clientData?.auth_user_id) {
      await supabase.from('notifications').insert([{
        user_id: clientData.auth_user_id,
        type: 'overnight_request',
        message: `Your overnight pass request (${new Date(reviewing.departure_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}) has been ${decision}.${reviewForm.notes ? ` Note: ${reviewForm.notes}` : ''}`,
        read: false,
      }]);
    }

    setReviewing(null);
    setReviewForm({ decision: '', notes: '' });
    setSaving(false);
    fetchRequests();
  };

  const fmt = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  const statusColor = (s) => s === 'approved' ? '#4ade80' : s === 'denied' ? '#f87171' : '#fb923c';
  const statusBg = (s) => s === 'approved' ? '#14532d' : s === 'denied' ? '#3a0f0f' : '#3a2d1e';

  return (
    <div style={{ marginTop: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h4 style={{ color: '#fff', margin: 0, fontSize: '15px' }}>🌙 Overnight Pass Requests</h4>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['pending', 'approved', 'denied', 'all'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: filter === f ? '600' : '400', background: filter === f ? '#b22222' : 'transparent', border: filter === f ? 'none' : '1px solid #333', color: filter === f ? '#fff' : '#888', textTransform: 'capitalize' }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p style={{ color: '#888', fontSize: '14px' }}>Loading...</p>
        : requests.length === 0 ? <p style={{ color: '#666', fontSize: '14px', fontStyle: 'italic' }}>No overnight requests found.</p>
        : requests.map(req => (
          <div key={req.id} style={{ background: '#1c1c24', border: '1px solid #2e2e3a', borderRadius: '10px', padding: '14px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <p style={{ color: '#fff', fontWeight: '600', fontSize: '14px', margin: '0 0 3px' }}>{req.client_name}</p>
                <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>
                  {fmt(req.departure_datetime)} → {fmt(req.return_datetime)}
                </p>
              </div>
              <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', background: statusBg(req.status), color: statusColor(req.status), textTransform: 'capitalize' }}>
                {req.status}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <div>
                <p style={{ color: '#666', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Reason</p>
                <p style={{ color: '#ddd', fontSize: '14px', margin: 0 }}>{req.reason || '—'}</p>
              </div>
              <div>
                <p style={{ color: '#666', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Location</p>
                <p style={{ color: '#ddd', fontSize: '14px', margin: 0 }}>{req.location || '—'}</p>
              </div>
              <div>
                <p style={{ color: '#666', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Who Seeing</p>
                <p style={{ color: '#ddd', fontSize: '14px', margin: 0 }}>{req.who_seeing || '—'}</p>
              </div>
              <div>
                <p style={{ color: '#666', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Signature</p>
                <p style={{ color: '#ddd', fontSize: '14px', margin: 0, fontStyle: 'italic' }}>{req.signature || '—'}</p>
              </div>
            </div>
            {req.review_notes && (
              <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 10px', padding: '6px 10px', background: '#1e1e24', borderRadius: '6px' }}>
                Review note: {req.review_notes}
              </p>
            )}
            {req.status === 'pending' && (
              reviewing?.id === req.id ? (
                <div>
                  <textarea value={reviewForm.notes} onChange={e => setReviewForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Optional note to client..." rows={2}
                    style={{ width: '100%', background: '#1e1e24', border: '1px solid #32323e', borderRadius: '6px', color: '#fff', padding: '8px', fontSize: '14px', resize: 'vertical', marginBottom: '8px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleReview('approved')} disabled={saving}
                      style={{ flex: 1, background: '#16a34a', border: 'none', color: '#fff', padding: '8px', borderRadius: '6px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
                      ✓ Approve
                    </button>
                    <button onClick={() => handleReview('denied')} disabled={saving}
                      style={{ flex: 1, background: '#b22222', border: 'none', color: '#fff', padding: '8px', borderRadius: '6px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
                      ✗ Deny
                    </button>
                    <button onClick={() => setReviewing(null)}
                      style={{ background: 'transparent', border: '1px solid #3a3a48', color: '#aaa', padding: '8px 14px', borderRadius: '6px', fontSize: '14px', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setReviewing(req); setReviewForm({ decision: '', notes: '' }); }}
                  style={{ background: '#1e2d3a', border: '1px solid #2a4a5a', color: '#60a5fa', padding: '7px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
                  Review Request
                </button>
              )
            )}
          </div>
        ))
      }
    </div>
  );
}

function HouseChatTab({ houseId, houseName, user }) {
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [memberProfiles, setMemberProfiles] = useState({});
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const subscriptionRef = useRef(null);

  useEffect(() => {
    let active = true;
    const init = async () => {
      setLoading(true);
      const { data: staffData } = await supabase.from('user_profiles').select('id, full_name, email, role');
      const map = {};
      (staffData || []).forEach(st => { map[st.id] = st; });
      const { data: clientData } = await supabase.from('clients').select('full_name, email, auth_user_id').not('auth_user_id', 'is', null);
      (clientData || []).forEach(c => { if (c.auth_user_id) map[c.auth_user_id] = { full_name: c.full_name, email: c.email, role: 'resident' }; });
      if (active) setMemberProfiles(map);

      let { data: houseConv } = await supabase.from('conversations').select('*').eq('house_id', houseId).maybeSingle();
      if (!houseConv) {
        const { data: created } = await supabase.from('conversations').insert([{ name: houseName, type: 'group', house_id: houseId }]).select().single();
        houseConv = created;
      }
      if (!active || !houseConv) { setLoading(false); return; }
      setConv(houseConv);

      await supabase.from('conversation_members').upsert({
        conversation_id: houseConv.id, user_id: user.id, last_read_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id,user_id' });

      const { data: msgs } = await supabase.from('messages').select('*').eq('conversation_id', houseConv.id).order('created_at', { ascending: true });
      if (active) setMessages(msgs || []);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    };
    init();
    return () => { active = false; if (subscriptionRef.current) supabase.removeChannel(subscriptionRef.current); };
  }, [houseId, houseName, user.id]);

  useEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps
    if (!conv) return;
    if (subscriptionRef.current) supabase.removeChannel(subscriptionRef.current);
    const channel = supabase.channel(`house_chat_${conv.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conv.id}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new]);
          supabase.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conv.id).eq('user_id', user.id);
        })
      .subscribe();
    subscriptionRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [conv?.id, user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const getSenderName = (senderId) => {
    if (senderId === user.id) return 'You';
    const profile = memberProfiles[senderId];
    if (profile?.full_name) return profile.full_name;
    if (profile?.email) return profile.email;
    return profile?.role === 'resident' ? 'Resident' : 'Staff';
  };

  const formatTime = (d) => {
    const date = new Date(d);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !conv || sending) return;
    setSending(true);
    const body = newMessage.trim();
    setNewMessage('');
    const { error } = await supabase.from('messages').insert([{ conversation_id: conv.id, sender_id: user.id, body }]);
    if (error) { alert('Error sending: ' + error.message); setNewMessage(body); }
    setSending(false);
  };

  if (loading) return <p style={{ color: '#888', fontSize: '14px' }}>Loading chat...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '500px', background: '#1c1c24', borderRadius: 10, overflow: 'hidden', border: '1px solid #32323e' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column' }}>
        {messages.length === 0 ? (
          <p style={{ color: '#888', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>No messages yet. Say hello! 👋</p>
        ) : messages.map((msg, idx) => {
          const isMe = msg.sender_id === user.id;
          const prevMsg = messages[idx - 1];
          const showSender = !isMe && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
          const isGrouped = prevMsg && prevMsg.sender_id === msg.sender_id && new Date(msg.created_at) - new Date(prevMsg.created_at) < 60000;
          return (
            <div key={msg.id} style={{ marginBottom: isGrouped ? '2px' : '12px', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
              {showSender && <p style={{ color: '#888', fontSize: '13px', margin: '0 0 3px 8px' }}>{getSenderName(msg.sender_id)}</p>}
              <div style={{ maxWidth: '70%', background: isMe ? '#b22222' : '#333', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', padding: '9px 14px' }}>
                <p style={{ color: '#fff', fontSize: '14px', margin: 0, lineHeight: '1.4', wordBreak: 'break-word' }}>{msg.body}</p>
              </div>
              {!isGrouped && <p style={{ color: '#999', fontSize: '12px', margin: '2px 4px 0 4px' }}>{formatTime(msg.created_at)}</p>}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ display: 'flex', gap: '10px', padding: '12px 16px', borderTop: '1px solid #32323e', background: '#1e1e24', flexShrink: 0 }}>
        <input ref={inputRef} value={newMessage} onChange={e => setNewMessage(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder={`Message ${houseName}...`}
          style={{ flex: 1, background: '#26262e', border: '1px solid #3a3a48', borderRadius: '10px', padding: '10px 14px', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
        <button onClick={sendMessage} disabled={!newMessage.trim() || sending}
          style={{ background: newMessage.trim() ? '#b22222' : '#333', border: 'none', color: newMessage.trim() ? '#fff' : '#bbb', padding: '10px 18px', borderRadius: '10px', fontSize: '14px', cursor: newMessage.trim() ? 'pointer' : 'default', fontWeight: '600' }}>
          Send
        </button>
      </div>
    </div>
  );
}

export default Houses;