import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const ENTRY_TYPES = ['House Check-In', 'Batch UA', 'Crisis', 'Event Attendance', 'General Note'];

function Houses() {
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [residents, setResidents] = useState([]);
  const [activeTab, setActiveTab] = useState('residents');
  const [rooms, setRooms] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [roomForm, setRoomForm] = useState({ name: '', type: 'Double', beds: '2' });
  const [entryType, setEntryType] = useState('House Check-In');
  const [entryForm, setEntryForm] = useState({ author: '', notes: '', severity: 'Low', event_name: '' });
  const [residentChecks, setResidentChecks] = useState({});
  const [form, setForm] = useState({
    name: '', address: '', city: '', zip: '', type: 'Men',
    total_beds: '', house_manager: '', phone: '', notes: '',
  });

  const fetchHouses = useCallback(async () => {
    setLoading(true);
    const { data: housesData } = await supabase.from('houses').select('*').order('name');
    const { data: clientsData } = await supabase
      .from('clients').select('house_id, status').in('status', ['Active', 'Pending']);
    const enriched = (housesData || []).map(h => ({
      ...h,
      occupied_beds: (clientsData || []).filter(c => c.house_id === h.id && c.status === 'Active').length,
      pending_count: (clientsData || []).filter(c => c.house_id === h.id && c.status === 'Pending').length,
    }));
    setHouses(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { fetchHouses(); }, [fetchHouses]);

  const fetchResidents = useCallback(async (houseId) => {
    const { data } = await supabase
      .from('clients').select('id, full_name, status, level, start_date, room_type, phone')
      .eq('house_id', houseId).in('status', ['Active', 'Pending']);
    setResidents(data || []);
    const checks = {};
    (data || []).forEach(r => { checks[r.id] = { name: r.full_name, value: '' }; });
    setResidentChecks(checks);
  }, []);

  const fetchRooms = useCallback(async (houseId) => {
    const { data } = await supabase.from('rooms').select('*').eq('house_id', houseId).order('name');
    setRooms(data || []);
  }, []);

  const fetchTimeline = useCallback(async (houseId) => {
    const { data } = await supabase.from('house_timeline').select('*')
      .eq('house_id', houseId).order('created_at', { ascending: false });
    setTimeline(data || []);
  }, []);

  const openHouse = (house) => {
    setSelected(house);
    setActiveTab('residents');
    setShowAddEntry(false);
    setEntryType('House Check-In');
    setEntryForm({ author: '', notes: '', severity: 'Low', event_name: '' });
    fetchResidents(house.id);
    fetchRooms(house.id);
    fetchTimeline(house.id);
  };

  const handleEntryTypeChange = (newType) => {
    setEntryType(newType);
    setEntryForm(prev => ({ author: prev.author, notes: '', severity: 'Low', event_name: '' }));
    setResidentChecks(prev => {
      const reset = {};
      Object.keys(prev).forEach(id => { reset[id] = { name: prev[id].name, value: '' }; });
      return reset;
    });
  };

  const set = (field, val) => setForm(p => ({ ...p, [field]: val }));

  const addHouse = async () => {
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
    fetchHouses();
  };

  const addRoom = async () => {
    if (!roomForm.name) { alert('Room name is required.'); return; }
    const { error } = await supabase.from('rooms').insert([{
      house_id: selected.id, name: roomForm.name, type: roomForm.type, beds: parseInt(roomForm.beds) || 1,
    }]);
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

    if ((entryType === 'House Check-In' || entryType === 'Batch UA') && resData.every(r => !r.value)) {
      alert('Please fill in at least one resident.'); return;
    }
    if (entryType === 'Event Attendance' && resData.every(r => r.value !== 'Attended')) {
      alert('Please select at least one resident.'); return;
    }

    const { error } = await supabase.from('house_timeline').insert([{
      house_id: selected.id,
      entry_type: entryType,
      author: entryForm.author,
      notes: entryForm.notes || null,
      severity: entryType === 'Crisis' ? entryForm.severity : null,
      event_name: entryType === 'Event Attendance' ? entryForm.event_name : null,
      resident_data: resData.length ? resData : null,
    }]);
    if (error) { alert('Error: ' + error.message); return; }

    if (['House Check-In', 'Batch UA', 'Event Attendance'].includes(entryType)) {
      const relevantResidents = resData.filter(r => r.value);
      for (const res of relevantResidents) {
        const { data: clientData } = await supabase
          .from('clients').select('id').eq('full_name', res.name).single();
        if (clientData) {
          await supabase.from('client_timeline').insert([{
            client_id: clientData.id,
            entry_type: entryType === 'Batch UA' ? 'UA' : entryType,
            author: entryForm.author,
            notes: entryForm.notes || null,
            event_name: entryType === 'Event Attendance' ? entryForm.event_name : res.value,
            source: 'house',
          }]);
        }
      }
    }

    setShowAddEntry(false);
    setEntryType('House Check-In');
    setEntryForm({ author: '', notes: '', severity: 'Low', event_name: '' });
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

  const setResCheck = (resId, val) => {
    setResidentChecks(p => ({ ...p, [resId]: { ...p[resId], value: val } }));
  };

  const entryColor = (type) => {
    if (type === 'House Check-In')   return '#7F77DD';
    if (type === 'Batch UA')         return '#1D9E75';
    if (type === 'Crisis')           return '#E24B4A';
    if (type === 'Event Attendance') return '#378ADD';
    if (type === 'General Note')     return '#BA7517';
    return '#888';
  };

  const severityColor = (sv) => {
    if (sv === 'High')   return { bg: '#3a1e1e', color: '#f87171' };
    if (sv === 'Medium') return { bg: '#3a2d1e', color: '#fb923c' };
    return { bg: '#1e3a2f', color: '#4ade80' };
  };

  const statusColor = (st) => {
    if (st === 'Active')  return { bg: '#2d1e3a', color: '#c084fc' };
    if (st === 'Pending') return { bg: '#2d2d1e', color: '#facc15' };
    return { bg: '#2a2a2a', color: '#aaa' };
  };

  const initials = (name) => name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '??';
  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Houses</h2>
          <p style={s.sub}>{houses.length} total</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={s.addBtn}>{showAdd ? 'Cancel' : '+ Add House'}</button>
      </div>

      {showAdd && (
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

      {loading ? <p style={{ color: '#888' }}>Loading...</p> : houses.length === 0 ? (
        <p style={{ color: '#888' }}>No houses yet.</p>
      ) : (
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
                <span style={s.statItem}><span style={s.statNum}>{house.total_beds || 0}</span><span style={s.statLabel}>Total</span></span>
                <span style={s.statItem}><span style={{ ...s.statNum, color: '#c084fc' }}>{house.occupied_beds || 0}</span><span style={s.statLabel}>Active</span></span>
                <span style={s.statItem}><span style={{ ...s.statNum, color: '#facc15' }}>{house.pending_count || 0}</span><span style={s.statLabel}>Pending</span></span>
                <span style={s.statItem}><span style={{ ...s.statNum, color: '#4ade80' }}>{(house.total_beds || 0) - (house.occupied_beds || 0) - (house.pending_count || 0)}</span><span style={s.statLabel}>Available</span></span>
              </div>
              {house.house_manager && <p style={s.manager}>Manager: {house.house_manager}</p>}
            </div>
          ))}
        </div>
      )}

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
                  {selected.house_manager && <span style={{ ...s.typeBadge, background: '#2a2a2a', color: '#aaa' }}>Manager: {selected.house_manager}</span>}
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={s.closeBtn}>×</button>
            </div>

            <div style={s.tabs}>
              {['residents', 'timeline', 'rooms', 'forms'].map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  style={{ ...s.tab, ...(activeTab === t ? s.tabActive : {}) }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div style={s.modalBody}>

              {activeTab === 'residents' && (
                <>
                  <p style={s.sectionLabel}>Current residents ({residents.length})</p>
                  {residents.length === 0 ? <p style={{ color: '#666', fontSize: '14px' }}>No current residents.</p> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {residents.map(r => (
                        <div key={r.id} style={s.residentRow}>
                          <div style={s.resAvatar}>{initials(r.full_name)}</div>
                          <div style={{ flex: 1 }}>
                            <p style={s.resName}>{r.full_name}</p>
                            <p style={s.resMeta}>Level {r.level || 1}{r.start_date ? ` · Move-in: ${r.start_date}` : ''}{r.phone ? ` · ${r.phone}` : ''}</p>
                          </div>
                          <span style={{ ...s.typeBadge, background: statusColor(r.status).bg, color: statusColor(r.status).color }}>{r.status}</span>
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
                    <button onClick={() => setShowAddEntry(!showAddEntry)} style={s.smallAddBtn}>
                      {showAddEntry ? 'Cancel' : '+ Add Entry'}
                    </button>
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
                              <label key={sv} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}>
                                <input type="radio" name="severity" value={sv} checked={entryForm.severity === sv} onChange={() => setEntryForm(p => ({ ...p, severity: sv }))} />
                                {sv}
                              </label>
                            ))}
                          </div>
                        </div>
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
                            <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #333' }}>
                              <span style={{ color: '#ddd', fontSize: '13px' }}>{r.full_name}</span>
                              <div style={{ display: 'flex', gap: '12px' }}>
                                {['Here', 'Not Here'].map(opt => (
                                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#aaa', fontSize: '12px', cursor: 'pointer' }}>
                                    <input type="radio" name={`checkin-${r.id}`} value={opt} checked={residentChecks[r.id]?.value === opt} onChange={() => setResCheck(r.id, opt)} />
                                    {opt}
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
                            <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid #333' }}>
                              <p style={{ color: '#ddd', fontSize: '13px', margin: '0 0 4px 0' }}>{r.full_name}</p>
                              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                {['Positive', 'Negative', 'Inconclusive', 'Refused'].map(opt => (
                                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#aaa', fontSize: '12px', cursor: 'pointer' }}>
                                    <input type="radio" name={`ua-${r.id}`} value={opt} checked={residentChecks[r.id]?.value === opt} onChange={() => setResCheck(r.id, opt)} />
                                    {opt}
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
                              <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={residentChecks[r.id]?.value === 'Attended'} onChange={e => setResCheck(r.id, e.target.checked ? 'Attended' : '')} />
                                {r.full_name}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ marginBottom: '12px' }}>
                        <label style={s.label}>Author *</label>
                        <input value={entryForm.author} onChange={e => setEntryForm(p => ({ ...p, author: e.target.value }))} style={s.input} placeholder="Your name" />
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={s.label}>Notes</label>
                        <textarea value={entryForm.notes} onChange={e => setEntryForm(p => ({ ...p, notes: e.target.value }))} style={{ ...s.input, resize: 'vertical' }} rows={3} placeholder="Add any notes..." />
                      </div>
                      <button onClick={saveEntry} style={s.saveBtn}>Save Entry</button>
                    </div>
                  )}

                  {timeline.length === 0 ? (
                    <p style={{ color: '#666', fontSize: '14px' }}>No timeline entries yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {timeline.map(entry => (
                        <div key={entry.id} style={s.timelineCard}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: entryColor(entry.entry_type), flexShrink: 0 }} />
                              <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{entry.entry_type}</span>
                              {entry.severity && <span style={{ ...s.typeBadge, background: severityColor(entry.severity).bg, color: severityColor(entry.severity).color }}>{entry.severity}</span>}
                              {entry.event_name && <span style={{ color: '#60a5fa', fontSize: '13px' }}>{entry.event_name}</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ color: '#555', fontSize: '11px' }}>{formatDate(entry.created_at)}</span>
                              <button onClick={() => deleteEntry(entry.id)} style={{ ...s.deleteBtn, padding: '2px 8px', fontSize: '11px' }}>×</button>
                            </div>
                          </div>

                          {entry.resident_data && entry.resident_data.length > 0 && (
                            <div style={{ marginBottom: '8px' }}>
                              {entry.entry_type === 'House Check-In' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                  {entry.resident_data.filter(r => r.value).map(r => (
                                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 6px', background: '#222', borderRadius: '4px' }}>
                                      <span style={{ color: '#aaa', fontSize: '12px' }}>{r.name}</span>
                                      <span style={{ fontSize: '11px', color: r.value === 'Here' ? '#4ade80' : '#f87171', fontWeight: '600' }}>{r.value}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {entry.entry_type === 'Batch UA' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {entry.resident_data.filter(r => r.value).map(r => (
                                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 6px', background: '#222', borderRadius: '4px' }}>
                                      <span style={{ color: '#aaa', fontSize: '12px' }}>{r.name}</span>
                                      <span style={{ fontSize: '11px', fontWeight: '600', color: r.value === 'Negative' ? '#4ade80' : r.value === 'Positive' ? '#f87171' : '#fb923c' }}>{r.value}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {entry.entry_type === 'Event Attendance' && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {entry.resident_data.filter(r => r.value === 'Attended').map(r => (
                                    <span key={r.id} style={{ ...s.typeBadge, background: '#1e2d3a', color: '#60a5fa', fontSize: '11px' }}>{r.name}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#555', fontSize: '12px' }}>By {entry.author}</span>
                          </div>
                          {entry.notes && <p style={{ color: '#aaa', fontSize: '13px', margin: '6px 0 0 0', lineHeight: '1.5' }}>{entry.notes}</p>}
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
                  {rooms.length === 0 ? <p style={{ color: '#666', fontSize: '14px' }}>No rooms added yet.</p> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {rooms.map(r => (
                        <div key={r.id} style={s.roomRow}>
                          <div style={{ flex: 1 }}>
                            <p style={{ color: '#fff', fontSize: '14px', fontWeight: '500', margin: 0 }}>{r.name}</p>
                            <p style={{ color: '#666', fontSize: '12px', margin: '2px 0 0 0' }}>{r.type} · {r.beds} bed{r.beds !== 1 ? 's' : ''}</p>
                          </div>
                          <button onClick={() => deleteRoom(r.id)} style={s.deleteBtn}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'forms' && (
                <div>
                  <p style={s.sectionLabel}>Forms</p>
                  <p style={{ color: '#666', fontSize: '14px', lineHeight: '1.6' }}>
                    Forms submitted by residents of {selected.name} will appear here once the forms system is built out.
                  </p>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page: { padding: '32px', fontFamily: 'sans-serif', color: '#fff' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: '700', margin: 0 },
  sub: { color: '#666', fontSize: '14px', margin: '4px 0 0 0' },
  addBtn: { backgroundColor: '#b22222', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '500' },
  smallAddBtn: { backgroundColor: 'transparent', border: '1px solid #444', color: '#aaa', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' },
  addForm: { background: '#2a2a2a', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px', border: '1px solid #333' },
  miniForm: { background: '#222', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', border: '1px solid #333' },
  addTitle: { color: '#fff', fontSize: '15px', fontWeight: '600', margin: '0 0 16px 0' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' },
  label: { display: 'block', color: '#aaa', fontSize: '13px', marginBottom: '4px' },
  input: { width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  saveBtn: { backgroundColor: '#16a34a', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' },
  deleteBtn: { backgroundColor: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' },
  houseGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' },
  houseCard: { background: '#2a2a2a', borderRadius: '12px', padding: '18px 20px', border: '1px solid #333', cursor: 'pointer' },
  houseCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' },
  houseName: { color: '#fff', fontSize: '15px', fontWeight: '600', margin: '0 0 4px 0' },
  houseAddress: { color: '#666', fontSize: '12px', margin: 0 },
  typeBadge: { fontSize: '11px', padding: '3px 8px', borderRadius: '20px', fontWeight: '500', whiteSpace: 'nowrap' },
  bedBar: { height: '4px', background: '#333', borderRadius: '2px', marginBottom: '12px', overflow: 'hidden' },
  bedBarFill: (house) => ({
    height: '100%',
    width: `${Math.min((((house.occupied_beds || 0) + (house.pending_count || 0)) / (house.total_beds || 1)) * 100, 100)}%`,
    background: '#c084fc', borderRadius: '2px',
  }),
  houseStats: { display: 'flex', gap: '16px', marginBottom: '10px' },
  statItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  statNum: { fontSize: '18px', fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: '11px', color: '#666' },
  manager: { color: '#888', fontSize: '12px', margin: '6px 0 0 0' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: '#1a1a1a', borderRadius: '16px', border: '1px solid #333', width: '100%', maxWidth: '680px', overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '20px 24px', borderBottom: '1px solid #333' },
  modalName: { fontSize: '20px', fontWeight: '600', margin: 0, color: '#fff' },
  modalSub: { fontSize: '13px', color: '#666', margin: '4px 0 0 0' },
  closeBtn: { width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #444', background: 'transparent', cursor: 'pointer', color: '#888', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tabs: { display: 'flex', borderBottom: '1px solid #333', padding: '0 20px' },
  tab: { padding: '10px 16px', fontSize: '13px', cursor: 'pointer', color: '#666', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', whiteSpace: 'nowrap' },
  tabActive: { color: '#fff', borderBottomColor: '#fff' },
  modalBody: { padding: '20px 24px', maxHeight: '520px', overflowY: 'auto' },
  sectionLabel: { fontSize: '11px', fontWeight: '500', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px 0' },
  residentRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#2a2a2a', borderRadius: '10px' },
  resAvatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#2d1e3a', color: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '500', flexShrink: 0 },
  resName: { color: '#fff', fontSize: '14px', fontWeight: '500', margin: 0 },
  resMeta: { color: '#666', fontSize: '12px', margin: '2px 0 0 0' },
  roomRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#2a2a2a', borderRadius: '10px' },
  timelineCard: { background: '#2a2a2a', borderRadius: '10px', padding: '12px 14px', border: '1px solid #333' },
};

export default Houses;