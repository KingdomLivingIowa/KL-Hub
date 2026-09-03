import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3, CURRENT_YEAR - 4];

const REFERRAL_LABELS = {
  'Correctional facility': 'Correctional Facility',
  'Treatment center': 'Treatment Center',
  'Recovery community center': 'Recovery Community Center',
  'Self-referral': 'Self-Referral',
  'Homeless': 'Homeless',
  'Other': 'Other',
};

const EXIT_LABELS = {
  'Move to Rent/Own Personal Home': 'Move to Personal Home',
  'Move to Other Recovery House': 'Other Recovery House',
  'Move to Other Supportive Housing': 'Supportive Housing',
  'Return to Treatment': 'Return to Treatment',
  'Return to Use': 'Return to Use',
  'Asked to Leave': 'Asked to Leave',
  'Graduate': 'Graduate',
  'Incarceration': 'Incarceration',
  'Unknown': 'Unknown',
  'Other': 'Other',
};

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: mon.toISOString().split('T')[0], end: sun.toISOString().split('T')[0] };
}

function calcLOS(startDate, endDate) {
  if (!startDate || !endDate) return null;
  return Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
}

function avgArr(arr) {
  const valid = arr.filter(n => n !== null && n !== undefined && !isNaN(n));
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
}

function fmtMoney(n) {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getMonthBounds(ym) {
  const start = ym + '-01';
  const end = new Date(parseInt(ym.slice(0, 4)), parseInt(ym.slice(5, 7)), 0).toISOString().slice(0, 10);
  return { start, end };
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: '#f7f7f9', borderRadius: 12, padding: '16px 18px', borderTop: `3px solid ${accent || '#b22222'}`, minWidth: 0 }}>
      <div style={{ fontSize: 13, color: '#71717a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: '#18181b', lineHeight: 1.1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 13, color: '#71717a', marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: '#f7f7f9', borderRadius: 12, padding: '20px 22px', border: '1px solid #e4e4e8', marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #e4e4e8' }}>
      <span style={{ fontSize: 15, color: '#52525b' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#18181b' }}>{value ?? '—'}</span>
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div style={{ background: '#ffffff', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 13, color: '#71717a', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: color || '#18181b' }}>{value ?? '—'}</div>
    </div>
  );
}

function YearTable({ title, columns, rows }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>{title}</div>
      <div style={{ background: '#f7f7f9', borderRadius: 12, border: '1px solid #e4e4e8', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `1fr ${columns.map(() => '90px').join(' ')}`, background: '#f7f7f9', padding: '10px 16px', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#71717a', fontWeight: 600 }}>YEAR</span>
          {columns.map(c => <span key={c} style={{ fontSize: 12, color: '#71717a', fontWeight: 600, textAlign: 'right' }}>{c}</span>)}
        </div>
        {rows.map((row, i) => (
          <div key={row.year} style={{ display: 'grid', gridTemplateColumns: `1fr ${columns.map(() => '90px').join(' ')}`, padding: '11px 16px', gap: 8, borderTop: '1px solid #e4e4e8', background: i === 0 ? '#fee2e2' : 'transparent' }}>
            <span style={{ fontSize: 14, color: i === 0 ? '#18181b' : '#71717a', fontWeight: i === 0 ? 600 : 400 }}>{row.year}</span>
            {row.values.map((v, j) => (
              <span key={j} style={{ fontSize: 14, color: i === 0 ? '#18181b' : '#71717a', fontWeight: i === 0 ? 600 : 400, textAlign: 'right' }}>{v ?? '—'}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function WalkthroughsReport() {
  const [walkthroughs, setWalkthroughs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterHouse, setFilterHouse] = useState('all');
  const [houses, setHouses] = useState([]);

  useEffect(() => {
    Promise.all([
      supabase.from('house_walkthroughs').select('*').order('walkthrough_date', { ascending: false }),
      supabase.from('houses').select('id, name').order('name'),
    ]).then(([wRes, hRes]) => {
      setWalkthroughs(wRes.data || []);
      setHouses(hRes.data || []);
      setLoading(false);
    });
  }, []);

  const filtered = filterHouse === 'all' ? walkthroughs : walkthroughs.filter(w => w.house_id === filterHouse);

  const resultBadge = (result) => {
    const map = {
      meets_standard: { label: 'Meets Standard', color: '#16a34a' },
      needs_improvement: { label: 'Needs Improvement', color: '#c2410c' },
      not_acceptable: { label: 'Not Acceptable', color: '#dc2626' },
    };
    const r = map[result] || { label: result, color: '#71717a' };
    return <span style={{ color: r.color, fontSize: '12px', fontWeight: '600' }}>{r.label}</span>;
  };

  const avgScore = filtered.length ? Math.round(filtered.reduce((sum, w) => sum + (w.score / w.total_items * 100), 0) / filtered.length) : 0;
  const meetCount = filtered.filter(w => w.overall_result === 'meets_standard').length;
  const needsCount = filtered.filter(w => w.overall_result === 'needs_improvement').length;
  const notAcceptCount = filtered.filter(w => w.overall_result === 'not_acceptable').length;

  if (loading) return <div style={{ color: '#9ca3af', padding: '20px' }}>Loading walkthroughs...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ color: '#18181b', margin: 0, fontSize: '18px', fontWeight: '700' }}>House Walkthroughs</h2>
        <select value={filterHouse} onChange={e => setFilterHouse(e.target.value)}
          style={{ background: '#ffffff', border: '1px solid #d8d8dd', borderRadius: '8px', padding: '7px 12px', color: '#3f3f46', fontSize: '13px' }}>
          <option value="all">All Houses</option>
          {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: '14px' }}>No walkthroughs found.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Total Submitted', value: filtered.length, color: '#2563eb' },
              { label: 'Avg Pass Rate', value: `${avgScore}%`, color: avgScore >= 90 ? '#16a34a' : avgScore >= 70 ? '#c2410c' : '#dc2626' },
              { label: 'Meets Standard', value: meetCount, color: '#16a34a' },
              { label: 'Needs Improvement', value: needsCount, color: '#c2410c' },
              { label: 'Not Acceptable', value: notAcceptCount, color: '#dc2626' },
            ].map(stat => (
              <div key={stat.label} style={{ background: '#ffffff', border: '1px solid #e4e4e8', borderRadius: '10px', padding: '14px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: stat.color }} />
                <p style={{ color: stat.color, fontSize: '24px', fontWeight: '800', margin: '4px 0 4px' }}>{stat.value}</p>
                <p style={{ color: '#9ca3af', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{stat.label}</p>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(w => {
              const pct = Math.round((w.score / w.total_items) * 100);
              const fmtD = new Date(w.walkthrough_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return (
                <div key={w.id} style={{ background: '#ffffff', border: '1px solid #e4e4e8', borderRadius: '10px', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <p style={{ color: '#18181b', fontWeight: '600', fontSize: '14px', margin: '0 0 2px' }}>{w.house_name}</p>
                      <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{fmtD} · By {w.submitted_by}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      {resultBadge(w.overall_result)}
                      <span style={{ color: '#71717a', fontSize: '13px' }}>{w.score}/{w.total_items} ({pct}%)</span>
                      <div style={{ width: '80px', height: '6px', background: '#e4e4e8', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626', borderRadius: '3px' }} />
                      </div>
                    </div>
                  </div>
                  {w.corrective_actions && (
                    <p style={{ color: '#dc2626', fontSize: '12px', margin: '8px 0 0', fontStyle: 'italic' }}>⚠ {w.corrective_actions.slice(0, 120)}{w.corrective_actions.length > 120 ? '...' : ''}</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState('weekly');
  const [loading, setLoading] = useState(true);
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reportHouse, setReportHouse] = useState('combined');

  const [clients, setClients] = useState([]);
  const [stays, setStays] = useState([]);
  const [payments, setPayments] = useState([]);
  const [waitingList, setWaitingList] = useState([]);
  const [houses, setHouses] = useState([]);
  const [applications, setApplications] = useState([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [clientsRes, staysRes, paymentsRes, waitingRes, housesRes, appsRes, maintRes] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('client_stays').select('*'),
      supabase.from('payments').select('*'),
      supabase.from('waiting_list').select('*'),
      supabase.from('houses').select('*'),
      supabase.from('applications').select('id, gender, created_at, status'),
      supabase.from('maintenance_requests').select('*'),
    ]);
    setClients(clientsRes.data || []);
    setStays(staysRes.data || []);
    setPayments(paymentsRes.data || []);
    setWaitingList(waitingRes.data || []);
    setHouses(housesRes.data || []);
    setApplications(appsRes.data || []);
    setMaintenanceRequests(maintRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Weekly ─────────────────────────────────────────────────────────────────
  const week = getWeekRange();

  const appsThisWeek = applications.filter(a =>
    a.created_at && a.created_at.split('T')[0] >= week.start && a.created_at.split('T')[0] <= week.end
  );
  const maleAppsWeek = appsThisWeek.filter(a => a.gender === 'Male').length;
  const femaleAppsWeek = appsThisWeek.filter(a => a.gender === 'Female').length;

  const activeClients = clients.filter(c => c.status === 'Active');
  const inProgram = activeClients.length + clients.filter(c => c.status === 'Pending').length;
  const totalBeds = houses.reduce((sum, h) => sum + (h.total_beds || 0), 0);

  const docWaitlist = waitingList.filter(w => w.status === 'waiting' && w.list_type?.includes('DOC')).length;
  const communityWaitlist = waitingList.filter(w => w.status === 'waiting' && w.list_type?.includes('Community')).length;
  const womenWaitlist = waitingList.filter(w => w.status === 'waiting' && w.list_type?.includes('Women')).length;

  const moveInsWeek = clients.filter(c => c.start_date >= week.start && c.start_date <= week.end).length;
  const dischargedThisWeek = clients.filter(c => c.discharge_date && c.discharge_date >= week.start && c.discharge_date <= week.end);
  const successfulDischargesWeek = dischargedThisWeek.filter(c => c.successful_discharge === true).length;
  const paymentsWeekTotal = payments
    .filter(p => p.payment_date && p.payment_date >= week.start && p.payment_date <= week.end)
    .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

  // ── LOS ────────────────────────────────────────────────────────────────────
  const completedStays = stays.filter(s => s.start_date && s.discharge_date);
  const clientGenderMap = {};
  clients.forEach(c => { clientGenderMap[c.id] = c.gender; });

  function losByGenderAndPeriod(gender, months) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return avgArr(
      completedStays
        .filter(s => s.discharge_date >= cutoffStr && clientGenderMap[s.client_id] === gender)
        .map(s => calcLOS(s.start_date, s.discharge_date))
    );
  }

  const avgLosOverall = avgArr(completedStays.map(s => calcLOS(s.start_date, s.discharge_date)));

  // ── Year-by-year ───────────────────────────────────────────────────────────
  const yearRows = YEARS.map(y => ({
    year: y,
    moveIns: stays.filter(s => s.start_date?.startsWith(String(y))).length,
    successful: stays.filter(s => s.discharge_date?.startsWith(String(y)) && s.successful_discharge === true).length,
    graduates: stays.filter(s => s.discharge_date?.startsWith(String(y)) && s.graduate === true).length,
  }));

  // ── Monthly ────────────────────────────────────────────────────────────────
  const { start: mStart, end: mEnd } = getMonthBounds(reportMonth);

  const uniqueHoused = clients.filter(c => c.start_date && c.start_date <= mEnd && (!c.discharge_date || c.discharge_date >= mStart));
  const byGender = (arr, g) => arr.filter(c => c.gender === g);

  const uniqueHousedFiltered = reportHouse === 'combined' ? uniqueHoused
    : reportHouse === 'men' ? byGender(uniqueHoused, 'Male') : byGender(uniqueHoused, 'Female');

  const oudCount = uniqueHousedFiltered.filter(c => c.oud === 'Yes' || c.oud === 'yes').length;

  const allIntakesMonth = clients.filter(c => c.start_date >= mStart && c.start_date <= mEnd);
  const intakesMonth = reportHouse === 'combined' ? allIntakesMonth
    : reportHouse === 'men' ? byGender(allIntakesMonth, 'Male') : byGender(allIntakesMonth, 'Female');

  const allExitsMonth = clients.filter(c => c.discharge_date && c.discharge_date >= mStart && c.discharge_date <= mEnd);
  const exitsMonth = reportHouse === 'combined' ? allExitsMonth
    : reportHouse === 'men' ? byGender(allExitsMonth, 'Male') : byGender(allExitsMonth, 'Female');

  const staysExitedThisMonth = stays.filter(s => s.discharge_date >= mStart && s.discharge_date <= mEnd);
  const staysFiltered = reportHouse === 'combined' ? staysExitedThisMonth
    : staysExitedThisMonth.filter(s => clientGenderMap[s.client_id] === (reportHouse === 'men' ? 'Male' : 'Female'));
  const avgLosMonth = avgArr(staysFiltered.map(s => calcLOS(s.start_date, s.discharge_date)));

  const graduatesMonth = staysExitedThisMonth.filter(s => s.graduate === true);
  const graduatesMonthFiltered = reportHouse === 'combined' ? graduatesMonth
    : graduatesMonth.filter(s => clientGenderMap[s.client_id] === (reportHouse === 'men' ? 'Male' : 'Female'));
  const menGraduatesMonth = graduatesMonth.filter(s => clientGenderMap[s.client_id] === 'Male').length;
  const womenGraduatesMonth = graduatesMonth.filter(s => clientGenderMap[s.client_id] === 'Female').length;

  const menWaitList = waitingList.filter(w => w.status === 'waiting' && w.list_type?.includes('Men')).length;
  const womenWaitList = waitingList.filter(w => w.status === 'waiting' && w.list_type?.includes('Women')).length;
  const totalWaitList = waitingList.filter(w => w.status === 'waiting').length;
  const waitListCount = reportHouse === 'combined' ? totalWaitList : reportHouse === 'men' ? menWaitList : womenWaitList;

  const menStaysMonth = staysExitedThisMonth.filter(s => clientGenderMap[s.client_id] === 'Male');
  const womenStaysMonth = staysExitedThisMonth.filter(s => clientGenderMap[s.client_id] === 'Female');

  const referralCounts = {};
  Object.keys(REFERRAL_LABELS).forEach(k => { referralCounts[k] = 0; });
  intakesMonth.forEach(c => {
    const src = c.referral_source;
    if (src && referralCounts[src] !== undefined) referralCounts[src]++;
    else if (src) referralCounts['Other'] = (referralCounts['Other'] || 0) + 1;
  });

  const exitCounts = {};
  Object.keys(EXIT_LABELS).forEach(k => { exitCounts[k] = 0; });
  exitsMonth.forEach(c => {
    const reason = c.reason_for_discharge;
    if (reason && exitCounts[reason] !== undefined) exitCounts[reason]++;
    else if (reason) exitCounts['Other'] = (exitCounts['Other'] || 0) + 1;
  });

  const tabBtn = (id) => ({
    padding: '9px 20px', borderRadius: 8, border: '1px solid #d8d8dd', cursor: 'pointer', fontSize: 14,
    background: activeTab === id ? '#e4e4e7' : 'transparent',
    color: activeTab === id ? '#18181b' : '#71717a',
    fontWeight: activeTab === id ? 600 : 400,
  });

  if (loading) return <div style={{ padding: 32, color: '#71717a', fontSize: 14 }}>Loading reports...</div>;

  const generateReportPDF = () => {
        const title = { weekly: 'Weekly Overview', monthly: 'Monthly Report', yearly: 'Year-by-Year', levels: 'Levels Report', maintenance: 'Maintenance Report', walkthroughs: 'Walkthroughs Report' }[activeTab] || 'Report';
    const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const el = document.getElementById('report-content');
    if (!el) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>KL — ${title}</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #18181b; color: #f4f4f6; padding: 0; }
      @media print { .no-print { display: none !important; } body { padding: 0; } }

      /* ── Page wrapper ── */
      .pdf-page { max-width: 900px; margin: 0 auto; padding: 40px 48px 60px; }

      /* ── Header ── */
      .pdf-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 6px; }
      .pdf-org { font-size: 22px; font-weight: 800; color: #f4f4f6; letter-spacing: -0.3px; }
      .pdf-report-type { font-size: 13px; font-weight: 600; color: #8b1c1c; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 3px; }
      .pdf-meta { font-size: 12px; color: #9ca3af; text-align: right; line-height: 1.6; }
      .pdf-divider { height: 3px; background: linear-gradient(to right, #8b1c1c, #c0392b); border-radius: 2px; margin: 14px 0 28px; }

      /* ── Print button ── */
      .print-btn { display: inline-flex; align-items: center; gap: 6px; background: #8b1c1c; color: #18181b; border: none; padding: 10px 22px; border-radius: 7px; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 28px; letter-spacing: 0.02em; }

      /* ── Stat grid (weekly/maintenance) ── */
      .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
      .stat-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; background: #18181b; position: relative; overflow: hidden; }
      .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--accent, #8b1c1c); border-radius: 10px 10px 0 0; }
      .stat-val { font-size: 28px; font-weight: 800; color: #f4f4f6; line-height: 1.1; margin-bottom: 4px; }
      .stat-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
      .stat-sub { font-size: 12px; color: #9ca3af; margin-top: 3px; }

      /* ── Metric cards (monthly) ── */
      .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 24px; }
      .metric-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; }
      .metric-val { font-size: 26px; font-weight: 800; color: #f4f4f6; line-height: 1.1; margin-bottom: 4px; }
      .metric-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; line-height: 1.3; }

      /* ── Section blocks ── */
      .section { border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 20px; overflow: hidden; }
      .section-title { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; padding: 12px 16px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }

      /* ── Tables ── */
      table { width: 100%; border-collapse: collapse; }
      th { background: #f3f4f6; text-align: left; padding: 9px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
      th[style*="right"], td[style*="right"] { text-align: right; }
      td { padding: 9px 14px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #374151; }
      tr:last-child td { border-bottom: none; }
      tr:nth-child(even) td { background: #fafafa; }
      .row-label { color: #4b5563; }
      .row-val { font-weight: 600; color: #f4f4f6; text-align: right; }

      /* ── Week range label ── */
      .week-range { display: inline-block; background: #fef3f2; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 12px; font-size: 12px; color: #8b1c1c; font-weight: 600; margin-bottom: 20px; letter-spacing: 0.03em; }

      /* ── Year table ── */
      .year-section-title { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; margin-top: 20px; }
      .year-current td { background: #fef2f2 !important; font-weight: 700; color: #f4f4f6 !important; }

      /* ── LOS section ── */
      .los-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 14px 16px; }
      .los-gender { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid currentColor; }
      .los-overall { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f9fafb; border-top: 1px solid #e5e7eb; }
      .los-overall-label { font-size: 13px; color: #6b7280; }
      .los-overall-val { font-size: 17px; font-weight: 800; color: #f4f4f6; }

      /* ── Pie charts (levels) ── */
      .chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 20px; }
      .chart-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 18px; background: #18181b; }
      .chart-title { font-size: 13px; font-weight: 700; color: #f4f4f6; margin-bottom: 14px; }
      .chart-inner { display: flex; align-items: center; gap: 16px; }
      .chart-legend-item { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; font-size: 12px; color: #4b5563; }
      .chart-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .chart-total { font-size: 11px; color: #9ca3af; margin-top: 6px; }

      /* ── Maintenance stat boxes ── */
      .maint-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 24px; }
      .maint-stat { border-radius: 10px; padding: 16px 18px; border: 1px solid #e5e7eb; background: #18181b; }
      .maint-stat-val { font-size: 30px; font-weight: 800; line-height: 1.1; margin-bottom: 4px; }
      .maint-stat-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
      .maint-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }

      /* ── Color overrides (force all dark colors to print-friendly) ── */
      [style*="color: #18181b"], [style*="color:#18181b"] { color: #f4f4f6 !important; }
      [style*="color: #3f3f46"], [style*="color:#3f3f46"] { color: #374151 !important; }
      [style*="color: #71717a"], [style*="color:#71717a"] { color: #6b7280 !important; }
      [style*="color: #71717a"], [style*="color:#71717a"] { color: #6b7280 !important; }
      [style*="color: #52525b"], [style*="color:#52525b"] { color: #4b5563 !important; }
      [style*="color: #6b7280"], [style*="color:#6b7280"] { color: #6b7280 !important; }
      [style*="color: #9ca3af"], [style*="color:#9ca3af"] { color: #6b7280 !important; }
      [style*="color: #a1a1aa"], [style*="color:#a1a1aa"] { color: #6b7280 !important; }
      [style*="background: #f7f7f9"], [style*="background:#f7f7f9"],
      [style*="background: #ffffff"], [style*="background:#ffffff"],
      [style*="background: #f7f7f9"], [style*="background:#f7f7f9"],
      [style*="background: #ffffff"], [style*="background:#ffffff"],
      [style*="background: #fee2e2"], [style*="background:#fee2e2"],
      [style*="background: #ffffff"], [style*="background:#ffffff"] { background: #18181b !important; }
      [style*="border: 1px solid #e4e4e8"], [style*="border:1px solid #e4e4e8"],
      [style*="border: 1px solid #e4e4e8"], [style*="border:1px solid #e4e4e8"],
      [style*="border-bottom: 1px solid #e4e4e8"], [style*="border-bottom:1px solid #e4e4e8"],
      [style*="border-bottom: 1px solid #e4e4e8"] { border-color: #e5e7eb !important; }
      [style*="border-top: 3px solid #b22222"] { border-top-color: #8b1c1c !important; }
      [style*="background: #f7f7f9"] { background: #f9fafb !important; }
    </style></head><body>
    <div class="pdf-page">
      <button class="print-btn no-print" onclick="window.print()">⬇ Print / Save PDF</button>
      <div class="pdf-header">
        <div>
          <div class="pdf-org">Kingdom Living Iowa</div>
          <div class="pdf-report-type">${title}</div>
        </div>
        <div class="pdf-meta">
          Non-Profit Recovery Community<br/>
          Generated ${date}
        </div>
      </div>
      <div class="pdf-divider"></div>
      ${el.innerHTML}
    </div>
    </body></html>`;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };

  return (
    <div style={{ fontFamily: "'Inter', 'system-ui', sans-serif" }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={tabBtn('weekly')} onClick={() => setActiveTab('weekly')}>Weekly Overview</button>
          <button style={tabBtn('monthly')} onClick={() => setActiveTab('monthly')}>Monthly Report</button>
          <button style={tabBtn('yearly')} onClick={() => setActiveTab('yearly')}>Year-by-Year</button>
          <button style={tabBtn('levels')} onClick={() => setActiveTab('levels')}>Levels</button>
                    <button style={tabBtn('maintenance')} onClick={() => setActiveTab('maintenance')}>Maintenance</button>
          <button style={tabBtn('walkthroughs')} onClick={() => setActiveTab('walkthroughs')}>Walkthroughs</button>
        </div>
        <button onClick={generateReportPDF} style={{ background: '#dcfce7', color: '#16a34a', border: '1px solid #dcfce7', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}>⬇ Export PDF</button>
      </div>
      <div id="report-content">

      {/* ── WEEKLY ──────────────────────────────────────────────────────────── */}
      {activeTab === 'weekly' && (
        <div>
          <div style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Week of {week.start} — {week.end}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
            <StatCard label="Male Applicants" value={maleAppsWeek} accent="#2563eb" />
            <StatCard label="Female Applicants" value={femaleAppsWeek} accent="#db2777" />
            <StatCard label="DOC Waitlist" value={docWaitlist} accent="#b45309" />
            <StatCard label="Community Waitlist" value={communityWaitlist} accent="#b45309" />
            <StatCard label="Women's Waitlist" value={womenWaitlist} accent="#db2777" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
            <StatCard label="Total in Program" value={inProgram} sub={`${totalBeds} beds total`} accent="#b22222" />
            <StatCard label="People in Beds" value={activeClients.length} accent="#b22222" />
            <StatCard label="Move Ins This Week" value={moveInsWeek} accent="#059669" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
            <StatCard label="Discharges This Week" value={dischargedThisWeek.length} accent="#dc2626" />
            <StatCard label="Successful Discharges" value={successfulDischargesWeek} accent="#059669" />
            <StatCard label="Payments This Week" value={fmtMoney(paymentsWeekTotal)} accent="#7c3aed" />
          </div>

        </div>
      )}

      {/* ── MONTHLY ─────────────────────────────────────────────────────────── */}
      {activeTab === 'monthly' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: '#71717a', marginBottom: 5 }}>Report Month</div>
              <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
                style={{ background: '#f7f7f9', border: '1px solid #d8d8dd', borderRadius: 8, padding: '8px 12px', color: '#18181b', fontSize: 14 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#71717a', marginBottom: 5 }}>View</div>
              <select value={reportHouse} onChange={e => setReportHouse(e.target.value)}
                style={{ background: '#f7f7f9', border: '1px solid #d8d8dd', borderRadius: 8, padding: '8px 12px', color: '#18181b', fontSize: 14 }}>
                <option value="combined">Combined</option>
                <option value="men">Men's House</option>
                <option value="women">Women's House</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
            <MetricCard label="Unique Individuals Housed" value={uniqueHousedFiltered.length} />
            <MetricCard label="OUD / Overdose History" value={oudCount} />
            <MetricCard label="New Intakes" value={intakesMonth.length} />
            <MetricCard label="New Exits" value={exitsMonth.length} />
            <MetricCard label="Graduates" value={graduatesMonthFiltered.length} color="#16a34a" />
            <MetricCard label="Avg Length of Stay (days)" value={avgLosMonth ?? '—'} />
            <MetricCard label="On Waiting List" value={waitListCount} />
          </div>

          {reportHouse === 'combined' && (
            <Section title="Breakdown by House">
              <Row label="Men's — Unique Individuals Housed" value={byGender(uniqueHoused, 'Male').length} />
              <Row label="Men's — Intakes" value={byGender(allIntakesMonth, 'Male').length} />
              <Row label="Men's — Exits" value={byGender(allExitsMonth, 'Male').length} />
              <Row label="Men's — Graduates" value={menGraduatesMonth} />
              <Row label="Men's — Avg Length of Stay (days)" value={avgArr(menStaysMonth.map(s => calcLOS(s.start_date, s.discharge_date))) ?? '—'} />
              <Row label="Men's — On Waiting List" value={menWaitList} />
              <Row label="Women's — Unique Individuals Housed" value={byGender(uniqueHoused, 'Female').length} />
              <Row label="Women's — Intakes" value={byGender(allIntakesMonth, 'Female').length} />
              <Row label="Women's — Exits" value={byGender(allExitsMonth, 'Female').length} />
              <Row label="Women's — Graduates" value={womenGraduatesMonth} />
              <Row label="Women's — Avg Length of Stay (days)" value={avgArr(womenStaysMonth.map(s => calcLOS(s.start_date, s.discharge_date))) ?? '—'} />
              <Row label="Women's — On Waiting List" value={womenWaitList} />
            </Section>
          )}

          <Section title="Average Length of Stay (Days)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Male</div>
                <Row label="Past Year" value={losByGenderAndPeriod('Male', 12)} />
                <Row label="Past 6 Months" value={losByGenderAndPeriod('Male', 6)} />
                <Row label="Past 3 Months" value={losByGenderAndPeriod('Male', 3)} />
                <Row label="Past 1 Month" value={losByGenderAndPeriod('Male', 1)} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#db2777', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Female</div>
                <Row label="Past Year" value={losByGenderAndPeriod('Female', 12)} />
                <Row label="Past 6 Months" value={losByGenderAndPeriod('Female', 6)} />
                <Row label="Past 3 Months" value={losByGenderAndPeriod('Female', 3)} />
                <Row label="Past 1 Month" value={losByGenderAndPeriod('Female', 1)} />
              </div>
            </div>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e4e4e8', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: '#71717a' }}>Overall average (all time)</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#18181b' }}>{avgLosOverall ?? '—'} days</span>
            </div>
          </Section>

          <Section title="Intakes by Referral Source">
            {Object.entries(REFERRAL_LABELS).map(([key, label]) => (
              <Row key={key} label={label} value={referralCounts[key] ?? 0} />
            ))}
          </Section>

          <Section title="Exits by Reason">
            {Object.entries(EXIT_LABELS).map(([key, label]) => (
              <Row key={key} label={label} value={exitCounts[key] ?? 0} />
            ))}
          </Section>
        </div>
      )}

      {/* ── YEARLY ──────────────────────────────────────────────────────────── */}
      {activeTab === 'yearly' && (
        <div>
          <YearTable
            title="Move Ins by Year"
            columns={['Move Ins']}
            rows={yearRows.map(r => ({ year: r.year, values: [r.moveIns] }))}
          />
          <YearTable
            title="Successful Discharges & Graduates by Year"
            columns={['Successful', 'Graduates']}
            rows={yearRows.map(r => ({ year: r.year, values: [r.successful, r.graduates] }))}
          />
        </div>
      )}

      {/* ── LEVELS ───────────────────────────────────────────────────────────── */}
      {activeTab === 'levels' && (
        <LevelsReport clients={clients} houses={houses} />
      )}
            {activeTab === 'maintenance' && (
        <MaintenanceReport maintenanceRequests={maintenanceRequests} />
      )}
      {activeTab === 'walkthroughs' && (
        <WalkthroughsReport />
      )}
    </div>
      </div>
  );
}

// ─── Levels Report Component ──────────────────────────────────────────────────
const LEVEL_COLORS = { L1: '#2563eb', L2: '#b45309', L3: '#db2777', L4: '#059669', null: '#71717a' };
const LEVEL_KEYS = ['L1', 'L2', 'L3', 'L4'];

function PieChart({ data, size = 120 }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: '50%', background: '#f7f7f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#71717a', fontSize: 12 }}>No data</span></div>;

  let cumulativeAngle = -Math.PI / 2;
  const cx = size / 2, cy = size / 2, r = size / 2 - 4;

  const slices = data.filter(d => d.count > 0).map(d => {
    const angle = (d.count / total) * 2 * Math.PI;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(cumulativeAngle);
    const y2 = cy + r * Math.sin(cumulativeAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const midAngle = startAngle + angle / 2;
    const labelR = r * 0.65;
    const lx = cx + labelR * Math.cos(midAngle);
    const ly = cy + labelR * Math.sin(midAngle);
    const pct = Math.round((d.count / total) * 100);
    return { ...d, x1, y1, x2, y2, largeArc, lx, ly, pct };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((sl, i) => (
        <g key={i}>
          <path d={`M ${cx} ${cy} L ${sl.x1} ${sl.y1} A ${r} ${r} 0 ${sl.largeArc} 1 ${sl.x2} ${sl.y2} Z`} fill={sl.color} opacity={0.9} />
          {sl.pct >= 8 && <text x={sl.lx} y={sl.ly} textAnchor="middle" dominantBaseline="middle" fontSize={size < 100 ? 9 : 11} fill="#18181b" fontWeight="600">{sl.pct}%</text>}
        </g>
      ))}
    </svg>
  );
}

function LevelsReport({ clients, houses }) {
  const activeClients = clients.filter(c => c.status === 'Active');

  function getLevelData(clientList) {
    const counts = { L1: 0, L2: 0, L3: 0, L4: 0 };
    clientList.forEach(c => {
      const lv = c.level ? `L${c.level}` : null;
      if (lv && counts[lv] !== undefined) counts[lv]++;
    });
    return LEVEL_KEYS.map(k => ({ label: k, count: counts[k], color: LEVEL_COLORS[k] }));
  }

  const allData = getLevelData(activeClients);
  const menClients = activeClients.filter(c => {
    const house = houses.find(h => h.id === c.house_id);
    return house?.type === 'Men';
  });
  const womenClients = activeClients.filter(c => {
    const house = houses.find(h => h.id === c.house_id);
    return house?.type === 'Women';
  });

  const houseBreakdowns = houses.map(h => ({
    house: h,
    clients: activeClients.filter(c => c.house_id === h.id),
    data: getLevelData(activeClients.filter(c => c.house_id === h.id)),
  })).filter(h => h.clients.length > 0);

  // Pivot table: houses as rows, levels as columns
  const pivotRows = houseBreakdowns.map(hb => {
    const counts = {};
    LEVEL_KEYS.forEach(k => { counts[k] = hb.data.find(d => d.label === k)?.count || 0; });
    const empty = hb.clients.filter(c => !c.level).length;
    return { name: hb.house.name, counts, empty, total: hb.clients.length };
  });

  const ChartCard = ({ title, clientList }) => {
    const data = getLevelData(clientList);
    const total = clientList.length;
    return (
      <div style={{ background: '#f7f7f9', borderRadius: 12, padding: '18px 20px', border: '1px solid #e4e4e8' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b', marginBottom: 14 }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <PieChart data={data} size={130} />
          <div>
            {data.filter(d => d.count > 0).map(d => (
              <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#71717a' }}>{d.label} ({d.count})</span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#71717a', marginTop: 6 }}>{total} residents</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
        <ChartCard title="All Houses" clientList={activeClients} />
        <ChartCard title="Men's Houses" clientList={menClients} />
        <ChartCard title="Women's Houses" clientList={womenClients} />
      </div>

      {/* Per-house charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 28 }}>
        {houseBreakdowns.map(hb => (
          <ChartCard key={hb.house.id} title={hb.house.name} clientList={hb.clients} />
        ))}
      </div>

      {/* Pivot table */}
      <div style={{ background: '#f7f7f9', borderRadius: 12, border: '1px solid #e4e4e8', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e4e4e8' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Pivot Table — Levels by House</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f7f7f9' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', color: '#71717a', fontWeight: 600, borderBottom: '1px solid #e4e4e8' }}>House</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#71717a', fontWeight: 600, borderBottom: '1px solid #e4e4e8' }}>No Level</th>
                {LEVEL_KEYS.map(k => (
                  <th key={k} style={{ padding: '10px 12px', textAlign: 'right', color: LEVEL_COLORS[k], fontWeight: 600, borderBottom: '1px solid #e4e4e8' }}>{k}</th>
                ))}
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#18181b', fontWeight: 700, borderBottom: '1px solid #e4e4e8' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {pivotRows.map((row, i) => (
                <tr key={row.name} style={{ background: i % 2 === 0 ? 'transparent' : '#f7f7f9', borderBottom: '1px solid #e4e4e8' }}>
                  <td style={{ padding: '10px 16px', color: '#3f3f46' }}>{row.name}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#71717a' }}>{row.empty}</td>
                  {LEVEL_KEYS.map(k => (
                    <td key={k} style={{ padding: '10px 12px', textAlign: 'right', color: row.counts[k] > 0 ? '#18181b' : '#6b7280' }}>{row.counts[k]}</td>
                  ))}
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#18181b', fontWeight: 700 }}>{row.total}</td>
                </tr>
              ))}
              {/* Totals row */}
              <tr style={{ background: '#f7f7f9', borderTop: '2px solid #d4d4d8' }}>
                <td style={{ padding: '10px 16px', color: '#18181b', fontWeight: 700 }}>Total</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#71717a' }}>{activeClients.filter(c => !c.level).length}</td>
                {LEVEL_KEYS.map(k => (
                  <td key={k} style={{ padding: '10px 12px', textAlign: 'right', color: LEVEL_COLORS[k], fontWeight: 700 }}>
                    {allData.find(d => d.label === k)?.count || 0}
                  </td>
                ))}
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#18181b', fontWeight: 700 }}>{activeClients.length}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Maintenance Report Component ────────────────────────────────────────────
function MaintenanceReport({ maintenanceRequests }) {
  const open = maintenanceRequests.filter(r => r.status === 'Open');
  const inProgress = maintenanceRequests.filter(r => r.status === 'In Progress');
  const completed = maintenanceRequests.filter(r => r.status === 'Completed');

  const resolved = completed.filter(r => r.submitted_at && r.service_date);
  const avgDays = resolved.length
    ? Math.round(resolved.reduce((sum, r) =>
        sum + (new Date(r.service_date) - new Date(r.submitted_at)) / (1000 * 60 * 60 * 24), 0) / resolved.length)
    : null;

  const byHouse = {};
  maintenanceRequests.forEach(r => {
    const key = r.house_name || 'Unknown';
    if (!byHouse[key]) byHouse[key] = { Open: 0, 'In Progress': 0, Completed: 0, total: 0 };
    byHouse[key][r.status] = (byHouse[key][r.status] || 0) + 1;
    byHouse[key].total++;
  });

  const byType = {};
  maintenanceRequests.forEach(r => {
    const key = r.issue_type || 'Other';
    byType[key] = (byType[key] || 0) + 1;
  });

  const statBox = (label, value, color) => (
    <div style={{ background: '#ffffff', borderRadius: 10, padding: '18px 24px', border: `1px solid ${color}33` }}>
      <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 4 }}>{label}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
        {statBox('Open', open.length, '#dc2626')}
        {statBox('In Progress', inProgress.length, '#c2410c')}
        {statBox('Completed', completed.length, '#16a34a')}
        {statBox('Total', maintenanceRequests.length, '#2563eb')}
        {statBox('Avg Days to Resolve', avgDays !== null ? avgDays : '—', '#7c3aed')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 13, color: '#71717a', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>By House</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e4e4e8' }}>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: '#a1a1aa', fontWeight: 600 }}>House</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#dc2626', fontWeight: 600 }}>Open</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#c2410c', fontWeight: 600 }}>In Progress</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#16a34a', fontWeight: 600 }}>Done</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byHouse).sort((a, b) => b[1].total - a[1].total).map(([house, counts]) => (
                <tr key={house} style={{ borderBottom: '1px solid #ececef' }}>
                  <td style={{ padding: '7px 10px', color: '#3f3f46' }}>{house}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#dc2626' }}>{counts['Open'] || 0}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#c2410c' }}>{counts['In Progress'] || 0}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#16a34a' }}>{counts['Completed'] || 0}</td>
                </tr>
              ))}
              {Object.keys(byHouse).length === 0 && (
                <tr><td colSpan="4" style={{ padding: '10px', color: '#a1a1aa', fontStyle: 'italic' }}>No data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <div style={{ fontSize: 13, color: '#71717a', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>By Issue Type</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e4e4e8' }}>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: '#a1a1aa', fontWeight: 600 }}>Type</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#a1a1aa', fontWeight: 600 }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <tr key={type} style={{ borderBottom: '1px solid #ececef' }}>
                  <td style={{ padding: '7px 10px', color: '#3f3f46' }}>{type}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>{count}</td>
                </tr>
              ))}
              {Object.keys(byType).length === 0 && (
                <tr><td colSpan="2" style={{ padding: '10px', color: '#a1a1aa', fontStyle: 'italic' }}>No data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#71717a', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Recent Completions</div>
      {completed.length === 0 ? (
        <p style={{ color: '#a1a1aa', fontSize: 13, fontStyle: 'italic' }}>No completed requests yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e4e4e8' }}>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: '#a1a1aa', fontWeight: 600 }}>House</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: '#a1a1aa', fontWeight: 600 }}>Issue</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: '#a1a1aa', fontWeight: 600 }}>Submitted</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: '#a1a1aa', fontWeight: 600 }}>Resolved</th>
            </tr>
          </thead>
          <tbody>
            {completed.slice(0, 10).map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #ececef' }}>
                <td style={{ padding: '7px 10px', color: '#3f3f46' }}>{r.house_name || '—'}</td>
                <td style={{ padding: '7px 10px', color: '#3f3f46' }}>{r.issue_type || '—'}</td>
                <td style={{ padding: '7px 10px', color: '#9ca3af' }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                <td style={{ padding: '7px 10px', color: '#16a34a' }}>{r.service_date ? new Date(r.service_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}