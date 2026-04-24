import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'online', label: 'Online' },
  { value: 'third_party', label: '3rd Party' },
];

const THIRD_PARTY_PAYERS = [
  'SOR Grant', 'DOC', 'Treatment Program', 'Iowa Medicaid',
  'Other Government', 'Nonprofit Payer', 'Other',
];

const CHARGE_TYPE_LABELS = {
  weekly_fee: 'Weekly Fee',
  move_in_fee: 'Move-In Fee',
  level4_fee: 'Level 4 Fee',
  other: 'Other',
};

function ClientPayments({ client }) {
  const { user, hasFullAccess } = useUser();

  const [charges, setCharges] = useState([]);
  const [payments, setPayments] = useState([]);
  const [feeSettings, setFeeSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('charges');

  // Add charge form
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [savingCharge, setSavingCharge] = useState(false);
  const [chargeForm, setChargeForm] = useState({
    charge_type: 'weekly_fee',
    room_type: client.room_type || 'Double',
    weeks: '1',
    custom_amount: '',
    due_date: new Date().toISOString().split('T')[0],
    description: '',
  });

  // Record payment form
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_method: 'cash',
    payer_name: '',
    notes: '',
    payment_date: new Date().toISOString().split('T')[0],
  });

  const [showReceipt, setShowReceipt] = useState(null);
  const [sendingLink, setSendingLink] = useState(false);

  const ROOM_TYPE_FEES = {
    'Single': 160, 'Double': 135, 'Houseperson': 110, 'Live-Out': 35,
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [chargesRes, paymentsRes, feeRes] = await Promise.all([
      supabase.from('charges').select('*').eq('client_id', client.id).order('due_date', { ascending: false }),
      supabase.from('payments').select('*').eq('client_id', client.id).order('payment_date', { ascending: false }),
      supabase.from('fee_settings').select('*'),
    ]);
    setCharges(chargesRes.data || []);
    setPayments(paymentsRes.data || []);
    const map = {};
    (feeRes.data || []).forEach(f => { map[f.room_type] = f; });
    setFeeSettings(map);
    setLoading(false);
  }, [client.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Balance calculations
  const totalCharged = charges.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const balance = totalCharged - totalPaid;

  // Get weekly rate for this client
  const roomType = client.room_type || 'Double';
  const settings = feeSettings[roomType];
  const weeklyRate = settings ? parseFloat(settings.weekly_fee) : (ROOM_TYPE_FEES[roomType] || 135);

  const getChargeAmount = () => {
    const { charge_type, room_type, weeks, custom_amount } = chargeForm;
    if (charge_type === 'move_in_fee') return 150;
    if (charge_type === 'level4_fee') return 120;
    if (charge_type === 'weekly_fee') {
      const s = feeSettings[room_type];
      const rate = s ? parseFloat(s.weekly_fee) : (ROOM_TYPE_FEES[room_type] || 135);
      return rate * parseInt(weeks || 1);
    }
    return parseFloat(custom_amount || 0);
  };

  const saveCharge = async () => {
    const amount = getChargeAmount();
    if (!amount || amount <= 0) { alert('Invalid amount.'); return; }
    setSavingCharge(true);

    let description = '';
    if (chargeForm.charge_type === 'weekly_fee') {
      const weeks = parseInt(chargeForm.weeks);
      const s = feeSettings[chargeForm.room_type];
      const rate = s ? parseFloat(s.weekly_fee) : (ROOM_TYPE_FEES[chargeForm.room_type] || 135);
      description = `Weekly fee — ${chargeForm.room_type}${weeks > 1 ? ` (${weeks} weeks @ ${formatCurrency(rate)})` : ''}`;
    } else if (chargeForm.charge_type === 'move_in_fee') {
      description = 'Move-in fee';
    } else if (chargeForm.charge_type === 'level4_fee') {
      description = 'Level 4 transition fee';
    } else {
      description = chargeForm.description || 'Other charge';
    }

    const { error } = await supabase.from('charges').insert([{
      client_id: client.id,
      charge_type: chargeForm.charge_type,
      amount,
      due_date: chargeForm.due_date,
      description,
      status: 'unpaid',
      amount_paid: 0,
      created_by: user?.email || null,
    }]);

    if (error) { alert('Error creating charge: ' + error.message); setSavingCharge(false); return; }
    setShowAddCharge(false);
    setChargeForm({ charge_type: 'weekly_fee', room_type: client.room_type || 'Double', weeks: '1', custom_amount: '', due_date: new Date().toISOString().split('T')[0], description: '' });
    setSavingCharge(false);
    fetchData();
  };

  const savePayment = async () => {
    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) { alert('Please enter a valid amount.'); return; }
    setSavingPayment(true);

    const { error } = await supabase.from('payments').insert([{
      client_id: client.id,
      charge_id: null, // Not tied to a specific charge
      amount,
      payment_method: paymentForm.payment_method,
      payer_name: paymentForm.payer_name || null,
      notes: paymentForm.notes || null,
      payment_date: paymentForm.payment_date,
      created_by: user?.email || null,
    }]);

    if (error) { alert('Error recording payment: ' + error.message); setSavingPayment(false); return; }

    setShowPaymentForm(false);
    setPaymentForm({ amount: '', payment_method: 'cash', payer_name: '', notes: '', payment_date: new Date().toISOString().split('T')[0] });
    setSavingPayment(false);
    fetchData();
  };

  const deleteCharge = async (id) => {
    if (!window.confirm('Delete this charge?')) return;
    await supabase.from('charges').delete().eq('id', id);
    fetchData();
  };

  const deletePayment = async (id) => {
    if (!window.confirm('Delete this payment record?')) return;
    await supabase.from('payments').delete().eq('id', id);
    fetchData();
  };

  const handlePayOnline = async () => {
    if (balance <= 0) { alert('This client has no outstanding balance.'); return; }
    setSendingLink(true);
    try {
      const response = await fetch('/api/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          amount: balance,
          paymentType: 'weekly_fee',
          description: `Kingdom Living — Balance due for ${client.full_name}`,
          chargeId: null,
        }),
      });
      const result = await response.json();
      if (!response.ok) { alert('Error creating payment link: ' + result.error); return; }
      await navigator.clipboard.writeText(result.url);
      alert(`Payment link copied to clipboard!\n\nSend this to ${client.full_name}:\n${result.url}`);
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setSendingLink(false);
    }
  };

  const formatCurrency = (n) => `$${parseFloat(n || 0).toFixed(2)}`;
  const formatDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  const chargeAmount = getChargeAmount();

  return (
    <div>
      {/* Balance header */}
      <div style={{ background: balance > 0 ? '#3a1e1e' : '#1e3a2f', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ color: balance > 0 ? '#f87171' : '#4ade80', fontSize: '28px', fontWeight: '700', margin: 0 }}>
            {balance > 0 ? formatCurrency(balance) : 'Paid up'}
          </p>
          <p style={{ color: balance > 0 ? '#f87171' : '#4ade80', fontSize: '12px', opacity: 0.7, margin: '2px 0 0 0' }}>
            {balance > 0 ? 'Balance owed' : 'No balance owed'}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: '#aaa', fontSize: '12px', margin: 0 }}>Total charged</p>
              <p style={{ color: '#fff', fontSize: '14px', fontWeight: '600', margin: 0 }}>{formatCurrency(totalCharged)}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: '#aaa', fontSize: '12px', margin: 0 }}>Total paid</p>
              <p style={{ color: '#4ade80', fontSize: '14px', fontWeight: '600', margin: 0 }}>{formatCurrency(totalPaid)}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: '#aaa', fontSize: '12px', margin: 0 }}>Weekly rate</p>
              <p style={{ color: '#60a5fa', fontSize: '14px', fontWeight: '600', margin: 0 }}>{formatCurrency(weeklyRate)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => { setShowPaymentForm(!showPaymentForm); setShowAddCharge(false); }}
          style={{ background: showPaymentForm ? 'transparent' : '#16a34a', border: showPaymentForm ? '1px solid #444' : 'none', color: showPaymentForm ? '#aaa' : '#fff', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
          {showPaymentForm ? 'Cancel' : '+ Record Payment'}
        </button>
        {hasFullAccess && (
          <button onClick={() => { setShowAddCharge(!showAddCharge); setShowPaymentForm(false); }}
            style={{ background: showAddCharge ? 'transparent' : 'transparent', border: '1px solid #444', color: showAddCharge ? '#aaa' : '#888', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
            {showAddCharge ? 'Cancel' : '+ Add Charge'}
          </button>
        )}
        {balance > 0 && (
          <button onClick={handlePayOnline} disabled={sendingLink}
            style={{ background: 'transparent', border: '1px solid #60a5fa', color: '#60a5fa', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', marginLeft: 'auto' }}>
            {sendingLink ? 'Getting link...' : '🔗 Send Pay Link'}
          </button>
        )}
      </div>

      {/* Record payment form */}
      {showPaymentForm && (
        <div style={{ background: '#222', borderRadius: '10px', padding: '16px', marginBottom: '16px', border: '1px solid #333' }}>
          <p style={{ color: '#fff', fontSize: '14px', fontWeight: '600', margin: '0 0 14px 0' }}>Record Payment</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={fl.label}>Amount *</label>
              <input type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))}
                style={fl.input} placeholder={balance > 0 ? formatCurrency(balance) : '0.00'} />
            </div>
            <div>
              <label style={fl.label}>Payment Date</label>
              <input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm(p => ({ ...p, payment_date: e.target.value }))} style={fl.input} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={fl.label}>Payment Method</label>
              <select value={paymentForm.payment_method} onChange={e => setPaymentForm(p => ({ ...p, payment_method: e.target.value }))} style={fl.input}>
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label style={fl.label}>Notes</label>
              <input value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} style={fl.input} placeholder="Optional" />
            </div>
          </div>
          {paymentForm.payment_method === 'third_party' && (
            <div style={{ marginBottom: '12px' }}>
              <label style={fl.label}>Payer Name</label>
              <select value={paymentForm.payer_name} onChange={e => setPaymentForm(p => ({ ...p, payer_name: e.target.value }))} style={fl.input}>
                <option value="">Select payer...</option>
                {THIRD_PARTY_PAYERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          <button onClick={savePayment} disabled={savingPayment}
            style={{ background: '#16a34a', border: 'none', color: '#fff', padding: '9px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
            {savingPayment ? 'Saving...' : 'Save Payment'}
          </button>
        </div>
      )}

      {/* Add charge form */}
      {showAddCharge && hasFullAccess && (
        <div style={{ background: '#222', borderRadius: '10px', padding: '16px', marginBottom: '16px', border: '1px solid #333' }}>
          <p style={{ color: '#fff', fontSize: '14px', fontWeight: '600', margin: '0 0 14px 0' }}>Add Charge</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={fl.label}>Charge Type</label>
              <select value={chargeForm.charge_type} onChange={e => setChargeForm(p => ({ ...p, charge_type: e.target.value }))} style={fl.input}>
                <option value="weekly_fee">Weekly Program Fee</option>
                <option value="move_in_fee">Move-In Fee</option>
                <option value="level4_fee">Level 4 Transition Fee</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label style={fl.label}>Due Date</label>
              <input type="date" value={chargeForm.due_date} onChange={e => setChargeForm(p => ({ ...p, due_date: e.target.value }))} style={fl.input} />
            </div>
          </div>
          {chargeForm.charge_type === 'weekly_fee' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={fl.label}>Room Type</label>
                <select value={chargeForm.room_type} onChange={e => setChargeForm(p => ({ ...p, room_type: e.target.value }))} style={fl.input}>
                  {Object.keys(ROOM_TYPE_FEES).map(rt => {
                    const s = feeSettings[rt];
                    const rate = s ? parseFloat(s.weekly_fee) : ROOM_TYPE_FEES[rt];
                    return <option key={rt} value={rt}>{rt} — {formatCurrency(rate)}/wk</option>;
                  })}
                </select>
              </div>
              <div>
                <label style={fl.label}>Weeks</label>
                <select value={chargeForm.weeks} onChange={e => setChargeForm(p => ({ ...p, weeks: e.target.value }))} style={fl.input}>
                  {[1,2,3,4,5,6,7,8].map(n => {
                    const s = feeSettings[chargeForm.room_type];
                    const rate = s ? parseFloat(s.weekly_fee) : (ROOM_TYPE_FEES[chargeForm.room_type] || 135);
                    return <option key={n} value={n}>{n} week{n !== 1 ? 's' : ''} — {formatCurrency(rate * n)}</option>;
                  })}
                </select>
              </div>
            </div>
          )}
          {chargeForm.charge_type === 'other' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={fl.label}>Amount *</label>
                <input type="number" step="0.01" value={chargeForm.custom_amount} onChange={e => setChargeForm(p => ({ ...p, custom_amount: e.target.value }))} style={fl.input} placeholder="0.00" />
              </div>
              <div>
                <label style={fl.label}>Description</label>
                <input value={chargeForm.description} onChange={e => setChargeForm(p => ({ ...p, description: e.target.value }))} style={fl.input} placeholder="What is this charge for?" />
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ color: '#4ade80', fontSize: '15px', fontWeight: '700', margin: 0 }}>Total: {formatCurrency(chargeAmount)}</p>
            <button onClick={saveCharge} disabled={savingCharge}
              style={{ background: '#b22222', border: 'none', color: '#fff', padding: '9px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
              {savingCharge ? 'Saving...' : 'Add Charge'}
            </button>
          </div>
        </div>
      )}

      {loading ? <p style={{ color: '#666', fontSize: '14px' }}>Loading...</p> : (
        <>
          {/* View toggle */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
            <button onClick={() => setActiveView('charges')}
              style={{ padding: '5px 14px', borderRadius: '20px', border: '1px solid #444', background: activeView === 'charges' ? '#b22222' : 'transparent', color: activeView === 'charges' ? '#fff' : '#888', fontSize: '12px', cursor: 'pointer' }}>
              Charges ({charges.length})
            </button>
            <button onClick={() => setActiveView('payments')}
              style={{ padding: '5px 14px', borderRadius: '20px', border: '1px solid #444', background: activeView === 'payments' ? '#b22222' : 'transparent', color: activeView === 'payments' ? '#fff' : '#888', fontSize: '12px', cursor: 'pointer' }}>
              Payments ({payments.length})
            </button>
          </div>

          {/* Charges list */}
          {activeView === 'charges' && (
            charges.length === 0 ? (
              <p style={{ color: '#666', fontSize: '14px' }}>No charges yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {charges.map(c => (
                  <div key={c.id} style={{ background: '#1a1a1a', borderRadius: '8px', padding: '10px 14px', border: '1px solid #333', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>{formatCurrency(c.amount)}</span>
                        <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: '#2a2a2a', color: '#888' }}>
                          {CHARGE_TYPE_LABELS[c.charge_type] || c.charge_type}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <span style={{ color: '#555', fontSize: '12px' }}>{formatDate(c.due_date)}</span>
                        <span style={{ color: '#666', fontSize: '12px' }}>· {c.description}</span>
                      </div>
                    </div>
                    {hasFullAccess && (
                      <button onClick={() => deleteCharge(c.id)}
                        style={{ background: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {/* Payments list */}
          {activeView === 'payments' && (
            payments.length === 0 ? (
              <p style={{ color: '#666', fontSize: '14px' }}>No payments recorded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {payments.map(p => (
                  <div key={p.id} style={{ background: '#1a1a1a', borderRadius: '8px', padding: '10px 14px', border: '1px solid #333', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ color: '#4ade80', fontSize: '14px', fontWeight: '600' }}>{formatCurrency(p.amount)}</span>
                        <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: '#1e3a2f', color: '#4ade80' }}>
                          {p.payment_method === 'third_party' ? '3rd Party' : p.payment_method.charAt(0).toUpperCase() + p.payment_method.slice(1)}
                        </span>
                        {p.payer_name && <span style={{ fontSize: '11px', color: '#888' }}>{p.payer_name}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <span style={{ color: '#555', fontSize: '12px' }}>{formatDate(p.payment_date)}</span>
                        {p.notes && <span style={{ color: '#666', fontSize: '12px' }}>· {p.notes}</span>}
                        {p.created_by && <span style={{ color: '#555', fontSize: '11px' }}>· by {p.created_by}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button onClick={() => setShowReceipt(p)}
                        style={{ background: 'transparent', border: '1px solid #444', color: '#aaa', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
                        Receipt
                      </button>
                      {hasFullAccess && (
                        <button onClick={() => deletePayment(p.id)}
                          style={{ background: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </>
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
                ['Method', showReceipt.payment_method === 'third_party' ? '3rd Party' : showReceipt.payment_method?.charAt(0).toUpperCase() + showReceipt.payment_method?.slice(1)],
                showReceipt.payer_name ? ['Payer', showReceipt.payer_name] : null,
                showReceipt.notes ? ['Notes', showReceipt.notes] : null,
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#666' }}>{label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '500' }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '16px', fontWeight: '600' }}>Amount Paid</span>
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

const fl = {
  label: { display: 'block', color: '#aaa', fontSize: '13px', marginBottom: '4px' },
  input: { width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '9px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
};

export default ClientPayments;