import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';

const CHARGE_TYPES = [
  { value: 'weekly_fee', label: 'Weekly Program Fee' },
  { value: 'move_in_fee', label: 'Move-In Fee' },
  { value: 'level4_fee', label: 'Level 4 Transition Fee' },
  { value: 'other', label: 'Other' },
];

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

const STATUS_COLORS = {
  unpaid: { bg: '#3a1e1e', color: '#f87171' },
  partial: { bg: '#3a2d1e', color: '#fb923c' },
  paid: { bg: '#1e3a2f', color: '#4ade80' },
  waived: { bg: '#2a2a2a', color: '#888' },
};

const ROOM_TYPE_FEES = {
  'Single': 160,
  'Double': 135,
  'Houseperson': 110,
  'Live-Out': 35,
};

function ClientPayments({ client }) {
  const { user, hasFullAccess } = useUser();

  const [charges, setCharges] = useState([]);
  const [payments, setPayments] = useState([]);
  const [feeSettings, setFeeSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('charges'); // 'charges' or 'payments'

  // Charge form
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

  // Payment form
  const [showPaymentModal, setShowPaymentModal] = useState(null); // charge object
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_method: 'cash',
    payer_name: '',
    notes: '',
    payment_date: new Date().toISOString().split('T')[0],
  });

  const [showReceipt, setShowReceipt] = useState(null);
  const [sendingLink, setSendingLink] = useState(null);

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

  // Auto-calculate charge amount
  const getChargeAmount = () => {
    const { charge_type, room_type, weeks, custom_amount } = chargeForm;
    if (charge_type === 'move_in_fee') {
      const s = feeSettings[room_type];
      return s ? parseFloat(s.move_in_fee) : 150;
    }
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

    const roomType = chargeForm.charge_type === 'weekly_fee' ? chargeForm.room_type : client.room_type;
    const weeks = chargeForm.charge_type === 'weekly_fee' ? parseInt(chargeForm.weeks) : 1;
    const settings = feeSettings[roomType];
    const rate = settings ? parseFloat(settings.weekly_fee) : null;

    let description = '';
    if (chargeForm.charge_type === 'weekly_fee') {
      description = `Weekly fee — ${roomType}${weeks > 1 ? ` (${weeks} weeks @ ${formatCurrency(rate)})` : ''}`;
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

  const openPaymentModal = (charge) => {
    setShowPaymentModal(charge);
    const remaining = parseFloat(charge.amount) - parseFloat(charge.amount_paid || 0);
    setPaymentForm({
      amount: remaining.toFixed(2),
      payment_method: 'cash',
      payer_name: '',
      notes: '',
      payment_date: new Date().toISOString().split('T')[0],
    });
  };

  const savePayment = async () => {
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      alert('Please enter a valid amount.'); return;
    }

    setSavingPayment(true);
    const charge = showPaymentModal;
    const paymentAmount = parseFloat(paymentForm.amount);
    const newAmountPaid = parseFloat(charge.amount_paid || 0) + paymentAmount;
    const newStatus = newAmountPaid >= parseFloat(charge.amount) ? 'paid'
      : newAmountPaid > 0 ? 'partial' : 'unpaid';

    // Insert payment record
    const { error: payError } = await supabase.from('payments').insert([{
      client_id: client.id,
      charge_id: charge.id,
      amount: paymentAmount,
      payment_method: paymentForm.payment_method,
      payer_name: paymentForm.payer_name || null,
      notes: paymentForm.notes || null,
      payment_date: paymentForm.payment_date,
      created_by: user?.email || null,
    }]);

    if (payError) { alert('Error recording payment: ' + payError.message); setSavingPayment(false); return; }

    // Update charge balance
    const { error: chargeError } = await supabase
      .from('charges')
      .update({ amount_paid: newAmountPaid, status: newStatus })
      .eq('id', charge.id);

    if (chargeError) { alert('Error updating charge: ' + chargeError.message); setSavingPayment(false); return; }

    setShowPaymentModal(null);
    setSavingPayment(false);
    fetchData();
  };

  const waiveCharge = async (chargeId) => {
    if (!window.confirm('Waive this charge? This marks it as paid with no payment required.')) return;
    await supabase.from('charges').update({ status: 'waived' }).eq('id', chargeId);
    fetchData();
  };

  const deleteCharge = async (chargeId) => {
    if (!window.confirm('Delete this charge? This cannot be undone.')) return;
    await supabase.from('charges').delete().eq('id', chargeId);
    fetchData();
  };

  const handlePayOnline = async (charge) => {
    setSendingLink(charge.id);
    const remaining = parseFloat(charge.amount) - parseFloat(charge.amount_paid || 0);
    try {
      const response = await fetch('/api/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          amount: remaining,
          paymentType: charge.charge_type,
          description: charge.description || 'Kingdom Living Program Fee',
          chargeId: charge.id,
        }),
      });
      const result = await response.json();
      if (!response.ok) { alert('Error creating payment link: ' + result.error); return; }
      await navigator.clipboard.writeText(result.url);
      alert(`Payment link copied to clipboard!\n\nSend this to ${client.full_name}:\n${result.url}`);
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setSendingLink(null);
    }
  };

  // Summary calculations
  const totalCharged = charges.filter(c => c.status !== 'waived').reduce((s, c) => s + parseFloat(c.amount), 0);
  const totalPaid = charges.reduce((s, c) => s + parseFloat(c.amount_paid || 0), 0);
  const totalOwed = totalCharged - totalPaid;
  const unpaidCharges = charges.filter(c => c.status === 'unpaid' || c.status === 'partial').length;

  const formatCurrency = (n) => `$${parseFloat(n || 0).toFixed(2)}`;
  const formatDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  const chargeAmount = getChargeAmount();

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <SummaryCard label="Total Charged" value={formatCurrency(totalCharged)} color="#aaa" bg="#2a2a2a" />
        <SummaryCard label="Total Paid" value={formatCurrency(totalPaid)} color="#4ade80" bg="#1e3a2f" />
        <SummaryCard label="Balance Owed" value={formatCurrency(totalOwed)} color={totalOwed > 0 ? '#f87171' : '#4ade80'} bg={totalOwed > 0 ? '#3a1e1e' : '#1e3a2f'} />
        {unpaidCharges > 0 && <SummaryCard label="Open Charges" value={unpaidCharges} color="#facc15" bg="#2d2d1e" />}
      </div>

      {/* View toggle + Add charge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setActiveView('charges')}
            style={{ padding: '6px 14px', borderRadius: '20px', border: '1px solid #444', background: activeView === 'charges' ? '#b22222' : 'transparent', color: activeView === 'charges' ? '#fff' : '#888', fontSize: '13px', cursor: 'pointer' }}>
            Charges
          </button>
          <button onClick={() => setActiveView('payments')}
            style={{ padding: '6px 14px', borderRadius: '20px', border: '1px solid #444', background: activeView === 'payments' ? '#b22222' : 'transparent', color: activeView === 'payments' ? '#fff' : '#888', fontSize: '13px', cursor: 'pointer' }}>
            Payment History
          </button>
        </div>
        {activeView === 'charges' && (
          <button onClick={() => setShowAddCharge(!showAddCharge)}
            style={{ background: showAddCharge ? 'transparent' : '#b22222', border: showAddCharge ? '1px solid #444' : 'none', color: showAddCharge ? '#aaa' : '#fff', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
            {showAddCharge ? 'Cancel' : '+ Add Charge'}
          </button>
        )}
      </div>

      {/* Add charge form */}
      {showAddCharge && activeView === 'charges' && (
        <div style={{ background: '#222', borderRadius: '10px', padding: '16px', marginBottom: '16px', border: '1px solid #333' }}>
          <p style={{ color: '#fff', fontSize: '14px', fontWeight: '600', margin: '0 0 14px 0' }}>New Charge</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={fl.label}>Charge Type</label>
              <select value={chargeForm.charge_type} onChange={e => setChargeForm(p => ({ ...p, charge_type: e.target.value }))} style={fl.input}>
                {CHARGE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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
                    return <option key={rt} value={rt}>{rt} — {formatCurrency(rate)}/week</option>;
                  })}
                </select>
              </div>
              <div>
                <label style={fl.label}>Number of Weeks</label>
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
            <p style={{ color: '#4ade80', fontSize: '15px', fontWeight: '700', margin: 0 }}>
              Total: {formatCurrency(chargeAmount)}
            </p>
            <button onClick={saveCharge} disabled={savingCharge}
              style={{ background: '#b22222', border: 'none', color: '#fff', padding: '9px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
              {savingCharge ? 'Saving...' : 'Add Charge'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#666', fontSize: '14px' }}>Loading...</p>
      ) : (
        <>
          {/* Charges view */}
          {activeView === 'charges' && (
            charges.length === 0 ? (
              <p style={{ color: '#666', fontSize: '14px' }}>No charges yet. Use the + Add Charge button to create one.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {charges.map(c => {
                  const col = STATUS_COLORS[c.status] || STATUS_COLORS.unpaid;
                  const remaining = parseFloat(c.amount) - parseFloat(c.amount_paid || 0);
                  const isOpen = c.status === 'unpaid' || c.status === 'partial';
                  return (
                    <div key={c.id} style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px 14px', border: `1px solid ${isOpen ? '#444' : '#333'}` }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>{formatCurrency(c.amount)}</span>
                            <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: col.bg, color: col.color, fontWeight: '600' }}>
                              {c.status}
                            </span>
                            {c.amount_paid > 0 && c.status !== 'paid' && (
                              <span style={{ fontSize: '11px', color: '#fb923c' }}>{formatCurrency(remaining)} remaining</span>
                            )}
                          </div>
                          <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 2px 0' }}>{c.description}</p>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <span style={{ color: '#555', fontSize: '11px' }}>Due: {formatDate(c.due_date)}</span>
                            {c.amount_paid > 0 && <span style={{ color: '#4ade80', fontSize: '11px' }}>Paid: {formatCurrency(c.amount_paid)}</span>}
                            {c.created_by && <span style={{ color: '#555', fontSize: '11px' }}>· by {c.created_by}</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {isOpen && (
                            <>
                              <button onClick={() => openPaymentModal(c)}
                                style={{ background: '#16a34a', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>
                                Record Payment
                              </button>
                              <button onClick={() => handlePayOnline(c)} disabled={sendingLink === c.id}
                                style={{ background: 'transparent', border: '1px solid #60a5fa', color: '#60a5fa', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                {sendingLink === c.id ? 'Getting link...' : 'Pay Online'}
                              </button>
                            </>
                          )}
                          {isOpen && hasFullAccess && (
                            <button onClick={() => waiveCharge(c.id)}
                              style={{ background: 'transparent', border: '1px solid #555', color: '#888', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                              Waive
                            </button>
                          )}
                          {hasFullAccess && (
                            <button onClick={() => deleteCharge(c.id)}
                              style={{ background: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* Payment history view */}
          {activeView === 'payments' && (
            payments.length === 0 ? (
              <p style={{ color: '#666', fontSize: '14px' }}>No payments recorded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {payments.map(p => (
                  <div key={p.id} style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px 14px', border: '1px solid #333', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <span style={{ color: '#4ade80', fontSize: '14px', fontWeight: '600' }}>{formatCurrency(p.amount)}</span>
                        <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', background: '#2a2a2a', color: '#aaa' }}>
                          {p.payment_method === 'third_party' ? '3rd Party' : p.payment_method.charAt(0).toUpperCase() + p.payment_method.slice(1)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#555', fontSize: '12px' }}>{formatDate(p.payment_date)}</span>
                        {p.payer_name && <span style={{ color: '#666', fontSize: '12px' }}>· {p.payer_name}</span>}
                        {p.notes && <span style={{ color: '#666', fontSize: '12px' }}>· {p.notes}</span>}
                        {p.created_by && <span style={{ color: '#555', fontSize: '11px' }}>· logged by {p.created_by}</span>}
                      </div>
                    </div>
                    <button onClick={() => setShowReceipt(p)}
                      style={{ background: 'transparent', border: '1px solid #444', color: '#aaa', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}>
                      Receipt
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* Record payment modal */}
      {showPaymentModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }}
          onClick={() => setShowPaymentModal(null)}>
          <div style={{ background: '#1a1a1a', borderRadius: '12px', padding: '24px', maxWidth: '420px', width: '100%', border: '1px solid #333' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', margin: '0 0 4px 0', fontSize: '16px' }}>Record Payment</h3>
            <p style={{ color: '#666', fontSize: '13px', margin: '0 0 16px 0' }}>
              {showPaymentModal.description} — {formatCurrency(parseFloat(showPaymentModal.amount) - parseFloat(showPaymentModal.amount_paid || 0))} remaining
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={fl.label}>Amount *</label>
                <input type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} style={fl.input} />
              </div>
              <div>
                <label style={fl.label}>Payment Date</label>
                <input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm(p => ({ ...p, payment_date: e.target.value }))} style={fl.input} />
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={fl.label}>Payment Method</label>
              <select value={paymentForm.payment_method} onChange={e => setPaymentForm(p => ({ ...p, payment_method: e.target.value }))} style={fl.input}>
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
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

            <div style={{ marginBottom: '16px' }}>
              <label style={fl.label}>Notes</label>
              <input value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} style={fl.input} placeholder="Optional" />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={savePayment} disabled={savingPayment}
                style={{ flex: 1, background: '#16a34a', border: 'none', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
                {savingPayment ? 'Saving...' : 'Save Payment'}
              </button>
              <button onClick={() => setShowPaymentModal(null)}
                style={{ flex: 1, background: 'transparent', border: '1px solid #444', color: '#aaa', padding: '10px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
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
                ['Method', showReceipt.payment_method?.charAt(0).toUpperCase() + showReceipt.payment_method?.slice(1)],
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

function SummaryCard({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: '8px', padding: '10px 14px' }}>
      <p style={{ color, fontSize: '18px', fontWeight: '700', margin: '0 0 2px 0' }}>{value}</p>
      <p style={{ color, fontSize: '11px', opacity: 0.8, margin: 0 }}>{label}</p>
    </div>
  );
}

const fl = {
  label: { display: 'block', color: '#aaa', fontSize: '13px', marginBottom: '4px' },
  input: { width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '9px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
};

export default ClientPayments;