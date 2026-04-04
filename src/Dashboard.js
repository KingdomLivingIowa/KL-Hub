import { useState } from 'react';
import { supabase } from './supabaseClient';
import Admissions from './Admissions';

function Dashboard({ user }) {
  const [activePage, setActivePage] = useState('home');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { id: 'home', label: 'Dashboard' },
    { id: 'admissions', label: 'Admissions' },
    { id: 'waitinglist', label: 'Waiting Lists' },
    { id: 'houses', label: 'Houses' },
    { id: 'clients', label: 'Clients' },
    { id: 'messages', label: 'Messages' },
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
              style={{
                ...styles.navItem,
                ...(activePage === item.id ? styles.navItemActive : {}),
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div style={styles.sidebarBottom}>
          <p style={styles.userEmail}>{user?.email}</p>
          <button onClick={handleSignOut} style={styles.signOutBtn}>
            Sign Out
          </button>
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
                <p style={styles.cardValue}>0</p>
              </div>
              <div style={styles.card}>
                <p style={styles.cardLabel}>On Waiting List</p>
                <p style={styles.cardValue}>0</p>
              </div>
              <div style={styles.card}>
                <p style={styles.cardLabel}>Active Clients</p>
                <p style={styles.cardValue}>0</p>
              </div>
              <div style={styles.card}>
                <p style={styles.cardLabel}>Total Houses</p>
                <p style={styles.cardValue}>0</p>
              </div>
            </div>
          )}

          {activePage === 'admissions' && <Admissions />}

{activePage !== 'home' && activePage !== 'admissions' && (
  <div style={styles.placeholder}>
    <p style={styles.placeholderText}>
      {navItems.find((i) => i.id === activePage)?.label} module coming soon.
    </p>
  </div>
)}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: '#1a1a1a',
    fontFamily: 'sans-serif',
  },
  sidebar: {
    width: '220px',
    backgroundColor: '#111111',
    borderRight: '1px solid #2a2a2a',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    height: '100vh',
  },
  sidebarLogo: {
    padding: '24px 20px',
    borderBottom: '1px solid #2a2a2a',
  },
  logoText: {
    color: '#ffffff',
    fontSize: '20px',
    fontWeight: '700',
    margin: '0',
  },
  logoSub: {
    color: '#a0a0a0',
    fontSize: '12px',
    margin: '2px 0 0 0',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 0',
    flex: 1,
  },
  navItem: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#a0a0a0',
    padding: '12px 20px',
    textAlign: 'left',
    fontSize: '14px',
    cursor: 'pointer',
    borderLeft: '3px solid transparent',
  },
  navItemActive: {
    backgroundColor: '#1e1e1e',
    color: '#ffffff',
    borderLeft: '3px solid #b22222',
  },
  sidebarBottom: {
    padding: '16px 20px',
    borderTop: '1px solid #2a2a2a',
  },
  userEmail: {
    color: '#a0a0a0',
    fontSize: '11px',
    margin: '0 0 10px 0',
    wordBreak: 'break-all',
  },
  signOutBtn: {
    backgroundColor: 'transparent',
    border: '1px solid #444',
    color: '#a0a0a0',
    padding: '8px 14px',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
    width: '100%',
  },
  main: {
    marginLeft: '220px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    backgroundColor: '#111111',
    borderBottom: '1px solid #2a2a2a',
    padding: '20px 32px',
  },
  pageTitle: {
    color: '#ffffff',
    fontSize: '22px',
    fontWeight: '600',
    margin: '0',
  },
  content: {
    padding: '32px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '20px',
  },
  card: {
    backgroundColor: '#2a2a2a',
    borderRadius: '12px',
    padding: '24px',
    borderTop: '3px solid #b22222',
  },
  cardLabel: {
    color: '#a0a0a0',
    fontSize: '13px',
    margin: '0 0 8px 0',
  },
  cardValue: {
    color: '#ffffff',
    fontSize: '32px',
    fontWeight: '700',
    margin: '0',
  },
  placeholder: {
    backgroundColor: '#2a2a2a',
    borderRadius: '12px',
    padding: '48px',
    textAlign: 'center',
  },
  placeholderText: {
    color: '#a0a0a0',
    fontSize: '16px',
    margin: '0',
  },
};

export default Dashboard;