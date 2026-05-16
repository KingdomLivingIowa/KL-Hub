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
import Calendars from './Calendars';
import Resources from './Resources';
import EmailSettings from './EmailSettings';
import PODashboard from './PODashboard';
import klLogo from './kingdom-living-logo.jpg';

const DEFAULT_NOTIF_PREFS = {
  client_status_change: true,
  client_positive_ua: true,
  client_crisis: true,
  client_level_change: true,
  client_weekly_checkin: true,
  vacation_request: true,
  new_application: true,
  weekly_charges: true,
};

const NOTIF_LABELS_MAP = {
  client_status_change: 'Client status changes',
  client_positive_ua: 'Positive UA logged',
  client_crisis: 'Crisis entry logged',
  client_level_change: 'Client level changes',
  client_weekly_checkin: 'Weekly check-in submitted (portal)',
  vacation_request: 'Staff vacation request submitted',
  new_application: 'New application submitted',
  weekly_charges: 'Weekly fees auto-charged',
};

const WAITING_LISTS = [
  'DOC Men', 'Community Men', 'Treatment Men',
  'DOC Women', 'Community Women', 'Treatment Women',
];

function DashboardHome({ counts, currentUser }) {
  const { isHouseManagerRole, assignedHouseIds } = useUser();

  const [houses, setHouses] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [readAlertKeys, setReadAlertKeys] = useState(new Set());
  const [showReadNotifications, setShowReadNotifications] = useState(false);
  const [waitingListCounts, setWaitingListCounts] = useState({});
  const [openCharges, setOpenCharges] = useState([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [loadingDashboard, setLoadingDashboard] = useState(true);

  const fetchDashboardData = useCallback(async (force = false) => {
    // Use cached data for instant render, then refresh in background after 60s
    const cached = getCached('dashboard_main');
    if (cached && !force) {
      setHouses(cached.houses);
      setOpenCharges(cached.charges);
      setTotalOutstanding(cached.outstanding);
      setWaitingListCounts(cached.waitlistCounts);
      setLoadingDashboard(false);
      // Always fetch user-specific data even from cache
      const cachedReadKeys = await fetchReadAlerts();
      fetchAlerts(cachedReadKeys);
      fetchNotifications();
      return;
    }
    setLoadingDashboard(true);
    try {
      const [freshReadKeys] = await Promise.all([
        fetchReadAlerts(),
        fetchHouses(),
        fetchNotifications(),
        fetchWaitingListCounts(),
        fetchOpenCharges(),
      ]);
      fetchAlerts(freshReadKeys);
    } finally {
      setLoadingDashboard(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch notifications whenever currentUser becomes available
  useEffect(() => {
    if (currentUser?.id) {
      fetchNotifications();
      fetchReadAlerts();
    }
  }, [currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchReadAlerts = async () => {
    if (!currentUser?.id) return new Set();
    const { data } = await supabase.from('alert_reads').select('alert_key').eq('user_id', currentUser.id);
    const keys = new Set((data || []).map(r => r.alert_key));
    setReadAlertKeys(keys);
    return keys;
  };

  const markAlertRead = async (alertKey) => {
    if (!currentUser?.id) return;
    await supabase.from('alert_reads').upsert([{ user_id: currentUser.id, alert_key: alertKey }], { onConflict: 'user_id,alert_key' });
    setReadAlertKeys(prev => new Set([...prev, alertKey]));
    setAlerts(prev => prev.filter(a => a.id !== alertKey));
  };

  const fetchNotifications = async () => {
    if (!currentUser?.id) return;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', currentUser.id)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false });
    setNotifications(data || []);
  };

  const markNotificationRead = async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllNotificationsRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (!unreadIds.length) return;
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
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

  const fetchAlerts = async (readKeys = readAlertKeys) => {
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
      ...filteredCrises
        .filter(c => !readKeys.has(`alert-crisis-${c.id}`))
        .map(c => ({
          id: `alert-crisis-${c.id}`, type: 'crisis',
          level: c.severity === 'High' ? 'high' : c.severity === 'Medium' ? 'medium' : 'low',
          label: `Crisis — ${c.clients?.full_name || 'Unknown'}`,
          sublabel: c.severity ? `${c.severity} severity` : null,
          time: c.created_at,
        })),
      ...(noCheckIn.length > 0 && !readKeys.has('alert-no-checkin') ? [{
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
    if (!loadingDashboard && houses.length > 0) {
      setCached('dashboard_main', {
        houses,
        charges: openCharges,
        outstanding: totalOutstanding,
        waitlistCounts: waitingListCounts,
      });
    }
  }, [loadingDashboard, houses, openCharges, totalOutstanding, waitingListCounts]);

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
  const unreadNotifications = notifications.filter(n => !n.read);
  const readNotifications = notifications.filter(n => n.read);
  const totalUnread = unreadAlerts.length + unreadNotifications.length;
  const totalWaiting = Object.values(waitingListCounts).reduce((sum, n) => sum + n, 0);

  const notifIcon = (type) => {
    if (type === 'client_status_change') return '🔄';
    if (type === 'client_positive_ua') return '🚨';
    if (type === 'client_crisis') return '⚠️';
    if (type === 'client_level_change') return '⬆️';
    if (type === 'client_weekly_checkin') return '📋';
    if (type === 'vacation_request') return '🏖️';
    if (type === 'new_application') return '📝';
    if (type === 'weekly_charges') return '💵';
    return '•';
  };

  const notifLevel = (type) => {
    if (type === 'client_positive_ua' || type === 'client_crisis') return 'high';
    if (type === 'client_status_change' || type === 'vacation_request' || type === 'new_application') return 'medium';
    return 'low';
  };

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
        <p style={{ color: '#bbb', fontSize: '14px', marginTop: '32px' }}>Loading dashboard...</p>
      ) : (
        <div style={ds.contentGrid}>

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Waiting List Breakdown — admin/upper management only */}
            {!isHouseManagerRole && (
            <Section title="Waiting Lists" count={totalWaiting} countColor="#fb923c">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <p style={{ fontSize: '10px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px 0', fontWeight: '600' }}>Men's</p>
                {['DOC Men', 'Community Men', 'Treatment Men'].map(list => (
                  <div key={list} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#1a1a1a', borderRadius: '8px', border: '1px solid #333' }}>
                    <span style={{ fontSize: '13px', color: '#aaa' }}>{list}</span>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: waitingListCounts[list] > 0 ? '#60a5fa' : '#999' }}>{waitingListCounts[list] || 0}</span>
                  </div>
                ))}
                <p style={{ fontSize: '10px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '10px 0 4px 0', fontWeight: '600' }}>Women's</p>
                {['DOC Women', 'Community Women', 'Treatment Women'].map(list => (
                  <div key={list} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#1a1a1a', borderRadius: '8px', border: '1px solid #333' }}>
                    <span style={{ fontSize: '13px', color: '#aaa' }}>{list}</span>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: waitingListCounts[list] > 0 ? '#f9a8d4' : '#999' }}>{waitingListCounts[list] || 0}</span>
                  </div>
                ))}
              </div>
            </Section>
            )}

            {/* Alerts & Notifications */}
            {(alerts.length > 0 || notifications.length > 0 || isHouseManagerRole) && (
              <Section title="Alerts" count={totalUnread > 0 ? totalUnread : undefined} countColor="#f87171">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Unread notifications */}
                  {unreadNotifications.map(notif => {
                    const col = alertColor(notifLevel(notif.type));
                    return (
                      <div key={notif.id} style={{ background: col.bg, border: `1px solid ${col.border}`, borderRadius: '10px', padding: '12px 14px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{notifIcon(notif.type)}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ color: col.color, fontSize: '13px', fontWeight: '500', margin: 0 }}>{notif.message}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <span style={{ color: col.color, fontSize: '11px', opacity: 0.6 }}>{formatTimeAgo(notif.created_at)}</span>
                          <button onClick={() => markNotificationRead(notif.id)}
                            style={{ background: 'transparent', border: `1px solid ${col.border}`, color: col.color, fontSize: '10px', padding: '2px 8px', borderRadius: '6px', cursor: 'pointer', opacity: 0.7, whiteSpace: 'nowrap' }}>
                            Mark read
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {/* Unread computed alerts */}
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
                  {/* Read section — hidden by default with toggle */}
                  {readNotifications.length > 0 && (
                    <div style={{ marginTop: '4px' }}>
                      <button onClick={() => setShowReadNotifications(p => !p)}
                        style={{ background: 'transparent', border: 'none', color: '#666', fontSize: '11px', padding: '4px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>{showReadNotifications ? '▲' : '▼'}</span>
                        {showReadNotifications ? 'Hide' : `Show ${readNotifications.length} read`}
                      </button>
                      {showReadNotifications && readNotifications.map(notif => (
                        <div key={notif.id} style={{ background: '#252525', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '10px 14px', display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px', opacity: 0.5 }}>
                          <span style={{ fontSize: '13px', flexShrink: 0 }}>{notifIcon(notif.type)}</span>
                          <p style={{ color: '#999', fontSize: '12px', margin: 0, flex: 1 }}>{notif.message}</p>
                          <span style={{ color: '#999', fontSize: '11px', flexShrink: 0 }}>{formatTimeAgo(notif.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Mark all read if there are unread notifications */}
                  {unreadNotifications.length > 1 && (
                    <button onClick={markAllNotificationsRead}
                      style={{ alignSelf: 'flex-end', background: 'transparent', border: '1px solid #444', color: '#aaa', fontSize: '11px', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', marginTop: '4px' }}>
                      Mark all read
                    </button>
                  )}
                  {/* Empty state for house managers */}
                  {alerts.length === 0 && notifications.length === 0 && (
                    <p style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '12px 0', margin: 0 }}>No new notifications</p>
                  )}
                </div>
              </Section>
            )}

            {/* Bed availability */}
            <Section title="Bed Availability">
              {houses.length === 0 ? (
                <p style={{ color: '#bbb', fontSize: '14px' }}>No houses found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {houses.map(h => {
                    const available = availableBeds(h);
                    const pct = occupancyPct(h);
                    const isAlmostFull = available <= 1;
                    return (
                      <div key={h.id} style={{ background: '#333', borderRadius: '10px', padding: '12px 14px', border: '1px solid #333' }}>
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
                    <p style={{ color: '#bbb', fontSize: '11px', margin: '2px 0 0 0' }}>open charge{openCharges.length !== 1 ? 's' : ''}</p>
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
                            <p style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, fontWeight: '600' }}>{group.name}</p>
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

          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children, count, countColor }) {
  return (
    <div style={{ background: '#333', borderRadius: '12px', padding: '18px 20px', border: '1px solid #333' }}>
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
      <span style={{ fontSize: '10px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
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
    isUpperManagement,
    isParoleOfficer,
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
    { id: 'calendars', label: 'Calendars', show: true },
    { id: 'resources', label: 'Resources', show: true },
  ].filter(item => item.show);

  const settingsItems = [
    { id: 'users', label: 'User Management', show: canSeeUserManagement },
    { id: 'email_settings', label: 'Email Settings', show: isAdmin || isUpperManagement },
    { id: 'profile', label: 'My Profile', show: true },
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
        <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  // Parole Officer gets their own restricted view
  if (isParoleOfficer) {
    return (
      <div style={{ minHeight: '100vh', background: '#111', padding: '32px 24px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src={klLogo} alt="KL" style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover' }} />
            <div>
              <p style={{ color: '#fff', fontWeight: '700', fontSize: '16px', margin: 0 }}>KL Hub</p>
              <p style={{ color: '#666', fontSize: '11px', margin: 0 }}>Parole Officer Portal</p>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut()} style={{ background: 'transparent', border: '1px solid #333', color: '#888', padding: '6px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
            Sign Out
          </button>
        </div>
        <PODashboard />
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
          {!isAdmin && (
            <div style={styles.settingsSection}>
              <p style={styles.settingsSectionLabel}>Settings</p>
              <button onClick={() => setActivePage('profile')}
                style={{ ...styles.navItem, ...(activePage === 'profile' ? styles.navItemActive : {}) }}>
                My Profile
              </button>
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
          {activePage === 'waitinglist' && canSeeWaitingList && <WaitingList onOpenClient={(id) => setPendingClientId(id)} setActivePage={setActivePage} />}
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
          {activePage === 'calendars' && <Calendars />}
          {activePage === 'resources' && <Resources />}
          {activePage === 'users' && canSeeUserManagement && <UserManagement currentUser={user} />}
          {activePage === 'email_settings' && (isAdmin || isUpperManagement) && <EmailSettings />}
          {activePage === 'profile' && <NotificationSettingsPage currentUser={user} />}
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
  statCard: { backgroundColor: '#333', borderRadius: '12px', padding: '20px 24px', borderTop: '3px solid #b22222' },
  statLabel: { color: '#a0a0a0', fontSize: '13px', margin: '0 0 8px 0' },
  statValue: { color: '#ffffff', fontSize: '32px', fontWeight: '700', margin: '0' },
  contentGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' },
};

const styles = {
  container: { display: 'flex', minHeight: '100vh', backgroundColor: '#1a1a1a', fontFamily: 'sans-serif' },
  sidebar: { width: '230px', backgroundColor: '#111111', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', position: 'fixed', height: '100vh' },
  sidebarLogo: { padding: '24px 20px', borderBottom: '1px solid #333' },
  logoText: { color: '#ffffff', fontSize: '22px', fontWeight: '700', margin: '0' },
  logoSub: { color: '#bbb', fontSize: '13px', margin: '3px 0 0 0' },
  nav: { display: 'flex', flexDirection: 'column', padding: '12px 0', flex: 1, overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' },
  navItem: { backgroundColor: 'transparent', border: 'none', color: '#bbb', padding: '13px 20px', textAlign: 'left', fontSize: '15px', cursor: 'pointer', borderLeft: '3px solid transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', letterSpacing: '0.01em' },
  navItemActive: { backgroundColor: '#252525', color: '#ffffff', borderLeft: '3px solid #b22222', fontWeight: '600' },
  badge: { backgroundColor: '#b22222', color: '#fff', borderRadius: '10px', padding: '2px 7px', fontSize: '11px', fontWeight: '700' },
  settingsSection: { marginTop: 'auto', borderTop: '1px solid #333', paddingTop: '8px' },
  settingsSectionLabel: { color: '#999', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 20px 4px 20px', margin: 0 },
  sidebarBottom: { padding: '16px 20px', borderTop: '1px solid #333' },
  userRole: { color: '#b22222', fontSize: '12px', fontWeight: '600', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' },
  userEmail: { color: '#bbb', fontSize: '12px', margin: '0 0 10px 0', wordBreak: 'break-all' },
  signOutBtn: { backgroundColor: 'transparent', border: '1px solid #555', color: '#bbb', padding: '8px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', width: '100%' },
  main: { marginLeft: '230px', flex: 1, display: 'flex', flexDirection: 'column' },
  header: { backgroundColor: '#111111', borderBottom: '2px solid #7a1515', padding: '22px 36px' },
  pageTitle: { color: '#ffffff', fontSize: '26px', fontWeight: '700', margin: '0' },
  content: { padding: '36px' },
};

function NotificationSettingsPage({ currentUser }) {
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!currentUser?.id) return;
    supabase.from('user_profiles').select('notification_preferences').eq('id', currentUser.id).single()
      .then(({ data }) => {
        setPrefs(data?.notification_preferences || { ...DEFAULT_NOTIF_PREFS });
      });
  }, [currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key) => {
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const savePrefs = async () => {
    setSaving(true);
    const { error } = await supabase.from('user_profiles').update({ notification_preferences: prefs }).eq('id', currentUser.id);
    if (error) {
      console.error('Save prefs error:', error);
      alert('Error saving preferences: ' + error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!prefs) return <p style={{ color: '#bbb', padding: '20px' }}>Loading...</p>;

  return (
    <div style={{ maxWidth: '540px' }}>
      <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', margin: '0 0 6px 0' }}>My Profile</h2>
      <p style={{ color: '#999', fontSize: '14px', margin: '0 0 28px 0' }}>Manage your notification preferences. Changes apply to your account only.</p>

      <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #333' }}>
          <p style={{ color: '#fff', fontSize: '15px', fontWeight: '600', margin: 0 }}>Notification Preferences</p>
          <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0 0' }}>Notifications appear in the Alerts section of your dashboard, scoped to your assigned house(s).</p>
        </div>
        {Object.entries(NOTIF_LABELS_MAP).map(([key, label]) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #2a2a2a' }}>
            <span style={{ fontSize: '14px', color: '#ddd' }}>{label}</span>
            <button onClick={() => toggle(key)}
              style={{
                width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                background: prefs[key] !== false ? '#b22222' : '#444',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0,
              }}>
              <span style={{
                position: 'absolute', top: '3px', width: '18px', height: '18px', borderRadius: '50%',
                background: '#fff', transition: 'left 0.2s',
                left: prefs[key] !== false ? '23px' : '3px',
              }} />
            </button>
          </div>
        ))}
      </div>

      <button onClick={savePrefs} disabled={saving}
        style={{ padding: '10px 24px', background: saving ? '#555' : '#b22222', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer' }}>
        {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Preferences'}
      </button>
    </div>
  );
}

export default Dashboard;