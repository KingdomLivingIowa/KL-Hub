import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { getCached, setCached } from './dataCache';
import { UserProvider, useUser } from './UserContext';
import Admissions from './Admissions';
import WaitingList from './WaitingList';
import Clients from './Clients';
import Houses from './Houses';
import UserManagement from './UserManagement';
import Payments from './Payments';
import Messaging from './Messaging';
import Reports from './Reports';

const WAITING_LISTS = [
  'DOC Men', 'Community Men', 'Treatment Men',
  'DOC Women', 'Community Women', 'Treatment Women',
];

function DashboardHome({ counts, currentUser }) {
  const { isHouseManagerRole, assignedHouseIds } = useUser();

  const [houses, setHouses] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [readAlertKeys, setReadAlertKeys] = useState(new Set());
  const [waitingListCounts, setWaitingListCounts] = useState({});
  const [openCharges, setOpenCharges] = useState([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [loadingDashboard, setLoadingDashboard] = useState(true);

  const fetchDashboardData = useCallback(async (force = false) => {
    // Use cached data for instant render, then refresh in background after 60s
    const cached = getCached('dashboard_main');
    if (cached && !force) {
      setHouses(cached.houses);
      setRecentActivity(cached.activity);
      setOpenCharges(cached.charges);
      setTotalOutstanding(cached.outstanding);
      setWaitingListCounts(cached.waitlistCounts);
      setLoadingDashboard(false);
      return;
    }
    setLoadingDashboard(true);
    try {
      await Promise.all([
        fetchHouses(),
        fetchRecentActivity(),
        fetchAlerts(),
        fetchWaitingListCounts(),
        fetchOpenCharges(),
        fetchReadAlerts(),
      ]);
    } finally {
      setLoadingDashboard(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchReadAlerts = async () => {
    if (!currentUser?.id) return;
    const { data } = await supabase.from('alert_reads').select('alert_key').eq('user_id', currentUser.id);
    setReadAlertKeys(new Set((data || []).map(r => r.alert_key)));
  };

  const markAlertRead = async (alertKey) => {
    if (!currentUser?.id) return;
    await supabase.from('alert_reads').upsert([{ user_id: currentUser.id, alert_key: alertKey }], { onConflict: 'user_id,alert_key' });
    setReadAlertKeys(prev => new Set([...prev, alertKey]));
  };

  const fetchWaitingListCounts = async () => {
    const { data } = await supabase.from('waiting_list').select('list_type').eq('status', 'waiting');
    const counts = {};
    WAITING_LISTS.forEach(l => { counts[l] = 0; });
    (data || []).forEach(row => { if (counts[row.list_type] !== undefined) counts[row.list_type]++; });
    setWaitingListCounts(counts);
  };

  const fetchHouses = async () => {
    let query = supabase.from('houses').select('*').order('name');
    if (isHouseManagerRole && assignedHouseIds.length > 0) query = query.in('id', assignedHouseIds);
    const { data: housesData } = await query;
    const { data: clientsData } = await supabase.from('clients').select('house_id, status').in('status', ['Active', 'Pending']);
    const enriched = (housesData || []).map(h => ({
      ...h,
      activeCount: (clientsData || []).filter(c => c.house_id === h.id && c.status === 'Active').length,
      pendingCount: (clientsData || []).filter(c => c.house_id === h.id && c.status === 'Pending').length,
    }));
    setHouses(enriched);
  };

  const fetchRecentActivity = async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const iso = sevenDaysAgo.toISOString();

    const { data: apps } = await supabase.from('applications').select('id, first_name, last_name, created_at, status').gte('created_at', iso).order('created_at', { ascending: false }).limit(5);
    const { data: discharges } = await supabase.from('clients').select('id, full_name, discharge_date, reason_for_discharge').eq('status', 'Discharged').gte('discharge_date', iso.split('T')[0]).order('discharge_date', { ascending: false }).limit(5);
    const { data: crises } = await supabase.from('client_timeline').select('id, client_id, author, severity, created_at, notes, clients(full_name)').eq('entry_type', 'Crisis').gte('created_at', iso).order('created_at', { ascending: false }).limit(5);

    const activity = [
      ...(apps || []).map(a => ({ id: `app-${a.id}`, type: 'application', label: `${a.first_name} ${a.last_name} submitted an application`, time: a.created_at, status: a.status })),
      ...(discharges || []).map(d => ({ id: `discharge-${d.id}`, type: 'discharge', label: `${d.full_name} was discharged`, sublabel: d.reason_for_discharge || null, time: d.discharge_date + 'T00:00:00' })),
      ...(crises || []).map(c => ({ id: `crisis-${c.id}`, type: 'crisis', label: `Crisis logged for ${c.clients?.full_name || 'unknown client'}`, sublabel: c.severity ? `Severity: ${c.severity}` : null, time: c.created_at, author: c.author })),
    ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 15);

    setRecentActivity(activity);
  };

  const fetchAlerts = async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const iso = sevenDaysAgo.toISOString();

    const { data: crises } = await supabase.from('client_timeline').select('id, severity, created_at, notes, clients(full_name, house_id)').eq('entry_type', 'Crisis').gte('created_at', iso).order('created_at', { ascending: false });
    const filteredCrises = isHouseManagerRole && assignedHouseIds.length > 0
      ? (crises || []).filter(c => assignedHouseIds.includes(c.clients?.house_id))
      : (crises || []);

    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    let clientQuery = supabase.from('clients').select('id, full_name, house_id').eq('status', 'Active');
    if (isHouseManagerRole && assignedHouseIds.length > 0) clientQuery = clientQuery.in('house_id', assignedHouseIds);
    const { data: activeClients } = await clientQuery;

    const { data: checkIns } = await supabase.from('client_timeline').select('client_id').in('entry_type', ['Check-In', 'House Check-In']).gte('created_at', weekStart.toISOString());
    const checkedInIds = new Set((checkIns || []).map(c => c.client_id));
    const noCheckIn = (activeClients || []).filter(c => !checkedInIds.has(c.id));

    const alertList = [
      ...filteredCrises.map(c => ({
        id: `alert-crisis-${c.id}`, type: 'crisis',
        level: c.severity === 'High' ? 'high' : c.severity === 'Medium' ? 'medium' : 'low',
        label: `Crisis — ${c.clients?.full_name || 'Unknown'}`,
        sublabel: c.severity ? `${c.severity} severity` : null,
        time: c.created_at,
      })),
      ...(noCheckIn.length > 0 ? [{
        id: 'alert-no-checkin', type: 'no_checkin', level: 'medium',
        label: `${noCheckIn.length} active client${noCheckIn.length !== 1 ? 's' : ''} with no check-in this week`,
        sublabel: noCheckIn.slice(0, 3).map(c => c.full_name).join(', ') + (noCheckIn.length > 3 ? ` +${noCheckIn.length - 3} more` : ''),
        time: null,
      }] : []),
    ];

    setAlerts(alertList);
  };

  const fetchOpenCharges = async () => {
    const { data } = await supabase.from('charges').select('id, client_id, amount, amount_paid, due_date, clients(id, full_name, house_id, houses(id, name))').in('status', ['unpaid', 'partial']).order('due_date', { ascending: true });
    let charges = data || [];
    if (isHouseManagerRole && assignedHouseIds.length > 0) {
      charges = charges.filter(c => assignedHouseIds.includes(c.clients?.house_id));
    }
    const total = charges.reduce((sum, c) => sum + (parseFloat(c.amount) - parseFloat(c.amount_paid || 0)), 0);
    setOpenCharges(charges);
    setTotalOutstanding(total);
  };

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  // Write to cache after data settles so next visit is instant
  useEffect(() => {
    if (!loadingDashboard && (houses.length > 0 || recentActivity.length > 0)) {
      setCached('dashboard_main', {
        houses,
        activity: recentActivity,
        charges: openCharges,
        outstanding: totalOutstanding,
        waitlistCounts: waitingListCounts,
      });
    }
  }, [loadingDashboard, houses, recentActivity, openCharges, totalOutstanding, waitingListCounts]);

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const activityIcon = (type) => {
    if (type === 'application') return { icon: '📋', bg: '#1e2d3a' };
    if (type === 'discharge') return { icon: '🚪', bg: '#3a1e1e' };
    if (type === 'crisis') return { icon: '⚠️', bg: '#3a2d1e' };
    return { icon: '•', bg: '#2a2a2a' };
  };

  const alertColor = (level) => {
    if (level === 'high') return { bg: '#3a1e1e', border: '#7f1d1d', color: '#f87171', dot: '#ef4444' };
    if (level === 'medium') return { bg: '#3a2d1e', border: '#7c4a1e', color: '#fb923c', dot: '#f97316' };
    return { bg: '#1e2d3a', border: '#1e3a5f', color: '#60a5fa', dot: '#3b82f6' };
  };

  const availableBeds = (h) => Math.max((h.total_beds || 0) - (h.activeCount || 0) - (h.pendingCount || 0), 0);
  const occupancyPct = (h) => Math.min(((h.activeCount || 0) + (h.pendingCount || 0)) / Math.max(h.total_beds || 1, 1) * 100, 100);

  const chargesByHouse = openCharges.reduce((acc, charge) => {
    const houseName = charge.clients?.houses?.name || 'No House Assigned';
    const houseId = charge.clients?.houses?.id || 'none';
    if (!acc[houseId]) acc[houseId] = { name: houseName, charges: [] };
    acc[houseId].charges.push(charge);
    return acc;
  }, {});

  const unreadAlerts = alerts.filter(a => !readAlertKeys.has(a.id));
  const readAlerts = alerts.filter(a => readAlertKeys.has(a.id));
  const totalWaiting = Object.values(waitingListCounts).reduce((sum, n) => sum + n, 0);

  return (
    <div>
      {/* Stat cards */}
      <div style={ds.statGrid}>
        <div style={ds.statCard}>
          <p style={ds.statLabel}>New Applications</p>
          <p style={ds.statValue}>{counts.pending}</p>
        </div>
        <div style={ds.statCard}>
          <p style={ds.statLabel}>Active Clients</p>
          <p style={ds.statValue}>{counts.active}</p>
        </div>
        <div style={ds.statCard}>
          <p style={ds.statLabel}>Total Houses</p>
          <p style={ds.statValue}>{counts.houses}</p>
        </div>
      </div>

      {loadingDashboard ? (
        <p style={{ color: '#555', fontSize: '14px', marginTop: '32px' }}>Loading dashboard...</p>
      ) : (
        <div style={ds.contentGrid}>

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Waiting List Breakdown */}
            <Section title="Waiting Lists" count={totalWaiting} countColor="#fb923c">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <p style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px 0', fontWeight: '600' }}>Men's</p>
                {['DOC Men', 'Community Men', 'Treatment Men'].map(list => (
                  <div key={list} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#1a1a1a', borderRadius: '8px', border: '1px solid #333' }}>
                    <span style={{ fontSize: '13px', color: '#aaa' }}>{list}</span>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: waitingListCounts[list] > 0 ? '#60a5fa' : '#444' }}>{waitingListCounts[list] || 0}</span>
                  </div>
                ))}
                <p style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '10px 0 4px 0', fontWeight: '600' }}>Women's</p>
                {['DOC Women', 'Community Women', 'Treatment Women'].map(list => (
                  <div key={list} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#1a1a1a', borderRadius: '8px', border: '1px solid #333' }}>
                    <span style={{ fontSize: '13px', color: '#aaa' }}>{list}</span>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: waitingListCounts[list] > 0 ? '#f9a8d4' : '#444' }}>{waitingListCounts[list] || 0}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Alerts */}
            {alerts.length > 0 && (
              <Section title="Alerts" count={unreadAlerts.length > 0 ? unreadAlerts.length : undefined} countColor="#f87171">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {unreadAlerts.map(alert => {
                    const col = alertColor(alert.level);
                    return (
                      <div key={alert.id} style={{ background: col.bg, border: `1px solid ${col.border}`, borderRadius: '10px', padding: '12px 14px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: col.dot, flexShrink: 0, marginTop: '5px' }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ color: col.color, fontSize: '13px', fontWeight: '500', margin: 0 }}>{alert.label}</p>
                          {alert.sublabel && <p style={{ color: col.color, fontSize: '11px', opacity: 0.7, margin: '3px 0 0 0' }}>{alert.sublabel}</p>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          {alert.time && <span style={{ color: col.color, fontSize: '11px', opacity: 0.6 }}>{formatTimeAgo(alert.time)}</span>}
                          <button onClick={() => markAlertRead(alert.id)}
                            style={{ background: 'transparent', border: `1px solid ${col.border}`, color: col.color, fontSize: '10px', padding: '2px 8px', borderRadius: '6px', cursor: 'pointer', opacity: 0.7, whiteSpace: 'nowrap' }}>
                            Mark read
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {readAlerts.length > 0 && (
                    <div style={{ marginTop: '4px' }}>
                      <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px 0' }}>Read</p>
                      {readAlerts.map(alert => (
                        <div key={alert.id} style={{ background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '10px 14px', display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '6px', opacity: 0.5 }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#444', flexShrink: 0 }} />
                          <p style={{ color: '#666', fontSize: '12px', margin: 0, flex: 1 }}>{alert.label}</p>
                          {alert.time && <span style={{ color: '#444', fontSize: '11px', flexShrink: 0 }}>{formatTimeAgo(alert.time)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Bed availability */}
            <Section title="Bed Availability">
              {houses.length === 0 ? (
                <p style={{ color: '#555', fontSize: '14px' }}>No houses found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {houses.map(h => {
                    const available = availableBeds(h);
                    const pct = occupancyPct(h);
                    const isAlmostFull = available <= 1;
                    return (
                      <div key={h.id} style={{ background: '#2a2a2a', borderRadius: '10px', padding: '12px 14px', border: '1px solid #333' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{h.name}</span>
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', background: h.type === 'Women' ? '#3a1e2d' : '#1e2d3a', color: h.type === 'Women' ? '#f9a8d4' : '#60a5fa' }}>{h.type}</span>
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: isAlmostFull ? '#f87171' : '#4ade80' }}>{available} available</span>
                        </div>
                        <div style={{ height: '4px', background: '#333', borderRadius: '2px', marginBottom: '8px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: isAlmostFull ? '#ef4444' : '#c084fc', borderRadius: '2px', transition: 'width 0.3s' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '14px' }}>
                          <BedStat label="Total" value={h.total_beds || 0} color="#aaa" />
                          <BedStat label="Active" value={h.activeCount} color="#c084fc" />
                          <BedStat label="Pending" value={h.pendingCount} color="#facc15" />
                          <BedStat label="Available" value={available} color={isAlmostFull ? '#f87171' : '#4ade80'} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Open Charges */}
            {openCharges.length > 0 && (
              <Section title="Open Charges">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#3a1e1e', borderRadius: '10px', border: '1px solid #7f1d1d', marginBottom: '14px' }}>
                  <div>
                    <p style={{ color: '#f87171', fontSize: '12px', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Outstanding</p>
                    <p style={{ color: '#fff', fontSize: '24px', fontWeight: '700', margin: 0 }}>${totalOutstanding.toFixed(2)}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ color: '#f87171', fontSize: '20px', fontWeight: '700', margin: 0 }}>{openCharges.length}</p>
                    <p style={{ color: '#888', fontSize: '11px', margin: '2px 0 0 0' }}>open charge{openCharges.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {Object.entries(chargesByHouse).map(([houseId, group]) => {
                    const houseTotal = group.charges.reduce((sum, c) => sum + (parseFloat(c.amount) - parseFloat(c.amount_paid || 0)), 0);
                    const clientMap = {};
                    group.charges.forEach(c => {
                      const cid = c.clients?.id;
                      if (!cid) return;
                      if (!clientMap[cid]) clientMap[cid] = { name: c.clients?.full_name || '—', total: 0 };
                      clientMap[cid].total += parseFloat(c.amount) - parseFloat(c.amount_paid || 0);
                    });
                    return (
                      <div key={houseId}>
                        {!isHouseManagerRole && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <p style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, fontWeight: '600' }}>{group.name}</p>
                            <span style={{ fontSize: '12px', color: '#f87171', fontWeight: '600' }}>${houseTotal.toFixed(2)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {Object.values(clientMap).map((client, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: '#1a1a1a', borderRadius: '7px', border: '1px solid #2a2a2a' }}>
                              <span style={{ fontSize: '13px', color: '#ddd' }}>{client.name}</span>
                              <span style={{ fontSize: '13px', color: '#f87171', fontWeight: '600' }}>${client.total.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Recent Activity */}
            <Section title="Recent Activity (Last 7 Days)">
              {recentActivity.length === 0 ? (
                <p style={{ color: '#555', fontSize: '14px' }}>No recent activity.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {recentActivity.map(item => {
                    const { icon, bg } = activityIcon(item.type);
                    return (
                      <div key={item.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #2a2a2a' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0 }}>
                          {icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: '#ddd', fontSize: '13px', margin: 0, lineHeight: '1.4' }}>{item.label}</p>
                          {item.sublabel && <p style={{ color: '#666', fontSize: '11px', margin: '2px 0 0 0' }}>{item.sublabel}</p>}
                          {item.author && <p style={{ color: '#555', fontSize: '11px', margin: '2px 0 0 0' }}>by {item.author}</p>}
                        </div>
                        <span style={{ color: '#555', fontSize: '11px', flexShrink: 0, paddingTop: '2px' }}>{formatTimeAgo(item.time)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children, count, countColor }) {
  return (
    <div style={{ background: '#2a2a2a', borderRadius: '12px', padding: '18px 20px', border: '1px solid #333' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <p style={{ color: '#fff', fontSize: '14px', fontWeight: '600', margin: 0 }}>{title}</p>
        {count !== undefined && (
          <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#3a1e1e', color: countColor || '#f87171', fontWeight: '600' }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function BedStat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      <span style={{ fontSize: '15px', fontWeight: '700', color }}>{value}</span>
      <span style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
    </div>
  );
}

function DashboardInner({ user }) {
  const [activePage, setActivePage] = useState('home');
  const [counts, setCounts] = useState({ pending: 0, waitingList: 0, active: 0, houses: 0 });
  const [unreadMessages] = useState(0);
  const [pendingClientId, setPendingClientId] = useState(null);
  const [cameFromHouses, setCameFromHouses] = useState(false);

  const {
    role,
    loadingRole,
    hasFullAccess,
    canSeeAdmissions,
    canSeeWaitingList,
    canSeeReports,
    canSeeUserManagement,
    isAdmin,
  } = useUser();

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCounts = async () => {
    const { count: pendingCount } = await supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    const { count: housesCount } = await supabase.from('houses').select('*', { count: 'exact', head: true });
    const { count: activeClientsCount } = await supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'Active');
    const { count: waitingListCount } = await supabase.from('waiting_list').select('*', { count: 'exact', head: true }).eq('status', 'waiting');
    setCounts({ pending: pendingCount || 0, active: activeClientsCount || 0, houses: housesCount || 0, waitingList: waitingListCount || 0 });
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); };

  const navItems = [
    { id: 'home', label: 'Dashboard', show: true },
    { id: 'admissions', label: 'Admissions', show: canSeeAdmissions },
    { id: 'waitinglist', label: 'Waiting Lists', show: canSeeWaitingList },
    { id: 'houses', label: 'Houses', show: true },
    { id: 'clients', label: 'Clients', show: true },
    { id: 'messages', label: 'Messages', show: true },
    { id: 'payments', label: 'Payments', show: hasFullAccess },
    { id: 'reports', label: 'Reports', show: canSeeReports },
  ].filter(item => item.show);

  const settingsItems = [
    { id: 'users', label: 'User Management', show: canSeeUserManagement },
  ].filter(item => item.show);

  const getPageTitle = () => {
    const all = [...navItems, ...settingsItems];
    return all.find(i => i.id === activePage)?.label || 'Dashboard';
  };

  const roleDisplayName = (r) => {
    if (!r) return '';
    return r.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loadingRole) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#1a1a1a' }}>
        <p style={{ color: '#666', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarLogo}>
          <p style={styles.logoText}>KL Hub</p>
          <p style={styles.logoSub}>Staff Portal</p>
        </div>
        <nav style={styles.nav}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => setActivePage(item.id)}
              style={{ ...styles.navItem, ...(activePage === item.id ? styles.navItemActive : {}) }}>
              {item.label}
              {item.id === 'admissions' && counts.pending > 0 && (
                <span style={styles.badge}>{counts.pending}</span>
              )}
              {item.id === 'messages' && unreadMessages > 0 && (
                <span style={styles.badge}>{unreadMessages}</span>
              )}
            </button>
          ))}
          {isAdmin && settingsItems.length > 0 && (
            <div style={styles.settingsSection}>
              <p style={styles.settingsSectionLabel}>Settings</p>
              {settingsItems.map(item => (
                <button key={item.id} onClick={() => setActivePage(item.id)}
                  style={{ ...styles.navItem, ...(activePage === item.id ? styles.navItemActive : {}) }}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </nav>
        <div style={styles.sidebarBottom}>
          {role && <p style={styles.userRole}>{roleDisplayName(role)}</p>}
          <p style={styles.userEmail}>{user?.email}</p>
          <button onClick={handleSignOut} style={styles.signOutBtn}>Sign Out</button>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.header}>
          <h1 style={styles.pageTitle}>{getPageTitle()}</h1>
        </div>
        <div style={styles.content}>
          {activePage === 'home' && <DashboardHome counts={counts} currentUser={user} />}
          {activePage === 'admissions' && canSeeAdmissions && <Admissions />}
          {activePage === 'waitinglist' && canSeeWaitingList && <WaitingList />}
          {activePage === 'clients' && (
            <Clients
              pendingClientId={pendingClientId}
              onClientOpened={() => setPendingClientId(null)}
              onBackToHouses={cameFromHouses ? () => { setActivePage('houses'); setCameFromHouses(false); } : null}
            />
          )}
          {activePage === 'houses' && (
            <Houses onOpenClient={(clientId) => {
              setPendingClientId(clientId);
              setCameFromHouses(true);
              setActivePage('clients');
            }} />
          )}
          {activePage === 'payments' && hasFullAccess && <Payments />}
          {activePage === 'messages' && <Messaging />}
          {activePage === 'reports' && canSeeReports && <Reports />}
          {activePage === 'users' && canSeeUserManagement && <UserManagement currentUser={user} />}
        </div>
      </div>
    </div>
  );
}

function Dashboard({ user }) {
  return (
    <UserProvider user={user}>
      <DashboardInner user={user} />
    </UserProvider>
  );
}

const ds = {
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' },
  statCard: { backgroundColor: '#2a2a2a', borderRadius: '12px', padding: '20px 24px', borderTop: '3px solid #b22222' },
  statLabel: { color: '#a0a0a0', fontSize: '13px', margin: '0 0 8px 0' },
  statValue: { color: '#ffffff', fontSize: '32px', fontWeight: '700', margin: '0' },
  contentGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' },
};

const styles = {
  container: { display: 'flex', minHeight: '100vh', backgroundColor: '#1a1a1a', fontFamily: 'sans-serif' },
  sidebar: { width: '220px', backgroundColor: '#111111', borderRight: '1px solid #2a2a2a', display: 'flex', flexDirection: 'column', position: 'fixed', height: '100vh' },
  sidebarLogo: { padding: '24px 20px', borderBottom: '1px solid #2a2a2a' },
  logoText: { color: '#ffffff', fontSize: '20px', fontWeight: '700', margin: '0' },
  logoSub: { color: '#a0a0a0', fontSize: '12px', margin: '2px 0 0 0' },
  nav: { display: 'flex', flexDirection: 'column', padding: '12px 0', flex: 1, overflowY: 'auto' },
  navItem: { backgroundColor: 'transparent', border: 'none', color: '#a0a0a0', padding: '12px 20px', textAlign: 'left', fontSize: '14px', cursor: 'pointer', borderLeft: '3px solid transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  navItemActive: { backgroundColor: '#1e1e1e', color: '#ffffff', borderLeft: '3px solid #b22222' },
  badge: { backgroundColor: '#b22222', color: '#fff', borderRadius: '10px', padding: '2px 7px', fontSize: '11px', fontWeight: '700' },
  settingsSection: { marginTop: 'auto', borderTop: '1px solid #2a2a2a', paddingTop: '8px' },
  settingsSectionLabel: { color: '#555', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 20px 4px 20px', margin: 0 },
  sidebarBottom: { padding: '16px 20px', borderTop: '1px solid #2a2a2a' },
  userRole: { color: '#b22222', fontSize: '11px', fontWeight: '600', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' },
  userEmail: { color: '#a0a0a0', fontSize: '11px', margin: '0 0 10px 0', wordBreak: 'break-all' },
  signOutBtn: { backgroundColor: 'transparent', border: '1px solid #444', color: '#a0a0a0', padding: '8px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', width: '100%' },
  main: { marginLeft: '220px', flex: 1, display: 'flex', flexDirection: 'column' },
  header: { backgroundColor: '#111111', borderBottom: '1px solid #2a2a2a', padding: '20px 32px' },
  pageTitle: { color: '#ffffff', fontSize: '22px', fontWeight: '600', margin: '0' },
  content: { padding: '32px' },
};

export default Dashboard;