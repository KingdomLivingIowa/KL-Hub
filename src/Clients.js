import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const LISTS = ['DOC Men', 'Community Men', 'Treatment Men', 'DOC Women', 'Community Women', 'Treatment Women'];

const STATUS_FLOW = {
  'Applied':      ['Accepted', 'Denied'],
  'Accepted':     ['Waiting List', 'Denied'],
  'Waiting List': ['Pending', 'Denied'],
  'Pending':      ['Active', 'Waiting List'],
  'Active':       ['Discharged'],
  'Discharged':   [],
  'Denied':       ['Accepted'],
};

function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [statusModal, setStatusModal] = useState(null);
  const [statusForm, setStatusForm] = useState({ list_type: 'DOC Men', move_in_date: '', discharge_reason: '' });

  useEffect(() => { fetchClients(); }, []);

  const fetchClients = async () => {
    setLoading(true);
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    setClients(data || []);
    setLoading(false);
  };

  const filtered = clients.filter(c => {
    const matchSearch = c.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusColor = (s) => {
    if (s === 'Applied')      return { bg: '#1e3a2f', color: '#4ade80' };
    if (s === 'Accepted')     return { bg: '#1e2d3a', color: '#60a5fa' };
    if (s === 'Waiting List') return { bg: '#3a2d1e', color: '#fb923c' };
    if (s === 'Pending')      return { bg: '#2d2d1e', color: '#facc15' };
    if (s === 'Active')       return { bg: '#2d1e3a', color: '#c084fc' };
    if (s === 'Discharged')   return { bg: '#3a1e1e', color: '#f87171' };
    if (s === 'Denied')       return { bg: '#2a2a2a', color: '#888' };
    return { bg: '#2a2a2a', color: '#aaa' };
  };

  const initials = (name) => name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '??';

  const openStatusModal = (client, newStatus) => {
    setStatusModal({ client, newStatus });
    setStatusForm({ list_type: 'DOC Men', move_in_date: '', discharge_reason: '' });
  };

  const confirmStatusChange = async () => {
    const { client, newStatus } = statusModal;
    const updates = { status: newStatus };

    if (newStatus === 'Waiting List') {
      const { error: wlError } = await supabase.from('waiting_list').insert([{
        full_name: client.full_name,
        email: client.email || null,
        phone: client.phone || null,
        list_type: statusForm.list_type,
        position: 999,
        status: 'waiting',
        application_id: client.application_id || null,
      }]);
      if (wlError) { alert('Error adding to waiting list: ' + wlError.message); return; }
    }

    if (newStatus === 'Active') {
      updates.start_date = statusForm.move_in_date || null;
    }

    if (newStatus === 'Discharged') {
      updates.discharge_date = new Date().toISOString().split('T')[0];
      if (statusForm.discharge_reason) updates.reason_for_discharge = statusForm.discharge_reason;
    }

    const { error } = await supabase.from('clients').update(updates).eq('id', client.id);
    if (error) { alert('Error updating status: ' + error.message); return; }

    setStatusModal(null);
    fetchClients();
    if (selected?.id === client.id) setSelected({ ...selected, ...updates });
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>Clients</h2>
        <p style={s.sub}>{filtered.length} {statusFilter === 'All' ? 'total' : statusFilter.toLowerCase()}</p>
      </div>

      <div style={s.toolbar}>
        <input placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)} style={s.search} />
        <div style={s.filters}>
          {['All', 'Applied', 'Accepted', 'Waiting List', 'Pending', 'Active', 'Discharged', 'Denied'].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              style={{ ...s.filterBtn, ...(statusFilter === f ? s.filterActive : {}) }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#888', padding: '20px' }}>Loading clients...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#888', padding: '20px' }}>No clients found.</p>
      ) : (
        <div style={s.table}>
          <div style={s.tableHeader}>
            <span style={{ flex: 2 }}>Name</span>
            <span style={{ flex: 1 }}>Status</span>
            <span style={{ flex: 1 }}>Level</span>
            <span style={{ flex: 2 }}>House</span>
            <span style={{ flex: 1 }}>Start Date</span>
          </div>
          {filtered.map(c => (
            <div key={c.id} style={s.row} onClick={() => { setSelected(c); setActiveTab('overview'); }}>
              <span style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={s.avatar}>{initials(c.full_name)}</div>
                <span style={{ color: '#fff', fontWeight: '500' }}>{c.full_name}</span>
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ ...s.badge, background: statusColor(c.status).bg, color: statusColor(c.status).color }}>
                  {c.status || '—'}
                </span>
              </span>
              <span style={{ flex: 1, color: '#aaa' }}>Level {c.level || 1}</span>
              <span style={{ flex: 2, color: '#aaa' }}>{c.house_id || '—'}</span>
              <span style={{ flex: 1, color: '#aaa' }}>{c.start_date || '—'}</span>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div style={s.overlay} onClick={() => setSelected(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>

            <div style={s.modalHeader}>
              <div style={s.modalAvatar}>{initials(selected.full_name)}</div>
              <div style={{ flex: 1 }}>
                <h2 style={s.modalName}>{selected.full_name}</h2>
                <p style={s.modalSub}>
                  {selected.house_id || 'No house assigned'} &nbsp;·&nbsp;
                  {selected.start_date ? `Started ${selected.start_date}` : 'No start date'}
                </p>
                <div style={s.badges}>
                  <span style={{ ...s.badge, background: statusColor(selected.status).bg, color: statusColor(selected.status).color }}>
                    {selected.status || 'Applied'}
                  </span>
                  <span style={{ ...s.badge, background: '#1e2d3a', color: '#60a5fa', cursor: 'pointer' }}
                    onClick={() => {
                      const lvl = prompt('Enter new level (1–4):', selected.level || 1);
                      if (lvl && ['1','2','3','4'].includes(lvl.trim())) {
                        supabase.from('clients').update({ level: parseInt(lvl) }).eq('id', selected.id)
                          .then(() => { fetchClients(); setSelected({ ...selected, level: parseInt(lvl) }); });
                      }
                    }}>
                    Level {selected.level || 1}
                  </span>
                  {selected.sor_grant && <span style={{ ...s.badge, background: '#3a2d1e', color: '#fb923c' }}>SOR grant</span>}
                </div>

                {STATUS_FLOW[selected.status]?.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: '#666', alignSelf: 'center' }}>Move to:</span>
                    {STATUS_FLOW[selected.status].map(ns => (
                      <button key={ns} onClick={() => openStatusModal(selected, ns)}
                        style={{ ...s.badge, background: statusColor(ns).bg, color: statusColor(ns).color, border: 'none', cursor: 'pointer', fontSize: '11px', padding: '4px 10px' }}>
                        {ns}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setSelected(null)} style={s.closeBtn}>×</button>
            </div>

            <div style={s.tabs}>
              {['overview','payments','UAs','medications','notes','timeline','application','documents'].map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  style={{ ...s.tab, ...(activeTab === t ? s.tabActive : {}) }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div style={s.modalBody}>
              {activeTab === 'overview' && (
                <div style={s.grid}>
                  <Card title="Contact info">
                    <Field label="Phone" value={selected.phone} />
                    <Field label="Email" value={selected.email} />
                    <Field label="DOB" value={selected.date_of_birth} />
                    <Field label="Gender" value={selected.gender} />
                    <Field label="Ethnicity" value={selected.ethnicity} />
                    <Field label="Marital status" value={selected.marital_status} />
                    <Field label="Emergency contact" value={selected.emergency_contact_name} />
                  </Card>
                  <Card title="House assignment">
                    <Field label="House" value={selected.house_id} />
                    <Field label="Room type" value={selected.room_type} />
                    <Field label="House manager" value={selected.house_manager} />
                    <Field label="Move-in date" value={selected.start_date} />
                  </Card>
                  <Card title="PO & legal">
                    <Field label="PO name" value={selected.po_name} />
                    <Field label="PO phone" value={selected.po_phone} />
                    <Field label="Personal status" value={selected.personal_status} alert={selected.personal_status === 'Currently Incarcerated'} />
                    <Field label="Sex offense" value={selected.sex_offender} />
                    <Field label="On probation" value={selected.on_probation} />
                    <Field label="On parole" value={selected.on_parole} />
                  </Card>
                  <Card title="Sponsor">
                    <Field label="Sponsor name" value={selected.sponsor_name} />
                    <Field label="Sponsor phone" value={selected.sponsor_phone} />
                    <Field label="Recovery meetings" value={selected.recovery_meetings} />
                  </Card>
                  <Card title="Recovery">
                    <Field label="Substance history" value={selected.substance_history} />
                    <Field label="Treatment history" value={selected.treatment_history} />
                    <Field label="OUD" value={selected.oud} />
                  </Card>
                  <Card title="Goals">
                    <Field label="Goal 1" value={selected.goal_1} />
                    <Field label="Goal 2" value={selected.goal_2} />
                    <Field label="Goal 3" value={selected.goal_3} />
                  </Card>
                </div>
              )}
              {activeTab === 'application' && (
                <div style={s.grid}>
                  <Card title="Application details">
                    <Field label="Application type" value={selected.application_type} />
                    <Field label="Present residence" value={selected.present_residence} />
                    <Field label="Has ID" value={selected.has_id} />
                    <Field label="Has SS card" value={selected.has_ss_card} />
                    <Field label="Employment" value={selected.employment_status} />
                    <Field label="On disability" value={selected.on_disability} />
                    <Field label="Criminal history" value={selected.criminal_history} />
                  </Card>
                </div>
              )}
              {activeTab === 'notes' && (
                <Card title="Staff notes" full>
                  <div style={{ color: selected.client_notes ? '#ddd' : '#666', fontSize: '14px', lineHeight: '1.6' }}>
                    {selected.client_notes || 'No notes yet.'}
                  </div>
                </Card>
              )}
              {activeTab === 'payments' && <Card title="Payments" full><p style={{ color: '#666', fontSize: '14px' }}>Payment records will appear here once billing is set up.</p></Card>}
              {activeTab === 'UAs' && <Card title="UA records" full><p style={{ color: '#666', fontSize: '14px' }}>UA records will appear here once UA tracking is set up.</p></Card>}
              {activeTab === 'medications' && <Card title="Medications" full><p style={{ color: '#666', fontSize: '14px' }}>Medication records will appear here once medication tracking is set up.</p></Card>}
              {activeTab === 'timeline' && <Card title="Timeline" full><p style={{ color: '#666', fontSize: '14px' }}>Activity timeline will appear here once timeline tracking is set up.</p></Card>}
              {activeTab === 'documents' && <Card title="Documents" full><p style={{ color: '#666', fontSize: '14px' }}>Documents will appear here once file uploads are set up.</p></Card>}
            </div>
          </div>
        </div>
      )}

      {statusModal && (
        <div style={{ ...s.overlay, zIndex: 2000 }} onClick={() => setStatusModal(null)}>
          <div style={{ ...s.modal, maxWidth: '420px', marginTop: '120px' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #333' }}>
              <h3 style={{ color: '#fff', margin: 0, fontSize: '16px' }}>
                Move to {statusModal.newStatus}
              </h3>
              <p style={{ color: '#666', fontSize: '13px', margin: '4px 0 0 0' }}>
                {statusModal.client.full_name}
              </p>
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

              {statusModal.newStatus === 'Active' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={sf.label}>Move-in date</label>
                  <input type="date" value={statusForm.move_in_date} onChange={e => setStatusForm(p => ({ ...p, move_in_date: e.target.value }))} style={sf.input} />
                </div>
              )}

              {statusModal.newStatus === 'Discharged' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={sf.label}>Reason for discharge</label>
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
              )}

              {statusModal.newStatus === 'Pending' && (
                <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 16px 0' }}>
                  This will mark the client as pending placement. You can assign a move-in date when you move them to Active.
                </p>
              )}

              {(statusModal.newStatus === 'Accepted' || statusModal.newStatus === 'Denied') && (
                <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 16px 0' }}>
                  This will update the client's status to {statusModal.newStatus}.
                </p>
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

function Field({ label, value, alert }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '4px 0', borderBottom: '1px solid #333', gap: '12px' }}>
      <span style={{ fontSize: '12px', color: '#666', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '13px', color: alert ? '#f87171' : (value ? '#ddd' : '#444'), textAlign: 'right', wordBreak: 'break-word' }}>
        {value || '—'}
      </span>
    </div>
  );
}

const s = {
  page: { padding: '32px', fontFamily: 'sans-serif', color: '#fff' },
  header: { marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: '700', margin: 0 },
  sub: { color: '#666', fontSize: '14px', margin: '4px 0 0 0' },
  toolbar: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' },
  search: { width: '100%', maxWidth: '360px', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 14px', color: '#fff', fontSize: '14px' },
  filters: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  filterBtn: { padding: '6px 14px', borderRadius: '20px', border: '1px solid #444', background: 'transparent', color: '#888', fontSize: '13px', cursor: 'pointer' },
  filterActive: { background: '#b22222', borderColor: '#b22222', color: '#fff' },
  table: { background: '#2a2a2a', borderRadius: '12px', overflow: 'hidden', border: '1px solid #333' },
  tableHeader: { display: 'flex', padding: '12px 16px', borderBottom: '1px solid #333', fontSize: '12px', color: '#666', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' },
  row: { display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #222', cursor: 'pointer' },
  avatar: { width: '34px', height: '34px', borderRadius: '50%', background: '#1e3a2f', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '500', flexShrink: 0 },
  badge: { fontSize: '11px', padding: '3px 8px', borderRadius: '20px', fontWeight: '500' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: '#1a1a1a', borderRadius: '16px', border: '1px solid #333', width: '100%', maxWidth: '860px', overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '16px 20px', borderBottom: '1px solid #333' },
  modalAvatar: { width: '52px', height: '52px', borderRadius: '50%', background: '#1e3a2f', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '500', flexShrink: 0 },
  modalName: { fontSize: '18px', fontWeight: '500', margin: 0, color: '#fff' },
  modalSub: { fontSize: '13px', color: '#666', margin: '2px 0 0 0' },
  badges: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' },
  closeBtn: { width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #444', background: 'transparent', cursor: 'pointer', color: '#888', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tabs: { display: 'flex', borderBottom: '1px solid #333', padding: '0 20px', overflowX: 'auto' },
  tab: { padding: '10px 14px', fontSize: '13px', cursor: 'pointer', color: '#666', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', whiteSpace: 'nowrap' },
  tabActive: { color: '#fff', borderBottomColor: '#fff' },
  modalBody: { padding: '20px', maxHeight: '520px', overflowY: 'auto' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' },
};

const sf = {
  label: { display: 'block', color: '#aaa', fontSize: '13px', marginBottom: '6px' },
  input: { width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  cancelBtn: { backgroundColor: 'transparent', border: '1px solid #444', color: '#aaa', padding: '8px 18px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' },
  confirmBtn: { backgroundColor: '#b22222', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' },
};

export default Clients;