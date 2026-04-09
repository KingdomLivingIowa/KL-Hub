import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

function IntakeDischarge() {
  const [view, setView] = useState('intake');
  const [house, setHouse] = useState('men');
  const [records, setRecords] = useState([]);
  const [filter, setFilter] = useState('all');
  const [reportMonth, setReportMonth] = useState('');
  const [reportHouse, setReportHouse] = useState('combined');
  const [activeClients, setActiveClients] = useState([]);
  const [waitingListCounts, setWaitingListCounts] = useState([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const [intakeForm, setIntakeForm] = useState({ first_name: '', last_name: '', date: '', oud: '', referral_source: '', referral_other: '', notes: '' });
  const [dischargeForm, setDischargeForm] = useState({ first_name: '', last_name: '', intake_date: '', discharge_date: '', exit_reason: '', exit_reason_other: '', notes: '' });

  useEffect(() => { fetchRecords(); }, []);

  const fetchRecords = async () => {
    const { data } = await supabase.from('survey_entries').select('*').order('created_at', { ascending: false });
    if (data) setRecords(data);
    const { data: clients } = await supabase.from('clients').select('id, start_date, discharge_date, status, house_id, gender, oud').not('start_date', 'is', null);
    if (clients) setActiveClients(clients);
    const { data: waitList } = await supabase.from('waiting_list').select('list_type').eq('status', 'waiting');
    if (waitList) setWaitingListCounts(waitList);
  };

  const showSuccess = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };

  const saveIntake = async () => {
    if (!intakeForm.first_name || !intakeForm.last_name || !intakeForm.date) { alert('Please enter first name, last name, and intake date.'); return; }
    setLoading(true);
    const { error } = await supabase.from('survey_entries').insert({
      type: 'intake', house, entry_date: intakeForm.date,
      first_name: intakeForm.first_name, last_name: intakeForm.last_name,
      oud: intakeForm.oud, referral_source: intakeForm.referral_source,
      referral_other: intakeForm.referral_other, notes: intakeForm.notes,
      intake_date: intakeForm.date,
    });
    setLoading(false);
    if (error) { alert('Error saving: ' + error.message); return; }
    setIntakeForm({ first_name: '', last_name: '', date: '', oud: '', referral_source: '', referral_other: '', notes: '' });
    fetchRecords();
    showSuccess('Intake saved!');
  };

  const saveDischarge = async () => {
    if (!dischargeForm.first_name || !dischargeForm.last_name || !dischargeForm.discharge_date) { alert('Please enter first name, last name, and discharge date.'); return; }
    let los = 0;
    if (dischargeForm.intake_date && dischargeForm.discharge_date) {
      los = Math.round((new Date(dischargeForm.discharge_date) - new Date(dischargeForm.intake_date)) / (1000 * 60 * 60 * 24));
    }
    setLoading(true);
    const { error } = await supabase.from('survey_entries').insert({
      type: 'discharge', house, entry_date: dischargeForm.discharge_date,
      first_name: dischargeForm.first_name, last_name: dischargeForm.last_name,
      intake_date: dischargeForm.intake_date || null, discharge_date: dischargeForm.discharge_date,
      exit_reason: dischargeForm.exit_reason, exit_reason_other: dischargeForm.exit_reason_other,
      length_of_stay: los, notes: dischargeForm.notes,
    });
    setLoading(false);
    if (error) { alert('Error saving: ' + error.message); return; }
    setDischargeForm({ first_name: '', last_name: '', intake_date: '', discharge_date: '', exit_reason: '', exit_reason_other: '', notes: '' });
    fetchRecords();
    showSuccess('Discharge saved!');
  };

  const months = [...new Set(records.map(r => r.entry_date?.slice(0, 7)).filter(Boolean))].sort().reverse();
  const curMonth = new Date().toISOString().slice(0, 7);
  const allMonths = months.includes(curMonth) ? months : [curMonth, ...months];
  const activeMonth = reportMonth || allMonths[0] || curMonth;

  const monthStart = activeMonth + '-01';
  const monthEnd = new Date(parseInt(activeMonth.slice(0, 4)), parseInt(activeMonth.slice(5, 7)), 0).toISOString().slice(0, 10);

  const uniqueHoused = activeClients.filter(c => {
    const moveIn = c.start_date;
    const moveOut = c.discharge_date;
    return moveIn <= monthEnd && (!moveOut || moveOut >= monthStart);
  });

  const uniqueHousedCount = reportHouse === 'combined'
    ? uniqueHoused.length
    : reportHouse === 'men'
      ? uniqueHoused.filter(c => c.gender === 'Male').length
      : uniqueHoused.filter(c => c.gender === 'Female').length;

  const oudCount = reportHouse === 'combined'
    ? uniqueHoused.filter(c => c.oud === 'Yes').length
    : reportHouse === 'men'
      ? uniqueHoused.filter(c => c.gender === 'Male' && c.oud === 'Yes').length
      : uniqueHoused.filter(c => c.gender === 'Female' && c.oud === 'Yes').length;

  const monthRecords = records.filter(r => r.entry_date?.slice(0, 7) === activeMonth);
  const filteredByHouse = reportHouse === 'combined' ? monthRecords : monthRecords.filter(r => r.house === reportHouse);
  const intakes = filteredByHouse.filter(r => r.type === 'intake');
  const exits = filteredByHouse.filter(r => r.type === 'discharge');
  const losArr = exits.filter(r => r.length_of_stay > 0).map(r => r.length_of_stay);
  const avgLos = losArr.length ? Math.round(losArr.reduce((a, b) => a + b, 0) / losArr.length) : 0;

  const menIntakes = monthRecords.filter(r => r.type === 'intake' && r.house === 'men');
  const womenIntakes = monthRecords.filter(r => r.type === 'intake' && r.house === 'women');
  const menExits = monthRecords.filter(r => r.type === 'discharge' && r.house === 'men');
  const womenExits = monthRecords.filter(r => r.type === 'discharge' && r.house === 'women');
  const menLos = menExits.filter(r => r.length_of_stay > 0).map(r => r.length_of_stay);
  const womenLos = womenExits.filter(r => r.length_of_stay > 0).map(r => r.length_of_stay);
  const avgMenLos = menLos.length ? Math.round(menLos.reduce((a, b) => a + b, 0) / menLos.length) : 0;
  const avgWomenLos = womenLos.length ? Math.round(womenLos.reduce((a, b) => a + b, 0) / womenLos.length) : 0;

  const menUniqueHoused = uniqueHoused.filter(c => c.gender === 'Male').length;
  const womenUniqueHoused = uniqueHoused.filter(c => c.gender === 'Female').length;

  const menWaitList = waitingListCounts.filter(w => w.list_type?.includes('Men')).length;
  const womenWaitList = waitingListCounts.filter(w => w.list_type?.includes('Women')).length;
  const totalWaitList = waitingListCounts.length;

  const refLabels = { correctional: 'Correctional facility', treatment: 'Treatment center', recovery: 'Recovery community center', self: 'Self-referral', homeless: 'Homeless', other: 'Other' };
  const exitLabels = { personal_home: 'Move to personal home', other_recovery: 'Other recovery house', supportive: 'Supportive housing', treatment: 'Return to treatment', return_use: 'Return to use', asked_leave: 'Asked to leave', incarceration: 'Incarceration', unknown: 'Unknown', other: 'Other' };

  const filteredRecords = records.filter(r => {
    if (filter === 'intake') return r.type === 'intake';
    if (filter === 'discharge') return r.type === 'discharge';
    if (filter === 'men') return r.house === 'men';
    if (filter === 'women') return r.house === 'women';
    return true;
  });

  const waitListCount = reportHouse === 'combined' ? totalWaitList : reportHouse === 'men' ? menWaitList : womenWaitList;

  return (
    <div style={s.page}>
      <div style={s.header}><h1 style={s.title}>Intake & Discharge</h1></div>
      <div style={s.tabs}>
        {[['intake','New Intake'],['discharge','New Discharge'],['records','Records'],['report','Monthly Report']].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)} style={{ ...s.tab, ...(view === id ? s.tabActive : {}) }}>{label}</button>
        ))}
      </div>

      {successMsg && <div style={s.success}>{successMsg}</div>}

      {view === 'intake' && (
        <div style={s.card}>
          <p style={s.cardSub}>Fill out when a new resident moves in</p>
          <div style={s.houseRow}>
            <button onClick={() => setHouse('men')} style={{ ...s.houseBtn, ...(house === 'men' ? s.houseBtnActive : {}) }}>Men's House</button>
            <button onClick={() => setHouse('women')} style={{ ...s.houseBtn, ...(house === 'women' ? s.houseBtnActive : {}) }}>Women's House</button>
          </div>
          <div style={s.grid2}>
            <div><label style={s.label}>First Name</label><input style={s.input} value={intakeForm.first_name} onChange={e => setIntakeForm({ ...intakeForm, first_name: e.target.value })} /></div>
            <div><label style={s.label}>Last Name</label><input style={s.input} value={intakeForm.last_name} onChange={e => setIntakeForm({ ...intakeForm, last_name: e.target.value })} /></div>
          </div>
          <div style={s.grid1}>
            <label style={s.label}>Date of Intake</label>
            <input type="date" style={s.input} value={intakeForm.date} onChange={e => setIntakeForm({ ...intakeForm, date: e.target.value })} />
          </div>
          <div style={s.grid1}>
            <label style={s.label}>OUD Diagnosis or History of Overdose?</label>
            <select style={s.input} value={intakeForm.oud} onChange={e => setIntakeForm({ ...intakeForm, oud: e.target.value })}>
              <option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option><option value="unknown">Unknown</option>
            </select>
          </div>
          <div style={s.grid1}>
            <label style={s.label}>Referral Source</label>
            <select style={s.input} value={intakeForm.referral_source} onChange={e => setIntakeForm({ ...intakeForm, referral_source: e.target.value })}>
              <option value="">Select...</option>
              <option value="correctional">Correctional Facility</option>
              <option value="treatment">Treatment Center</option>
              <option value="recovery">Recovery Community Center</option>
              <option value="self">Self-Referral</option>
              <option value="homeless">Homeless</option>
              <option value="other">Other</option>
            </select>
          </div>
          {intakeForm.referral_source === 'other' && (
            <div style={s.grid1}><label style={s.label}>Describe Referral Source</label><input style={s.input} value={intakeForm.referral_other} onChange={e => setIntakeForm({ ...intakeForm, referral_other: e.target.value })} /></div>
          )}
          <div style={s.grid1}><label style={s.label}>Notes (optional)</label><textarea style={{ ...s.input, minHeight: '80px', resize: 'vertical' }} value={intakeForm.notes} onChange={e => setIntakeForm({ ...intakeForm, notes: e.target.value })} /></div>
          <button style={s.submitBtn} onClick={saveIntake} disabled={loading}>{loading ? 'Saving...' : 'Save Intake Record'}</button>
        </div>
      )}

      {view === 'discharge' && (
        <div style={s.card}>
          <p style={s.cardSub}>Fill out when a resident moves out</p>
          <div style={s.houseRow}>
            <button onClick={() => setHouse('men')} style={{ ...s.houseBtn, ...(house === 'men' ? s.houseBtnActive : {}) }}>Men's House</button>
            <button onClick={() => setHouse('women')} style={{ ...s.houseBtn, ...(house === 'women' ? s.houseBtnActive : {}) }}>Women's House</button>
          </div>
          <div style={s.grid2}>
            <div><label style={s.label}>First Name</label><input style={s.input} value={dischargeForm.first_name} onChange={e => setDischargeForm({ ...dischargeForm, first_name: e.target.value })} /></div>
            <div><label style={s.label}>Last Name</label><input style={s.input} value={dischargeForm.last_name} onChange={e => setDischargeForm({ ...dischargeForm, last_name: e.target.value })} /></div>
          </div>
          <div style={s.grid2}>
            <div><label style={s.label}>Date of Intake (Move-in)</label><input type="date" style={s.input} value={dischargeForm.intake_date} onChange={e => setDischargeForm({ ...dischargeForm, intake_date: e.target.value })} /></div>
            <div><label style={s.label}>Date of Discharge (Move-out)</label><input type="date" style={s.input} value={dischargeForm.discharge_date} onChange={e => setDischargeForm({ ...dischargeForm, discharge_date: e.target.value })} /></div>
          </div>
          <div style={s.grid1}>
            <label style={s.label}>Reason for Exit</label>
            <select style={s.input} value={dischargeForm.exit_reason} onChange={e => setDischargeForm({ ...dischargeForm, exit_reason: e.target.value })}>
              <option value="">Select...</option>
              <option value="personal_home">Move to Rent/Own Personal Home</option>
              <option value="other_recovery">Move to Other Recovery House</option>
              <option value="supportive">Move to Other Supportive Housing</option>
              <option value="treatment">Return to Treatment</option>
              <option value="return_use">Return to Use</option>
              <option value="asked_leave">Asked to Leave</option>
              <option value="incarceration">Incarceration</option>
              <option value="unknown">Unknown</option>
              <option value="other">Other</option>
            </select>
          </div>
          {dischargeForm.exit_reason === 'other' && (
            <div style={s.grid1}><label style={s.label}>Describe Reason</label><input style={s.input} value={dischargeForm.exit_reason_other} onChange={e => setDischargeForm({ ...dischargeForm, exit_reason_other: e.target.value })} /></div>
          )}
          <div style={s.grid1}><label style={s.label}>Notes (optional)</label><textarea style={{ ...s.input, minHeight: '80px', resize: 'vertical' }} value={dischargeForm.notes} onChange={e => setDischargeForm({ ...dischargeForm, notes: e.target.value })} /></div>
          <button style={s.submitBtn} onClick={saveDischarge} disabled={loading}>{loading ? 'Saving...' : 'Save Discharge Record'}</button>
        </div>
      )}

      {view === 'records' && (
        <div style={s.card}>
          <div style={s.filterRow}>
            {[['all','All'],['intake','Intakes'],['discharge','Discharges'],['men',"Men's"],['women',"Women's"]].map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)} style={{ ...s.filterBtn, ...(filter === id ? s.filterBtnActive : {}) }}>{label}</button>
            ))}
          </div>
          {filteredRecords.length === 0 && <p style={s.empty}>No records yet.</p>}
          {filteredRecords.map(r => (
            <div key={r.id} style={s.recordRow}>
              <div style={{ ...s.avatar, ...(r.house === 'men' ? s.avatarMen : s.avatarWomen) }}>
                {(r.first_name?.[0] || '') + (r.last_name?.[0] || '')}
              </div>
              <div style={{ flex: 1 }}>
                <div style={s.recordName}>
                  {r.first_name} {r.last_name}
                  <span style={{ ...s.badge, ...(r.type === 'intake' ? s.badgeIntake : s.badgeExit) }}>{r.type}</span>
                  <span style={{ ...s.badge, ...(r.house === 'men' ? s.badgeMen : s.badgeWomen) }}>{r.house}</span>
                </div>
                <div style={s.recordMeta}>
                  {r.type === 'intake' ? `Referral: ${refLabels[r.referral_source] || '—'}` : `Exit: ${exitLabels[r.exit_reason] || '—'}${r.length_of_stay ? ' · ' + r.length_of_stay + ' days' : ''}`}
                </div>
              </div>
              <div style={s.recordDate}>{r.entry_date || '—'}</div>
            </div>
          ))}
        </div>
      )}

      {view === 'report' && (
        <div style={s.card}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <div>
              <label style={s.label}>Report Month</label>
              <select style={{ ...s.input, maxWidth: '180px' }} value={activeMonth} onChange={e => setReportMonth(e.target.value)}>
                {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>View</label>
              <select style={{ ...s.input, maxWidth: '180px' }} value={reportHouse} onChange={e => setReportHouse(e.target.value)}>
                <option value="combined">Combined</option>
                <option value="men">Men's House</option>
                <option value="women">Women's House</option>
              </select>
            </div>
          </div>

          <div style={s.metricGrid}>
            {[
              ['Unique Individuals Housed', uniqueHousedCount],
              ['OUD / Overdose History', oudCount],
              ['New Intakes', intakes.length],
              ['New Exits', exits.length],
              ['Avg Length of Stay (days)', avgLos || '—'],
              ['On Waiting List', waitListCount],
            ].map(([label, val]) => (
              <div key={label} style={s.metric}><div style={s.metricLabel}>{label}</div><div style={s.metricVal}>{val}</div></div>
            ))}
          </div>

          {reportHouse === 'combined' && (
            <>
              <div style={s.sectionLabel}>Breakdown by House</div>
              <div style={s.reportRow}><span style={s.reportLabel}>Men's — Unique Individuals Housed</span><span style={s.reportVal}>{menUniqueHoused}</span></div>
              <div style={s.reportRow}><span style={s.reportLabel}>Men's — Intakes</span><span style={s.reportVal}>{menIntakes.length}</span></div>
              <div style={s.reportRow}><span style={s.reportLabel}>Men's — Exits</span><span style={s.reportVal}>{menExits.length}</span></div>
              <div style={s.reportRow}><span style={s.reportLabel}>Men's — Avg Length of Stay (days)</span><span style={s.reportVal}>{avgMenLos || '—'}</span></div>
              <div style={s.reportRow}><span style={s.reportLabel}>Men's — On Waiting List</span><span style={s.reportVal}>{menWaitList}</span></div>
              <div style={s.reportRow}><span style={s.reportLabel}>Women's — Unique Individuals Housed</span><span style={s.reportVal}>{womenUniqueHoused}</span></div>
              <div style={s.reportRow}><span style={s.reportLabel}>Women's — Intakes</span><span style={s.reportVal}>{womenIntakes.length}</span></div>
              <div style={s.reportRow}><span style={s.reportLabel}>Women's — Exits</span><span style={s.reportVal}>{womenExits.length}</span></div>
              <div style={s.reportRow}><span style={s.reportLabel}>Women's — Avg Length of Stay (days)</span><span style={s.reportVal}>{avgWomenLos || '—'}</span></div>
              <div style={s.reportRow}><span style={s.reportLabel}>Women's — On Waiting List</span><span style={s.reportVal}>{womenWaitList}</span></div>
            </>
          )}

          <div style={{ ...s.sectionLabel, marginTop: '20px' }}>Intakes by Referral Source</div>
          {Object.entries(refLabels).map(([key, label]) => (
            <div key={key} style={s.reportRow}><span style={s.reportLabel}>{label}</span><span style={s.reportVal}>{intakes.filter(r => r.referral_source === key).length}</span></div>
          ))}

          <div style={{ ...s.sectionLabel, marginTop: '20px' }}>Exits by Reason</div>
          {Object.entries(exitLabels).map(([key, label]) => (
            <div key={key} style={s.reportRow}><span style={s.reportLabel}>{label}</span><span style={s.reportVal}>{exits.filter(r => r.exit_reason === key).length}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  page: { padding: '32px', backgroundColor: '#1a1a1a', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' },
  header: { marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: '600', margin: 0 },
  tabs: { display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' },
  tab: { padding: '8px 18px', borderRadius: '8px', border: '1px solid #444', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: '13px' },
  tabActive: { background: '#2a2a2a', color: '#fff', borderColor: '#666' },
  success: { background: '#1a3a1a', color: '#4ade80', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px' },
  card: { background: '#2a2a2a', borderRadius: '12px', padding: '24px', maxWidth: '700px' },
  cardSub: { color: '#888', fontSize: '13px', margin: '0 0 20px 0' },
  houseRow: { display: 'flex', gap: '8px', marginBottom: '20px' },
  houseBtn: { flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #444', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: '13px' },
  houseBtnActive: { background: '#1e2a3a', color: '#60a5fa', borderColor: '#3b82f6' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' },
  grid1: { marginBottom: '12px' },
  label: { display: 'block', fontSize: '13px', color: '#aaa', marginBottom: '4px' },
  input: { width: '100%', background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '14px', fontFamily: 'sans-serif', boxSizing: 'border-box' },
  submitBtn: { width: '100%', padding: '12px', background: '#b22222', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginTop: '8px' },
  filterRow: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' },
  filterBtn: { padding: '5px 12px', borderRadius: '8px', border: '1px solid #444', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: '12px' },
  filterBtnActive: { background: '#333', color: '#fff', borderColor: '#666' },
  recordRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid #333' },
  avatar: { width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '500', flexShrink: 0 },
  avatarMen: { background: '#1e3a5f', color: '#60a5fa' },
  avatarWomen: { background: '#3a1e2f', color: '#f472b6' },
  recordName: { fontSize: '14px', fontWeight: '500', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  recordMeta: { fontSize: '12px', color: '#888', marginTop: '2px' },
  recordDate: { fontSize: '12px', color: '#666', flexShrink: 0 },
  badge: { fontSize: '11px', padding: '2px 8px', borderRadius: '20px' },
  badgeIntake: { background: '#1a3a1a', color: '#4ade80' },
  badgeExit: { background: '#3a1a1a', color: '#f87171' },
  badgeMen: { background: '#1e3a5f', color: '#60a5fa' },
  badgeWomen: { background: '#3a1e2f', color: '#f472b6' },
  empty: { color: '#666', fontSize: '14px', padding: '20px 0' },
  metricGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' },
  metric: { background: '#1a1a1a', borderRadius: '8px', padding: '14px' },
  metricLabel: { fontSize: '12px', color: '#888', marginBottom: '6px' },
  metricVal: { fontSize: '24px', fontWeight: '600', color: '#fff' },
  sectionLabel: { fontSize: '11px', fontWeight: '500', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' },
  reportRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #333', fontSize: '14px' },
  reportLabel: { color: '#aaa' },
  reportVal: { fontWeight: '500', color: '#fff' },
};

export default IntakeDischarge;