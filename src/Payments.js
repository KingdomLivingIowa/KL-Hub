import { useState, useEffect, useCallback } from 'react';
import { getCached, setCached, bustCache } from './dataCache';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';
import ClientPayments from './ClientPayments';

const ROOM_TYPE_COLORS = {
  'Single':      { bg: '#1e2d3a', color: '#60a5fa' },
  'Double':      { bg: '#2d1e3a', color: '#c084fc' },
  'Houseperson': { bg: '#1e3a2f', color: '#4ade80' },
  'Live-Out':    { bg: '#3a2d1e', color: '#fb923c' },
};

function Payments() {
  const { hasFullAccess } = useUser();

  const [clients, setClients] = useState([]);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState('current'); // 'current' | 'all'
  const [selectedClient, setSelectedClient] = useState(null);
  const [showFeeSettings, setShowFeeSettings] = useState(false);

  // Fee settings state
  const [feeSettings, setFeeSettings] = useState([]);
  const [savingFees, setSavingFees] = useState(false);
  const [feeEdits, setFeeEdits] = useState({});

  const fetchClients = useCallback(async (force = false) => {
    const cacheKey = `payments_clients_${viewFilter}`;
    if (!force) {
      const cached = getCached(cacheKey);
      if (cached) { setClients(cached.clients); setBalances(cached.balances); setLoading(false); return; }
    }
    setLoading(true);

    let query = supabase
      .from('clients')
      .select('id, full_name, email, photo_url, status, level, room_type, house_id, start_date, houses(name)')
      .order('full_name');

    if (viewFilter === 'current') {
      query = query.eq('status', 'Active');
    } else {
      query = query.in('status', ['Active', 'Pending', 'Discharged']);
    }

    const { data } = await query;
    const enriched = (data || []).map(c => ({ ...c, house_name: c.houses?.name || null }));
    setClients(enriched);

    const balanceMap = {};
    // Fetch balances for all clients
    if (enriched.length > 0) {
      const ids = enriched.map(c => c.id);

      const [chargesRes, paymentsRes] = await Promise.all([
        supabase.from('charges').select('client_id, amount').in('client_id', ids),
        supabase.from('payments').select('client_id, amount').in('client_id', ids),
      ]);

      ids.forEach(id => { balanceMap[id] = { charged: 0, paid: 0 }; });
      (chargesRes.data || []).forEach(c => { balanceMap[c.client_id].charged += parseFloat(c.amount || 0); });
      (paymentsRes.data || []).forEach(p => { balanceMap[p.client_id].paid += parseFloat(p.amount || 0); });
      setBalances(balanceMap);
    }

    setCached(cacheKey, { clients: enriched, balances: balanceMap });
    setLoading(false);
  }, [viewFilter]);

  const fetchFeeSettings = useCallback(async () => {
    const { data } = await supabase.from('fee_settings').select('*').order('room_type');
    setFeeSettings(data || []);
    const edits = {};
    (data || []).forEach(f => { edits[f.id] = { weekly_fee: f.weekly_fee, move_in_fee: f.move_in_fee }; });
    setFeeEdits(edits);
  }, []);

  useEffect(() => {
    fetchClients();
    fetchFeeSettings();
  }, [fetchClients, fetchFeeSettings]);

  const saveFeeSettings = async () => {
    setSavingFees(true);
    for (const [id, vals] of Object.entries(feeEdits)) {
      await supabase.from('fee_settings').update({
        weekly_fee: parseFloat(vals.weekly_fee) || 0,
        move_in_fee: parseFloat(vals.move_in_fee) || 0,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
    }
    setSavingFees(false);
    fetchFeeSettings();
    alert('Fee settings saved!');
  };

  const formatCurrency = (n) => `$${parseFloat(n || 0).toFixed(2)}`;

  const initials = (name) => name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '??';

  const filteredClients = clients.filter(c =>
    !search || c.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalOutstanding = Object.values(balances).reduce((sum, b) => {
    const owed = b.charged - b.paid;
    return sum + (owed > 0 ? owed : 0);
  }, 0);

  const totalCollected = Object.values(balances).reduce((sum, b) => sum + b.paid, 0);

  const clientsWithBalance = Object.values(balances).filter(b => b.charged - b.paid > 0).length;

  return (
    <div style={ps.page}>
      {/* Header */}
      <div style={ps.header}>
        <div>
          <h2 style={ps.title}>Payments</h2>
          <p style={ps.sub}>{filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {hasFullAccess && (
            <button onClick={() => setShowFeeSettings(!showFeeSettings)}
              title="Fee Settings"
              style={{ background: showFeeSettings ? '#b22222' : 'transparent', border: '1px solid #444', color: showFeeSettings ? '#fff' : '#888', width: '36px', height: '36px', borderRadius: '8px', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ⚙️
            </button>
          )}
        </div>
      </div>

      {/* Fee Settings panel */}
      {showFeeSettings && hasFullAccess && (
        <div style={{ background: '#2a2a2a', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px', border: '1px solid #444' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p style={{ color: '#fff', fontSize: '15px', fontWeight: '600', margin: 0 }}>Fee Settings</p>
            <button onClick={saveFeeSettings} disabled={savingFees}
              style={{ background: '#16a34a', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
              {savingFees ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {feeSettings.map(f => (
              <div key={f.id} style={{ background: '#1a1a1a', borderRadius: '10px', padding: '14px 16px', border: '1px solid #333' }}>
                <p style={{ color: '#fff', fontSize: '14px', fontWeight: '600', margin: '0 0 12px 0' }}>{f.room_type}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={ps.label}>Weekly Fee</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: '14px' }}>$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={feeEdits[f.id]?.weekly_fee ?? f.weekly_fee}
                        onChange={e => setFeeEdits(p => ({ ...p, [f.id]: { ...p[f.id], weekly_fee: e.target.value } }))}
                        style={{ ...ps.input, paddingLeft: '22px' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={ps.label}>Move-In Fee</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: '14px' }}>$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={feeEdits[f.id]?.move_in_fee ?? f.move_in_fee}
                        onChange={e => setFeeEdits(p => ({ ...p, [f.id]: { ...p[f.id], move_in_fee: e.target.value } }))}
                        style={{ ...ps.input, paddingLeft: '22px' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ color: '#555', fontSize: '12px', margin: '12px 0 0 0' }}>Changes take effect immediately for new charges. Existing charges are not affected.</p>
        </div>
      )}

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <SummaryCard label="Total Outstanding" value={formatCurrency(totalOutstanding)} color="#f87171" bg="#3a1e1e" />
        <SummaryCard label="Total Collected" value={formatCurrency(totalCollected)} color="#4ade80" bg="#1e3a2f" />
        <SummaryCard label="Clients with Balance" value={clientsWithBalance} color="#facc15" bg="#2d2d1e" />
        <SummaryCard label="Active Clients" value={clients.filter(c => c.status === 'Active').length} color="#c084fc" bg="#2d1e3a" />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...ps.input, maxWidth: '300px', padding: '9px 14px' }}
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setViewFilter('current')}
            style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #444', background: viewFilter === 'current' ? '#b22222' : 'transparent', color: viewFilter === 'current' ? '#fff' : '#888', fontSize: '13px', cursor: 'pointer' }}>
            Current
          </button>
          <button onClick={() => setViewFilter('all')}
            style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #444', background: viewFilter === 'all' ? '#b22222' : 'transparent', color: viewFilter === 'all' ? '#fff' : '#888', fontSize: '13px', cursor: 'pointer' }}>
            All
          </button>
        </div>
      </div>

      {/* Client cards grouped by house */}
      {loading ? (
        <p style={{ color: '#888' }}>Loading...</p>
      ) : filteredClients.length === 0 ? (
        <p style={{ color: '#888' }}>No clients found.</p>
      ) : (
        (() => {
          // Group clients by house
          const groups = {};
          filteredClients.forEach(client => {
            const key = client.house_name || 'No House Assigned';
            if (!groups[key]) groups[key] = [];
            groups[key].push(client);
          });
          const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
            if (a === 'No House Assigned') return 1;
            if (b === 'No House Assigned') return -1;
            return a.localeCompare(b);
          });

          return sortedGroups.map(([houseName, houseClients]) => {
            const houseBalance = houseClients.reduce((sum, c) => {
              const b = balances[c.id] || { charged: 0, paid: 0 };
              return sum + Math.max(b.charged - b.paid, 0);
            }, 0);

            return (
              <div key={houseName} style={{ marginBottom: '32px' }}>
                {/* House header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #333' }}>
                  <span style={{ color: '#fff', fontSize: '15px', fontWeight: '600' }}>{houseName}</span>
                  <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#2a2a2a', color: '#888' }}>{houseClients.length} client{houseClients.length !== 1 ? 's' : ''}</span>
                  {houseBalance > 0 && (
                    <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#3a1e1e', color: '#f87171', marginLeft: 'auto' }}>
                      {formatCurrency(houseBalance)} outstanding
                    </span>
                  )}
                </div>
                <div style={ps.cardGrid}>
                  {houseClients.map(client => {
                    const b = balances[client.id] || { charged: 0, paid: 0 };
                    const balance = b.charged - b.paid;
                    const roomCol = ROOM_TYPE_COLORS[client.room_type] || { bg: '#2a2a2a', color: '#aaa' };

                    return (
                      <div key={client.id} style={ps.card}>
                        {/* Card header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#1e3a2f', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '600', flexShrink: 0, overflow: 'hidden' }}>
                            {client.photo_url
                              ? <img src={client.photo_url} alt={client.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                              : initials(client.full_name)
                            }
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: '#fff', fontSize: '14px', fontWeight: '600', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.full_name}</p>
                            <p style={{ color: '#666', fontSize: '12px', margin: '2px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.email || '—'}</p>
                          </div>
                        </div>

                        {/* Badges */}
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#1e2d3a', color: '#60a5fa' }}>Level {client.level || 1}</span>
                          {client.room_type && (
                            <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: roomCol.bg, color: roomCol.color }}>{client.room_type}</span>
                          )}
                          {client.status !== 'Active' && (
                            <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#2a2a2a', color: '#888' }}>{client.status}</span>
                          )}
                        </div>

                        {/* Balance */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px', padding: '10px', background: '#111', borderRadius: '8px' }}>
                          <div>
                            <p style={{ color: '#666', fontSize: '11px', margin: '0 0 2px 0' }}>Total Charged</p>
                            <p style={{ color: '#fff', fontSize: '16px', fontWeight: '700', margin: 0 }}>{formatCurrency(b.charged)}</p>
                          </div>
                          <div>
                            <p style={{ color: '#666', fontSize: '11px', margin: '0 0 2px 0' }}>Balance Owed</p>
                            <p style={{ color: balance > 0 ? '#f87171' : '#4ade80', fontSize: '16px', fontWeight: '700', margin: 0 }}>
                              {balance > 0 ? formatCurrency(balance) : 'Paid up'}
                            </p>
                          </div>
                        </div>

                        {/* View button */}
                        <button onClick={() => setSelectedClient(client)}
                          style={{ width: '100%', background: '#b22222', border: 'none', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
                          View
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          });
        })()
      )}

      {/* Client payments modal */}
      {selectedClient && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', zIndex: 1000, overflowY: 'auto' }}
          onClick={() => setSelectedClient(null)}>
          <div style={{ background: '#1a1a1a', borderRadius: '16px', border: '1px solid #333', width: '100%', maxWidth: '700px', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', borderBottom: '1px solid #333' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#1e3a2f', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '600', flexShrink: 0 }}>
                {initials(selectedClient.full_name)}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: '600', margin: 0 }}>{selectedClient.full_name}</h3>
                <p style={{ color: '#666', fontSize: '12px', margin: '2px 0 0 0' }}>
                  {selectedClient.house_name || 'No house'}{selectedClient.room_type ? ` · ${selectedClient.room_type}` : ''}
                </p>
              </div>
              <button onClick={() => setSelectedClient(null)}
                style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #444', background: 'transparent', cursor: 'pointer', color: '#888', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ×
              </button>
            </div>
            {/* Payments component */}
            <div style={{ padding: '20px' }}>
              <ClientPayments client={selectedClient} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: '10px', padding: '14px 16px' }}>
      <p style={{ color, fontSize: '20px', fontWeight: '700', margin: '0 0 2px 0' }}>{value}</p>
      <p style={{ color, fontSize: '11px', opacity: 0.7, margin: 0 }}>{label}</p>
    </div>
  );
}

const ps = {
  page: { padding: '32px', fontFamily: 'sans-serif', color: '#fff' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  title: { fontSize: '24px', fontWeight: '700', margin: 0 },
  sub: { color: '#666', fontSize: '14px', margin: '4px 0 0 0' },
  label: { display: 'block', color: '#aaa', fontSize: '12px', marginBottom: '4px' },
  input: { width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '9px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' },
  card: { background: '#2a2a2a', borderRadius: '12px', padding: '18px', border: '1px solid #333' },
};

export default Payments;