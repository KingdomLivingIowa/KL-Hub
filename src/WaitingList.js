import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const LISTS = [
  'DOC Men', 'Community Men', 'Treatment Men',
  'DOC Women', 'Community Women', 'Treatment Women',
];

function WaitingList() {
  const [activeList, setActiveList] = useState('DOC Men');
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [accepted, setAccepted] = useState([]);
  const [addForm, setAddForm] = useState({ full_name: '', email: '', phone: '', notes: '', ready_date: '', application_id: null });
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('waiting_list')
      .select('*')
      .eq('list_type', activeList)
      .eq('status', 'waiting')
      .order('ready_date', { ascending: true, nullsFirst: false });
    if (!error) setClients(data || []);
    setLoading(false);
  }, [activeList]);

  const fetchAccepted = useCallback(async () => {
    const { data } = await supabase
      .from('applications')
      .select('id, full_name, email, phone')
      .eq('status', 'accepted');
    setAccepted(data || []);
  }, []);

  useEffect(() => {
    fetchList();
    fetchAccepted();
  }, [fetchList, fetchAccepted]);

  const selectAccepted = (app) => {
    setAddForm(p => ({ ...p, full_name: app.full_name, email: app.email || '', phone: app.phone || '', application_id: app.id }));
    setSearch(app.full_name);
    setShowDropdown(false);
  };

  const addToList = async () => {
    if (!addForm.full_name) { alert('Name is required.'); return; }
    const insertData = {
      full_name: addForm.full_name,
      email: addForm.email || null,
      phone: addForm.phone || null,
      notes: addForm.notes || null,
      ready_date: addForm.ready_date || null,
      list_type: activeList,
      position: clients.length + 1,
      status: 'waiting',
    };
    if (addForm.application_id) insertData.application_id = addForm.application_id;
    const { error } = await supabase.from('waiting_list').insert([insertData]);
    if (error) { alert('Error adding to list: ' + error.message); return; }
    setAddForm({ full_name: '', email: '', phone: '', notes: '', ready_date: '', application_id: null });
    setSearch('');
    setShowAdd(false);
    fetchList();
  };

  const removeFromList = async (id) => {
    if (!window.confirm('Remove this person from the waiting list?')) return;
    await supabase.from('waiting_list').update({ status: 'removed' }).eq('id', id);
    fetchList();
  };

  const formatDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString() : null;

  const daysDiff = (d) => {
    if (!d) return null;
    return Math.ceil((new Date(d + 'T00:00:00') - new Date()) / (1000 * 60 * 60 * 24));
  };

  const readyBadge = (d) => {
    const diff = daysDiff(d);
    if (diff === null) return null;
    if (diff < 0) return { label: 'Ready now', color: '#16a34a' };
    if (diff <= 7) return { label: `${diff}d away`, color: '#ca8a04' };
    return { label: `${diff}d away`, color: '#555' };
  };

  return (
    <div>
      <div style={styles.tabs}>
        {LISTS.map(list => (
          <button key={list} onClick={() => setActiveList(list)}
            style={{ ...styles.tab, ...(activeList === list ? styles.tabActive : {}) }}>
            {list}
          </button>
        ))}
      </div>

      <div style={styles.listHeader}>
        <p style={styles.listCount}>{clients.length} on list</p>
        <button onClick={() => setShowAdd(!showAdd)} style={styles.addBtn}>
          {showAdd ? 'Cancel' : '+ Add to List'}
        </button>
      </div>

      {showAdd && (
        <div style={styles.addForm}>
          <p style={styles.addTitle}>Add to {activeList}</p>
          {accepted.length > 0 && (
            <div style={{ marginBottom: '16px', position: 'relative' }}>
              <label style={styles.label}>Search accepted applications</label>
              <input value={search}
                onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Type a name to search..."
                style={styles.input} />
              {showDropdown && search.length > 0 && (
                <div style={styles.searchDropdown}>
                  {accepted.filter(a => a.full_name.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
                    <p style={styles.noResults}>No matches found</p>
                  ) : (
                    accepted.filter(a => a.full_name.toLowerCase().includes(search.toLowerCase())).map(a => (
                      <div key={a.id} onClick={() => selectAccepted(a)} style={styles.searchItem}>
                        <p style={styles.searchName}>{a.full_name}</p>
                        <p style={styles.searchMeta}>{a.email}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
              <p style={{ color: '#666', fontSize: '12px', margin: '4px 0 0 0' }}>Or fill in manually below</p>
            </div>
          )}
          <div style={styles.addGrid}>
            <div>
              <label style={styles.label}>Full Name *</label>
              <input value={addForm.full_name} onChange={e => setAddForm(p => ({ ...p, full_name: e.target.value }))}
                style={styles.input} placeholder="Full name" />
            </div>
            <div>
              <label style={styles.label}>Email</label>
              <input value={addForm.email} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
                style={styles.input} placeholder="Email" />
            </div>
            <div>
              <label style={styles.label}>Phone</label>
              <input value={addForm.phone} onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))}
                style={styles.input} placeholder="Phone" />
            </div>
            <div>
              <label style={styles.label}>Ready Date</label>
              <input type="date" value={addForm.ready_date} onChange={e => setAddForm(p => ({ ...p, ready_date: e.target.value }))}
                style={styles.input} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={styles.label}>Notes</label>
              <input value={addForm.notes} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))}
                style={styles.input} placeholder="Any notes" />
            </div>
          </div>
          <button onClick={addToList} style={styles.saveBtn}>Add to List</button>
        </div>
      )}

      {loading ? (
        <p style={styles.empty}>Loading...</p>
      ) : clients.length === 0 ? (
        <p style={styles.empty}>No one on the {activeList} list yet.</p>
      ) : (
        <div style={styles.list}>
          {clients.map((client, idx) => {
            const badge = readyBadge(client.ready_date);
            return (
              <div key={client.id} style={styles.card}>
                <div style={styles.position}>{idx + 1}</div>
                <div style={styles.info}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <p style={styles.name}>{client.full_name}</p>
                    {badge && <span style={{ ...styles.badge, color: badge.color, borderColor: badge.color }}>{badge.label}</span>}
                  </div>
                  <p style={styles.meta}>{client.email}{client.phone ? ` · ${client.phone}` : ''}</p>
                  {client.ready_date && <p style={styles.readyDate}>Ready: {formatDate(client.ready_date)}</p>}
                  {client.notes && <p style={styles.notes}>{client.notes}</p>}
                  <p style={styles.date}>Added: {new Date(client.created_at).toLocaleDateString()}</p>
                </div>
                <div style={styles.controls}>
                  <button onClick={() => removeFromList(client.id)} style={styles.removeBtn}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  tabs: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' },
  tab: { backgroundColor: 'transparent', border: '1px solid #444', color: '#a0a0a0', padding: '8px 16px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer' },
  tabActive: { backgroundColor: '#b22222', border: '1px solid #b22222', color: '#fff' },
  listHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  listCount: { color: '#a0a0a0', fontSize: '14px', margin: 0 },
  addBtn: { backgroundColor: '#b22222', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' },
  addForm: { backgroundColor: '#2a2a2a', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px' },
  addTitle: { color: '#fff', fontSize: '15px', fontWeight: '600', margin: '0 0 16px 0' },
  addGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' },
  label: { color: '#a0a0a0', fontSize: '13px', display: 'block', marginBottom: '4px' },
  input: { width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  saveBtn: { backgroundColor: '#16a34a', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' },
  empty: { color: '#a0a0a0', textAlign: 'center', marginTop: '60px', fontSize: '15px' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  card: { backgroundColor: '#2a2a2a', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' },
  position: { backgroundColor: '#b22222', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', flexShrink: 0 },
  info: { flex: 1 },
  name: { color: '#fff', fontSize: '15px', fontWeight: '600', margin: '0 0 2px 0' },
  meta: { color: '#a0a0a0', fontSize: '13px', margin: '2px 0' },
  readyDate: { color: '#60a5fa', fontSize: '13px', margin: '2px 0' },
  notes: { color: '#cbd5e1', fontSize: '13px', fontStyle: 'italic', margin: '4px 0' },
  date: { color: '#555', fontSize: '12px', margin: '4px 0 0 0' },
  badge: { border: '1px solid', borderRadius: '12px', padding: '2px 8px', fontSize: '11px', fontWeight: '600' },
  controls: { display: 'flex', gap: '6px', alignItems: 'center' },
  removeBtn: { backgroundColor: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' },
  searchDropdown: { position: 'absolute', top: '64px', left: 0, right: 0, backgroundColor: '#1e1e1e', border: '1px solid #444', borderRadius: '8px', zIndex: 100, maxHeight: '200px', overflowY: 'auto' },
  searchItem: { padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a' },
  searchName: { color: '#fff', fontSize: '14px', margin: 0 },
  searchMeta: { color: '#888', fontSize: '12px', margin: '2px 0 0 0' },
  noResults: { color: '#888', fontSize: '13px', padding: '10px 14px', margin: 0 },
};

export default WaitingList;