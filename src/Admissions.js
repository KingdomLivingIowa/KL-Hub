import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

function Admissions() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setApplications(data || []);
    setLoading(false);
  };

  const updateStatus = async (id, status) => {
    const { error } = await supabase
      .from('applications')
      .update({ status })
      .eq('id', id);

    if (!error) fetchApplications();
  };

  const filtered = filter === 'all'
    ? applications
    : applications.filter((a) => a.status === filter);

  const statusColor = (status) => {
    if (status === 'accepted') return '#16a34a';
    if (status === 'denied') return '#dc2626';
    return '#ca8a04';
  };

  return (
    <div>
      {/* Filter Tabs */}
      <div style={styles.tabs}>
        {['all', 'pending', 'accepted', 'denied'].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              ...styles.tab,
              ...(filter === tab ? styles.tabActive : {}),
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Applications List */}
      {loading ? (
        <p style={styles.empty}>Loading...</p>
      ) : filtered.length === 0 ? (
        <p style={styles.empty}>No applications found.</p>
      ) : (
        <div style={styles.list}>
          {filtered.map((app) => (
            <div key={app.id} style={styles.card}>
              <div style={styles.cardTop}>
                <div>
                  <p style={styles.name}>{app.full_name}</p>
                  <p style={styles.meta}>{app.email} · {app.phone}</p>
                  <p style={styles.meta}>Track: {app.track} · {app.gender}</p>
                </div>
                <span style={{
                  ...styles.badge,
                  backgroundColor: statusColor(app.status) + '22',
                  color: statusColor(app.status),
                }}>
                  {app.status}
                </span>
              </div>

              {app.notes && (
                <p style={styles.notes}>{app.notes}</p>
              )}

              <p style={styles.date}>
                Applied: {new Date(app.created_at).toLocaleDateString()}
              </p>

              {app.status === 'pending' && (
                <div style={styles.actions}>
                  <button
                    onClick={() => updateStatus(app.id, 'accepted')}
                    style={styles.acceptBtn}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => updateStatus(app.id, 'denied')}
                    style={styles.denyBtn}
                  >
                    Deny
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
  },
  tab: {
    backgroundColor: 'transparent',
    border: '1px solid #444',
    color: '#a0a0a0',
    padding: '8px 18px',
    borderRadius: '20px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  tabActive: {
    backgroundColor: '#b22222',
    border: '1px solid #b22222',
    color: '#ffffff',
  },
  empty: {
    color: '#a0a0a0',
    textAlign: 'center',
    marginTop: '60px',
    fontSize: '15px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  card: {
    backgroundColor: '#2a2a2a',
    borderRadius: '12px',
    padding: '20px 24px',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
  },
  name: {
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 4px 0',
  },
  meta: {
    color: '#a0a0a0',
    fontSize: '13px',
    margin: '2px 0',
  },
  badge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  notes: {
    color: '#cbd5e1',
    fontSize: '14px',
    margin: '8px 0',
    fontStyle: 'italic',
  },
  date: {
    color: '#666',
    fontSize: '12px',
    margin: '8px 0 0 0',
  },
  actions: {
    display: 'flex',
    gap: '10px',
    marginTop: '16px',
  },
  acceptBtn: {
    backgroundColor: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 20px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: '600',
  },
  denyBtn: {
    backgroundColor: 'transparent',
    color: '#dc2626',
    border: '1px solid #dc2626',
    borderRadius: '8px',
    padding: '8px 20px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: '600',
  },
};

export default Admissions;