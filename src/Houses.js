import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

function Houses() {
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [residents, setResidents] = useState([]);
  const [form, setForm] = useState({
    name: '', address: '', city: '', zip: '', type: 'Men',
    total_beds: '', house_manager: '', phone: '', notes: '',
  });

  const fetchHouses = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('houses').select('*').order('name');
    setHouses(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchHouses(); }, [fetchHouses]);

  const fetchResidents = useCallback(async (houseId) => {
    const { data } = await supabase
      .from('clients')
      .select('id, full_name, status, level, start_date, room_type')
      .eq('house_id', houseId)
      .in('status', ['Active', 'Pending']);
    setResidents(data || []);
  }, []);

  const openHouse = (house) => {
    setSelected(house);
    fetchResidents(house.id);
  };

  const set = (field, val) => setForm(p => ({ ...p, [field]: val }));

  const addHouse = async () => {
    if (!form.name) { alert('House name is required.'); return; }
    if (!form.total_beds) { alert('Number of beds is required.'); return; }
    const { error } = await supabase.from('houses').insert([{
      name: form.name,
      address: form.address || null,
      city: form.city || null,
      zip: form.zip || null,
      type: form.type,
      total_beds: parseInt(form.total_beds),
      house_manager: form.house_manager || null,
      phone: form.phone || null,
      notes: form.notes || null,
    }]);
    if (error) { alert('Error adding house: ' + error.message); return; }
    setForm({ name: '', address: '', city: '', zip: '', type: 'Men', total_beds: '', house_manager: '', phone: '', notes: '' });
    setShowAdd(false);
    fetchHouses();
  };

  const bedsOccupied = (house) => residents.length;
  const bedsAvailable = (house) => (house.total_beds || 0) - residents.length;

  const statusColor = (s) => {
    if (s === 'Active')   return { bg: '#2d1e3a', color: '#c084fc' };
    if (s === 'Pending')  return { bg: '#2d2d1e', color: '#facc15' };
    return { bg: '#2a2a2a', color: '#aaa' };
  };

  const initials = (name) => name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '??';

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Houses</h2>
          <p style={s.sub}>{houses.length} total</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={s.addBtn}>
          {showAdd ? 'Cancel' : '+ Add House'}
        </button>
      </div>

      {showAdd && (
        <div style={s.addForm}>
          <p style={s.addTitle}>New House</p>
          <div style={s.grid2}>
            <div>
              <label style={s.label}>House Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} style={s.input} placeholder="e.g. 225 Watrous Ave." />
            </div>
            <div>
              <label style={s.label}>Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} style={s.input}>
                <option>Men</option>
                <option>Women</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Address</label>
              <input value={form.address} onChange={e => set('address', e.target.value)} style={s.input} placeholder="Street address" />
            </div>
            <div>
              <label style={s.label}>City</label>
              <input value={form.city} onChange={e => set('city', e.target.value)} style={s.input} placeholder="City" />
            </div>
            <div>
              <label style={s.label}>Zip Code</label>
              <input value={form.zip} onChange={e => set('zip', e.target.value)} style={s.input} placeholder="Zip" />
            </div>
            <div>
              <label style={s.label}>Total Beds *</label>
              <input type="number" value={form.total_beds} onChange={e => set('total_beds', e.target.value)} style={s.input} placeholder="0" />
            </div>
            <div>
              <label style={s.label}>House Manager</label>
              <input value={form.house_manager} onChange={e => set('house_manager', e.target.value)} style={s.input} placeholder="Manager name" />
            </div>
            <div>
              <label style={s.label}>Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} style={s.input} placeholder="House phone" />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={s.label}>Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} style={{ ...s.input, resize: 'vertical' }} rows={2} placeholder="Any notes about this house" />
            </div>
          </div>
          <button onClick={addHouse} style={s.saveBtn}>Save House</button>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#888' }}>Loading houses...</p>
      ) : houses.length === 0 ? (
        <p style={{ color: '#888' }}>No houses yet. Add your first house above.</p>
      ) : (
        <div style={s.houseGrid}>
          {houses.map(house => (
            <div key={house.id} style={s.houseCard} onClick={() => openHouse(house)}>
              <div style={s.houseCardTop}>
                <div>
                  <p style={s.houseName}>{house.name}</p>
                  <p style={s.houseAddress}>{house.address}{house.city ? `, ${house.city}` : ''}</p>
                </div>
                <span style={{ ...s.typeBadge, background: house.type === 'Women' ? '#3a1e2d' : '#1e2d3a', color: house.type === 'Women' ? '#f9a8d4' : '#60a5fa' }}>
                  {house.type}
                </span>
              </div>
              <div style={s.bedBar}>
                <div style={s.bedBarFill(house)} />
              </div>
              <div style={s.houseStats}>
                <span style={s.statItem}>
                  <span style={s.statNum}>{house.total_beds || 0}</span>
                  <span style={s.statLabel}>Total beds</span>
                </span>
                <span style={s.statItem}>
                  <span style={{ ...s.statNum, color: '#c084fc' }}>{house.occupied_beds || 0}</span>
                  <span style={s.statLabel}>Occupied</span>
                </span>
                <span style={s.statItem}>
                  <span style={{ ...s.statNum, color: '#4ade80' }}>{(house.total_beds || 0) - (house.occupied_beds || 0)}</span>
                  <span style={s.statLabel}>Available</span>
                </span>
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
                  <span style={{ ...s.typeBadge, background: selected.type === 'Women' ? '#3a1e2d' : '#1e2d3a', color: selected.type === 'Women' ? '#f9a8d4' : '#60a5fa' }}>
                    {selected.type}
                  </span>
                  <span style={{ ...s.typeBadge, background: '#1e3a2f', color: '#4ade80' }}>
                    {(selected.total_beds || 0) - (selected.occupied_beds || 0)} beds available
                  </span>
                  {selected.house_manager && (
                    <span style={{ ...s.typeBadge, background: '#2a2a2a', color: '#aaa' }}>
                      Manager: {selected.house_manager}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={s.closeBtn}>×</button>
            </div>

            <div style={s.modalBody}>
              <p style={s.sectionLabel}>Current residents</p>
              {residents.length === 0 ? (
                <p style={{ color: '#666', fontSize: '14px' }}>No current residents.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {residents.map(r => (
                    <div key={r.id} style={s.residentRow}>
                      <div style={s.resAvatar}>{initials(r.full_name)}</div>
                      <div style={{ flex: 1 }}>
                        <p style={s.resName}>{r.full_name}</p>
                        <p style={s.resMeta}>Level {r.level || 1}{r.start_date ? ` · Move-in: ${r.start_date}` : ''}{r.room_type ? ` · ${r.room_type}` : ''}</p>
                      </div>
                      <span style={{ ...s.typeBadge, background: statusColor(r.status).bg, color: statusColor(r.status).color }}>
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {selected.notes && (
                <>
                  <p style={{ ...s.sectionLabel, marginTop: '20px' }}>Notes</p>
                  <p style={{ color: '#aaa', fontSize: '14px', lineHeight: '1.6' }}>{selected.notes}</p>
                </>
              )}

              {selected.phone && (
                <>
                  <p style={{ ...s.sectionLabel, marginTop: '20px' }}>Contact</p>
                  <p style={{ color: '#aaa', fontSize: '14px' }}>{selected.phone}</p>
                </>
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
  addForm: { background: '#2a2a2a', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px', border: '1px solid #333' },
  addTitle: { color: '#fff', fontSize: '15px', fontWeight: '600', margin: '0 0 16px 0' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' },
  label: { display: 'block', color: '#aaa', fontSize: '13px', marginBottom: '4px' },
  input: { width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  saveBtn: { backgroundColor: '#16a34a', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' },
  houseGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' },
  houseCard: { background: '#2a2a2a', borderRadius: '12px', padding: '18px 20px', border: '1px solid #333', cursor: 'pointer' },
  houseCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' },
  houseName: { color: '#fff', fontSize: '15px', fontWeight: '600', margin: '0 0 4px 0' },
  houseAddress: { color: '#666', fontSize: '12px', margin: 0 },
  typeBadge: { fontSize: '11px', padding: '3px 8px', borderRadius: '20px', fontWeight: '500', whiteSpace: 'nowrap' },
  bedBar: { height: '4px', background: '#333', borderRadius: '2px', marginBottom: '12px', overflow: 'hidden' },
  bedBarFill: (house) => ({
    height: '100%',
    width: `${Math.min(((house.occupied_beds || 0) / (house.total_beds || 1)) * 100, 100)}%`,
    background: '#c084fc',
    borderRadius: '2px',
  }),
  houseStats: { display: 'flex', gap: '16px', marginBottom: '10px' },
  statItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  statNum: { fontSize: '18px', fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: '11px', color: '#666' },
  manager: { color: '#888', fontSize: '12px', margin: '6px 0 0 0' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: '#1a1a1a', borderRadius: '16px', border: '1px solid #333', width: '100%', maxWidth: '600px', overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '20px 24px', borderBottom: '1px solid #333' },
  modalName: { fontSize: '20px', fontWeight: '600', margin: 0, color: '#fff' },
  modalSub: { fontSize: '13px', color: '#666', margin: '4px 0 0 0' },
  closeBtn: { width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #444', background: 'transparent', cursor: 'pointer', color: '#888', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalBody: { padding: '20px 24px', maxHeight: '500px', overflowY: 'auto' },
  sectionLabel: { fontSize: '11px', fontWeight: '500', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px 0' },
  residentRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#2a2a2a', borderRadius: '10px' },
  resAvatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#2d1e3a', color: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '500', flexShrink: 0 },
  resName: { color: '#fff', fontSize: '14px', fontWeight: '500', margin: 0 },
  resMeta: { color: '#666', fontSize: '12px', margin: '2px 0 0 0' },
};

export default Houses;