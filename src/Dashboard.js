import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { UserProvider, useUser } from './UserContext';
import Admissions from './Admissions';
import WaitingList from './WaitingList';
import Clients from './Clients';
import Houses from './Houses';
import IntakeDischarge from './IntakeDischarge';
import UserManagement from './UserManagement';

function DashboardInner({ user }) {
  const [activePage, setActivePage] = useState('home');
  const [counts, setCounts] = useState({ pending: 0, waitingList: 0, active: 0, houses: 0 });

  const {
    role,
    loadingRole,
    canSeeAdmissions,
    canSeeWaitingList,
    canSeeIntake,
    canSeeReports,
    canSeeUserManagement,
    isAdmin,
  } = useUser();

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 5000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCounts = async () => {
    const { count: pendingCount } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    const { count: housesCount } = await supabase
      .from('houses')
      .select('*', { count: 'exact', head: true });
    const { count: activeClientsCount } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Active');
    const { count: waitingListCount } = await supabase
      .from('waiting_list')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'waiting');
    setCounts({
      pending: pendingCount || 0,
      active: activeClientsCount || 0,
      houses: housesCount || 0,
      waitingList: waitingListCount || 0,
    });
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); };

  // Build nav items based on role
  const navItems = [
    { id: 'home', label: 'Dashboard', show: true },
    { id: 'admissions', label: 'Admissions', show: canSeeAdmissions },
    { id: 'waitinglist', label: 'Waiting Lists', show: canSeeWaitingList },
    { id: 'houses', label: 'Houses', show: true },
    { id: 'clients', label: 'Clients', show: true },
    { id: 'messages', label: 'Messages', show: true },
    { id: 'intake', label: 'Intake & Discharge', show: canSeeIntake },
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
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              style={{ ...styles.navItem, ...(activePage === item.id ? styles.navItemActive : {}) }}
            >
              {item.label}
              {item.id === 'admissions' && counts.pending > 0 && (
                <span style={styles.badge}>{counts.pending}</span>
              )}
            </button>
          ))}

          {/* Settings section — admin only */}
          {isAdmin && settingsItems.length > 0 && (
            <div style={styles.settingsSection}>
              <p style={styles.settingsSectionLabel}>Settings</p>
              {settingsItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  style={{ ...styles.navItem, ...(activePage === item.id ? styles.navItemActive : {}) }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </nav>

        <div style={styles.sidebarBottom}>
          {role && (
            <p style={styles.userRole}>{roleDisplayName(role)}</p>
          )}
          <p style={styles.userEmail}>{user?.email}</p>
          <button onClick={handleSignOut} style={styles.signOutBtn}>Sign Out</button>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.header}>
          <h1 style={styles.pageTitle}>{getPageTitle()}</h1>
        </div>
        <div style={styles.content}>
          {activePage === 'home' && (
            <div style={styles.grid}>
              <div style={styles.card}>
                <p style={styles.cardLabel}>New Applications</p>
                <p style={styles.cardValue}>{counts.pending}</p>
              </div>
              <div style={styles.card}>
                <p style={styles.cardLabel}>On Waiting List</p>
                <p style={styles.cardValue}>{counts.waitingList}</p>
              </div>
              <div style={styles.card}>
                <p style={styles.cardLabel}>Active Clients</p>
                <p style={styles.cardValue}>{counts.active}</p>
              </div>
              <div style={styles.card}>
                <p style={styles.cardLabel}>Total Houses</p>
                <p style={styles.cardValue}>{counts.houses}</p>
              </div>
            </div>
          )}
          {activePage === 'admissions' && canSeeAdmissions && <Admissions />}
          {activePage === 'waitinglist' && canSeeWaitingList && <WaitingList />}
          {activePage === 'clients' && <Clients />}
          {activePage === 'houses' && <Houses />}
          {activePage === 'intake' && canSeeIntake && <IntakeDischarge />}
          {activePage === 'users' && canSeeUserManagement && <UserManagement currentUser={user} />}
        </div>
      </div>
    </div>
  );
}

// Wrap with UserProvider so context is available
function Dashboard({ user }) {
  return (
    <UserProvider user={user}>
      <DashboardInner user={user} />
    </UserProvider>
  );
}

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
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' },
  card: { backgroundColor: '#2a2a2a', borderRadius: '12px', padding: '24px', borderTop: '3px solid #b22222' },
  cardLabel: { color: '#a0a0a0', fontSize: '13px', margin: '0 0 8px 0' },
  cardValue: { color: '#ffffff', fontSize: '32px', fontWeight: '700', margin: '0' },
};

export default Dashboard;