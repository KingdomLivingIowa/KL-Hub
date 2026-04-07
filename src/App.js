import { useState, useEffect } from 'react';
import './App.css';
import logo from './kingdom-living-logo.jpg';
import { supabase } from './supabaseClient';
import Dashboard from './Dashboard';
import ApplicationForm from './ApplicationForm';
import Clients from './Clients';
import Houses from './Houses';
import Reports from './Reports';

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [activePage, setActivePage] = useState('home');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { id: 'home', label: 'Dashboard' },
    { id: 'admissions', label: 'Admissions' },
    { id: 'waitinglist', label: 'Waiting List' },
    { id: 'houses', label: 'Houses' },
    { id: 'clients', label: 'Clients' },
    { id: 'reports', label: 'Reports' },
  ];

  if (!user) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <img src={logo} alt="Kingdom Living" style={styles.logo} />
          <p style={styles.subtitle}>Staff Portal</p>
          {error && <div style={styles.error}>{error}</div>}
          <form onSubmit={handleSignIn} style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
                placeholder="you@example.com"
                required
              />
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" style={styles.button} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appContainer}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarLogo}>
          <img src={logo} alt="Kingdom Living" style={styles.sidebarLogoImg} />
          <p style={styles.logoSub}>KL Hub</p>
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
          <button onClick={handleSignOut} style={styles.signOutBtn}>Sign Out</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {activePage === 'home' && <Dashboard user={user} setActivePage={setActivePage} />}
        {activePage === 'admissions' && <ApplicationForm />}
        {activePage === 'clients' && <Clients />}
        {activePage === 'houses' && <Houses />}
        {activePage === 'reports' && <Reports />}
        {activePage === 'waitinglist' && (
          <div style={styles.placeholder}>
            <p style={styles.placeholderText}>Waiting List module coming soon.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  loginContainer: {
    minHeight: '100vh',
    backgroundColor: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'sans-serif',
  },
  loginCard: {
    backgroundColor: '#2a2a2a',
    padding: '48px 40px',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    borderTop: '4px solid #b22222',
  },
  logo: {
    width: '180px',
    display: 'block',
    margin: '0 auto 12px auto',
    borderRadius: '4px',
  },
  subtitle: {
    color: '#a0a0a0',
    fontSize: '14px',
    textAlign: 'center',
    margin: '0 0 36px 0',
  },
  error: {
    backgroundColor: '#3d1515',
    color: '#f87171',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '16px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    color: '#d0d0d0',
    fontSize: '14px',
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #444444',
    borderRadius: '8px',
    padding: '12px 14px',
    color: '#ffffff',
    fontSize: '15px',
    outline: 'none',
  },
  button: {
    backgroundColor: '#b22222',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '14px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '8px',
  },
  appContainer: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    fontFamily: 'sans-serif',
  },
  sidebar: {
    width: '220px',
    backgroundColor: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    padding: '0',
    flexShrink: 0,
  },
  sidebarLogo: {
    padding: '24px 20px 20px',
    borderBottom: '1px solid #333',
  },
  sidebarLogoImg: {
    width: '120px',
    borderRadius: '4px',
    display: 'block',
    marginBottom: '8px',
  },
  logoSub: {
    color: '#a0a0a0',
    fontSize: '12px',
    margin: 0,
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 12px',
    gap: '4px',
    flex: 1,
  },
  navItem: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#c0c0c0',
    padding: '10px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '14px',
    fontWeight: '400',
  },
  navItemActive: {
    backgroundColor: '#b22222',
    color: '#ffffff',
    fontWeight: '500',
  },
  sidebarBottom: {
    padding: '16px 20px',
    borderTop: '1px solid #333',
  },
  userEmail: {
    color: '#a0a0a0',
    fontSize: '12px',
    margin: '0 0 10px 0',
    wordBreak: 'break-all',
  },
  signOutBtn: {
    backgroundColor: 'transparent',
    border: '1px solid #444',
    color: '#c0c0c0',
    padding: '8px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    width: '100%',
  },
  main: {
    flex: 1,
    overflow: 'auto',
  },
  placeholder: {
    padding: '2rem',
  },
  placeholderText: {
    color: '#888',
    fontSize: '16px',
  },
};

export default App;