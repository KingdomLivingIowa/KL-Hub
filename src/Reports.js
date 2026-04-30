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
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: '#2a2a2a', borderRadius: 12, padding: '20px 22px', border: '1px solid #333', marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #333' }}>
      <span style={{ fontSize: 14, color: '#aaa' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>{value ?? '—'}</span>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: '#fff' }}>{value ?? '—'}</div>
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
    padding: '8px 18px', borderRadius: 8, border: '1px solid #444', cursor: 'pointer', fontSize: 13,
    background: activeTab === id ? '#2a2a2a' : 'transparent',
    color: activeTab === id ? '#fff' : '#888',
    fontWeight: activeTab === id ? 600 : 400,
  });

  if (loading) return <div style={{ padding: 32, color: '#555', fontSize: 14 }}>Loading reports...</div>;

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        <button style={tabBtn('weekly')} onClick={() => setActiveTab('weekly')}>Weekly Overview</button>
        <button style={tabBtn('monthly')} onClick={() => setActiveTab('monthly')}>Monthly Report</button>
        <button style={tabBtn('yearly')} onClick={() => setActiveTab('yearly')}>Year-by-Year</button>
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
    </div>
  );
}