import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

function Admissions() {
  const [applications, setApplications] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [expanded, setExpanded] = useState(null);
  const [duplicateModal, setDuplicateModal] = useState(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const { data: apps, error } = await supabase.from('applications').select('*').order('created_at', { ascending: false });
    if (!error) setApplications(apps || []);
    const { data: cls } = await supabase.from('clients').select('id, first_name, last_name, date_of_birth, ssn, status');
    if (cls) setClients(cls);
    setLoading(false);
  };

  const updateStatus = async (id, status) => {
    const { error } = await supabase.from('applications').update({ status }).eq('id', id);
    if (!error) fetchAll();
  };

  const findDuplicate = (app) => {
    return clients.find(c => {
      const nameMatch = c.first_name?.toLowerCase() === app.first_name?.toLowerCase() &&
        c.last_name?.toLowerCase() === app.last_name?.toLowerCase();
      const dobMatch = app.date_of_birth && c.date_of_birth && c.date_of_birth === app.date_of_birth;
      const ssnMatch = app.ssn && c.ssn && c.ssn === app.ssn;
      return nameMatch || dobMatch || ssnMatch;
    });
  };

  const handleMerge = async () => {
    if (!duplicateModal) return;
    setMerging(true);
    const { app, client } = duplicateModal;
    const { error } = await supabase.from('clients').update({
      first_name: app.first_name || client.first_name,
      last_name: app.last_name || client.last_name,
      phone: app.phone || null,
      email: app.email || null,
      date_of_birth: app.date_of_birth || client.date_of_birth,
      ssn: app.ssn || client.ssn,
      gender: app.gender || null,
      present_residence: app.current_situation || null,
      application_type: app.program || null,
    }).eq('id', client.id);
    if (!error) {
      await supabase.from('applications').update({ status: 'accepted' }).eq('id', app.id);
      setDuplicateModal(null);
      fetchAll();
    }
    setMerging(false);
  };

  const handleIgnore = async () => {
    if (!duplicateModal) return;
    setDuplicateModal(null);
  };

  const filtered = filter === 'all' ? applications : applications.filter(a => a.status === filter);

  const statusColor = (status) => {
    if (status === 'accepted') return '#16a34a';
    if (status === 'denied') return '#dc2626';
    return '#ca8a04';
  };

  const fmt = (val) => val || '—';

  return (
    <div style={s.page}>
      <h1 style={s.title}>Admissions</h1>
      <div style={s.tabs}>
        {['pending', 'all', 'accepted', 'denied'].map(tab => (
          <button key={tab} onClick={() => setFilter(tab)}
            style={{ ...s.tab, ...(filter === tab ? s.tabActive : {}) }}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={s.empty}>Loading...</p>
      ) : filtered.length === 0 ? (
        <p style={s.empty}>No applications found.</p>
      ) : (
        <div style={s.list}>
          {filtered.map(app => {
            const duplicate = findDuplicate(app);
            return (
              <div key={app.id} style={s.card}>
                <div style={s.cardHeader}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={s.name}>{fmt(app.first_name)} {fmt(app.last_name)}</span>
                      {duplicate && app.status === 'pending' && (
                        <button style={s.dupBadge} onClick={() => setDuplicateModal({ app, client: duplicate })}>
                          ⚠ Possible Duplicate
                        </button>
                      )}
                    </div>
                    <p style={s.meta}>{fmt(app.email)} · {fmt(app.phone)}</p>
                    <p style={s.meta}>Applied: {app.created_at ? new Date(app.created_at).toLocaleDateString() : '—'}</p>
                  </div>
                  <span style={{ ...s.badge, backgroundColor: statusColor(app.status) }}>
                    {app.status ? app.status.charAt(0).toUpperCase() + app.status.slice(1) : 'Pending'}
                  </span>
                </div>

                <div style={s.snapshot}>
                  {[
                    ['Gender', app.gender],
                    ['Program', app.program],
                    ['Lived Here Before?', app.lived_here_before],
                    ['On Disability?', app.on_disability],
                    ['Substance History?', app.substance_history],
                    ['Registered Sex Offender?', app.sex_offender],
                    ['Correspondence Contact', app.correspondence_contact],
                    ['Current Situation', app.current_situation],
                  ].map(([label, val]) => (
                    <div key={label} style={s.snapshotItem}>
                      <span style={s.snapshotLabel}>{label}</span>
                      <span style={s.snapshotVal}>{fmt(val)}</span>
                    </div>
                  ))}
                </div>

                <div style={s.cardActions}>
                  <button style={s.viewBtn} onClick={() => setExpanded(expanded === app.id ? null : app.id)}>
                    {expanded === app.id ? 'Hide Application' : 'View Full Application'}
                  </button>
                  {app.status === 'pending' && (
                    <>
                      <button style={s.acceptBtn} onClick={() => updateStatus(app.id, 'accepted')}>Accept</button>
                      <button style={s.denyBtn} onClick={() => updateStatus(app.id, 'denied')}>Deny</button>
                    </>
                  )}
                  {app.status === 'accepted' && (
                    <button style={s.denyBtn} onClick={() => updateStatus(app.id, 'denied')}>Deny</button>
                  )}
                  {app.status === 'denied' && (
                    <button style={s.acceptBtn} onClick={() => updateStatus(app.id, 'accepted')}>Accept</button>
                  )}
                </div>

                {expanded === app.id && (
                  <div style={s.fullApp}>
                    <div style={s.fullGrid}>
                      {[
                        ['First Name', app.first_name],
                        ['Last Name', app.last_name],
                        ['Email', app.email],
                        ['Phone', app.phone],
                        ['Date of Birth', app.date_of_birth],
                        ['SSN', app.ssn],
                        ['Gender', app.gender],
                        ['Program', app.program],
                        ['Current Situation', app.current_situation],
                        ['Lived Here Before?', app.lived_here_before],
                        ['On Disability?', app.on_disability],
                        ['Substance History?', app.substance_history],
                        ['Sex Offender?', app.sex_offender],
                        ['Correspondence Contact', app.correspondence_contact],
                        ['Emergency Contact', app.emergency_contact_name],
                        ['Emergency Phone', app.emergency_contact_phone],
                        ['Parole Officer', app.po_name],
                        ['PO Phone', app.po_phone],
                        ['Notes', app.notes],
                        ['Signature', app.signature],
                      ].map(([label, val]) => val ? (
                        <div key={label} style={s.fullItem}>
                          <span style={s.fullLabel}>{label}</span>
                          <span style={s.fullVal}>{val}</span>
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {duplicateModal && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>Possible Duplicate Detected</h2>
              <p style={s.modalSub}>A client with similar information already exists. Review and choose an action.</p>
            </div>
            <div style={s.compareGrid}>
              <div style={s.compareCol}>
                <div style={s.compareColHeader}>New Application</div>
                {[
                  ['Name', `${duplicateModal.app.first_name} ${duplicateModal.app.last_name}`],
                  ['DOB', duplicateModal.app.date_of_birth],
                  ['SSN', duplicateModal.app.ssn],
                  ['Email', duplicateModal.app.email],
                  ['Phone', duplicateModal.app.phone],
                  ['Gender', duplicateModal.app.gender],
                  ['Program', duplicateModal.app.program],
                ].map(([label, val]) => (
                  <div key={label} style={s.compareRow}>
                    <span style={s.compareLabel}>{label}</span>
                    <span style={s.compareVal}>{fmt(val)}</span>
                  </div>
                ))}
              </div>
              <div style={s.compareCol}>
                <div style={s.compareColHeader}>Existing Client</div>
                {[
                  ['Name', `${duplicateModal.client.first_name} ${duplicateModal.client.last_name}`],
                  ['DOB', duplicateModal.client.date_of_birth],
                  ['SSN', duplicateModal.client.ssn],
                  ['Status', duplicateModal.client.status],
                ].map(([label, val]) => (
                  <div key={label} style={s.compareRow}>
                    <span style={s.compareLabel}>{label}</span>
                    <span style={s.compareVal}>{fmt(val)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={s.modalActions}>
              <button style={s.mergeBtn} onClick={handleMerge} disabled={merging}>
                {merging ? 'Merging...' : 'Merge into Existing Client'}
              </button>
              <button style={s.ignoreBtn} onClick={handleIgnore}>Treat as New Person</button>
              <button style={s.cancelBtn} onClick={() => setDuplicateModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page: { padding: '32px', backgroundColor: '#1a1a1a', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' },
  title: { fontSize: '24px', fontWeight: '600', margin: '0 0 24px 0' },
  tabs: { display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' },
  tab: { padding: '8px 18px', borderRadius: '20px', border: '1px solid #444', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: '13px' },
  tabActive: { background: '#b22222', color: '#fff', borderColor: '#b22222' },
  empty: { color: '#666', fontSize: '14px' },
  list: { display: 'flex', flexDirection: 'column', gap: '16px' },
  card: { background: '#2a2a2a', borderRadius: '12px', padding: '20px', border: '1px solid #333' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
  name: { fontSize: '18px', fontWeight: '600', color: '#fff' },
  meta: { fontSize: '13px', color: '#888', margin: '2px 0 0 0' },
  badge: { fontSize: '12px', padding: '4px 12px', borderRadius: '20px', color: '#fff', fontWeight: '500', flexShrink: 0 },
  dupBadge: { fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: '#78350f', color: '#fbbf24', border: '1px solid #92400e', cursor: 'pointer', fontFamily: 'sans-serif' },
  snapshot: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: '#222', borderRadius: '8px', padding: '14px', marginBottom: '16px' },
  snapshotItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  snapshotLabel: { fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' },
  snapshotVal: { fontSize: '13px', color: '#fff' },
  cardActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  viewBtn: { padding: '7px 14px', borderRadius: '8px', border: '1px solid #444', background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: '13px', fontFamily: 'sans-serif' },
  acceptBtn: { padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: '13px', fontFamily: 'sans-serif' },
  denyBtn: { padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: '13px', fontFamily: 'sans-serif' },
  fullApp: { marginTop: '16px', borderTop: '1px solid #333', paddingTop: '16px' },
  fullGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' },
  fullItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  fullLabel: { fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' },
  fullVal: { fontSize: '13px', color: '#ddd' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modal: { background: '#2a2a2a', borderRadius: '16px', padding: '28px', maxWidth: '700px', width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #444' },
  modalHeader: { marginBottom: '20px' },
  modalTitle: { fontSize: '18px', fontWeight: '600', margin: '0 0 6px 0', color: '#fff' },
  modalSub: { fontSize: '13px', color: '#888', margin: 0 },
  compareGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' },
  compareCol: { background: '#1a1a1a', borderRadius: '10px', padding: '14px' },
  compareColHeader: { fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' },
  compareRow: { display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '10px' },
  compareLabel: { fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' },
  compareVal: { fontSize: '13px', color: '#fff' },
  modalActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  mergeBtn: { padding: '10px 18px', borderRadius: '8px', border: 'none', background: '#b22222', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600', fontFamily: 'sans-serif' },
  ignoreBtn: { padding: '10px 18px', borderRadius: '8px', border: '1px solid #444', background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: '13px', fontFamily: 'sans-serif' },
  cancelBtn: { padding: '10px 18px', borderRadius: '8px', border: '1px solid #444', background: 'transparent', color: '#666', cursor: 'pointer', fontSize: '13px', fontFamily: 'sans-serif' },
};

export default Admissions;