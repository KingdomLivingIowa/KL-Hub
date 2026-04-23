import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';

const PAYMENT_TYPES = [
  { value: 'move_in_fee', label: 'Move-In Fee' },
  { value: 'weekly_fee', label: 'Weekly Program Fee' },
  { value: 'third_party', label: '3rd Party Payment' },
];

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'online', label: 'Online' },
  { value: 'third_party', label: '3rd Party' },
];

const THIRD_PARTY_PAYERS = [
  'SOR Grant',
  'DOC',
  'Treatment Program',
  'Iowa Medicaid',
  'Other Government',
  'Nonprofit Payer',
  'Other',
];

const STATUS_COLORS = {
  paid: { bg: '#1e3a2f', color: '#4ade80' },
  pending: { bg: '#2d2d1e', color: '#facc15' },
  failed: { bg: '#3a1e1e', color: '#f87171' },
  refunded: { bg: '#2d1e3a', color: '#c084fc' },
};

const TYPE_LABELS = {
  move_in_fee: 'Move-In Fee',
  weekly_fee: 'Weekly Fee',
  third_party: '3rd Party',
};

const METHOD_LABELS = {
  cash: 'Cash',
  check: 'Check',
  online: 'Online',
  third_party: '3rd Party',
};

function ClientPayments({ client }) {
  const { user, hasFullAccess } = useUser();

  const [payments, setPayments] = useState([]);
  const [feeSettings, setFeeSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sendingLink, setSendingLink] = useState(null);

  const [form, setForm] = useState({
    payment_type: 'weekly_fee',
    payment_method: 'cash',
    amount: '',
    payer_name: '',
    notes: '',
    payment_date: new Date().toISOString().split('T')[0],
    status: 'paid',
    weeks_covered: '1',
  });

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('client_id', client.id)
      .order('payment_date', { ascending: false });
    setPayments(data || []);
    setLoading(false);
  }, [client.id]);

  const fetchFeeSettings = useCallback(async () => {
    const { data } = await supabase.from('fee_settings').select('*');
    const map = {};
    (data || []).forEach(f => { map[f.room_type] = f; });
    setFeeSettings(map);
  }, []);

  useEffect(() => {
    fetchPayments();
    fetchFeeSettings();
  }, [fetchPayments, fetchFeeSettings]);

  // Auto-fill amount when payment type or weeks changes
  useEffect(() => {
    const roomType = client.room_type;
    const settings = feeSettings[roomType];
    if (!settings) return;

    if (form.payment_type === 'move_in_fee') {
      setForm(p => ({ ...p, amount: settings.move_in_fee.toString() }));
    } else if (form.payment_type === 'weekly_fee') {
      const total = (parseFloat(settings.weekly_fee) * parseInt(form.weeks_covered || 1)).toFixed(2);
      setForm(p => ({ ...p, amount: total }));
    }
  }, [form.payment_type, form.weeks_covered, feeSettings, client.room_type]);

  const savePayment = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    if (!form.payment_date) {
      alert('Payment date is required.');
      return;
    }
    if (form.payment_type === 'third_party' && !form.payer_name) {
      alert('Please enter the payer name for 3rd party payments.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('payments').insert([{
      client_id: client.id,
      amount: parseFloat(form.amount),
      payment_type: form.payment_type,
      payment_method: form.payment_method,
      payer_name: form.payer_name || null,
      notes: form.notes || null,
      payment_date: form.payment_date,
      status: form.status,
      created_by: user?.email || null,
    }]);

    if (error) {
      alert('Error saving payment: ' + error.message);
      setSaving(false);
      return;
    }

    setShowAddPayment(false);
    setForm({
      payment_type: 'weekly_fee',
      payment_method: 'cash',
      amount: '',
      payer_name: '',
      notes: '',
      payment_date: new Date().toISOString().split('T')[0],
      status: 'paid',
      weeks_covered: '1',
    });
    setSaving(false);
    fetchPayments();
  };

  const deletePayment = async (id) => {
    if (!window.confirm('Delete this payment record?')) return;
    await supabase.from('payments').delete().eq('id', id);
    fetchPayments();
  };

  const handlePayOnline = async (payment) => {
    setSendingLink(payment.id);
    try {
      const response = await fetch('/api/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          amount: payment.amount,
          paymentType: payment.payment_type,
          description: `Kingdom Living — ${TYPE_LABELS[payment.payment_type] || 'Program Fee'}`,
          paymentId: payment.id,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        alert('Error creating payment link: ' + result.error);
        return;
      }
      // Copy link to clipboard and show it
      await navigator.clipboard.writeText(result.url);
      alert(`Payment link copied to clipboard!\n\nSend this to ${client.full_name}:\n${result.url}`);
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setSendingLink(null);
    }
  };

  // Balance calculations
  const totalPaid = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const totalPending = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const thirdPartyTotal = payments.filter(p => p.payment_type === 'third_party' && p.status === 'paid').reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const clientPaidTotal = totalPaid - thirdPartyTotal;

  const roomType = client.room_type;
  const settings = feeSettings[roomType];
  const weeklyRate = settings ? parseFloat(settings.weekly_fee) : null;

  const formatCurrency = (n) => `$${parseFloat(n || 0).toFixed(2)}`;
  const formatDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div>
      {/* Balance summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <SummaryCard label="Total Paid" value={formatCurrency(totalPaid)} color="#4ade80" bg="#1e3a2f" />
        <SummaryCard label="Client Paid" value={formatCurrency(clientPaidTotal)} color="#60a5fa" bg="#1e2d3a" />
        <SummaryCard label="3rd Party Paid" value={formatCurrency(thirdPartyTotal)} color="#c084fc" bg="#2d1e3a" />
        {totalPending > 0 && <SummaryCard label="Pending" value={formatCurrency(totalPending)} color="#facc15" bg="#2d2d1e" />}
        {weeklyRate && <SummaryCard label="Weekly Rate" value={formatCurrency(weeklyRate)} color="#aaa" bg="#2a2a2a" sublabel={roomType || 'No room type'} />}
      </div>

      {/* Add payment button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button onClick={() => setShowAddPayment(!showAddPayment)}
          style={{ background: showAddPayment ? 'transparent' : '#b22222', border: showAddPayment ? '1px solid #444' : 'none', color: showAddPayment ? '#aaa' : '#fff', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
          {showAddPayment ? 'Cancel' : '+ Log Payment'}
        </button>
      </div>

      {/* Add payment form */}
      {showAddPayment && (
        <div style={{ background: '#222', borderRadius: '10px', padding: '16px', marginBottom: '16px', border: '1px solid #333' }}>
          <p style={{ color: '#fff', fontSize: '14px', fontWeight: '600', margin: '0 0 14px 0' }}>Log Payment</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={fl.label}>Payment Type</label>
              <select value={form.payment_type} onChange={e => setForm(p => ({ ...p, payment_type: e.target.value }))} style={fl.input}>
                {PAYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={fl.label}>Payment Method</label>
              <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))} style={fl.input}>
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          {form.payment_type === 'weekly_fee' && (
            <div style={{ marginBottom: '12px' }}>
              <label style={fl.label}>Number of Weeks</label>
              <select value={form.weeks_covered} onChange={e => setForm(p => ({ ...p, weeks_covered: e.target.value }))} style={fl.input}>
                {[1,2,3,4,5,6,7,8].map(n => (
                  <option key={n} value={n}>
                    {n} week{n !== 1 ? 's' : ''}{weeklyRate ? ` — ${formatCurrency(weeklyRate * n)}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.payment_type === 'third_party' && (
            <div style={{ marginBottom: '12px' }}>
              <label style={fl.label}>Payer Name *</label>
              <select value={form.payer_name} onChange={e => setForm(p => ({ ...p, payer_name: e.target.value }))} style={fl.input}>
                <option value="">Select payer...</option>
                {THIRD_PARTY_PAYERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={fl.label}>Amount *</label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} style={fl.input} placeholder="0.00" />
            </div>
            <div>
              <label style={fl.label}>Payment Date *</label>
              <input type="date" value={form.payment_date} onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))} style={fl.input} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={fl.label}>Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={fl.input}>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label style={fl.label}>Notes</label>
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={fl.input} placeholder="Optional notes" />
            </div>
          </div>

          <button onClick={savePayment} disabled={saving}
            style={{ background: '#16a34a', border: 'none', color: '#fff', padding: '9px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
            {saving ? 'Saving...' : 'Save Payment'}
          </button>
        </div>
      )}

      {/* Payment history */}
      {loading ? (
        <p style={{ color: '#666', fontSize: '14px' }}>Loading payments...</p>
      ) : payments.length === 0 ? (
        <p style={{ color: '#666', fontSize: '14px' }}>No payment records yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {payments.map(p => {
            const col = STATUS_COLORS[p.status] || STATUS_COLORS.paid;
            return (
              <div key={p.id} style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px 14px', border: '1px solid #333', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                    <span style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>{formatCurrency(p.amount)}</span>
                    <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: col.bg, color: col.color }}>{p.status}</span>
                    <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#2a2a2a', color: '#aaa' }}>{TYPE_LABELS[p.payment_type] || p.payment_type}</span>
                    <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#2a2a2a', color: '#888' }}>{METHOD_LABELS[p.payment_method] || p.payment_method}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#555', fontSize: '12px' }}>{formatDate(p.payment_date)}</span>
                    {p.payer_name && <span style={{ color: '#666', fontSize: '12px' }}>· {p.payer_name}</span>}
                    {p.notes && <span style={{ color: '#666', fontSize: '12px' }}>· {p.notes}</span>}
                    {p.created_by && <span style={{ color: '#555', fontSize: '11px' }}>· logged by {p.created_by}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {p.status === 'pending' && (
                    <button
                      onClick={() => handlePayOnline(p)}
                      disabled={sendingLink === p.id}
                      style={{ background: 'transparent', border: '1px solid #60a5fa', color: '#60a5fa', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      {sendingLink === p.id ? 'Getting link...' : 'Pay Online'}
                    </button>
                  )}
                  <button onClick={() => setShowReceipt(p)}
                    style={{ background: 'transparent', border: '1px solid #444', color: '#aaa', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                    Receipt
                  </button>
                  {hasFullAccess && (
                    <button onClick={() => deletePayment(p.id)}
                      style={{ background: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      ×
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Receipt modal */}
      {showReceipt && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }}
          onClick={() => setShowReceipt(null)}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', maxWidth: '400px', width: '100%', color: '#111' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <p style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 4px 0' }}>Kingdom Living</p>
              <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>Payment Receipt</p>
            </div>
            <div style={{ borderTop: '1px solid #eee', borderBottom: '1px solid #eee', padding: '16px 0', marginBottom: '16px' }}>
              {[
                ['Client', client.full_name],
                ['Date', formatDate(showReceipt.payment_date)],
                ['Type', TYPE_LABELS[showReceipt.payment_type]],
                ['Method', METHOD_LABELS[showReceipt.payment_method]],
                showReceipt.payer_name ? ['Payer', showReceipt.payer_name] : null,
                showReceipt.notes ? ['Notes', showReceipt.notes] : null,
                ['Status', showReceipt.status.charAt(0).toUpperCase() + showReceipt.status.slice(1)],
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#666' }}>{label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '500' }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '16px', fontWeight: '600' }}>Amount</span>
              <span style={{ fontSize: '24px', fontWeight: '700', color: '#16a34a' }}>{formatCurrency(showReceipt.amount)}</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => window.print()}
                style={{ flex: 1, background: '#b22222', border: 'none', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
                Print Receipt
              </button>
              <button onClick={() => setShowReceipt(null)}
                style={{ flex: 1, background: 'transparent', border: '1px solid #ccc', color: '#666', padding: '10px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, bg, sublabel }) {
  return (
    <div style={{ background: bg, borderRadius: '8px', padding: '10px 14px' }}>
      <p style={{ color, fontSize: '18px', fontWeight: '700', margin: '0 0 2px 0' }}>{value}</p>
      <p style={{ color, fontSize: '11px', opacity: 0.8, margin: 0 }}>{label}</p>
      {sublabel && <p style={{ color, fontSize: '10px', opacity: 0.5, margin: '2px 0 0 0' }}>{sublabel}</p>}
    </div>
  );
}

const fl = {
  label: { display: 'block', color: '#aaa', fontSize: '13px', marginBottom: '4px' },
  input: { width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '9px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
};

export default ClientPayments;