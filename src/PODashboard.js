import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';

export default function PODashboard() {
  const { user } = useUser();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const fetchClients = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        console.error('No session token available');
        setLoading(false);
        return;
      }
      console.log('Calling get-po-clients with token length:', token?.length);
      const res = await fetch('https://pmvxnetpbxuzkrxitioc.supabase.co/functions/v1/get-po-clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdnhuZXRwYnh1emtyeGl0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjE1NDcsImV4cCI6MjA5MDgzNzU0N30.IRRDTmFc3Ew1GWk69q0pSRTezsJOskK43yklIK4h2Xc',
        },
      });
      const json = await res.json();
      console.log('get-po-clients response:', json);
      if (json.error) console.error('PO clients error:', json.error, json.detail);
      setClients(json.clients || []);
    } catch (err) {
      console.error('fetchClients error:', err);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const statusColor = (s) => {
    if (s === 'Active') return { bg: '#14532d', color: '#4ade80' };
    if (s === 'Accepted') return { bg: '#1e3a5f', color: '#60a5fa' };
    if (s === 'Pending') return { bg: '#3a2d1e', color: '#fb923c' };
    if (s === 'Discharged') return { bg: '#2a2a2a', color: '#999' };
    return { bg: '#2a2a2a', color: '#aaa' };
  };

  if (loading) return (
    <div style={s.loading}>
      <div style={s.spinner} />
      <p style={{ color: '#888', marginTop: '12px' }}>Loading your clients...</p>
    </div>
  );

  if (selected) return (
    <POClientView client={selected} onBack={() => setSelected(null)} />
  );

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>My Clients</h1>
        <p style={s.subtitle}>{clients.length} client{clients.length !== 1 ? 's' : ''} assigned to you</p>
        <p style={{ color: '#555', fontSize: '11px', margin: '4px 0 0 0' }}>Logged in as: {user?.email}</p>
      </div>

      {clients.length === 0 ? (
        <div style={s.empty}>
          <p style={{ color: '#666', fontSize: '15px' }}>No clients are currently assigned to your email address.</p>
          <p style={{ color: '#555', fontSize: '13px', marginTop: '8px' }}>Contact staff if you believe this is an error.</p>
        </div>
      ) : (
        <div style={s.grid}>
          {clients.map(c => {
            const sc = statusColor(c.status);
            const initials = `${c.first_name?.[0] || ''}${c.last_name?.[0] || ''}`.toUpperCase() || '??';
            const daysIn = c.start_date ? Math.floor((new Date() - new Date(c.start_date)) / (1000 * 60 * 60 * 24)) : null;
            return (
              <div key={c.id} style={s.card} onClick={() => setSelected(c)}>
                <div style={s.cardLeft}>
                  {c.photo_url
                    ? <img src={c.photo_url} alt="" style={s.avatar} />
                    : <div style={s.avatarFallback}>{initials}</div>
                  }
                  <div>
                    <p style={s.clientName}>{c.full_name}</p>
                    <p style={s.clientSub}>{c.houses?.name || 'No house assigned'}</p>
                  </div>
                </div>
                <div style={s.cardRight}>
                  <span style={{ ...s.badge, background: sc.bg, color: sc.color }}>{c.status}</span>
                  {c.status === 'Active' && c.level && (
                    <span style={{ ...s.badge, background: '#2a2a2a', color: '#aaa', marginTop: '4px' }}>Level {c.level}</span>
                  )}
                  {daysIn !== null && c.status === 'Active' && (
                    <span style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>{daysIn}d in program</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PO Client View ─────────────────────────────────────────────────────────────
function POClientView({ client, onBack }) {
  const [data, setData] = useState({
    checkIns: [], allCheckIns: [], uas: [], meetings: [],
    timeline: [], charges: [], payments: [], stays: [],
  });
  const [loading, setLoading] = useState(true);
  const [showAllCheckIns, setShowAllCheckIns] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [
        { data: timeline },
        { data: charges },
        { data: payments },
      ] = await Promise.all([
        supabase.from('client_timeline')
          .select('*')
          .eq('client_id', client.id)
          .eq('source', 'client') // client entries only — no house timeline
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('charges').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
        supabase.from('payments').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
      ]);

      // Also fetch staff-logged entries (infractions etc) but NOT house timeline entries
      const { data: staffTimeline } = await supabase
        .from('client_timeline')
        .select('*')
        .eq('client_id', client.id)
        .eq('source', 'staff')
        .order('created_at', { ascending: false })
        .limit(50);

      const allTimeline = [...(timeline || []), ...(staffTimeline || [])]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const allCheckIns = allTimeline.filter(e => e.entry_type === 'Weekly Check-In');
      const uas = allTimeline.filter(e => e.entry_type === 'UA');
      const meetings = allTimeline.filter(e => e.entry_type === 'Meeting');
      const recentTimeline = allTimeline.filter(e => !['Weekly Check-In', 'UA', 'Meeting'].includes(e.entry_type)).slice(0, 15);

      setData({ allCheckIns, uas, meetings, timeline: recentTimeline, charges: charges || [], payments: payments || [] });
      setLoading(false);
    };
    load();
  }, [client.id]);

  const totalCharged = data.charges.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const totalPaid = data.payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const balance = totalCharged - totalPaid;
  const daysIn = client.start_date ? Math.floor((new Date() - new Date(client.start_date)) / (1000 * 60 * 60 * 24)) : null;
  const initials = `${client.first_name?.[0] || ''}${client.last_name?.[0] || ''}`.toUpperCase() || '??';

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const fmtShort = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

  const entryTypeColor = (type) => {
    if (type === 'UA') return '#f472b6';
    if (type === 'Check-In') return '#c084fc';
    if (type === 'Meeting') return '#60a5fa';
    if (type === 'Infraction') return '#dc2626';
    if (type === 'Crisis') return '#E24B4A';
    if (type === 'General Note') return '#f59e0b';
    if (type === 'Weekly Check-In') return '#7F77DD';
    return '#bbb';
  };

  if (loading) return (
    <div style={s.loading}>
      <div style={s.spinner} />
    </div>
  );

  const latestCheckIn = data.allCheckIns[0];
  const checkInsToShow = showAllCheckIns ? data.allCheckIns : (latestCheckIn ? [latestCheckIn] : []);

  return (
    <div style={s.page}>
      {/* Back button */}
      <button onClick={onBack} style={s.backBtn}>← Back to My Clients</button>

      {/* Client Header */}
      <div style={s.clientHeader}>
        {client.photo_url
          ? <img src={client.photo_url} alt="" style={s.headerAvatar} />
          : <div style={{ ...s.headerAvatar, ...s.avatarFallbackLg }}>{initials}</div>
        }
        <div style={s.headerInfo}>
          <h2 style={s.headerName}>{client.full_name}</h2>
          <div style={s.headerMeta}>
            <span>{client.houses?.name || 'No house'}</span>
            {client.level && <span>· Level {client.level}</span>}
            {client.status && <span style={{ color: client.status === 'Active' ? '#4ade80' : '#aaa' }}>· {client.status}</span>}
            {daysIn !== null && <span>· {daysIn} days in program</span>}
          </div>
          {client.start_date && <p style={s.headerSub}>Started {fmt(client.start_date)}</p>}
        </div>
      </div>

      {/* Balance Summary */}
      <div style={s.section}>
        <h3 style={s.sectionTitle}>💰 Balance</h3>
        <div style={s.balanceRow}>
          <div style={s.balanceStat}>
            <span style={s.balanceLabel}>Total Charged</span>
            <span style={s.balanceValue}>${totalCharged.toFixed(2)}</span>
          </div>
          <div style={s.balanceStat}>
            <span style={s.balanceLabel}>Total Paid</span>
            <span style={{ ...s.balanceValue, color: '#4ade80' }}>${totalPaid.toFixed(2)}</span>
          </div>
          <div style={s.balanceStat}>
            <span style={s.balanceLabel}>Balance Owed</span>
            <span style={{ ...s.balanceValue, color: balance > 0 ? '#f87171' : '#4ade80', fontSize: '20px' }}>
              ${Math.abs(balance).toFixed(2)} {balance > 0 ? 'owed' : balance < 0 ? 'credit' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Weekly Check-Ins */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <h3 style={s.sectionTitle}>📋 Weekly Check-Ins</h3>
          {data.allCheckIns.length > 1 && (
            <button onClick={() => setShowAllCheckIns(p => !p)} style={s.toggleBtn}>
              {showAllCheckIns ? 'Show Latest Only' : `View All ${data.allCheckIns.length}`}
            </button>
          )}
        </div>
        {checkInsToShow.length === 0 ? (
          <p style={s.empty2}>No check-ins submitted yet.</p>
        ) : checkInsToShow.map((ci, i) => (
          <div key={ci.id} style={{ ...s.checkInCard, ...(i > 0 ? { marginTop: '10px' } : {}) }}>
            <p style={s.checkInDate}>{fmt(ci.created_at)}</p>
            <div style={s.checkInGrid}>
              {ci.checkin_meetings !== null && <CheckInField label="Meetings" value={ci.checkin_meetings} />}
              {ci.checkin_sponsor_contacts !== null && <CheckInField label="Sponsor Contacts" value={ci.checkin_sponsor_contacts} />}
              {ci.checkin_chore && <CheckInField label="Chore" value={ci.checkin_chore} />}
              {ci.checkin_chore_completed !== null && <CheckInField label="Chore Completed" value={ci.checkin_chore_completed ? 'Yes' : 'No'} color={ci.checkin_chore_completed ? '#4ade80' : '#f87171'} />}
              {ci.checkin_employed !== null && <CheckInField label="Employed" value={ci.checkin_employed ? 'Yes' : 'No'} />}
              {ci.checkin_employer && <CheckInField label="Employer" value={ci.checkin_employer} />}
              {ci.checkin_payment_plan && <CheckInField label="Payment Plan" value={ci.checkin_payment_plan} />}
              {ci.needs_ride !== null && <CheckInField label="Needs Ride" value={ci.needs_ride ? 'Yes' : 'No'} color={ci.needs_ride ? '#fb923c' : '#aaa'} />}
            </div>
            {ci.notes && <p style={s.checkInNotes}>"{ci.notes}"</p>}
          </div>
        ))}
      </div>

      {/* UA History */}
      <div style={s.section}>
        <h3 style={s.sectionTitle}>🧪 UA History</h3>
        {data.uas.length === 0 ? (
          <p style={s.empty2}>No UAs recorded.</p>
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Result</th>
                  <th style={s.th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.uas.slice(0, 10).map(ua => (
                  <tr key={ua.id}>
                    <td style={s.td}>{fmtShort(ua.created_at)}</td>
                    <td style={{ ...s.td, color: ua.result === 'Positive' ? '#f87171' : '#4ade80', fontWeight: '600' }}>
                      {ua.result || '—'}
                    </td>
                    <td style={{ ...s.td, color: '#888' }}>{ua.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Meetings */}
      <div style={s.section}>
        <h3 style={s.sectionTitle}>🤝 Meetings</h3>
        <div style={s.meetingStats}>
          <div style={s.meetingStat}>
            <span style={s.meetingStatNum}>{data.meetings.filter(m => {
              const d = new Date(m.created_at);
              const now = new Date();
              return d >= new Date(now.setDate(now.getDate() - 7));
            }).length}</span>
            <span style={s.meetingStatLabel}>This Week</span>
          </div>
          <div style={s.meetingStat}>
            <span style={s.meetingStatNum}>{data.meetings.filter(m => {
              const d = new Date(m.created_at);
              const now = new Date();
              return d >= new Date(now.getFullYear(), now.getMonth(), 1);
            }).length}</span>
            <span style={s.meetingStatLabel}>This Month</span>
          </div>
          <div style={s.meetingStat}>
            <span style={s.meetingStatNum}>{data.meetings.length}</span>
            <span style={s.meetingStatLabel}>Total</span>
          </div>
        </div>
      </div>

      {/* Recent Timeline */}
      <div style={s.section}>
        <h3 style={s.sectionTitle}>📅 Recent Activity</h3>
        {data.timeline.length === 0 ? (
          <p style={s.empty2}>No recent activity.</p>
        ) : data.timeline.map(entry => (
          <div key={entry.id} style={s.timelineEntry}>
            <div style={{ ...s.timelineDot, background: entryTypeColor(entry.entry_type) }} />
            <div style={s.timelineContent}>
              <div style={s.timelineHeader}>
                <span style={{ color: entryTypeColor(entry.entry_type), fontSize: '13px', fontWeight: '600' }}>
                  {entry.entry_type}
                </span>
                {entry.severity && (
                  <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: entry.severity === 'Serious' ? '#3a0f0f' : '#3a2a0f', color: entry.severity === 'Serious' ? '#f87171' : '#fb923c', fontWeight: '600' }}>
                    {entry.severity}
                  </span>
                )}
                <span style={s.timelineDate}>{fmtShort(entry.created_at)}</span>
              </div>
              {entry.entry_type === 'Mood Check-In' && entry.mood_value && (
                <p style={s.timelineNotes}>Mood: {entry.mood_value}/10</p>
              )}
              {entry.entry_type === 'UA' && entry.result && (
                <p style={{ ...s.timelineNotes, color: entry.result === 'Positive' ? '#f87171' : '#4ade80', fontWeight: '600' }}>Result: {entry.result}</p>
              )}
              {entry.entry_type === 'Meeting' && entry.meeting_name && (
                <p style={s.timelineNotes}>Meeting: {entry.meeting_name}</p>
              )}
              {entry.entry_type === 'Chores' && entry.meeting_name && (
                <p style={s.timelineNotes}>Chore: {entry.meeting_name}</p>
              )}
              {entry.notes && entry.notes !== 'Notes' && <p style={s.timelineNotes}>{entry.notes}</p>}
              {entry.photo_url && (
                <img src={entry.photo_url} alt="" onClick={() => window.open(entry.photo_url, '_blank')}
                  style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: '8px', marginTop: '8px', cursor: 'pointer', border: '1px solid #2a2a2a' }} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckInField({ label, value, color }) {
  return (
    <div style={{ marginBottom: '6px' }}>
      <span style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}: </span>
      <span style={{ fontSize: '13px', color: color || '#ddd' }}>{value}</span>
    </div>
  );
}

const s = {
  page: { padding: '0 0 60px 0', maxWidth: '860px' },
  loading: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px' },
  spinner: { width: '32px', height: '32px', border: '3px solid #333', borderTop: '3px solid #b22222', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  header: { marginBottom: '28px' },
  title: { color: '#fff', fontSize: '24px', fontWeight: '700', margin: '0 0 6px 0' },
  subtitle: { color: '#888', fontSize: '14px', margin: 0 },
  grid: { display: 'flex', flexDirection: 'column', gap: '10px' },
  card: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'border-color 0.15s' },
  cardLeft: { display: 'flex', alignItems: 'center', gap: '14px' },
  cardRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
  avatar: { width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #333' },
  avatarFallback: { width: '44px', height: '44px', borderRadius: '50%', background: '#2a2a2a', border: '2px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '14px', fontWeight: '700' },
  avatarFallbackLg: { width: '64px', height: '64px', fontSize: '20px' },
  clientName: { color: '#fff', fontSize: '15px', fontWeight: '600', margin: '0 0 3px 0' },
  clientSub: { color: '#888', fontSize: '13px', margin: 0 },
  badge: { padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', display: 'inline-block' },
  empty: { padding: '60px 0', textAlign: 'center' },
  backBtn: { background: 'transparent', border: '1px solid #333', color: '#aaa', padding: '7px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '24px' },
  clientHeader: { display: 'flex', gap: '20px', alignItems: 'flex-start', marginBottom: '28px', padding: '20px', background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a' },
  headerAvatar: { width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #333', flexShrink: 0 },
  headerInfo: { flex: 1 },
  headerName: { color: '#fff', fontSize: '22px', fontWeight: '700', margin: '0 0 6px 0' },
  headerMeta: { color: '#888', fontSize: '13px', display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' },
  headerSub: { color: '#666', fontSize: '12px', margin: 0 },
  section: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '18px 20px', marginBottom: '14px' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  sectionTitle: { color: '#fff', fontSize: '15px', fontWeight: '600', margin: '0 0 14px 0' },
  toggleBtn: { background: '#2a2a2a', border: '1px solid #333', color: '#aaa', padding: '5px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' },
  balanceRow: { display: 'flex', gap: '16px', flexWrap: 'wrap' },
  balanceStat: { flex: 1, minWidth: '120px', background: '#111', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '4px' },
  balanceLabel: { fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' },
  balanceValue: { fontSize: '18px', fontWeight: '700', color: '#fff' },
  checkInCard: { background: '#111', borderRadius: '8px', padding: '12px 14px' },
  checkInDate: { fontSize: '11px', color: '#666', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '0.5px' },
  checkInGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' },
  checkInNotes: { color: '#888', fontSize: '13px', fontStyle: 'italic', margin: '10px 0 0 0', borderTop: '1px solid #222', paddingTop: '8px' },
  empty2: { color: '#666', fontSize: '13px', fontStyle: 'italic', margin: 0 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { textAlign: 'left', padding: '8px 10px', color: '#666', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #2a2a2a' },
  td: { padding: '8px 10px', color: '#ddd', borderBottom: '1px solid #1e1e1e' },
  meetingStats: { display: 'flex', gap: '12px' },
  meetingStat: { flex: 1, background: '#111', borderRadius: '8px', padding: '12px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '4px' },
  meetingStatNum: { fontSize: '28px', fontWeight: '700', color: '#60a5fa' },
  meetingStatLabel: { fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' },
  timelineEntry: { display: 'flex', gap: '12px', alignItems: 'flex-start', paddingBottom: '12px', borderBottom: '1px solid #222', marginBottom: '12px' },
  timelineDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '5px' },
  timelineContent: { flex: 1 },
  timelineHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' },
  timelineDate: { color: '#555', fontSize: '11px', marginLeft: 'auto' },
  timelineNotes: { color: '#888', fontSize: '13px', margin: 0, lineHeight: 1.5 },
};