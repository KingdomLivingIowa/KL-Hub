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
    <div style={{ background: '#2a2a2a', borderRadius: 12, padding: '16px 18px', borderTop: `3px solid ${accent || '#b22222'}`, minWidth: 0 }}>
      <div style={{ fontSize: 13, color: '#aaa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 13, color: '#777', marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: '#2a2a2a', borderRadius: 12, padding: '20px 22px', border: '1px solid #333', marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #333' }}>
      <span style={{ fontSize: 15, color: '#ccc' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{value ?? '—'}</span>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 13, color: '#aaa', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: '#fff' }}>{value ?? '—'}</div>
    </div>
  );
}

function YearTable({ title, columns, rows }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>{title}</div>
      <div style={{ background: '#2a2a2a', borderRadius: 12, border: '1px solid #333', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `1fr ${columns.map(() => '90px').join(' ')}`, background: '#1e1e1e', padding: '10px 16px', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>YEAR</span>
          {columns.map(c => <span key={c} style={{ fontSize: 12, color: '#555', fontWeight: 600, textAlign: 'right' }}>{c}</span>)}
        </div>
        {rows.map((row, i) => (
          <div key={row.year} style={{ display: 'grid', gridTemplateColumns: `1fr ${columns.map(() => '90px').join(' ')}`, padding: '11px 16px', gap: 8, borderTop: '1px solid #333', background: i === 0 ? '#2e2e2e' : 'transparent' }}>
            <span style={{ fontSize: 14, color: i === 0 ? '#fff' : '#aaa', fontWeight: i === 0 ? 600 : 400 }}>{row.year}</span>
            {row.values.map((v, j) => (
              <span key={j} style={{ fontSize: 14, color: i === 0 ? '#fff' : '#888', fontWeight: i === 0 ? 600 : 400, textAlign: 'right' }}>{v ?? '—'}</span>
            ))}
          </div>
        ))}
      </div>
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

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [clientsRes, staysRes, paymentsRes, waitingRes, housesRes, appsRes] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('client_stays').select('*'),
      supabase.from('payments').select('*'),
      supabase.from('waiting_list').select('*'),
      supabase.from('houses').select('*'),
      supabase.from('applications').select('id, gender, created_at, status'),
    ]);
    setClients(clientsRes.data || []);
    setStays(staysRes.data || []);
    setPayments(paymentsRes.data || []);
    setWaitingList(waitingRes.data || []);
    setHouses(housesRes.data || []);
    setApplications(appsRes.data || []);
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
    padding: '9px 20px', borderRadius: 8, border: '1px solid #444', cursor: 'pointer', fontSize: 14,
    background: activeTab === id ? '#2a2a2a' : 'transparent',
    color: activeTab === id ? '#fff' : '#aaa',
    fontWeight: activeTab === id ? 600 : 400,
  });

  if (loading) return <div style={{ padding: 32, color: '#555', fontSize: 14 }}>Loading reports...</div>;

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        <button style={tabBtn('weekly')} onClick={() => setActiveTab('weekly')}>Weekly Overview</button>
        <button style={tabBtn('monthly')} onClick={() => setActiveTab('monthly')}>Monthly Report</button>
        <button style={tabBtn('yearly')} onClick={() => setActiveTab('yearly')}>Year-by-Year</button>
        <button style={tabBtn('levels')} onClick={() => setActiveTab('levels')}>Levels</button>
      </div>

      {/* ── WEEKLY ──────────────────────────────────────────────────────────── */}
      {activeTab === 'weekly' && (
        <div>
          <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Week of {week.start} — {week.end}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
            <StatCard label="Male Applicants" value={maleAppsWeek} accent="#3b82f6" />
            <StatCard label="Female Applicants" value={femaleAppsWeek} accent="#ec4899" />
            <StatCard label="DOC Waitlist" value={docWaitlist} accent="#f59e0b" />
            <StatCard label="Community Waitlist" value={communityWaitlist} accent="#f59e0b" />
            <StatCard label="Women's Waitlist" value={womenWaitlist} accent="#ec4899" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
            <StatCard label="Total in Program" value={inProgram} sub={`${totalBeds} beds total`} accent="#b22222" />
            <StatCard label="People in Beds" value={activeClients.length} accent="#b22222" />
            <StatCard label="Move Ins This Week" value={moveInsWeek} accent="#10b981" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
            <StatCard label="Discharges This Week" value={dischargedThisWeek.length} accent="#ef4444" />
            <StatCard label="Successful Discharges" value={successfulDischargesWeek} accent="#10b981" />
            <StatCard label="Payments This Week" value={fmtMoney(paymentsWeekTotal)} accent="#8b5cf6" />
          </div>

        </div>
      )}

      {/* ── MONTHLY ─────────────────────────────────────────────────────────── */}
      {activeTab === 'monthly' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 5 }}>Report Month</div>
              <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
                style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 5 }}>View</div>
              <select value={reportHouse} onChange={e => setReportHouse(e.target.value)}
                style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14 }}>
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
            <MetricCard label="Avg Length of Stay (days)" value={avgLosMonth ?? '—'} />
            <MetricCard label="On Waiting List" value={waitListCount} />
          </div>

          {reportHouse === 'combined' && (
            <Section title="Breakdown by House">
              <Row label="Men's — Unique Individuals Housed" value={byGender(uniqueHoused, 'Male').length} />
              <Row label="Men's — Intakes" value={byGender(allIntakesMonth, 'Male').length} />
              <Row label="Men's — Exits" value={byGender(allExitsMonth, 'Male').length} />
              <Row label="Men's — Avg Length of Stay (days)" value={avgArr(menStaysMonth.map(s => calcLOS(s.start_date, s.discharge_date))) ?? '—'} />
              <Row label="Men's — On Waiting List" value={menWaitList} />
              <Row label="Women's — Unique Individuals Housed" value={byGender(uniqueHoused, 'Female').length} />
              <Row label="Women's — Intakes" value={byGender(allIntakesMonth, 'Female').length} />
              <Row label="Women's — Exits" value={byGender(allExitsMonth, 'Female').length} />
              <Row label="Women's — Avg Length of Stay (days)" value={avgArr(womenStaysMonth.map(s => calcLOS(s.start_date, s.discharge_date))) ?? '—'} />
              <Row label="Women's — On Waiting List" value={womenWaitList} />
            </Section>
          )}

          <Section title="Average Length of Stay (Days)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Male</div>
                <Row label="Past Year" value={losByGenderAndPeriod('Male', 12)} />
                <Row label="Past 6 Months" value={losByGenderAndPeriod('Male', 6)} />
                <Row label="Past 3 Months" value={losByGenderAndPeriod('Male', 3)} />
                <Row label="Past 1 Month" value={losByGenderAndPeriod('Male', 1)} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#ec4899', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Female</div>
                <Row label="Past Year" value={losByGenderAndPeriod('Female', 12)} />
                <Row label="Past 6 Months" value={losByGenderAndPeriod('Female', 6)} />
                <Row label="Past 3 Months" value={losByGenderAndPeriod('Female', 3)} />
                <Row label="Past 1 Month" value={losByGenderAndPeriod('Female', 1)} />
              </div>
            </div>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: '#aaa' }}>Overall average (all time)</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{avgLosOverall ?? '—'} days</span>
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
    </div>
  );
}

// ─── Levels Report Component ──────────────────────────────────────────────────
const LEVEL_COLORS = { L1: '#3b82f6', L2: '#f59e0b', L3: '#ec4899', L4: '#10b981', null: '#555' };
const LEVEL_KEYS = ['L1', 'L2', 'L3', 'L4'];

function PieChart({ data, size = 120 }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#555', fontSize: 12 }}>No data</span></div>;

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
          {sl.pct >= 8 && <text x={sl.lx} y={sl.ly} textAnchor="middle" dominantBaseline="middle" fontSize={size < 100 ? 9 : 11} fill="#fff" fontWeight="600">{sl.pct}%</text>}
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
      <div style={{ background: '#2a2a2a', borderRadius: 12, padding: '18px 20px', border: '1px solid #333' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 14 }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <PieChart data={data} size={130} />
          <div>
            {data.filter(d => d.count > 0).map(d => (
              <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#aaa' }}>{d.label} ({d.count})</span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#555', marginTop: 6 }}>{total} residents</div>
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
      <div style={{ background: '#2a2a2a', borderRadius: 12, border: '1px solid #333', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #333' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Pivot Table — Levels by House</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#1e1e1e' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', color: '#555', fontWeight: 600, borderBottom: '1px solid #333' }}>House</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#555', fontWeight: 600, borderBottom: '1px solid #333' }}>No Level</th>
                {LEVEL_KEYS.map(k => (
                  <th key={k} style={{ padding: '10px 12px', textAlign: 'right', color: LEVEL_COLORS[k], fontWeight: 600, borderBottom: '1px solid #333' }}>{k}</th>
                ))}
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#fff', fontWeight: 700, borderBottom: '1px solid #333' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {pivotRows.map((row, i) => (
                <tr key={row.name} style={{ background: i % 2 === 0 ? 'transparent' : '#252525', borderBottom: '1px solid #2a2a2a' }}>
                  <td style={{ padding: '10px 16px', color: '#ddd' }}>{row.name}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#555' }}>{row.empty}</td>
                  {LEVEL_KEYS.map(k => (
                    <td key={k} style={{ padding: '10px 12px', textAlign: 'right', color: row.counts[k] > 0 ? '#fff' : '#444' }}>{row.counts[k]}</td>
                  ))}
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#fff', fontWeight: 700 }}>{row.total}</td>
                </tr>
              ))}
              {/* Totals row */}
              <tr style={{ background: '#1e1e1e', borderTop: '2px solid #444' }}>
                <td style={{ padding: '10px 16px', color: '#fff', fontWeight: 700 }}>Total</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#555' }}>{activeClients.filter(c => !c.level).length}</td>
                {LEVEL_KEYS.map(k => (
                  <td key={k} style={{ padding: '10px 12px', textAlign: 'right', color: LEVEL_COLORS[k], fontWeight: 700 }}>
                    {allData.find(d => d.label === k)?.count || 0}
                  </td>
                ))}
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#fff', fontWeight: 700 }}>{activeClients.length}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}