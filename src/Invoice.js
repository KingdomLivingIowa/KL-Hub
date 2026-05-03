import { useState } from 'react';
import { supabase } from './supabaseClient';

const KL_LOGO = '/kingdom-living-logo.jpg';

export function InvoiceButton({ client, style }) {
  const [generating, setGenerating] = useState(false);

  const generateInvoice = async () => {
    setGenerating(true);
    try {
      const [chargesRes, paymentsRes] = await Promise.all([
        supabase.from('charges').select('*').eq('client_id', client.id).order('created_at', { ascending: true }),
        supabase.from('payments').select('*').eq('client_id', client.id).order('payment_date', { ascending: true }),
      ]);

      const charges = chargesRes.data || [];
      const payments = paymentsRes.data || [];
      const totalCharged = charges.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
      const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
      const balance = totalCharged - totalPaid;

      const fmt = (n) => '$' + parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice – ${client.full_name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #111; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 20px; margin-bottom: 8px; }
    .header img { width: 80px; height: 80px; object-fit: contain; }
    .org-name { font-size: 26px; font-weight: 700; color: #111; }
    .org-sub { font-size: 14px; color: #888; margin-top: 2px; }
    .divider { height: 3px; background: #b22222; margin: 16px 0; }
    .invoice-title { font-size: 20px; font-weight: 700; color: #b22222; margin-bottom: 16px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 28px; background: #f9f9f9; padding: 16px; border-radius: 8px; }
    .meta-item label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 3px; }
    .meta-item span { font-size: 15px; font-weight: 600; color: #111; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #111; color: #fff; padding: 10px 12px; text-align: left; font-size: 13px; }
    td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 14px; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .section-title { font-size: 15px; font-weight: 700; color: #111; margin: 24px 0 10px; border-left: 4px solid #b22222; padding-left: 10px; }
    .summary { background: #111; color: #fff; border-radius: 8px; padding: 16px 20px; margin-top: 24px; }
    .summary-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 15px; }
    .summary-row.balance { font-size: 20px; font-weight: 700; border-top: 1px solid #444; margin-top: 8px; padding-top: 10px; color: ${balance > 0 ? '#ef4444' : '#4ade80'}; }
    .footer { margin-top: 32px; text-align: center; color: #aaa; font-size: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${window.location.origin}${KL_LOGO}" onerror="this.style.display='none'" />
    <div>
      <div class="org-name">Kingdom Living Iowa</div>
      <div class="org-sub">Non-Profit Recovery Community</div>
    </div>
  </div>
  <div class="divider"></div>

  <div class="invoice-title">Account Statement</div>

  <div class="meta">
    <div class="meta-item"><label>Client</label><span>${client.full_name}</span></div>
    <div class="meta-item"><label>House</label><span>${client.house_name || '—'}</span></div>
    <div class="meta-item"><label>Move-In Date</label><span>${fmtDate(client.start_date)}</span></div>
    <div class="meta-item"><label>Statement Date</label><span>${fmtDate(new Date().toISOString())}</span></div>
  </div>

  <div class="section-title">Charges</div>
  ${charges.length === 0 ? '<p style="color:#888;font-size:14px;margin-bottom:16px">No charges on record.</p>' : `
  <table>
    <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      ${charges.map(c => `<tr><td>${fmtDate(c.created_at)}</td><td>${c.description || c.charge_type || 'Charge'}</td><td style="text-align:right">${fmt(c.amount)}</td></tr>`).join('')}
    </tbody>
  </table>`}

  <div class="section-title">Payments</div>
  ${payments.length === 0 ? '<p style="color:#888;font-size:14px;margin-bottom:16px">No payments on record.</p>' : `
  <table>
    <thead><tr><th>Date</th><th>Method</th><th>Note</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      ${payments.map(p => `<tr><td>${fmtDate(p.payment_date)}</td><td>${p.payment_method || '—'}</td><td>${p.notes || '—'}</td><td style="text-align:right">${fmt(p.amount)}</td></tr>`).join('')}
    </tbody>
  </table>`}

  <div class="summary">
    <div class="summary-row"><span>Total Charged</span><span>${fmt(totalCharged)}</span></div>
    <div class="summary-row"><span>Total Paid</span><span>${fmt(totalPaid)}</span></div>
    <div class="summary-row balance"><span>Current Balance</span><span>${fmt(balance)}</span></div>
  </div>

  <div class="footer">Kingdom Living Iowa · Non-Profit Recovery Community<br>Generated ${new Date().toLocaleString()}</div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

      const win = window.open('', '_blank');
      win.document.write(html);
      win.document.close();
    } catch (err) {
      alert('Error generating invoice: ' + err.message);
    }
    setGenerating(false);
  };

  return (
    <button onClick={generateInvoice} disabled={generating} style={style}>
      {generating ? '...' : '🧾 Invoice'}
    </button>
  );
}