import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';

// ============================================================
// SOR Grant — screeners (applications), documents, SUPRT-C.
// Admin + Upper Management: review. House managers: view only (their houses).
// PO accounts never see this page (Dashboard hides it).
// ============================================================

const BUCKET = 'sor-files';
const DOC_KINDS = ['Photo ID', 'Insurance', 'Proof of Income', 'Substance Use Assessment'];
const STATUS = {
  submitted:  { label: 'Submitted',  bg: '#dbeafe', color: '#2563eb' },
  needs_info: { label: 'Needs Info', bg: '#fef3c7', color: '#b45309' },
  accepted:   { label: 'Accepted',   bg: '#dcfce7', color: '#16a34a' },
  denied:     { label: 'Denied',     bg: '#fee2e2', color: '#b91c1c' },
};
const A2_ITEMS = [
  ['a', 'I am physically fine most days.'],
  ['b', 'My mental health is fine most days.'],
  ['c', 'My substance use does not cause problems in my life.'],
  ['d', 'I have stable housing.'],
  ['e', 'I have a steady job or am involved in things like school, training, or volunteering.'],
  ['f', 'My life has purpose and meaning.'],
  ['g', 'I have enough money to meet my needs.'],
  ['h', 'I am proud of the community I live in and feel a part of it.'],
  ['i', 'I am supported by the people around me.'],
  ['j', 'The future appears bright to me.'],
  ['k', 'I am in control of my life.'],
  ['l', 'I bounce back quickly after hard times.'],
];

const SELECT = '*, clients(id, full_name, first_name, last_name, status, house_id, houses(name)), sor_files(id, kind, file_name, storage_path, uploaded_by_role, created_at)';

function clientName(c) {
  if (!c) return '';
  return c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
}
function fmtDate(d) {
  if (!d) return '—';
  const s = String(d);
  const dt = s.length === 10 ? new Date(s + 'T00:00:00') : new Date(s);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SorGrant() {
  const { hasFullAccess } = useUser();
  const canEdit = hasFullAccess;
  const [rows, setRows] = useState([]);
  const [suprt, setSuprt] = useState({}); // client_id -> SUPRT-C row
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data, error: e1 }, { data: sup }] = await Promise.all([
      supabase.from('sor_screeners').select(SELECT).order('submitted_at', { ascending: false }),
      supabase.from('sor_suprt_c').select('*'),
    ]);
    if (e1) setError(e1.message);
    setRows(data || []);
    const map = {};
    (sup || []).forEach(s => { map[s.client_id] = s; });
    setSuprt(map);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const counts = useMemo(() => {
    const c = { submitted: 0, needs_info: 0, accepted: 0, denied: 0 };
    rows.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter === 'open' && !['submitted', 'needs_info'].includes(r.status)) return false;
      if (statusFilter !== 'open' && statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (q && !clientName(r.clients).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const openRow = rows.find(r => r.id === openId) || null;

  return (
    <div style={sg.page}>
      <div style={sg.header}>
        <div>
          <h1 style={sg.title}>SOR Grant</h1>
          <p style={sg.sub}>Screeners, documents and SUPRT-C forms submitted by residents in the Portal.{canEdit ? '' : ' View only.'}</p>
        </div>
        <button style={sg.btn} onClick={fetchAll}>↻ Refresh</button>
      </div>

      <div style={sg.summary}>
        {Object.entries(STATUS).map(([k, v]) => (
          <button key={k} onClick={() => setStatusFilter(statusFilter === k ? 'open' : k)}
            style={{ ...sg.statBox, background: v.bg, outline: statusFilter === k ? `2px solid ${v.color}` : 'none' }}>
            <span style={{ ...sg.statNum, color: v.color }}>{counts[k] || 0}</span>
            <span style={{ ...sg.statLabel, color: v.color }}>{v.label}</span>
          </button>
        ))}
      </div>

      <div style={sg.filters}>
        <input style={sg.search} placeholder="Search resident…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={sg.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="open">Needs review (Submitted + Needs Info)</option>
          <option value="all">All</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {error && <div style={sg.error}>{error}</div>}

      {loading ? <p style={{ color: '#52525b' }}>Loading…</p> : (
        <div style={sg.tableWrap}>
          <table style={sg.table}>
            <thead>
              <tr>
                <th style={sg.th}>Resident</th>
                <th style={sg.th}>House</th>
                <th style={sg.th}>Submitted</th>
                <th style={sg.th}>Status</th>
                <th style={sg.th}>Documents</th>
                <th style={sg.th}>SUPRT-C</th>
                <th style={sg.th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ ...sg.td, textAlign: 'center', color: '#71717a', padding: '24px' }}>No screeners here.</td></tr>
              )}
              {filtered.map(r => {
                const kinds = new Set((r.sor_files || []).map(f => f.kind));
                const st = STATUS[r.status] || STATUS.submitted;
                return (
                  <tr key={r.id}>
                    <td style={{ ...sg.td, fontWeight: 500 }}>{clientName(r.clients) || '—'}</td>
                    <td style={sg.td}>{r.clients?.houses?.name || '—'}</td>
                    <td style={sg.td}>{fmtDate(r.submitted_at)}</td>
                    <td style={sg.td}><span style={{ ...sg.badge, background: st.bg, color: st.color }}>{st.label}</span></td>
                    <td style={{ ...sg.td, color: kinds.size === 4 ? '#16a34a' : '#b45309', fontWeight: 600 }}>{kinds.size} of 4</td>
                    <td style={sg.td}>{suprt[r.client_id] ? <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Done</span> : (r.status === 'accepted' ? <span style={{ color: '#71717a' }}>Waiting</span> : '—')}</td>
                    <td style={sg.td}><button style={sg.primaryBtn} onClick={() => setOpenId(r.id)}>Open</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openRow && (
        <ScreenerModal row={openRow} suprt={suprt[openRow.client_id] || null} canEdit={canEdit}
          onClose={() => setOpenId(null)} onChanged={fetchAll} />
      )}
    </div>
  );
}

// ---------- One screener ----------
function ScreenerModal({ row, suprt, canEdit, onClose, onChanged }) {
  const { user, fullName } = useUser();
  const [tab, setTab] = useState('screener');
  const [decisionNote, setDecisionNote] = useState(row.decision_note || '');
  const [staffNotes, setStaffNotes] = useState(row.staff_notes || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [upKind, setUpKind] = useState(DOC_KINDS[0]);
  const fileRef = useRef(null);
  const name = clientName(row.clients);
  const st = STATUS[row.status] || STATUS.submitted;

  // Esc closes the screener
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const answers = [
    ['1. Kingdom Living move-in date', fmtDate(row.move_in_date)],
    ['   Address', row.address || '—'],
    ['2. Anticipated move-out date', fmtDate(row.anticipated_move_out)],
    ['3. Place of employment', row.employer || '—'],
    ['   Monthly income', row.monthly_income || '—'],
    ['4. Has a substance use assessment?', row.has_assessment || '—'],
    ['   Already sent it?', row.assessment_sent || '—'],
    ['5. Currently receiving SOR Grant services?', row.receiving_sor || '—'],
    ['   If yes, start date', fmtDate(row.sor_start_date)],
    ['6. Can attend Family Group one Thursday a month?', row.family_group || '—'],
    ['7. Additional information', row.additional_info || '—'],
  ];

  const decide = async (status) => {
    if (status === 'needs_info' && !decisionNote.trim()) { setMsg({ ok: false, text: 'Add a note telling the resident what is needed.' }); return; }
    setSaving(true); setMsg(null);
    const { error } = await supabase.from('sor_screeners').update({
      status, decision_note: decisionNote.trim() || null, staff_notes: staffNotes.trim() || null,
      reviewed_by: user?.id || null, reviewed_by_name: fullName || user?.email || null, reviewed_at: new Date().toISOString(),
    }).eq('id', row.id);
    setSaving(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: `Marked ${STATUS[status].label}. The resident was notified.` });
    onChanged();
  };

  const saveNotes = async () => {
    setSaving(true); setMsg(null);
    const { error } = await supabase.from('sor_screeners').update({ decision_note: decisionNote.trim() || null, staff_notes: staffNotes.trim() || null }).eq('id', row.id);
    setSaving(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Notes saved.' });
    if (!error) onChanged();
  };

  const openFile = async (f, download) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 120, download ? { download: f.file_name || true } : undefined);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    window.open(data.signedUrl, '_blank');
  };

  const upload = async (file) => {
    if (!file) return;
    setSaving(true); setMsg(null);
    const clean = file.name.replace(/[^A-Za-z0-9._-]+/g, '_');
    const path = `${row.client_id}/${row.id}/${Date.now()}-${clean}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
    if (upErr) { setSaving(false); setMsg({ ok: false, text: upErr.message }); return; }
    const { error } = await supabase.from('sor_files').insert([{ screener_id: row.id, client_id: row.client_id, kind: upKind, storage_path: path, file_name: file.name, uploaded_by_role: 'staff' }]);
    setSaving(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${upKind} uploaded.` });
    onChanged();
  };

  const removeFile = async (f) => {
    if (!window.confirm(`Delete ${f.kind} (${f.file_name || 'file'})?`)) return;
    await supabase.storage.from(BUCKET).remove([f.storage_path]);
    await supabase.from('sor_files').delete().eq('id', f.id);
    onChanged();
  };

  return (
    <div style={sg.overlay} onClick={onClose}>
      <div style={sg.modal} onClick={e => e.stopPropagation()}>
        <div style={sg.modalHeader}>
          <div>
            <h3 style={sg.modalTitle}>{name || 'Resident'}</h3>
            <div style={{ fontSize: 13, color: '#52525b', marginTop: 4 }}>
              {row.clients?.houses?.name || 'No house'} · submitted {fmtDate(row.submitted_at)} · <span style={{ ...sg.badge, background: st.bg, color: st.color }}>{st.label}</span>
              {row.reviewed_at && <> · reviewed by {row.reviewed_by_name || 'staff'} on {fmtDate(row.reviewed_at)}</>}
            </div>
          </div>
          <button style={sg.backBtn} onClick={onClose}>← Back to list</button>
        </div>

        <div style={sg.tabs}>
          {[['screener', 'Screener'], ['documents', `Documents (${new Set((row.sor_files || []).map(f => f.kind)).size}/4)`], ['suprt', `SUPRT-C${suprt ? ' ✓' : ''}`]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...sg.tabBtn, ...(tab === k ? sg.tabActive : {}) }}>{l}</button>
          ))}
        </div>

        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
          {tab === 'screener' && (
            <>
              {answers.map(([q, a]) => (
                <div key={q} style={sg.answerRow}>
                  <span style={sg.answerQ}>{q}</span>
                  <span style={sg.answerA}>{a}</span>
                </div>
              ))}

              <div style={{ marginTop: 18 }}>
                <label style={sg.label}>Note to the resident (they see this in the Portal)
                  <textarea style={sg.textarea} value={decisionNote} onChange={e => setDecisionNote(e.target.value)} disabled={!canEdit}
                    placeholder="e.g. Please upload your insurance card." />
                </label>
                <label style={sg.label}>Staff notes (staff only)
                  <textarea style={sg.textarea} value={staffNotes} onChange={e => setStaffNotes(e.target.value)} disabled={!canEdit} />
                </label>
              </div>

              {canEdit && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <button style={{ ...sg.decBtn, background: '#dcfce7', borderColor: '#16a34a', color: '#16a34a' }} disabled={saving} onClick={() => decide('accepted')}>✓ Accept</button>
                  <button style={{ ...sg.decBtn, background: '#fef3c7', borderColor: '#b45309', color: '#b45309' }} disabled={saving} onClick={() => decide('needs_info')}>Needs Info</button>
                  <button style={{ ...sg.decBtn, background: '#fee2e2', borderColor: '#b91c1c', color: '#b91c1c' }} disabled={saving} onClick={() => decide('denied')}>✕ Deny</button>
                  <button style={sg.btn} disabled={saving} onClick={saveNotes}>Save notes only</button>
                </div>
              )}
            </>
          )}

          {tab === 'documents' && (
            <>
              {DOC_KINDS.map(kind => {
                const files = (row.sor_files || []).filter(f => f.kind === kind);
                return (
                  <div key={kind} style={sg.docBlock}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 14 }}>{kind}</strong>
                      {files.length ? <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 13 }}>✓ Uploaded</span> : <span style={{ color: '#b45309', fontSize: 13 }}>Missing</span>}
                    </div>
                    {files.map(f => (
                      <div key={f.id} style={sg.fileRow}>
                        <span style={{ fontSize: 13, color: '#3f3f46' }}>{f.file_name || 'File'} · {f.uploaded_by_role === 'client' ? 'resident' : 'staff'} · {fmtDate(f.created_at)}</span>
                        <span style={{ display: 'flex', gap: 6 }}>
                          <button style={sg.smallBtn} onClick={() => openFile(f, false)}>View</button>
                          <button style={sg.smallBtn} onClick={() => openFile(f, true)}>Download</button>
                          {canEdit && <button style={sg.smallBtn} onClick={() => removeFile(f)}>×</button>}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
              {canEdit && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                  <select style={sg.select} value={upKind} onChange={e => setUpKind(e.target.value)}>
                    {DOC_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                    onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
                  <button style={sg.primaryBtn} disabled={saving} onClick={() => fileRef.current?.click()}>{saving ? 'Uploading…' : '+ Upload for resident'}</button>
                </div>
              )}
            </>
          )}

          {tab === 'suprt' && <SuprtView suprt={suprt} status={row.status} canEdit={canEdit} onChanged={onChanged} />}

          {msg && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: msg.ok ? '#16a34a' : '#b91c1c' }}>{msg.text}</div>}
        </div>
        <div style={sg.modalFooter}>
          <button style={sg.btn} onClick={onClose}>← Back to list</button>
        </div>
      </div>
    </div>
  );
}

// ---------- SUPRT-C answers + Office Use Only ----------
function SuprtView({ suprt, status, canEdit, onChanged }) {
  const { user, fullName } = useUser();
  const [office, setOffice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!suprt) return;
    setOffice({
      office_client_code: suprt.office_client_code || '', office_site_id: suprt.office_site_id || '',
      office_grant_id: suprt.office_grant_id || '', office_conducted: suprt.office_conducted || '',
      office_conducted_date: suprt.office_conducted_date || '', office_not_conducted_reason: suprt.office_not_conducted_reason || '',
    });
  }, [suprt]);

  if (!suprt) {
    return <p style={{ color: '#71717a' }}>{status === 'accepted' ? 'Accepted — waiting for the resident to fill out the SUPRT-C in the Portal.' : 'The SUPRT-C opens for the resident after the screener is accepted.'}</p>;
  }

  const save = async () => {
    setSaving(true); setMsg(null);
    const { error } = await supabase.from('sor_suprt_c').update({
      ...office,
      office_conducted_date: office.office_conducted_date || null,
      office_updated_by_name: fullName || user?.email || null,
      office_updated_at: new Date().toISOString(),
    }).eq('id', suprt.id);
    setSaving(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Office section saved.' });
    if (!error) onChanged();
  };

  const goals = Array.isArray(suprt.a4_goals) ? suprt.a4_goals : [];
  const set = (k, v) => setOffice(p => ({ ...p, [k]: v }));

  return (
    <div>
      <p style={{ fontSize: 13, color: '#52525b', marginTop: 0 }}>Submitted {fmtDate(suprt.submitted_at)}</p>
      <div style={sg.answerRow}><span style={sg.answerQ}>A1. Best applies right now</span><span style={sg.answerA}>{suprt.a1_recovery || '—'}</span></div>
      <div style={{ ...sg.answerQ, margin: '12px 0 6px' }}>A2. Agree / disagree</div>
      {A2_ITEMS.map(([k, text]) => (
        <div key={k} style={sg.answerRow}><span style={sg.answerQ}>{k}. {text}</span><span style={sg.answerA}>{(suprt.a2 || {})[k] || '—'}</span></div>
      ))}
      <div style={sg.answerRow}><span style={sg.answerQ}>A3. Quality of life (0–100)</span><span style={sg.answerA}>{suprt.a3_quality_of_life ?? '—'}</span></div>
      <div style={sg.answerRow}>
        <span style={sg.answerQ}>A4. Goals they made progress on</span>
        <span style={sg.answerA}>
          {suprt.a4_prefer_not ? 'Prefer not to answer' : (goals.length ? goals.join('; ') : '—')}
          {suprt.a4_other ? ` · Other: ${suprt.a4_other}` : ''}
        </span>
      </div>

      {office && (
        <div style={{ marginTop: 18, padding: 14, border: '1px solid #c9c9cf', borderRadius: 10, background: '#f7f7f9' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#3f3f46', marginBottom: 10 }}>OFFICE USE ONLY — RECORD MANAGEMENT</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <label style={sg.label}>Client ID<input style={sg.input} value={office.office_client_code} disabled={!canEdit} onChange={e => set('office_client_code', e.target.value)} /></label>
            <label style={sg.label}>Site ID<input style={sg.input} value={office.office_site_id} disabled={!canEdit} onChange={e => set('office_site_id', e.target.value)} /></label>
            <label style={sg.label}>Grant ID<input style={sg.input} value={office.office_grant_id} disabled={!canEdit} onChange={e => set('office_grant_id', e.target.value)} /></label>
          </div>
          <label style={sg.label}>1. Was this assessment conducted with the client/caregiver?
            <select style={sg.input} value={office.office_conducted} disabled={!canEdit} onChange={e => set('office_conducted', e.target.value)}>
              <option value="">—</option>
              <option>Yes – Client</option>
              <option>Yes – Caregiver/Proxy</option>
              <option>No</option>
            </select>
          </label>
          {office.office_conducted.startsWith('Yes') && (
            <label style={sg.label}>1a. When?<input type="date" style={sg.input} value={office.office_conducted_date} disabled={!canEdit} onChange={e => set('office_conducted_date', e.target.value)} /></label>
          )}
          {office.office_conducted === 'No' && (
            <label style={sg.label}>1b. Why not? (primary reason)
              <select style={sg.input} value={office.office_not_conducted_reason} disabled={!canEdit} onChange={e => set('office_not_conducted_reason', e.target.value)}>
                <option value="">—</option>
                <option>Client/Caregiver was unable to provide consent</option>
                <option>Client was not reached for assessment</option>
                <option>Client no longer in care</option>
              </select>
            </label>
          )}
          {canEdit && <button style={{ ...sg.primaryBtn, marginTop: 10 }} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save office section'}</button>}
          {suprt.office_updated_at && <div style={{ fontSize: 12, color: '#71717a', marginTop: 8 }}>Last saved by {suprt.office_updated_by_name || 'staff'} on {fmtDate(suprt.office_updated_at)}</div>}
          {msg && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: msg.ok ? '#16a34a' : '#b91c1c' }}>{msg.text}</div>}
        </div>
      )}
    </div>
  );
}

const sg = {
  page: { padding: '32px', fontFamily: "'Inter', 'system-ui', sans-serif", color: '#18181b' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 700, margin: 0 },
  sub: { color: '#4b5563', fontSize: 14, margin: '4px 0 0 0' },
  summary: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 },
  statBox: { border: 'none', borderRadius: 10, padding: '10px 16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, cursor: 'pointer', minWidth: 110 },
  statNum: { fontSize: 20, fontWeight: 700 },
  statLabel: { fontSize: 13 },
  filters: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  search: { width: '100%', maxWidth: 280, backgroundColor: '#ffffff', border: '1px solid #b8b8bf', borderRadius: 8, padding: '9px 12px', fontSize: 14, boxSizing: 'border-box' },
  select: { backgroundColor: '#ffffff', border: '1px solid #b8b8bf', borderRadius: 8, padding: '9px 10px', fontSize: 14 },
  tableWrap: { overflowX: 'auto', border: '1px solid #c9c9cf', borderRadius: 10, background: '#ffffff' },
  table: { borderCollapse: 'collapse', width: '100%', fontSize: 14 },
  th: { background: '#f4f4f5', borderBottom: '2px solid #fee2e2', padding: '9px 10px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#3f3f46', textTransform: 'uppercase', letterSpacing: '0.04em' },
  td: { borderBottom: '1px solid #e4e4e7', padding: '9px 10px', verticalAlign: 'middle' },
  badge: { fontSize: 12, padding: '3px 8px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap' },
  btn: { backgroundColor: '#ffffff', border: '1px solid #b8b8bf', color: '#3f3f46', padding: '7px 12px', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
  primaryBtn: { backgroundColor: '#fee2e2', border: '1px solid #b22222', color: '#b22222', padding: '7px 14px', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontWeight: 600 },
  smallBtn: { backgroundColor: '#ffffff', border: '1px solid #c9c9cf', color: '#3f3f46', padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  decBtn: { border: '1px solid', padding: '8px 16px', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontWeight: 600 },
  error: { background: '#fee2e2', color: '#b91c1c', padding: '8px 12px', borderRadius: 8, fontSize: 14, marginBottom: 10 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', zIndex: 2000 },
  modal: { background: '#ffffff', borderRadius: 14, border: '1px solid #c9c9cf', width: '100%', maxWidth: 760, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 20px', borderBottom: '2px solid #fee2e2', gap: 12 },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700 },
  backBtn: { backgroundColor: '#ffffff', border: '1px solid #b8b8bf', color: '#3f3f46', padding: '7px 12px', borderRadius: 8, fontSize: 14, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' },
  modalFooter: { padding: '10px 20px', borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'flex-end' },
  closeBtn: { width: 30, height: 30, borderRadius: '50%', border: '1px solid #b8b8bf', background: 'transparent', cursor: 'pointer', color: '#52525b', fontSize: 18, flexShrink: 0 },
  tabs: { display: 'flex', gap: 4, padding: '8px 20px 0', borderBottom: '1px solid #e4e4e7' },
  tabBtn: { background: 'transparent', border: 'none', borderBottom: '2px solid transparent', padding: '8px 12px', fontSize: 14, cursor: 'pointer', color: '#52525b' },
  tabActive: { borderBottom: '2px solid #b22222', color: '#18181b', fontWeight: 600 },
  answerRow: { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: '1px solid #f4f4f5' },
  answerQ: { fontSize: 13, color: '#52525b', flex: 1, whiteSpace: 'pre-wrap' },
  answerA: { fontSize: 14, color: '#18181b', fontWeight: 500, flex: 1, textAlign: 'right', whiteSpace: 'pre-wrap' },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#52525b', marginBottom: 10 },
  textarea: { width: '100%', minHeight: 70, border: '1px solid #b8b8bf', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' },
  input: { width: '100%', border: '1px solid #b8b8bf', borderRadius: 8, padding: '8px 10px', fontSize: 14, boxSizing: 'border-box', background: '#fff' },
  docBlock: { border: '1px solid #e4e4e7', borderRadius: 10, padding: '10px 12px', marginBottom: 10 },
  fileRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid #f4f4f5', marginTop: 6 },
};

export default SorGrant;