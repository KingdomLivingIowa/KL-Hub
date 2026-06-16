import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';

const STATUS_COLORS = {
  'Open': { bg: '#3a1e1e', color: '#f87171' },
  'In Progress': { bg: '#3a2d1e', color: '#fb923c' },
  'Completed': { bg: '#1e3a2f', color: '#4ade80' },
};

const ISSUE_TYPE_COLORS = {
  'Safety & Security': '#f87171',
  'Plumbing': '#60a5fa',
  'Electrical': '#fbbf24',
  'HVAC': '#a78bfa',
  'Appliances': '#34d399',
  'Other': '#9ca3af',
};

export default function Maintenance() {
  const { assignedHouseIds, isHouseManagerRole } = useUser();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [houseFilter, setHouseFilter] = useState('All');
  const [houses, setHouses] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchRequests = useCallback(async () => {
    let query = supabase.from('maintenance_requests').select('*').order('submitted_at', { ascending: false });
    if (isHouseManagerRole && assignedHouseIds.length > 0) {
      query = query.in('house_id', assignedHouseIds);
    }
    if (statusFilter !== 'All') query = query.eq('status', statusFilter);
    if (houseFilter !== 'All') query = query.eq('house_id', houseFilter);
    const { data } = await query;
    setRequests(data || []);
    setLoading(false);
  }, [statusFilter, houseFilter, isHouseManagerRole, assignedHouseIds]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  useEffect(() => {
    supabase.from('houses').select('id, name').order('name')
      .then(({ data }) => setHouses(data || []));
  }, []);

  const startEdit = (req) => {
    setEditingId(req.id);
    setEditForm({
      status: req.status,
      called_date: req.called_date || '',
      called_notes: req.called_notes || '',
      service_date: req.service_date || '',
      service_notes: req.service_notes || '',
    });
  };

  const saveEdit = async (id) => {
    setSaving(true);
    const req = requests.find(r => r.id === id);
    await supabase.from('maintenance_requests').update({
      status: editForm.status,
      called_date: editForm.called_date || null,
      called_notes: editForm.called_notes || null,
      service_date: editForm.service_date || null,
      service_notes: editForm.service_notes || null,
    }).eq('id', id);

    // Write a timeline update to the house so managers can track progress
    if (req?.house_id) {
      const statusChanged = req.status !== editForm.status;
      const parts = [];
      if (statusChanged) parts.push(`Status changed to ${editForm.status}`);
      if (editForm.called_notes && editForm.called_notes !== req.called_notes) parts.push(`Call notes: ${editForm.called_notes}`);
      if (editForm.service_notes && editForm.service_notes !== req.service_notes) parts.push(`Service notes: ${editForm.service_notes}`);
      if (editForm.service_date && editForm.service_date !== req.service_date) parts.push(`Service date: ${editForm.service_date}`);
      if (parts.length > 0) {
        await supabase.from('house_timeline').insert([{
          house_id: req.house_id,
          entry_type: 'Maintenance Update',
          notes: `[${req.description || 'Maintenance'}${req.issue_location ? ` – ${req.issue_location}` : ''}] ${parts.join(' · ')}`,
          author: 'Staff',
        }]);
      }
    }

    setEditingId(null);
    setSaving(false);
    fetchRequests();
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const fmtTime = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

  const openCount = requests.filter(r => r.status === 'Open').length;
  const inProgressCount = requests.filter(r => r.status === 'In Progress').length;
  const completedCount = requests.filter(r => r.status === 'Completed').length;

  return (
    <div style={s.page}>
      <h1 style={s.title}>Maintenance</h1>

      {/* Summary stats */}
      <div style={s.statsRow}>
        <div style={{ ...s.stat, borderColor: '#f87171' }}>
          <span style={{ ...s.statNum, color: '#f87171' }}>{openCount}</span>
          <span style={s.statLabel}>Open</span>
        </div>
        <div style={{ ...s.stat, borderColor: '#fb923c' }}>
          <span style={{ ...s.statNum, color: '#fb923c' }}>{inProgressCount}</span>
          <span style={s.statLabel}>In Progress</span>
        </div>
        <div style={{ ...s.stat, borderColor: '#4ade80' }}>
          <span style={{ ...s.statNum, color: '#4ade80' }}>{completedCount}</span>
          <span style={s.statLabel}>Completed</span>
        </div>
        <div style={{ ...s.stat, borderColor: '#555' }}>
          <span style={{ ...s.statNum, color: '#fff' }}>{requests.length}</span>
          <span style={s.statLabel}>Total</span>
        </div>
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={s.select}>
            <option value="All">All</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>House</label>
          <select value={houseFilter} onChange={e => setHouseFilter(e.target.value)} style={s.select}>
            <option value="All">All Houses</option>
            {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
      </div>

      {/* Requests list */}
      {loading ? (
        <p style={{ color: '#888' }}>Loading...</p>
      ) : requests.length === 0 ? (
        <div style={s.empty}>
          <p style={{ color: '#666', fontSize: '15px' }}>No maintenance requests found.</p>
        </div>
      ) : (
        <div style={s.list}>
          {requests.map(req => {
            const sc = STATUS_COLORS[req.status] || STATUS_COLORS['Open'];
            const isExpanded = expanded === req.id;
            const isEditing = editingId === req.id;
            return (
              <div key={req.id} style={s.card}>
                {/* Card header */}
                <div style={s.cardHeader} onClick={() => setExpanded(isExpanded ? null : req.id)}>
                  <div style={s.cardLeft}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <span style={{ ...s.badge, background: sc.bg, color: sc.color }}>{req.status}</span>
                      {req.issue_type && (
                        <span style={{ ...s.badge, background: '#1c1c24', color: ISSUE_TYPE_COLORS[req.issue_type] || '#aaa', border: `1px solid ${ISSUE_TYPE_COLORS[req.issue_type] || '#333'}` }}>
                          {req.issue_type}
                        </span>
                      )}
                      {req.previously_submitted === 'Yes' && (
                        <span style={{ ...s.badge, background: '#3a2a0f', color: '#fb923c', border: '1px solid #92400e' }}>Previously Reported</span>
                      )}
                    </div>
                    <p style={s.cardHouse}>{req.house_name || '—'}</p>
                    {req.issue_location && <p style={s.cardLocation}>📍 {req.issue_location}</p>}
                    {req.description && <p style={s.cardDesc}>{req.description}</p>}
                  </div>
                  <div style={s.cardRight}>
                    <p style={s.cardDate}>{fmtTime(req.submitted_at)}</p>
                    <p style={s.cardBy}>{req.submitted_by}</p>
                    <span style={{ color: '#555', fontSize: '16px' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded detail / edit */}
                {isExpanded && (
                  <div style={s.cardBody}>
                    {isEditing ? (
                      <div>
                        <div style={s.editRow}>
                          <label style={s.editLabel}>Status</label>
                          <select value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))} style={s.editInput}>
                            <option>Open</option>
                            <option>In Progress</option>
                            <option>Completed</option>
                          </select>
                        </div>
                        <div style={s.editRow}>
                          <label style={s.editLabel}>Date Called</label>
                          <input type="date" value={editForm.called_date} onChange={e => setEditForm(p => ({ ...p, called_date: e.target.value }))} style={s.editInput} />
                        </div>
                        <div style={s.editRow}>
                          <label style={s.editLabel}>Call Notes</label>
                          <textarea value={editForm.called_notes} onChange={e => setEditForm(p => ({ ...p, called_notes: e.target.value }))} style={{ ...s.editInput, height: '70px', resize: 'vertical' }} placeholder="Notes from the call..." />
                        </div>
                        <div style={s.editRow}>
                          <label style={s.editLabel}>Service Date</label>
                          <input type="date" value={editForm.service_date} onChange={e => setEditForm(p => ({ ...p, service_date: e.target.value }))} style={s.editInput} />
                        </div>
                        <div style={s.editRow}>
                          <label style={s.editLabel}>Service Notes</label>
                          <textarea value={editForm.service_notes} onChange={e => setEditForm(p => ({ ...p, service_notes: e.target.value }))} style={{ ...s.editInput, height: '70px', resize: 'vertical' }} placeholder="Notes from service visit..." />
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                          <button onClick={() => saveEdit(req.id)} disabled={saving}
                            style={{ background: '#16a34a', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)}
                            style={{ background: 'transparent', border: '1px solid #3a3a48', color: '#aaa', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={s.detailGrid}>
                          <div>
                            <p style={s.detailLabel}>Called</p>
                            <p style={s.detailValue}>{fmt(req.called_date)}</p>
                          </div>
                          <div>
                            <p style={s.detailLabel}>Service Date</p>
                            <p style={s.detailValue}>{fmt(req.service_date)}</p>
                          </div>
                        </div>
                        {req.called_notes && (
                          <div style={{ marginBottom: '10px' }}>
                            <p style={s.detailLabel}>Call Notes</p>
                            <p style={s.detailValue}>{req.called_notes}</p>
                          </div>
                        )}
                        {req.service_notes && (
                          <div style={{ marginBottom: '10px' }}>
                            <p style={s.detailLabel}>Service Notes</p>
                            <p style={s.detailValue}>{req.service_notes}</p>
                          </div>
                        )}
                        <button onClick={() => startEdit(req)}
                          style={{ background: '#1e2d3a', border: '1px solid #2a4a5a', color: '#60a5fa', padding: '7px 16px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '500', marginTop: '8px' }}>
                          ✏️ Update Request
                        </button>
                      </div>
                    )}
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

const s = {
  page: { padding: '0 0 60px' },
  title: { color: '#fff', fontSize: '26px', fontWeight: '700', margin: '0 0 24px' },
  statsRow: { display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' },
  stat: { background: '#1c1c24', border: '1px solid', borderRadius: '10px', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '100px' },
  statNum: { fontSize: '28px', fontWeight: '700' },
  statLabel: { fontSize: '13px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' },
  filters: { display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' },
  filterGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  filterLabel: { fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' },
  select: { background: '#1c1c24', border: '1px solid #32323e', borderRadius: '8px', color: '#fff', padding: '7px 12px', fontSize: '14px', cursor: 'pointer' },
  empty: { padding: '60px 0', textAlign: 'center' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  card: { background: '#1c1c24', border: '1px solid #2e2e3a', borderRadius: '12px', overflow: 'hidden' },
  cardHeader: { padding: '14px 16px', display: 'flex', gap: '12px', justifyContent: 'space-between', cursor: 'pointer' },
  cardLeft: { flex: 1 },
  cardRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 },
  badge: { padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', display: 'inline-block' },
  cardHouse: { color: '#fff', fontSize: '14px', fontWeight: '600', margin: '0 0 3px' },
  cardLocation: { color: '#888', fontSize: '13px', margin: '0 0 4px' },
  cardDesc: { color: '#aaa', fontSize: '14px', margin: 0, lineHeight: 1.5 },
  cardDate: { color: '#666', fontSize: '12px', margin: 0 },
  cardBy: { color: '#555', fontSize: '12px', margin: 0 },
  cardBody: { padding: '14px 16px', borderTop: '1px solid #222', background: '#141414' },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' },
  detailLabel: { fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' },
  detailValue: { color: '#ddd', fontSize: '14px', margin: 0, lineHeight: 1.5 },
  editRow: { marginBottom: '12px' },
  editLabel: { display: 'block', fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' },
  editInput: { width: '100%', background: '#1c1c24', border: '1px solid #32323e', borderRadius: '8px', color: '#fff', padding: '8px 10px', fontSize: '14px', boxSizing: 'border-box' },
};