import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3, CURRENT_YEAR - 4];

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { start: mon.toISOString().split('T')[0], end: sun.toISOString().split('T')[0] };
}

function calcLOS(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const diff = new Date(endDate) - new Date(startDate);
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function avg(arr) {
  const valid = arr.filter(n => n !== null && !isNaN(n));
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
}

function fmtMoney(n) {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: '#2a2a2a', borderRadius: 12, padding: '16px 18px',
      borderTop: `3px solid ${accent || '#b22222'}`, minWidth: 0,
    }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ background: '#2a2a2a', borderRadius: 12, padding: '20px 22px', border: '1px solid #333', marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

// ─── Row stat inside a section ────────────────────────────────────────────────
function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #333' }}>
      <span style={{ fontSize: 14, color: '#aaa' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: bold ? 700 : 500, color: '#fff' }}>{value ?? '—'}</span>
    </div>
  );
}

// ─── Year breakdown table ─────────────────────────────────────────────────────
function YearTable({ title, rows, columns }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>{title}</div>
      <div style={{ background: '#2a2a2a', borderRadius: 12, border: '1px solid #333', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `1fr ${columns.map(() => '80px').join(' ')}`, background: '#1e1e1e', padding: '10px 16px', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>YEAR</span>
          {columns.map(c => <span key={c} style={{ fontSize: 12, color: '#555', fontWeight: 600, textAlign: 'right' }}>{c}</span>)}
        </div>
        {rows.map((row, i) => (
          <div key={row.year} style={{ display: 'grid', gridTemplateColumns: `1fr ${columns.map(() => '80px').join(' ')}`, padding: '11px 16px', gap: 8, borderTop: '1px solid #333', background: i === 0 ? '#2e2e2e' : 'transparent' }}>
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Reports() {
  const [loading, setLoading] = useState(true);

  // Raw data
  const [clients, setClients] = useState([]);
  const [stays, setStays] = useState([]);
  const [payments, setPayments] = useState([]);
  const [charges, setCharges] = useState([]);
  const [waitingList, setWaitingList] = useState([]);
  const [houses, setHouses] = useState([]);
  const [applications, setApplications] = useState([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [
      clientsRes, staysRes, paymentsRes, chargesRes,
      waitingRes, housesRes, appsRes,
    ] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('client_stays').select('*'),
      supabase.from('payments').select('*'),
      supabase.from('charges').select('*'),
      supabase.from('waiting_list').select('*'),
      supabase.from('houses').select('*'),
      supabase.from('applications').select('id, gender, created_at, status'),
    ]);
    setClients(clientsRes.data || []);
    setStays(staysRes.data || []);
    setPayments(paymentsRes.data || []);
    setCharges(chargesRes.data || []);
    setWaitingList(waitingRes.data || []);
    setHouses(housesRes.data || []);
    setApplications(appsRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Derived stats ────────────────────────────────────────────────────────────
  const week = getWeekRange();

  // Applicants this week
  const appsThisWeek = applications.filter(a => a.created_at && a.created_at.split('T')[0] >= week.start && a.created_at.split('T')[0] <= week.end);
  const maleAppsWeek = appsThisWeek.filter(a => a.gender === 'Male').length;
  const femaleAppsWeek = appsThisWeek.filter(a => a.gender === 'Female').length;

  // Current program counts
  const activeClients = clients.filter(c => c.status === 'Active');
  const pendingClients = clients.filter(c => c.status === 'Pending');
  const inProgram = activeClients.length + pendingClients.length;

  // Beds: sum total_beds across houses
  const totalBeds = houses.reduce((sum, h) => sum + (h.total_beds || 0), 0);

  // Waitlist counts
  const docWaitlist = waitingList.filter(w => w.status === 'waiting' && w.list_type?.toLowerCase().includes('doc')).length;
  const communityWaitlist = waitingList.filter(w => w.status === 'waiting' && w.list_type?.toLowerCase().includes('community')).length;
  const womenWaitlist = waitingList.filter(w => w.status === 'waiting' && (w.list_type?.toLowerCase().includes('women') || w.list_type?.toLowerCase().includes('woman'))).length;
  const totalWaiting = waitingList.filter(w => w.status === 'waiting').length;

  // Move ins/outs this week
  const moveInsWeek = clients.filter(c => c.start_date >= week.start && c.start_date <= week.end).length;
  const moveOutsWeek = clients.filter(c => c.discharge_date && c.discharge_date >= week.start && c.discharge_date <= week.end).length;

  // Discharges this week
  const dischargedThisWeek = clients.filter(c => c.discharge_date && c.discharge_date >= week.start && c.discharge_date <= week.end);
  const successfulDischargesWeek = dischargedThisWeek.filter(c => c.successful_discharge === true).length;

  // Payments this week
  const paymentsThisWeek = payments.filter(p => p.payment_date && p.payment_date >= week.start && p.payment_date <= week.end);
  const paymentsWeekTotal = paymentsThisWeek.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

  // Average Length of Stay — from completed stays
  const completedStays = stays.filter(s => s.start_date && s.discharge_date);
  const losAll = completedStays.map(s => calcLOS(s.start_date, s.discharge_date));

  function losForPeriod(months) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const filtered = completedStays.filter(s => s.discharge_date >= cutoffStr);
    return avg(filtered.map(s => calcLOS(s.start_date, s.discharge_date)));
  }

  function losByGenderAndPeriod(gender, months) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    // Match stays to house type via client gender
    const clientGenderMap = {};
    clients.forEach(c => { clientGenderMap[c.id] = c.gender; });
    const filtered = completedStays.filter(s => s.discharge_date >= cutoffStr && clientGenderMap[s.client_id] === gender);
    return avg(filtered.map(s => calcLOS(s.start_date, s.discharge_date)));
  }

  // Year-by-year stats
  function staysForYear(year) {
    return stays.filter(s => s.start_date && s.start_date.startsWith(String(year)));
  }
  function dischargesForYear(year) {
    return stays.filter(s => s.discharge_date && s.discharge_date.startsWith(String(year)));
  }
  function graduatesForYear(year) {
    return stays.filter(s => s.discharge_date && s.discharge_date.startsWith(String(year)) && s.graduate === true).length;
  }
  function successfulDischargesForYear(year) {
    return stays.filter(s => s.discharge_date && s.discharge_date.startsWith(String(year)) && s.successful_discharge === true).length;
  }

  const yearRows = YEARS.map(y => ({
    year: y,
    moveIns: staysForYear(y).length,
    successfulDischarges: successfulDischargesForYear(y),
    graduates: graduatesForYear(y),
  }));

  const avgLosOverall = avg(losAll);

  if (loading) {
    return (
      <div style={{ padding: 32, color: '#555', fontSize: 14 }}>Loading reports...</div>
    );
  }

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 960, margin: '0 auto' }}>

      {/* ── THIS WEEK ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Week of {week.start} — {week.end}
        </div>
      </div>

      {/* Applicants */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Male Applicants" value={maleAppsWeek} accent="#3b82f6" />
        <StatCard label="Female Applicants" value={femaleAppsWeek} accent="#ec4899" />
        <StatCard label="DOC Waitlist" value={docWaitlist} accent="#f59e0b" />
        <StatCard label="Community Waitlist" value={communityWaitlist} accent="#f59e0b" />
        <StatCard label="Women's Waitlist" value={womenWaitlist} accent="#ec4899" />
      </div>

      {/* Program + Movement */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Total in Program" value={inProgram} sub={`${totalBeds} beds total`} accent="#b22222" />
        <StatCard label="People in Beds" value={activeClients.length} accent="#b22222" />
        <StatCard label="Move Ins This Week" value={moveInsWeek} accent="#10b981" />
        <StatCard label="Move Outs This Week" value={moveOutsWeek} accent="#ef4444" />
      </div>

      {/* Discharges + Payments this week */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
        <StatCard label="Discharges This Week" value={dischargedThisWeek.length} accent="#ef4444" />
        <StatCard label="Successful Discharges" value={successfulDischargesWeek} accent="#10b981" />
        <StatCard label="Payments This Week" value={fmtMoney(paymentsWeekTotal)} accent="#8b5cf6" />
      </div>

      {/* ── AVERAGE LENGTH OF STAY ────────────────────────────────────── */}
      <Section title="Average Length of Stay (Days)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Male */}
          <div>
            <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Male</div>
            <Row label="Past Year" value={losByGenderAndPeriod('Male', 12)} />
            <Row label="Past 6 Months" value={losByGenderAndPeriod('Male', 6)} />
            <Row label="Past 3 Months" value={losByGenderAndPeriod('Male', 3)} />
            <Row label="Past 1 Month" value={losByGenderAndPeriod('Male', 1)} />
          </div>
          {/* Female */}
          <div>
            <div style={{ fontSize: 12, color: '#ec4899', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Female</div>
            <Row label="Past Year" value={losByGenderAndPeriod('Female', 12)} />
            <Row label="Past 6 Months" value={losByGenderAndPeriod('Female', 6)} />
            <Row label="Past 3 Months" value={losByGenderAndPeriod('Female', 3)} />
            <Row label="Past 1 Month" value={losByGenderAndPeriod('Female', 1)} />
          </div>
        </div>
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#aaa' }}>Overall average (all time)</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{avgLosOverall ?? '—'} days</span>
        </div>
      </Section>

      {/* ── YEAR-BY-YEAR BREAKDOWN ───────────────────────────────────── */}
      <YearTable
        title="Move Ins by Year"
        columns={['Move Ins']}
        rows={yearRows.map(r => ({ year: r.year, values: [r.moveIns] }))}
      />

      <YearTable
        title="Successful Discharges & Graduates by Year"
        columns={['Successful', 'Graduates']}
        rows={yearRows.map(r => ({ year: r.year, values: [r.successfulDischarges, r.graduates] }))}
      />

      {/* ── WAITLIST DETAIL ───────────────────────────────────────────── */}
      <Section title="Current Waitlist Breakdown">
        {[
          'DOC Men', 'Community Men', 'Treatment Men',
          'DOC Women', 'Community Women', 'Treatment Women',
        ].map(list => {
          const count = waitingList.filter(w => w.status === 'waiting' && w.list_type === list).length;
          return <Row key={list} label={list} value={count} />;
        })}
        <div style={{ paddingTop: 10, borderTop: '1px solid #444', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Total</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{totalWaiting}</span>
        </div>
      </Section>

    </div>
  );
}