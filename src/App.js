import { useState, useEffect } from 'react';
import './App.css';
import logo from './kingdom-living-logo.jpg';
import { supabase } from './supabaseClient';
import Dashboard from './Dashboard';
import ApplicationForm from './ApplicationForm';

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) setError(error.message);
    setLoading(false);
  };

  if (window.location.pathname === '/apply') return <ApplicationForm />;
if (user) return <Dashboard user={user} />;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src={logo} alt="Kingdom Living" style={styles.logo} />
        <p style={styles.subtitle}>KL Hub — Staff Portal</p>

        {error && <p style={styles.error}>{error}</p>}

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={styles.input}
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

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'sans-serif',
  },
  card: {
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
};

export default App;