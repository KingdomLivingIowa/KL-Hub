import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';
import { InvoiceButton } from './Invoice';
import klLogo from './kingdom-living-logo.jpg';

function generateReceiptPDF(payment, client, balance, logoSrc) {
  const name = client.full_name || '—';
  const amount = parseFloat(payment.amount || 0);
  const method = payment.payment_method === 'third_party' ? '3rd Party'
    : payment.payment_method ? payment.payment_method.charAt(0).toUpperCase() + payment.payment_method.slice(1) : '—';
  const date = payment.payment_date
    ? new Date(payment.payment_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const receiptNum = payment.id ? payment.id.slice(-8).toUpperCase() : Date.now().toString().slice(-8);
  const remainingBalance = parseFloat(balance || 0);

  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" style="width:65px;height:65px;object-fit:contain;" />`
    : `<div style="width:65px;height:65px;border:2px solid #8b1c1c;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:bold;color:#8b1c1c;">KL</div>`;

  const row = (label, value, bold = false) => `
    <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #eee;">
      <span style="font-size:14px;color:#666;">${label}</span>
      <span style="font-size:14px;${bold ? 'font-weight:700;' : ''}color:#111;">${value}</span>
    </div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Receipt – ${name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #fff; border-radius: 12px; padding: 40px; max-width: 420px; width: 100%; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 2px solid #b22222; }
    .org-name { font-size: 18px; font-weight: 700; color: #111; }
    .org-sub { font-size: 12px; color: #888; margin-top: 2px; }
    .receipt-title { text-align: center; margin-bottom: 24px; }
    .receipt-title h2 { font-size: 22px; font-weight: 700; color: #111; margin-bottom: 4px; }
    .receipt-title p { font-size: 12px; color: #999; }
    .amount-box { background: #f0faf4; border: 2px solid #16a34a; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
    .amount-label { font-size: 13px; color: #16a34a; margin-bottom: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .amount-value { font-size: 40px; font-weight: 700; color: #16a34a; }
    .balance-box { background: ${remainingBalance > 0 ? '#fff5f5' : '#f0faf4'}; border-radius: 8px; padding: 12px 16px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center; }
    .print-btn { display: block; width: 100%; margin-top: 24px; padding: 12px; background: #b22222; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .footer { text-align: center; margin-top: 20px; font-size: 11px; color: #bbb; }
    @media print { body { background: #fff; padding: 0; } .card { box-shadow: none; } .print-btn { display: none; } }
  </style></head><body>
  <div class="card">
    <div class="header">
      ${logoHtml}
      <div>
        <div class="org-name">Kingdom Living Iowa</div>
        <div class="org-sub">Non-Profit Recovery Community</div>
      </div>
    </div>

    <div class="receipt-title">
      <h2>Payment Receipt</h2>
      <p>Receipt #${receiptNum} &nbsp;·&nbsp; ${generatedDate}</p>
    </div>

    ${row('Client', name)}
    ${row('Payment Date', date)}
    ${row('Payment Method', method)}
    ${payment.payer_name ? row('Paid By', payment.payer_name) : ''}
    ${payment.notes ? row('Notes', payment.notes) : ''}
    ${payment.created_by ? row('Recorded By', payment.created_by) : ''}

    <div class="amount-box">
      <div class="amount-label">Amount Paid</div>
      <div class="amount-value">$${amount.toFixed(2)}</div>
    </div>

    <div class="balance-box">
      <span style="font-size:14px;color:#555;">Remaining Balance</span>
      <span style="font-size:16px;font-weight:700;color:${remainingBalance > 0 ? '#dc2626' : '#16a34a'};">
        ${remainingBalance > 0 ? `$${remainingBalance.toFixed(2)} owed` : remainingBalance < 0 ? `$${Math.abs(remainingBalance).toFixed(2)} credit` : 'Paid in full'}
      </span>
    </div>

    <button class="print-btn" onclick="window.print()">⬇ Print / Save PDF</button>
    <div class="footer">Thank you — Kingdom Living Iowa</div>
  </div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=520,height=750');
  win.document.write(html);
  win.document.close();
}

function generatePaymentHistoryPDF(client, charges, payments, logoSrc) {
  const name = client.full_name || '—';
  const house = client.house_name || '—';
  const startDate = client.start_date ? new Date(client.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const totalCharged = charges.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const balance = totalCharged - totalPaid;

  const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const fmtAmt = (n) => `$${parseFloat(n || 0).toFixed(2)}`;
  const chargeTypeLabel = (t) => ({ weekly_fee: 'Weekly Fee', move_in_fee: 'Move-In Fee', level4_fee: 'Level 4 Fee', other: 'Other' }[t] || t);
  const methodLabel = (m) => m === 'third_party' ? '3rd Party' : m ? m.charAt(0).toUpperCase() + m.slice(1) : '—';

  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" style="width:65px;height:65px;object-fit:contain;" />`
    : `<div style="width:65px;height:65px;border:2px solid #8b1c1c;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:bold;color:#8b1c1c;">KL</div>`;

  // Merge charges and payments into a single timeline sorted by date
  const timeline = [
    ...charges.map(c => ({ date: c.due_date, type: 'charge', label: chargeTypeLabel(c.charge_type), description: c.description || '', amount: parseFloat(c.amount || 0) })),
    ...payments.map(p => ({ date: p.payment_date, type: 'payment', label: methodLabel(p.payment_method), description: p.payer_name || p.notes || '', amount: parseFloat(p.amount || 0), by: p.created_by || '' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const timelineRows = timeline.map(t => `
    <tr style="background:${t.type === 'payment' ? '#f0faf4' : '#fff'};">
      <td style="padding:9px 12px;border-bottom:1px solid #eee;font-size:13px;color:#555;">${fmtDate(t.date)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #eee;">
        <span style="font-size:13px;font-weight:600;color:${t.type === 'payment' ? '#16a34a' : '#111'};">${t.type === 'payment' ? 'Payment' : 'Charge'}</span>
        <span style="font-size:12px;color:#888;margin-left:6px;">${t.label}</span>
        ${t.description ? `<div style="font-size:12px;color:#aaa;margin-top:2px;">${t.description}</div>` : ''}
        ${t.by ? `<div style="font-size:11px;color:#bbb;">by ${t.by}</div>` : ''}
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid #eee;text-align:right;font-size:13px;font-weight:600;color:${t.type === 'payment' ? '#16a34a' : '#dc2626'};">
        ${t.type === 'payment' ? '+' : '-'}${fmtAmt(t.amount)}
      </td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Payment History – ${name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #111; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 20px; margin-bottom: 8px; }
    .org-name { font-size: 22px; font-weight: 700; }
    .org-sub { font-size: 13px; color: #888; margin-top: 2px; }
    .divider { height: 3px; background: #b22222; margin: 14px 0 20px 0; }
    .report-title { font-size: 20px; font-weight: 700; color: #b22222; margin-bottom: 4px; }
    .report-sub { font-size: 13px; color: #888; margin-bottom: 24px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 28px; }
    .sum-box { background: #f5f5f5; border-radius: 8px; padding: 14px; text-align: center; }
    .sum-num { font-size: 26px; font-weight: 700; }
    .sum-label { font-size: 12px; color: #888; margin-top: 4px; }
    .section-title { font-size: 13px; font-weight: 700; color: #b22222; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; border-left: 4px solid #b22222; padding-left: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 28px; }
    th { background: #111; color: #fff; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    th:last-child { text-align: right; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 28px; }
    .info-row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #eee; }
    .info-label { font-size: 13px; color: #888; }
    .info-value { font-size: 13px; font-weight: 500; color: #111; }
    .balance-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: ${balance > 0 ? '#fff5f5' : '#f0faf4'}; border-radius: 8px; margin-bottom: 28px; }
    .print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 20px; background: #8b1c1c; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
    .footer { text-align: center; color: #bbb; font-size: 12px; margin-top: 32px; }
    @media print { .print-btn { display: none; } body { padding: 20px; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">⬇ Print / Save PDF</button>

  <div class="header">
    ${logoHtml}
    <div><div class="org-name">KINGDOM LIVING IOWA</div><div class="org-sub">Non-Profit Recovery Community</div></div>
  </div>
  <div class="divider"></div>
  <div class="report-title">Payment History Report</div>
  <div class="report-sub">${name} &nbsp;·&nbsp; ${house} &nbsp;·&nbsp; Generated ${generatedDate}</div>

  <div class="section-title">Client Information</div>
  <div class="info-grid">
    <div class="info-row"><span class="info-label">Name</span><span class="info-value">${name}</span></div>
    <div class="info-row"><span class="info-label">House</span><span class="info-value">${house}</span></div>
    <div class="info-row"><span class="info-label">Move-In Date</span><span class="info-value">${startDate}</span></div>
    <div class="info-row"><span class="info-label">PO Name</span><span class="info-value">${client.po_name || '—'}</span></div>
  </div>

  <div class="section-title">Summary</div>
  <div class="summary">
    <div class="sum-box"><div class="sum-num" style="color:#dc2626;">${fmtAmt(totalCharged)}</div><div class="sum-label">Total Charged</div></div>
    <div class="sum-box"><div class="sum-num" style="color:#16a34a;">${fmtAmt(totalPaid)}</div><div class="sum-label">Total Paid</div></div>
    <div class="sum-box"><div class="sum-num" style="color:${balance > 0 ? '#dc2626' : '#16a34a'};">${fmtAmt(Math.abs(balance))}</div><div class="sum-label">${balance > 0 ? 'Balance Owed' : balance < 0 ? 'Credit' : 'Paid in Full'}</div></div>
  </div>

  <div class="balance-row">
    <span style="font-size:15px;font-weight:600;color:#555;">Current Balance</span>
    <span style="font-size:20px;font-weight:700;color:${balance > 0 ? '#dc2626' : '#16a34a'};">
      ${balance > 0 ? `${fmtAmt(balance)} owed` : balance < 0 ? `${fmtAmt(Math.abs(balance))} credit` : 'Paid in full ✓'}
    </span>
  </div>

  <div class="section-title">Transaction History</div>
  ${timeline.length === 0 ? '<p style="color:#888;font-size:14px;margin-bottom:20px;">No transactions on record.</p>' : `
  <table>
    <thead><tr><th>Date</th><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
    <tbody>${timelineRows}</tbody>
  </table>`}

  <div class="footer">Kingdom Living Iowa · Non-Profit Recovery Community · Generated ${generatedDate}</div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=800,height=1000');
  win.document.write(html);
  win.document.close();
}

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

function ClientPayments({ client, onPaymentChange }) {
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
  const isCredit = balance < 0;

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
    if (onPaymentChange) onPaymentChange();
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
    if (onPaymentChange) onPaymentChange();
  };

  const deleteCharge = async (id) => {
    if (!window.confirm('Delete this charge?')) return;
    await supabase.from('charges').delete().eq('id', id);
    fetchData();
    if (onPaymentChange) onPaymentChange();
  };

  const deletePayment = async (id) => {
    if (!window.confirm('Delete this payment record?')) return;
    await supabase.from('payments').delete().eq('id', id);
    fetchData();
    if (onPaymentChange) onPaymentChange();
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
            {balance > 0 ? formatCurrency(balance) : isCredit ? `Credit $${Math.abs(balance).toFixed(2)}` : 'Paid up'}
          </p>
          <p style={{ color: balance > 0 ? '#f87171' : '#4ade80', fontSize: '12px', opacity: 0.7, margin: '2px 0 0 0' }}>
            {balance > 0 ? 'Balance owed' : isCredit ? 'Credit on account' : 'No balance owed'}
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
            style={{ background: showAddCharge ? 'transparent' : 'transparent', border: '1px solid #444', color: showAddCharge ? '#aaa' : '#bbb', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
            {showAddCharge ? 'Cancel' : '+ Add Charge'}
          </button>
        )}
        {balance > 0 && (
          <button onClick={handlePayOnline} disabled={sendingLink}
            style={{ background: 'transparent', border: '1px solid #60a5fa', color: '#60a5fa', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', marginLeft: 'auto' }}>
            {sendingLink ? 'Getting link...' : '🔗 Send Pay Link'}
          </button>
        )}
        <InvoiceButton client={client} style={{ background: 'transparent', border: '1px solid #1D9E75', color: '#4ade80', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', marginLeft: balance > 0 ? '8px' : 'auto' }} />
        {hasFullAccess && (charges.length > 0 || payments.length > 0) && (
          <button onClick={() => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
              canvas.getContext('2d').drawImage(img, 0, 0);
              generatePaymentHistoryPDF(client, charges, payments, canvas.toDataURL('image/jpeg'));
            };
            img.onerror = () => generatePaymentHistoryPDF(client, charges, payments, null);
            img.src = klLogo;
          }}
            style={{ background: 'transparent', border: '1px solid #7c3aed', color: '#a78bfa', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
            📄 Export History
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

      {loading ? <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p> : (
        <>
          {/* View toggle */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
            <button onClick={() => setActiveView('charges')}
              style={{ padding: '5px 14px', borderRadius: '20px', border: '1px solid #444', background: activeView === 'charges' ? '#b22222' : 'transparent', color: activeView === 'charges' ? '#fff' : '#bbb', fontSize: '12px', cursor: 'pointer' }}>
              Charges ({charges.length})
            </button>
            <button onClick={() => setActiveView('payments')}
              style={{ padding: '5px 14px', borderRadius: '20px', border: '1px solid #444', background: activeView === 'payments' ? '#b22222' : 'transparent', color: activeView === 'payments' ? '#fff' : '#bbb', fontSize: '12px', cursor: 'pointer' }}>
              Payments ({payments.length})
            </button>
          </div>

          {/* Charges list */}
          {activeView === 'charges' && (
            charges.length === 0 ? (
              <p style={{ color: '#999', fontSize: '14px' }}>No charges yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {charges.map(c => (
                  <div key={c.id} style={{ background: '#1a1a1a', borderRadius: '8px', padding: '10px 14px', border: '1px solid #333', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>{formatCurrency(c.amount)}</span>
                        <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: '#333', color: '#bbb' }}>
                          {CHARGE_TYPE_LABELS[c.charge_type] || c.charge_type}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <span style={{ color: '#bbb', fontSize: '12px' }}>{formatDate(c.due_date)}</span>
                        <span style={{ color: '#999', fontSize: '12px' }}>· {c.description}</span>
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
              <p style={{ color: '#999', fontSize: '14px' }}>No payments recorded yet.</p>
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
                        {p.payer_name && <span style={{ fontSize: '11px', color: '#bbb' }}>{p.payer_name}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <span style={{ color: '#bbb', fontSize: '12px' }}>{formatDate(p.payment_date)}</span>
                        {p.notes && <span style={{ color: '#999', fontSize: '12px' }}>· {p.notes}</span>}
                        {p.created_by && <span style={{ color: '#bbb', fontSize: '11px' }}>· by {p.created_by}</span>}
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
              <p style={{ fontSize: '13px', color: '#999', margin: 0 }}>Payment Receipt</p>
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
                  <span style={{ fontSize: '13px', color: '#999' }}>{label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '500' }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '16px', fontWeight: '600' }}>Amount Paid</span>
              <span style={{ fontSize: '24px', fontWeight: '700', color: '#16a34a' }}>{formatCurrency(showReceipt.amount)}</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                  const canvas = document.createElement('canvas');
                  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
                  canvas.getContext('2d').drawImage(img, 0, 0);
                  generateReceiptPDF(showReceipt, client, balance, canvas.toDataURL('image/jpeg'));
                };
                img.onerror = () => generateReceiptPDF(showReceipt, client, balance, null);
                img.src = klLogo;
              }}
                style={{ flex: 1, background: '#b22222', border: 'none', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
                ⬇ Download Receipt
              </button>
              <button onClick={() => setShowReceipt(null)}
                style={{ flex: 1, background: 'transparent', border: '1px solid #ccc', color: '#999', padding: '10px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
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