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

const severityColor = (s) => {
  if (s === 'Serious') return '#dc2626';
  if (s === 'Major') return '#f97316';
  return '#eab308';
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get recipients
    const { data: settings } = await supabase
      .from('email_notification_settings')
      .select('user_id')
      .eq('notification_type', 'infractions');

    if (!settings?.length) {
      return res.status(200).json({ message: 'No recipients configured for infractions.' });
    }

    const userIds = settings.map(s => s.user_id);
    const { data: staffProfiles } = await supabase
      .from('user_profiles')
      .select('email')
      .in('id', userIds);

    const recipients = (staffProfiles || []).map(s => s.email).filter(Boolean);
    if (!recipients.length) {
      return res.status(200).json({ message: 'No valid recipient emails found.' });
    }

    // Get infraction entries from the past 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: infractions } = await supabase
      .from('client_timeline')
      .select('id, client_id, notes, severity, author, created_at, clients(full_name, house_id, houses(name))')
      .eq('entry_type', 'Infraction')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    if (!infractions?.length) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: recipients,
        subject: 'Not Following the Rules — No infractions this week',
        html: wrap(`
          <p style="margin:0 0 6px 0;font-size:13px;color:#999;">${today}</p>
          <h2 style="margin:0 0 20px 0;font-size:20px;color:#1a1a1a;">⚠️ Not Following the Rules</h2>
          <p style="color:#555;">No infractions were recorded in the past 7 days. Great week!</p>
        `),
      });
      return res.status(200).json({ message: 'No infractions this week — notification sent.' });
    }

    // Group by house
    const byHouse = {};
    infractions.forEach(i => {
      const houseName = i.clients?.houses?.name || 'Unknown House';
      if (!byHouse[houseName]) byHouse[houseName] = [];
      byHouse[houseName].push(i);
    });

    const houseBlocks = Object.entries(byHouse).map(([house, entries]) => `
      <div style="margin-bottom:24px;">
        <div style="background:#f5f5f5;border-left:4px solid #dc2626;padding:10px 14px;border-radius:4px;margin-bottom:10px;">
          <strong style="color:#1a1a1a;font-size:15px;">🏠 ${house}</strong>
          <span style="color:#666;font-size:13px;margin-left:8px;">${entries.length} infraction${entries.length !== 1 ? 's' : ''}</span>
        </div>
        ${entries.map(e => `
          <div style="background:#fff8f8;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <strong style="color:#1a1a1a;font-size:14px;">${e.clients?.full_name || 'Unknown Client'}</strong>
              <div style="display:flex;gap:8px;align-items:center;">
                ${e.severity ? `<span style="background:${severityColor(e.severity)}22;color:${severityColor(e.severity)};font-size:12px;font-weight:600;padding:2px 8px;border-radius:12px;border:1px solid ${severityColor(e.severity)}44;">${e.severity}</span>` : ''}
                <span style="color:#999;font-size:12px;">${new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>
            ${e.notes ? `<p style="margin:0 0 4px 0;color:#555;font-size:13px;">${e.notes}</p>` : ''}
            ${e.author ? `<p style="margin:0;color:#999;font-size:12px;">Logged by: ${e.author}</p>` : ''}
          </div>
        `).join('')}
      </div>
    `).join('');

    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipients,
      subject: `Not Following the Rules — ${infractions.length} infraction${infractions.length !== 1 ? 's' : ''} this week`,
      html: wrap(`
        <p style="margin:0 0 6px 0;font-size:13px;color:#999;">${today}</p>
        <h2 style="margin:0 0 20px 0;font-size:20px;color:#1a1a1a;">⚠️ Not Following the Rules</h2>
        <p style="margin:0 0 24px 0;color:#555;">The following <strong>${infractions.length} infraction${infractions.length !== 1 ? 's' : ''}</strong> were recorded in the past 7 days:</p>
        ${houseBlocks}
      `),
    });

    return res.status(200).json({
      success: true,
      count: infractions.length,
      recipients: recipients.length,
    });

  } catch (err) {
    console.error('infractions-email error:', err);
    return res.status(500).json({ error: err.message });
  }
}