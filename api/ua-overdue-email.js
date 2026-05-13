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
      .eq('notification_type', 'ua_overdue');

    if (!settings?.length) {
      return res.status(200).json({ message: 'No recipients configured for ua_overdue.' });
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

    // Get all active clients with their house and last UA date
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString();

    const { data: clients } = await supabase
      .from('clients')
      .select('id, full_name, house_id, houses(name)')
      .eq('status', 'Active')
      .not('house_id', 'is', null);

    if (!clients?.length) {
      return res.status(200).json({ message: 'No active clients found.' });
    }

    // Get most recent UA for each client
    const clientIds = clients.map(c => c.id);
    const { data: recentUAs } = await supabase
      .from('client_timeline')
      .select('client_id, created_at')
      .eq('entry_type', 'UA')
      .in('client_id', clientIds)
      .order('created_at', { ascending: false });

    // Map most recent UA per client
    const lastUAMap = {};
    (recentUAs || []).forEach(ua => {
      if (!lastUAMap[ua.client_id]) {
        lastUAMap[ua.client_id] = ua.created_at;
      }
    });

    // Find clients overdue (no UA in 30 days or never had one)
    const overdueClients = clients.filter(c => {
      const lastUA = lastUAMap[c.id];
      if (!lastUA) return true; // never had a UA
      return new Date(lastUA) < new Date(cutoff);
    });

    if (!overdueClients.length) {
      return res.status(200).json({ message: 'No clients overdue for UA.' });
    }

    // Group by house
    const byHouse = {};
    overdueClients.forEach(c => {
      const houseName = c.houses?.name || 'Unknown House';
      if (!byHouse[houseName]) byHouse[houseName] = [];
      byHouse[houseName].push({
        name: c.full_name,
        lastUA: lastUAMap[c.id]
          ? new Date(lastUAMap[c.id]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'Never',
      });
    });

    // Build email body
    const houseBlocks = Object.entries(byHouse).map(([house, clients]) => `
      <div style="margin-bottom:24px;">
        <div style="background:#f5f5f5;border-left:4px solid #b22222;padding:10px 14px;border-radius:4px;margin-bottom:10px;">
          <strong style="color:#1a1a1a;font-size:15px;">🏠 ${house}</strong>
          <span style="color:#666;font-size:13px;margin-left:8px;">${clients.length} client${clients.length !== 1 ? 's' : ''} overdue</span>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr style="background:#f9f9f9;">
            <th style="text-align:left;padding:8px 12px;font-size:12px;color:#666;border-bottom:1px solid #eee;">Client</th>
            <th style="text-align:left;padding:8px 12px;font-size:12px;color:#666;border-bottom:1px solid #eee;">Last UA</th>
          </tr>
          ${clients.map((c, i) => `
            <tr style="background:${i % 2 === 0 ? '#fff' : '#fafafa'};">
              <td style="padding:9px 12px;font-size:14px;color:#333;border-bottom:1px solid #f0f0f0;">${c.name}</td>
              <td style="padding:9px 12px;font-size:14px;color:${c.lastUA === 'Never' ? '#b22222' : '#e07b00'};font-weight:500;border-bottom:1px solid #f0f0f0;">${c.lastUA}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    `).join('');

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const html = wrap(`
      <p style="margin:0 0 6px 0;font-size:13px;color:#999;">${today}</p>
      <h2 style="margin:0 0 20px 0;font-size:20px;color:#1a1a1a;">🧪 UA Overdue Report</h2>
      <p style="margin:0 0 24px 0;color:#555;">The following <strong>${overdueClients.length} client${overdueClients.length !== 1 ? 's' : ''}</strong> have not had a UA recorded in the past 30 days:</p>
      ${houseBlocks}
      <p style="color:#888;font-size:13px;margin-top:24px;">Please schedule UAs for these clients as soon as possible.</p>
    `);

    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipients,
      subject: `UA Overdue Report — ${overdueClients.length} client${overdueClients.length !== 1 ? 's' : ''} need attention`,
      html,
    });

    return res.status(200).json({
      success: true,
      overdueCount: overdueClients.length,
      recipients: recipients.length,
    });

  } catch (err) {
    console.error('ua-overdue-email error:', err);
    return res.status(500).json({ error: err.message });
  }
}