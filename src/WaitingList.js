import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';

function WaitingList({ onOpenClient, setActivePage }) {
  const { hasFullAccess } = useUser();
  const [waitingClients, setWaitingClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeList, setActiveList] = useState('DOC Men');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: '', email: '', phone: '', notes: '', ready_date: '', application_id: null });
  const [editingId, setEditingId] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [saving, setSaving] = useState(false);

  const LIST_TYPES = ['DOC Men', 'Community Men', 'Treatment Men', 'DOC Women', 'Community Women', 'Treatment Women'];

  const fetchWaitingList = useCallback(async () => {
    const { data } = await supabase
      .from('waiting_list')
      .select('*')
      .eq('status', 'waiting')
      .order('ready_date', { ascending: true, nullsFirst: false });
    setWaitingClients(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchWaitingList(); }, [fetchWaitingList]);

  // Real-time: waiting list updates
  useEffect(() => {
    const channel = supabase.channel('waitinglist_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waiting_list' },
        () => { fetchWaitingList(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clients = waitingClients.filter(c => c.list_type === activeList);

  const addToList = async () => {
    if (!addForm.full_name.trim()) return alert('Name is required.');
    setSaving(true);
    await supabase.from('waiting_list').insert([{
      full_name: addForm.full_name,
      email: addForm.email || null,
      phone: addForm.phone || null,
      notes: addForm.notes || null,
      ready_date: addForm.ready_date || null,
      list_type: activeList,
      status: 'waiting',
    }]);
    setAddForm({ full_name: '', email: '', phone: '', notes: '', ready_date: '', application_id: null });
    setShowAdd(false);
    setSaving(false);
    fetchWaitingList();
  };

  const removeFromList = async (id) => {
    await supabase.from('waiting_list').update({ status: 'removed' }).eq('id', id);
    fetchWaitingList();
  };

  const updateField = async (id, field, value) => {
    await supabase.from('waiting_list').update({ [field]: value || null }).eq('id', id);
    fetchWaitingList();
  };

  const formatDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  const readyBadge = (date) => {
    if (!date) return null;
    const days = Math.floor((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { label: 'Ready now', color: '#4ade80' };
    if (days <= 7) return { label: `${days}d`, color: '#f59e0b' };
    if (days <= 30) return { label: `${Math.ceil(days / 7)}w`, color: '#60a5fa' };
    return { label: `${Math.ceil(days / 30)}mo`, color: '#aaa' };
  };

  return (
    <div>
      {/* List tabs */}
      <div style={styles.tabs}>
        {LIST_TYPES.map(list => (
          <button key={list} onClick={() => setActiveList(list)}
            style={{ ...styles.tab, ...(activeList === list ? styles.tabActive : {}) }}>
            {list}
          </button>
        ))}
      </div>

      {/* Header */}
      <div style={styles.listHeader}>
        <p style={styles.listCount}>{clients.length} on {activeList} list</p>
        {hasFullAccess && (
          <button style={styles.addBtn} onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : '+ Add to List'}
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && hasFullAccess && (
        <div style={styles.addForm}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={styles.formLabel}>Full Name *</label>
              <input value={addForm.full_name} onChange={e => setAddForm(p => ({ ...p, full_name: e.target.value }))}
                style={styles.input} placeholder="Full name" />
            </div>
            <div>
              <label style={styles.formLabel}>Ready Date</label>
              <input type="date" value={addForm.ready_date} onChange={e => setAddForm(p => ({ ...p, ready_date: e.target.value }))}
                style={styles.input} />
            </div>
            <div>
              <label style={styles.formLabel}>Email</label>
              <input value={addForm.email} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
                style={styles.input} placeholder="Email" />
            </div>
            <div>
              <label style={styles.formLabel}>Phone</label>
              <input value={addForm.phone} onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))}
                style={styles.input} placeholder="Phone" />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={styles.formLabel}>Notes</label>
            <input value={addForm.notes} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))}
              style={styles.input} placeholder="Any notes..." />
          </div>
          <button onClick={addToList} disabled={saving} style={styles.addBtn}>{saving ? 'Adding...' : 'Add to List'}</button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p style={styles.empty}>Loading...</p>
      ) : clients.length === 0 ? (
        <p style={styles.empty}>No one on the {activeList} list yet.</p>
      ) : (
        <div style={{ background: '#2a2a2a', borderRadius: 10, border: '1px solid #333', overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 150px 1fr auto', gap: 8, padding: '10px 14px', background: '#1a1a1a', borderBottom: '1px solid #444' }}>
            {['#', 'Name', 'Ready Date', 'Notes', ''].map((h, i) => (
              <span key={i} style={{ fontSize: 11, color: '#b22222', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
            ))}
          </div>

          {clients.map((client, idx) => {
            const badge = readyBadge(client.ready_date);
            return (
              <div key={client.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 150px 1fr auto', gap: 8, padding: '10px 14px', alignItems: 'center', background: idx % 2 === 0 ? 'transparent' : '#252525', borderBottom: '1px solid #2a2a2a' }}>
                <span style={{ fontSize: 13, color: '#555', fontWeight: 600 }}>{idx + 1}</span>

                {/* Name */}
                <div>
                  <div
                    style={{ fontSize: 14, color: client.client_id ? '#e57373' : '#fff', fontWeight: 500, cursor: client.client_id ? 'pointer' : 'default', textDecoration: client.client_id ? 'underline' : 'none' }}
                    onClick={() => {
                      if (client.client_id && onOpenClient && setActivePage) {
                        onOpenClient(client.client_id);
                        setActivePage('clients');
                      }
                    }}
                  >
                    {client.full_name}
                  </div>
                  {client.email && <div style={{ fontSize: 12, color: '#666' }}>{client.email}</div>}
                </div>

                {/* Ready Date - inline editable */}
                <div>
                  {editingId === client.id ? (
                    <input type="date" defaultValue={client.ready_date || ''} autoFocus
                      onBlur={e => { updateField(client.id, 'ready_date', e.target.value); setEditingId(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingId(null); }}
                      style={{ ...styles.input, padding: '4px 8px', fontSize: 13 }} />
                  ) : (
                    <div onClick={() => hasFullAccess && setEditingId(client.id)}
                      style={{ cursor: hasFullAccess ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, color: client.ready_date ? '#60a5fa' : '#444' }}>
                        {client.ready_date ? formatDate(client.ready_date) : '+ Add date'}
                      </span>
                      {badge && <span style={{ fontSize: 11, color: badge.color, border: `1px solid ${badge.color}`, borderRadius: 10, padding: '1px 6px' }}>{badge.label}</span>}
                    </div>
                  )}
                </div>

                {/* Notes - inline editable */}
                <div>
                  {editingNoteId === client.id ? (
                    <input defaultValue={client.notes || ''} autoFocus
                      onBlur={e => { updateField(client.id, 'notes', e.target.value); setEditingNoteId(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingNoteId(null); }}
                      style={{ ...styles.input, padding: '4px 8px', fontSize: 13, width: '100%' }} />
                  ) : (
                    <span onClick={() => hasFullAccess && setEditingNoteId(client.id)}
                      style={{ fontSize: 13, color: client.notes ? '#aaa' : '#444', cursor: hasFullAccess ? 'pointer' : 'default' }}>
                      {client.notes || (hasFullAccess ? '+ Add note' : '—')}
                    </span>
                  )}
                </div>

                {/* Remove */}
                {hasFullAccess && (
                  <button onClick={() => removeFromList(client.id)} style={styles.removeBtn}>Remove</button>
                )}
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
  tab: { backgroundColor: 'transparent', border: '1px solid #444', color: '#aaa', padding: '8px 16px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer' },
  tabActive: { backgroundColor: '#b22222', border: '1px solid #b22222', color: '#fff' },
  listHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  listCount: { color: '#aaa', fontSize: '14px', margin: 0 },
  addBtn: { backgroundColor: '#b22222', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 },
  addForm: { background: '#2a2a2a', borderRadius: 10, border: '1px solid #333', padding: '16px', marginBottom: 20 },
  formLabel: { fontSize: 12, color: '#999', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '6px', padding: '8px 12px', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box' },
  removeBtn: { backgroundColor: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' },
  empty: { color: '#555', fontSize: '14px', padding: '32px 0', textAlign: 'center' },
};

export default WaitingList;