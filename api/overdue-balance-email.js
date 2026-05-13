import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'admissions@kingdomlivingia.com';
const LOGO_URL = 'https://pmvxnetpbxuzkrxitioc.supabase.co/storage/v1/object/public/assets/kingdom-living-logo.jpg';

function wrap(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#1a1a1a;padding:28px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="Kingdom Living Iowa" width="160" style="display:block;margin:0 auto 12px auto;border-radius:6px;" onerror="this.style.display='none'"/>
          <p style="margin:0;color:#b22222;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Staff Notification</p>
        </td></tr>
        <tr><td style="background-color:#b22222;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:36px 40px;color:#333333;font-size:15px;line-height:1.7;">${body}</td></tr>
        <tr><td style="background-color:#f9f9f9;border-top:1px solid #eeeeee;padding:20px 40px;text-align:center;">
          <p style="margin:0 0 4px 0;font-size:13px;color:#666666;font-weight:600;">Kingdom Living Iowa</p>
          <p style="margin:0;font-size:12px;color:#999999;">This is an automated staff notification.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get recipients from email_notification_settings
    const { data: settings } = await supabase
      .from('email_notification_settings')
      .select('user_id')
      .eq('notification_type', 'overdue_balance');

    if (!settings?.length) {
      return res.status(200).json({ message: 'No recipients configured for overdue_balance.' });
    }

    const userIds = settings.map(s => s.user_id);
    const { data: staffProfiles } = await supabase
      .from('user_profiles')
      .select('email, full_name')
      .in('id', userIds);

    const recipients = (staffProfiles || []).map(s => s.email).filter(Boolean);
    if (!recipients.length) {
      return res.status(200).json({ message: 'No valid recipient emails found.' });
    }

    // Get active clients in a house for 30+ days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

    const { data: clients } = await supabase
      .from('clients')
      .select('id, full_name, start_date, house_id, houses(name)')
      .eq('status', 'Active')
      .not('house_id', 'is', null)
      .not('start_date', 'is', null)
      .lte('start_date', cutoff);

    if (!clients?.length) {
      return res.status(200).json({ message: 'No clients in house for 30+ days.' });
    }

    // Get charges and payments for each client
    const clientIds = clients.map(c => c.id);

    const { data: allCharges } = await supabase
      .from('charges')
      .select('client_id, amount')
      .in('client_id', clientIds);

    const { data: allPayments } = await supabase
      .from('payments')
      .select('client_id, amount')
      .in('client_id', clientIds);

    // Calculate balance per client
    const chargeMap = {};
    const paymentMap = {};
    (allCharges || []).forEach(c => {
      chargeMap[c.client_id] = (chargeMap[c.client_id] || 0) + (parseFloat(c.amount) || 0);
    });
    (allPayments || []).forEach(p => {
      paymentMap[p.client_id] = (paymentMap[p.client_id] || 0) + (parseFloat(p.amount) || 0);
    });

    // Filter to clients with outstanding balance
    const overdueClients = clients
      .map(c => ({
        ...c,
        balance: Math.max(0, (chargeMap[c.id] || 0) - (paymentMap[c.id] || 0)),
        daysInHouse: Math.floor((new Date() - new Date(c.start_date)) / (1000 * 60 * 60 * 24)),
      }))
      .filter(c => c.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    if (!overdueClients.length) {
      return res.status(200).json({ message: 'No clients with overdue balances.' });
    }

    // Group by house
    const byHouse = {};
    overdueClients.forEach(c => {
      const houseName = c.houses?.name || 'Unknown House';
      if (!byHouse[houseName]) byHouse[houseName] = [];
      byHouse[houseName].push(c);
    });

    const totalOwed = overdueClients.reduce((sum, c) => sum + c.balance, 0);

    const houseBlocks = Object.entries(byHouse).map(([house, clients]) => `
      <div style="margin-bottom:24px;">
        <div style="background:#f5f5f5;border-left:4px solid #b22222;padding:10px 14px;border-radius:4px;margin-bottom:10px;">
          <strong style="color:#1a1a1a;font-size:15px;">🏠 ${house}</strong>
          <span style="color:#666;font-size:13px;margin-left:8px;">${clients.length} client${clients.length !== 1 ? 's' : ''} with balance</span>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr style="background:#f9f9f9;">
            <th style="text-align:left;padding:8px 12px;font-size:12px;color:#666;border-bottom:1px solid #eee;">Client</th>
            <th style="text-align:left;padding:8px 12px;font-size:12px;color:#666;border-bottom:1px solid #eee;">Days in House</th>
            <th style="text-align:right;padding:8px 12px;font-size:12px;color:#666;border-bottom:1px solid #eee;">Balance Owed</th>
          </tr>
          ${clients.map((c, i) => `
            <tr style="background:${i % 2 === 0 ? '#fff' : '#fafafa'};">
              <td style="padding:9px 12px;font-size:14px;color:#333;border-bottom:1px solid #f0f0f0;">${c.full_name}</td>
              <td style="padding:9px 12px;font-size:14px;color:#555;border-bottom:1px solid #f0f0f0;">${c.daysInHouse} days</td>
              <td style="padding:9px 12px;font-size:14px;color:#b22222;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;">$${c.balance.toFixed(2)}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    `).join('');

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const html = wrap(`
      <p style="margin:0 0 6px 0;font-size:13px;color:#999;">${today}</p>
      <h2 style="margin:0 0 20px 0;font-size:20px;color:#1a1a1a;">💰 Overdue Balance Report</h2>
      <p style="margin:0 0 8px 0;color:#555;">The following <strong>${overdueClients.length} client${overdueClients.length !== 1 ? 's' : ''}</strong> have been in the house for 30+ days and still have an outstanding balance:</p>
      <p style="margin:0 0 24px 0;color:#b22222;font-weight:600;font-size:16px;">Total owed: $${totalOwed.toFixed(2)}</p>
      ${houseBlocks}
      <p style="color:#888;font-size:13px;margin-top:24px;">Please follow up with these clients regarding their outstanding balances.</p>
    `);

    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipients,
      subject: `Overdue Balance Report — ${overdueClients.length} client${overdueClients.length !== 1 ? 's' : ''} · $${totalOwed.toFixed(2)} total`,
      html,
    });

    return res.status(200).json({
      success: true,
      overdueCount: overdueClients.length,
      totalOwed: totalOwed.toFixed(2),
      recipients: recipients.length,
    });

  } catch (err) {
    console.error('overdue-balance-email error:', err);
    return res.status(500).json({ error: err.message });
  }
}