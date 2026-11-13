import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';

// ============================================================
// Vouchers — rent voucher tracker (spreadsheet view)
// Admin + Upper Management: edit. House managers: view only.
// Each row links to a client, which links to their portal.
// ============================================================

const STAGES = ['Waiting on LS', 'LS Received', 'Approved', 'Paid'];
const STAGE_COLORS = {
  'Waiting on LS': { bg: '#f4f4f5', color: '#52525b' },
  'LS Received':   { bg: '#dbeafe', color: '#2563eb' },
  'Approved':      { bg: '#fef3c7', color: '#b45309' },
  'Paid':          { bg: '#dcfce7', color: '#16a34a' },
};
const BUCKET = 'voucher-files';

// "9.15.26", "9/15/26", "9-15-2026", "2026-09-15" -> "2026-09-15"
function parseDateInput(text) {
  const s = (text || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (!m) return undefined; // not a date
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  const mo = parseInt(m[1], 10), d = parseInt(m[2], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// "2026-09-15" -> "9.15.26" (same look as the old spreadsheet)
function fmtDate(iso) {
  if (!iso) return '';
  const [y, mo, d] = iso.split('-');
  return `${parseInt(mo, 10)}.${parseInt(d, 10)}.${y.slice(2)}`;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function clientName(c) {
  if (!c) return '';
  return c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
}

function houseNumber(name) {
  const m = (name || '').match(/\d{3,4}/);
  return m ? m[0] : '';
}

// Warnings shown as yellow cells
function rowWarnings(v) {
  const w = {};
  const thisYear = new Date().getFullYear();
  ['ls_date', 'approval_date', 'payment_date'].forEach(f => {
    if (v[f]) {
      const y = parseInt(v[f].slice(0, 4), 10);
      if (y !== thisYear) w[f] = `Year is ${y} — typo?`;
      if (v[f] > todayIso() && f !== 'ls_date') w[f] = 'Date is in the future';
    }
  });
  if (v.ls_date && v.approval_date && v.approval_date < v.ls_date) w.approval_date = 'Approval is before the landlord statement date';
  if (v.approval_date && v.payment_date && v.payment_date < v.approval_date) w.payment_date = 'Payment is before the approval date';
  return w;
}

function Vouchers() {
  const { hasFullAccess, user } = useUser();
  const canEdit = hasFullAccess;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('All');
  const [houseFilter, setHouseFilter] = useState('All');
  const [monthFilter, setMonthFilter] = useState('All');
  const [editing, setEditing] = useState(null); // { id, field, value }
  const [saveError, setSaveError] = useState(null);
  const [pickerFor, setPickerFor] = useState(null); // voucher id or 'new'
  const [filesFor, setFilesFor] = useState(null); // voucher row
  const [historyFor, setHistoryFor] = useState(null); // voucher row
  const [showSettings, setShowSettings] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  // Archived rows are read-only until restored
  const editable = canEdit && !showArchived;

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vouchers')
      .select('*, clients(id, full_name, first_name, last_name, status, house_id, houses(name)), voucher_files(id, file_name, storage_path, uploaded_by_role, kind, created_at)')
      .order('ls_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    if (error) setSaveError(error.message);
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const houses = useMemo(() => {
    const set = new Set(rows.map(r => r.house_label || houseNumber(r.clients?.houses?.name)).filter(Boolean));
    return [...set].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [rows]);

  const months = useMemo(() => {
    const set = new Set(rows.map(r => (r.ls_date || '').slice(0, 7)).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (showArchived ? !r.archived_at : r.archived_at) return false;
      const name = (clientName(r.clients) || r.resident_name || '').toLowerCase();
      const house = r.house_label || houseNumber(r.clients?.houses?.name);
      if (q && !name.includes(q) && !(r.notes || '').toLowerCase().includes(q)) return false;
      if (stageFilter !== 'All' && r.stage !== stageFilter) return false;
      if (houseFilter !== 'All' && house !== houseFilter) return false;
      if (monthFilter !== 'All' && (r.ls_date || '').slice(0, 7) !== monthFilter) return false;
      return true;
    });
  }, [rows, search, stageFilter, houseFilter, monthFilter, showArchived]);

  const totals = useMemo(() => {
    const t = { count: filtered.length, paid: 0 };
    STAGES.forEach(s => { t[s] = 0; });
    filtered.forEach(r => {
      t[r.stage] = (t[r.stage] || 0) + 1;
      if (r.stage === 'Paid') t.paid += Number(r.amount || 0);
    });
    return t;
  }, [filtered]);

  // ---------- Saving ----------
  const saveField = async (row, field, rawValue) => {
    setSaveError(null);
    let value = rawValue;
    if (['ls_date', 'approval_date', 'payment_date'].includes(field)) {
      value = parseDateInput(rawValue);
      if (value === undefined) { setSaveError(`"${rawValue}" isn't a date. Type it like 9.15.26`); return false; }
    }
    if (field === 'amount') {
      const s = String(rawValue || '').replace(/[$,\s]/g, '');
      value = s === '' ? null : Number(s);
      if (value !== null && Number.isNaN(value)) { setSaveError(`"${rawValue}" isn't an amount`); return false; }
    }
    if (field === 'notes' || field === 'resident_name' || field === 'house_label') value = (rawValue || '').trim() || null;
    if ((row[field] ?? null) === (value ?? null)) return true;

    const { data, error } = await supabase.from('vouchers').update({ [field]: value }).eq('id', row.id)
      .select('*, clients(id, full_name, first_name, last_name, status, house_id, houses(name)), voucher_files(id, file_name, storage_path, uploaded_by_role, kind, created_at)')
      .single();
    if (error) { setSaveError(error.message); return false; }
    setRows(prev => prev.map(r => (r.id === row.id ? data : r)));
    return true;
  };

  const startEdit = (row, field) => {
    if (!editable) return;
    let value = row[field] ?? '';
    if (['ls_date', 'approval_date', 'payment_date'].includes(field)) value = fmtDate(row[field]);
    setEditing({ id: row.id, field, value: String(value) });
  };

  const commitEdit = async () => {
    if (!editing) return;
    const row = rows.find(r => r.id === editing.id);
    const ok = row ? await saveField(row, editing.field, editing.value) : true;
    if (ok) setEditing(null);
  };

  const toggleFlag = async (row) => {
    if (!editable) return;
    await saveField(row, 'flagged', !row.flagged);
  };

  const addRow = async (client) => {
    setSaveError(null);
    const { data, error } = await supabase.from('vouchers').insert([{
      client_id: client?.id || null,
      resident_name: clientName(client) || null,
      house_label: houseNumber(client?.houses?.name) || null,
      amount: 430,
      created_by: user?.id,
    }]).select('*, clients(id, full_name, first_name, last_name, status, house_id, houses(name)), voucher_files(id, file_name, storage_path, uploaded_by_role, kind, created_at)').single();
    if (error) { setSaveError(error.message); return; }
    setRows(prev => [...prev, data]);
  };

  const linkClient = async (row, client) => {
    setSaveError(null);
    const { data, error } = await supabase.from('vouchers').update({
      client_id: client.id,
      resident_name: clientName(client),
      house_label: houseNumber(client.houses?.name) || row.house_label,
    }).eq('id', row.id)
      .select('*, clients(id, full_name, first_name, last_name, status, house_id, houses(name)), voucher_files(id, file_name, storage_path, uploaded_by_role, kind, created_at)')
      .single();
    if (error) { setSaveError(error.message); return; }
    setRows(prev => prev.map(r => (r.id === row.id ? data : r)));
  };

  const archiveRow = async (row) => {
    const who = clientName(row.clients) || row.resident_name || 'this resident';
    if (!window.confirm(`Archive the voucher row for ${who}? You can find it later under "Archived" and restore it.`)) return;
    setSaveError(null);
    const { data, error } = await supabase.from('vouchers')
      .update({ archived_at: new Date().toISOString(), archived_by: user?.id || null })
      .eq('id', row.id).select('*, clients(id, full_name, first_name, last_name, status, house_id, houses(name)), voucher_files(id, file_name, storage_path, uploaded_by_role, kind, created_at)').single();
    if (error) { setSaveError(error.message); return; }
    setRows(prev => prev.map(r => (r.id === row.id ? data : r)));
  };

  const restoreRow = async (row) => {
    setSaveError(null);
    const { data, error } = await supabase.from('vouchers')
      .update({ archived_at: null, archived_by: null })
      .eq('id', row.id).select('*, clients(id, full_name, first_name, last_name, status, house_id, houses(name)), voucher_files(id, file_name, storage_path, uploaded_by_role, kind, created_at)').single();
    if (error) { setSaveError(error.message); return; }
    setRows(prev => prev.map(r => (r.id === row.id ? data : r)));
  };

  const deleteForever = async (row) => {
    const who = clientName(row.clients) || row.resident_name || 'this resident';
    if (!window.confirm(`Permanently delete the archived voucher for ${who}? This removes it and its files for good and can't be undone.`)) return;
    setSaveError(null);
    const paths = (row.voucher_files || []).map(f => f.storage_path).filter(Boolean);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from('vouchers').delete().eq('id', row.id);
    if (error) { setSaveError(error.message); return; }
    setRows(prev => prev.filter(r => r.id !== row.id));
  };

  const archivedCount = rows.filter(r => r.archived_at).length;

  const exportCsv = () => {
    const head = ['Resident Name', 'House', 'Landlord Statement Date', 'Approval Date', 'Payment Date', 'Amount', 'Expected Payment', 'Stage', 'Files', 'Notes', 'Linked to Client'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filtered.map(r => [
      clientName(r.clients) || r.resident_name, r.house_label || houseNumber(r.clients?.houses?.name),
      fmtDate(r.ls_date), fmtDate(r.approval_date), fmtDate(r.payment_date), r.amount ?? '',
      fmtDate(r.expected_payment), r.stage, (r.voucher_files || []).length, r.notes || '', r.client_id ? 'Yes' : 'No',
    ].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Voucher Tracking ${todayIso()}.csv`;
    a.click();
  };

  // ---------- Cells ----------
  const cell = (row, field, display, opts = {}) => {
    const warn = rowWarnings(row)[field];
    const isEditing = editing && editing.id === row.id && editing.field === field;
    const base = { ...vs.td, ...(opts.style || {}), ...(warn ? vs.warnCell : {}), cursor: editable ? 'text' : 'default' };
    if (isEditing) {
      return (
        <td style={{ ...base, padding: 0 }}>
          <input
            autoFocus
            value={editing.value}
            onChange={e => setEditing({ ...editing, value: e.target.value })}
            onBlur={commitEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
              if (e.key === 'Escape') { setEditing(null); setSaveError(null); }
            }}
            placeholder={opts.placeholder || ''}
            style={vs.cellInput}
          />
        </td>
      );
    }
    return (
      <td style={base} title={warn || ''} onClick={() => startEdit(row, field)}>
        {display}
      </td>
    );
  };

  return (
    <div style={vs.page}>
      <div style={vs.header}>
        <div>
          <h1 style={vs.title}>Vouchers</h1>
          <p style={vs.sub}>
            {showArchived
              ? 'Archived voucher records · read only. Restore a row to edit it again.'
              : <>Rent voucher tracking · {canEdit ? 'Click any cell to edit. Dates can be typed like 9.15.26.' : 'View only.'}</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {editable && <button style={vs.primaryBtn} onClick={() => setPickerFor('new')}>+ Add Voucher</button>}
          <button style={showArchived ? vs.primaryBtn : vs.btn} onClick={() => { setShowArchived(a => !a); setEditing(null); setStageFilter('All'); }}>
            {showArchived ? '← Back to Vouchers' : `🗄 Archived (${archivedCount})`}
          </button>
          <button style={vs.btn} onClick={exportCsv}>⬇ Export to Excel</button>
          {canEdit && <button style={vs.btn} onClick={() => setShowSettings(true)}>Portal Instructions</button>}
          <button style={vs.btn} onClick={fetchRows}>↻ Refresh</button>
        </div>
      </div>

      {showArchived && (
        <div style={vs.archiveBanner}>🗄 You're viewing <strong>archived</strong> vouchers. These are hidden from the tracker and from residents' portals.</div>
      )}

      {/* Summary */}
      <div style={vs.summary}>
        {STAGES.map(s => (
          <button key={s} onClick={() => setStageFilter(stageFilter === s ? 'All' : s)}
            style={{ ...vs.statBox, background: STAGE_COLORS[s].bg, outline: stageFilter === s ? `2px solid ${STAGE_COLORS[s].color}` : 'none' }}>
            <span style={{ ...vs.statNum, color: STAGE_COLORS[s].color }}>{totals[s] || 0}</span>
            <span style={{ ...vs.statLabel, color: STAGE_COLORS[s].color }}>{s}</span>
          </button>
        ))}
        <div style={{ ...vs.statBox, background: '#f7f7f9', cursor: 'default' }}>
          <span style={vs.statNum}>${totals.paid.toLocaleString('en-US')}</span>
          <span style={vs.statLabel}>Paid (shown rows)</span>
        </div>
      </div>

      {/* Filters */}
      <div style={vs.filters}>
        <input style={vs.search} placeholder="Search name or notes…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={vs.select} value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="All">All stages</option>
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={vs.select} value={houseFilter} onChange={e => setHouseFilter(e.target.value)}>
          <option value="All">All houses</option>
          {houses.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <select style={vs.select} value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
          <option value="All">All months (LS date)</option>
          {months.map(m => {
            const [y, mo] = m.split('-');
            return <option key={m} value={m}>{new Date(Number(y), Number(mo) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</option>;
          })}
        </select>
      </div>

      {saveError && <div style={vs.error}>{saveError} <button style={vs.linkBtn} onClick={() => setSaveError(null)}>dismiss</button></div>}

      {loading ? <p style={{ color: '#52525b' }}>Loading…</p> : (
        <div style={vs.tableWrap}>
          <table style={vs.table}>
            <thead>
              <tr>
                <th style={{ ...vs.th, width: '28px' }} title="Flag"></th>
                <th style={{ ...vs.th, minWidth: '190px' }}>Resident Name</th>
                <th style={{ ...vs.th, width: '64px' }}>House</th>
                <th style={{ ...vs.th, width: '96px' }}>Landlord Statement Date</th>
                <th style={{ ...vs.th, width: '90px' }}>Approval Date</th>
                <th style={{ ...vs.th, width: '90px' }}>Payment Date</th>
                <th style={{ ...vs.th, width: '76px' }}>Amount</th>
                <th style={{ ...vs.th, width: '90px' }}>Expected Pay</th>
                <th style={{ ...vs.th, width: '110px' }}>Stage</th>
                <th style={{ ...vs.th, width: '44px' }} title="Files">📎</th>
                <th style={{ ...vs.th, minWidth: '260px' }}>Notes</th>
                {canEdit && <th style={{ ...vs.th, width: showArchived ? '120px' : '56px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={canEdit ? 12 : 11} style={{ ...vs.td, textAlign: 'center', color: '#71717a', padding: '24px' }}>{showArchived ? 'No archived vouchers.' : 'No vouchers match.'}</td></tr>
              )}
              {filtered.map(r => {
                const name = clientName(r.clients) || r.resident_name || '';
                const house = r.house_label || houseNumber(r.clients?.houses?.name);
                const overdue = r.stage === 'Approved' && r.expected_payment && r.expected_payment < todayIso();
                const files = r.voucher_files || [];
                const clientUpload = files.some(f => f.uploaded_by_role === 'client');
                const rowStyle = r.flagged ? vs.flagRow : {};
                return (
                  <tr key={r.id} style={rowStyle}>
                    <td style={{ ...vs.td, textAlign: 'center', cursor: editable ? 'pointer' : 'default' }} onClick={() => toggleFlag(r)} title={editable ? 'Highlight this row' : ''}>
                      {r.flagged ? '🟨' : <span style={{ color: '#d4d4d8' }}>▢</span>}
                    </td>
                    <td style={vs.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 500, fontStyle: r.client_id ? 'normal' : 'italic', color: r.client_id ? '#18181b' : '#71717a' }}>
                          {name || '—'}
                          {r.archived_at && (
                            <span style={{ display: 'block', fontSize: '11px', fontStyle: 'normal', color: '#71717a', fontWeight: 400 }}>
                              Archived {new Date(r.archived_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                        </span>
                        {!r.client_id && editable && (
                          <button style={vs.linkChip} onClick={() => setPickerFor(r.id)} title="Link this row to a client so it shows in their portal">Link client</button>
                        )}
                        {r.client_id && editable && (
                          <button style={vs.tinyBtn} onClick={() => setPickerFor(r.id)} title="Change client">✎</button>
                        )}
                      </div>
                    </td>
                    {cell(r, 'house_label', house, { style: { textAlign: 'center' } })}
                    {cell(r, 'ls_date', fmtDate(r.ls_date), { style: { textAlign: 'center' }, placeholder: '9.15.26' })}
                    {cell(r, 'approval_date', fmtDate(r.approval_date), { style: { textAlign: 'center' }, placeholder: '9.15.26' })}
                    {cell(r, 'payment_date', fmtDate(r.payment_date), { style: { textAlign: 'center' }, placeholder: '9.15.26' })}
                    {cell(r, 'amount', r.amount != null ? Number(r.amount).toLocaleString('en-US') : '', { style: { textAlign: 'right' } })}
                    <td style={{ ...vs.td, textAlign: 'center', color: overdue ? '#dc2626' : '#52525b', fontWeight: overdue ? 600 : 400 }}
                      title={overdue ? 'Past the expected payment date' : 'Approval date + 15 days'}>
                      {r.stage === 'Paid' ? '' : fmtDate(r.expected_payment)}
                    </td>
                    <td style={vs.td}>
                      <span style={{ ...vs.badge, background: STAGE_COLORS[r.stage]?.bg, color: STAGE_COLORS[r.stage]?.color }}>{r.stage}</span>
                    </td>
                    <td style={{ ...vs.td, textAlign: 'center', cursor: 'pointer' }} onClick={() => setFilesFor(r)} title="View / upload files">
                      {files.length > 0
                        ? <span style={{ fontWeight: 600, color: clientUpload ? '#2563eb' : '#18181b' }}>📎{files.length}</span>
                        : <span style={{ color: '#d4d4d8' }}>📎</span>}
                    </td>
                    {cell(r, 'notes', r.notes || '', { style: { whiteSpace: 'pre-wrap' } })}
                    {canEdit && (
                      <td style={{ ...vs.td, whiteSpace: 'nowrap' }}>
                        <button style={vs.tinyBtn} onClick={() => setHistoryFor(r)} title="Change history">🕘</button>
                        {showArchived ? (
                          <>
                            <button style={vs.tinyBtn} onClick={() => restoreRow(r)} title="Restore to the tracker">↩ Restore</button>
                            <button style={{ ...vs.tinyBtn, color: '#b91c1c', borderColor: '#fca5a5' }} onClick={() => deleteForever(r)} title="Delete permanently">🗑</button>
                          </>
                        ) : (
                          <button style={vs.tinyBtn} onClick={() => archiveRow(r)} title="Archive this row">×</button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ color: '#71717a', fontSize: '13px', marginTop: '10px' }}>
        Yellow cell = date looks wrong (hover to see why). Red expected-pay date = past due. Blue 📎 = resident uploaded from the portal. Italic name = not linked to a client yet (won't show in their portal).
      </p>

      {pickerFor && (
        <ClientPicker
          onClose={() => setPickerFor(null)}
          onPick={async (client) => {
            if (pickerFor === 'new') await addRow(client);
            else {
              const row = rows.find(x => x.id === pickerFor);
              if (row) await linkClient(row, client);
            }
            setPickerFor(null);
          }}
          allowBlank={pickerFor === 'new'}
          onBlank={async () => { await addRow(null); setPickerFor(null); }}
        />
      )}

      {filesFor && (
        <FilesModal
          row={rows.find(x => x.id === filesFor.id) || filesFor}
          canEdit={editable}
          onClose={() => setFilesFor(null)}
          onChanged={fetchRows}
        />
      )}

      {historyFor && <HistoryModal row={historyFor} onClose={() => setHistoryFor(null)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// ---------- Pick a client ----------
function ClientPicker({ onClose, onPick, allowBlank, onBlank }) {
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('clients')
      .select('id, full_name, first_name, last_name, status, houses(name)')
      .not('status', 'in', '("Archived","Denied")')
      .order('full_name')
      .then(({ data }) => { setClients(data || []); setLoading(false); });
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = clients.filter(c => !s || clientName(c).toLowerCase().includes(s));
    const rank = { Active: 0, Pending: 1, Accepted: 2, 'Waiting List': 3, Applied: 4, Discharged: 5 };
    return list.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || clientName(a).localeCompare(clientName(b))).slice(0, 50);
  }, [clients, q]);

  return (
    <div style={vs.overlay} onClick={onClose}>
      <div style={{ ...vs.modal, maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
        <div style={vs.modalHeader}>
          <h3 style={vs.modalTitle}>Choose client</h3>
          <button style={vs.closeBtn} onClick={onClose}>×</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <input autoFocus style={{ ...vs.search, width: '100%', maxWidth: 'none' }} placeholder="Type a name…" value={q} onChange={e => setQ(e.target.value)} />
          <div style={{ maxHeight: '360px', overflowY: 'auto', marginTop: '10px' }}>
            {loading && <p style={{ color: '#71717a' }}>Loading clients…</p>}
            {!loading && shown.map(c => (
              <button key={c.id} style={vs.pickRow} onClick={() => onPick(c)}>
                <span style={{ fontWeight: 500 }}>{clientName(c)}</span>
                <span style={{ color: '#71717a', fontSize: '13px' }}>{c.houses?.name || '—'} · {c.status}</span>
              </button>
            ))}
            {!loading && shown.length === 0 && <p style={{ color: '#71717a' }}>No clients match.</p>}
          </div>
          {allowBlank && (
            <button style={{ ...vs.linkBtn, marginTop: '10px' }} onClick={onBlank}>Add a blank row instead (link a client later)</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Files ----------
function FilesModal({ row, canEdit, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const inputRef = useRef(null);
  const files = row.voucher_files || [];

  const openFile = async (f, download) => {
    setErr(null);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 120, download ? { download: f.file_name || true } : undefined);
    if (error) { setErr(error.message); return; }
    window.open(data.signedUrl, '_blank');
  };

  const upload = async (file) => {
    if (!file) return;
    if (!row.client_id) { setErr('Link this row to a client before uploading.'); return; }
    setBusy(true); setErr(null);
    const clean = file.name.replace(/[^A-Za-z0-9._-]+/g, '_');
    const path = `${row.client_id}/${row.id}/${Date.now()}-${clean}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
    if (upErr) { setErr(upErr.message); setBusy(false); return; }
    const { error: rowErr } = await supabase.from('voucher_files').insert([{
      voucher_id: row.id, client_id: row.client_id, storage_path: path, file_name: file.name,
      kind: 'Landlord Statement', uploaded_by_role: 'staff',
    }]);
    if (rowErr) setErr(rowErr.message);
    setBusy(false);
    onChanged();
  };

  const remove = async (f) => {
    if (!window.confirm(`Delete ${f.file_name || 'this file'}?`)) return;
    await supabase.storage.from(BUCKET).remove([f.storage_path]);
    await supabase.from('voucher_files').delete().eq('id', f.id);
    onChanged();
  };

  return (
    <div style={vs.overlay} onClick={onClose}>
      <div style={{ ...vs.modal, maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
        <div style={vs.modalHeader}>
          <h3 style={vs.modalTitle}>Files — {clientName(row.clients) || row.resident_name}</h3>
          <button style={vs.closeBtn} onClick={onClose}>×</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {files.length === 0 && <p style={{ color: '#71717a' }}>No files yet.</p>}
          {files.map(f => (
            <div key={f.id} style={vs.fileRow}>
              <div>
                <div style={{ fontWeight: 500 }}>{f.file_name || 'File'}</div>
                <div style={{ fontSize: '13px', color: '#71717a' }}>
                  {f.kind} · {f.uploaded_by_role === 'client' ? 'uploaded by resident' : 'uploaded by staff'} · {new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button style={vs.btn} onClick={() => openFile(f, false)}>View</button>
                <button style={vs.btn} onClick={() => openFile(f, true)}>Download</button>
                {canEdit && <button style={vs.tinyBtn} onClick={() => remove(f)} title="Delete">×</button>}
              </div>
            </div>
          ))}
          {canEdit && (
            <div style={{ marginTop: '14px' }}>
              <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
              <button style={vs.primaryBtn} disabled={busy} onClick={() => inputRef.current?.click()}>
                {busy ? 'Uploading…' : '+ Upload landlord statement'}
              </button>
            </div>
          )}
          {err && <div style={{ ...vs.error, marginTop: '10px' }}>{err}</div>}
        </div>
      </div>
    </div>
  );
}

// ---------- Change history ----------
const FIELD_LABELS = { archived: 'Archived', client: 'Client', ls_date: 'LS Date', approval_date: 'Approval Date', payment_date: 'Payment Date', amount: 'Amount', notes: 'Notes' };

function HistoryModal({ row, onClose }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('voucher_history').select('*').eq('voucher_id', row.id).order('changed_at', { ascending: false });
      const ids = [...new Set((data || []).map(h => h.changed_by).filter(Boolean))];
      let names = {};
      if (ids.length) {
        const { data: profiles } = await supabase.from('user_profiles').select('id, full_name').in('id', ids);
        names = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]));
      }
      setItems((data || []).map(h => ({ ...h, who: names[h.changed_by] || (h.changed_by ? 'Staff' : 'System') })));
    })();
  }, [row.id]);

  const show = (field, v) => (field === 'archived' ? (v === 'archived' ? 'Archived' : 'Active') : null) || (['ls_date', 'approval_date', 'payment_date'].includes(field) ? fmtDate(v) : (field === 'client' ? (v ? 'linked' : '—') : v)) || '—';

  return (
    <div style={vs.overlay} onClick={onClose}>
      <div style={{ ...vs.modal, maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
        <div style={vs.modalHeader}>
          <h3 style={vs.modalTitle}>Change history — {clientName(row.clients) || row.resident_name}</h3>
          <button style={vs.closeBtn} onClick={onClose}>×</button>
        </div>
        <div style={{ padding: '16px 20px', maxHeight: '420px', overflowY: 'auto' }}>
          {!items && <p style={{ color: '#71717a' }}>Loading…</p>}
          {items && items.length === 0 && <p style={{ color: '#71717a' }}>No changes recorded yet.</p>}
          {items && items.map(h => (
            <div key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid #e4e4e7', fontSize: '14px' }}>
              <div><strong>{FIELD_LABELS[h.field] || h.field}</strong>: {show(h.field, h.old_value)} → {show(h.field, h.new_value)}</div>
              <div style={{ color: '#71717a', fontSize: '13px' }}>{h.who} · {new Date(h.changed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Portal instructions ----------
function SettingsModal({ onClose }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    supabase.from('voucher_settings').select('*').eq('id', 1).maybeSingle()
      .then(({ data }) => setForm(data || { id: 1, instructions: '', online_application_url: '', contact_email: '' }));
  }, []);

  const save = async () => {
    setSaving(true); setMsg(null);
    const { error } = await supabase.from('voucher_settings').update({
      instructions: form.instructions, online_application_url: form.online_application_url,
      contact_email: form.contact_email, updated_at: new Date().toISOString(),
    }).eq('id', 1);
    setSaving(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Saved. Residents will see this in their portal.' });
  };

  return (
    <div style={vs.overlay} onClick={onClose}>
      <div style={{ ...vs.modal, maxWidth: '680px' }} onClick={e => e.stopPropagation()}>
        <div style={vs.modalHeader}>
          <h3 style={vs.modalTitle}>Portal voucher instructions</h3>
          <button style={vs.closeBtn} onClick={onClose}>×</button>
        </div>
        {!form ? <p style={{ padding: '20px', color: '#71717a' }}>Loading…</p> : (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={vs.label}>Instructions (what residents see)
              <textarea style={{ ...vs.input, minHeight: '280px', fontFamily: 'inherit', lineHeight: 1.5 }} value={form.instructions || ''}
                onChange={e => setForm({ ...form, instructions: e.target.value })} />
            </label>
            <label style={vs.label}>Online application link
              <input style={vs.input} value={form.online_application_url || ''} onChange={e => setForm({ ...form, online_application_url: e.target.value })} />
            </label>
            <label style={vs.label}>Contact email
              <input style={vs.input} value={form.contact_email || ''} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button style={vs.primaryBtn} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
              {msg && <span style={{ color: msg.ok ? '#16a34a' : '#dc2626', fontSize: '14px' }}>{msg.text}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const vs = {
  page: { padding: '32px', fontFamily: "'Inter', 'system-ui', sans-serif", color: '#18181b' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' },
  title: { fontSize: '24px', fontWeight: '700', margin: 0 },
  sub: { color: '#4b5563', fontSize: '14px', margin: '4px 0 0 0' },
  summary: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' },
  statBox: { border: 'none', borderRadius: '10px', padding: '10px 16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', cursor: 'pointer', minWidth: '110px' },
  statNum: { fontSize: '20px', fontWeight: '700', color: '#18181b' },
  statLabel: { fontSize: '13px', color: '#52525b' },
  filters: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' },
  search: { width: '100%', maxWidth: '280px', backgroundColor: '#ffffff', border: '1px solid #b8b8bf', borderRadius: '8px', padding: '9px 12px', color: '#18181b', fontSize: '14px', boxSizing: 'border-box' },
  select: { backgroundColor: '#ffffff', border: '1px solid #b8b8bf', borderRadius: '8px', padding: '9px 10px', color: '#18181b', fontSize: '14px' },
  tableWrap: { overflowX: 'auto', border: '1px solid #c9c9cf', borderRadius: '10px', background: '#ffffff' },
  table: { borderCollapse: 'collapse', width: '100%', fontSize: '14px' },
  th: { position: 'sticky', top: 0, background: '#f4f4f5', borderBottom: '2px solid #fee2e2', borderRight: '1px solid #e4e4e7', padding: '8px 8px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#3f3f46', lineHeight: 1.2 },
  td: { borderBottom: '1px solid #e4e4e7', borderRight: '1px solid #e4e4e7', padding: '6px 8px', verticalAlign: 'middle', height: '34px' },
  cellInput: { width: '100%', height: '34px', border: '2px solid #2563eb', padding: '4px 6px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' },
  warnCell: { background: '#fef9c3' },
  archiveBanner: { background: '#f4f4f5', border: '1px solid #d4d4d8', color: '#3f3f46', borderRadius: '10px', padding: '10px 14px', fontSize: '14px', marginBottom: '14px' },
  flagRow: { background: '#fef08a' },
  badge: { fontSize: '12px', padding: '3px 8px', borderRadius: '20px', fontWeight: '600', whiteSpace: 'nowrap' },
  btn: { backgroundColor: '#ffffff', border: '1px solid #b8b8bf', color: '#3f3f46', padding: '7px 12px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' },
  primaryBtn: { backgroundColor: '#fee2e2', border: '1px solid #b22222', color: '#b22222', padding: '7px 14px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' },
  tinyBtn: { background: 'transparent', border: '1px solid #d4d4d8', color: '#52525b', borderRadius: '4px', padding: '1px 6px', fontSize: '13px', cursor: 'pointer', marginLeft: '2px' },
  linkChip: { background: '#fff7ed', border: '1px solid #fdba74', color: '#c2410c', borderRadius: '12px', padding: '1px 8px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' },
  linkBtn: { background: 'transparent', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '14px', padding: 0 },
  error: { background: '#fee2e2', color: '#b91c1c', padding: '8px 12px', borderRadius: '8px', fontSize: '14px', marginBottom: '10px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: '#ffffff', borderRadius: '14px', border: '1px solid #c9c9cf', width: '100%', overflow: 'hidden' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '2px solid #fee2e2' },
  modalTitle: { margin: 0, fontSize: '17px', fontWeight: '600' },
  closeBtn: { width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #b8b8bf', background: 'transparent', cursor: 'pointer', color: '#52525b', fontSize: '18px' },
  pickRow: { display: 'flex', justifyContent: 'space-between', gap: '10px', width: '100%', textAlign: 'left', padding: '10px 8px', border: 'none', borderBottom: '1px solid #f4f4f5', background: 'transparent', cursor: 'pointer', fontSize: '14px' },
  fileRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid #f4f4f5' },
  label: { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: '#52525b' },
  input: { width: '100%', backgroundColor: '#ffffff', border: '1px solid #b8b8bf', borderRadius: '8px', padding: '9px 12px', color: '#18181b', fontSize: '14px', boxSizing: 'border-box' },
};

export default Vouchers;