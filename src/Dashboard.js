import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Admissions from './Admissions';
import WaitingList from './WaitingList';
import Clients from './Clients';
import Houses from './Houses';
import IntakeDischarge from './IntakeDischarge';

function Dashboard({ user }) {
  const [activePage, setActivePage] = useState('home');
  const [counts, setCounts] = useState({ pending: 0, waitingList: 0, active: 0, houses: 0 });

  useEffect(() => { fetchCounts(); }, []);

  const fetchCounts = async () => {
    const [pending, active] = await Promise.all([
      supabase.from('applications').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('applications').select('id', { count: 'exact' }).eq('status', 'accepted'),
    ]);
    setCounts(prev => ({
      ...prev,
      pending: pending.count || 0,
      active: active.count || 0,
    }));
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); };

  const navItems = [
    { id: 'home', label: 'Dashboard' },
    { id: 'admissions', label: 'Admissions' },
    { id: 'waitinglist', label: 'Waiting Lists' },
    { id: 'houses', label: 'Houses' },
    { id: 'clients', label: 'Clients' },
    { id: 'messages', label: 'Messages' },
    { id: 'intake', label: 'Intake & Discharge' },
{ id: 'reports', label: 'Reports' },
  ];

  return (
    <div style={styles.container}>
      {/* Sidebar */}
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
        </nav>

        <div style={styles.sidebarBottom}>
          <p style={styles.userEmail}>{user?.email}</p>
          <button onClick={handleSignOut} style={styles.signOutBtn}>Sign Out</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        <div style={styles.header}>
          <h1 style={styles.pageTitle}>
            {navItems.find((i) => i.id === activePage)?.label}
          </h1>
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

          {activePage === 'admissions' && <Admissions />}
          {activePage === 'waitinglist' && <WaitingList />}
          {activePage === 'clients' && <Clients />}
          {activePage === 'houses' && <Houses />}
          {activePage === 'intake' && <IntakeDischarge />}
            </div>
        </div>
      </div>
  );
}

const styles = {
  container: { display: 'flex', minHeight: '100vh', backgroundColor: '#1a1a1a', fontFamily: 'sans-serif' },
  sidebar: { width: '220px', backgroundColor: '#111111', borderRight: '1px solid #2a2a2a', display: 'flex', flexDirection: 'column', position: 'fixed', height: '100vh' },
  sidebarLogo: { padding: '24px 20px', borderBottom: '1px solid #2a2a2a' },
  logoText: { color: '#ffffff', fontSize: '20px', fontWeight: '700', margin: '0' },
  logoSub: { color: '#a0a0a0', fontSize: '12px', margin: '2px 0 0 0' },
  nav: { display: 'flex', flexDirection: 'column', padding: '12px 0', flex: 1 },
  navItem: { backgroundColor: 'transparent', border: 'none', color: '#a0a0a0', padding: '12px 20px', textAlign: 'left', fontSize: '14px', cursor: 'pointer', borderLeft: '3px solid transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  navItemActive: { backgroundColor: '#1e1e1e', color: '#ffffff', borderLeft: '3px solid #b22222' },
  badge: { backgroundColor: '#b22222', color: '#fff', borderRadius: '10px', padding: '2px 7px', fontSize: '11px', fontWeight: '700' },
  sidebarBottom: { padding: '16px 20px', borderTop: '1px solid #2a2a2a' },
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
  placeholder: { backgroundColor: '#2a2a2a', borderRadius: '12px', padding: '48px', textAlign: 'center' },
  placeholderText: { color: '#a0a0a0', fontSize: '16px', margin: '0' },
};

export default Dashboard;