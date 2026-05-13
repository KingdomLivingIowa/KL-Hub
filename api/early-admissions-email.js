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
    // Get recipients
    const { data: settings } = await supabase
      .from('email_notification_settings')
      .select('user_id')
      .eq('notification_type', 'early_admissions');

    if (!settings?.length) {
      return res.status(200).json({ message: 'No recipients configured for early_admissions.' });
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

    // Get clients marked as early admission in the past 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoff = sevenDaysAgo.toISOString().split('T')[0];

    const { data: clients } = await supabase
      .from('clients')
      .select('id, full_name, start_date, house_id, houses(name), program_type, application_type, early_admission_notes')
      .eq('early_admission', true)
      .gte('start_date', cutoff)
      .order('start_date', { ascending: false });

    if (!clients?.length) {
      return res.status(200).json({ message: 'No early admissions in the past 7 days.' });
    }

    // Group by house
    const byHouse = {};
    clients.forEach(c => {
      const houseName = c.houses?.name || 'Unknown House';
      if (!byHouse[houseName]) byHouse[houseName] = [];
      byHouse[houseName].push(c);
    });

    const houseBlocks = Object.entries(byHouse).map(([house, clients]) => `
      <div style="margin-bottom:24px;">
        <div style="background:#f5f5f5;border-left:4px solid #b22222;padding:10px 14px;border-radius:4px;margin-bottom:10px;">
          <strong style="color:#1a1a1a;font-size:15px;">🏠 ${house}</strong>
          <span style="color:#666;font-size:13px;margin-left:8px;">${clients.length} early admission${clients.length !== 1 ? 's' : ''}</span>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr style="background:#f9f9f9;">
            <th style="text-align:left;padding:8px 12px;font-size:12px;color:#666;border-bottom:1px solid #eee;">Client</th>
            <th style="text-align:left;padding:8px 12px;font-size:12px;color:#666;border-bottom:1px solid #eee;">Move-in Date</th>
            <th style="text-align:left;padding:8px 12px;font-size:12px;color:#666;border-bottom:1px solid #eee;">Program</th>
            <th style="text-align:left;padding:8px 12px;font-size:12px;color:#666;border-bottom:1px solid #eee;">Notes</th>
          </tr>
          ${clients.map((c, i) => `
            <tr style="background:${i % 2 === 0 ? '#fff' : '#fafafa'};">
              <td style="padding:9px 12px;font-size:14px;color:#333;border-bottom:1px solid #f0f0f0;">${c.full_name}</td>
              <td style="padding:9px 12px;font-size:14px;color:#555;border-bottom:1px solid #f0f0f0;">${c.start_date ? new Date(c.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
              <td style="padding:9px 12px;font-size:14px;color:#555;border-bottom:1px solid #f0f0f0;">${c.application_type || c.program_type || '—'}</td>
              <td style="padding:9px 12px;font-size:14px;color:#888;font-style:italic;border-bottom:1px solid #f0f0f0;">${c.early_admission_notes || '—'}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    `).join('');

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const html = wrap(`
      <p style="margin:0 0 6px 0;font-size:13px;color:#999;">${today}</p>
      <h2 style="margin:0 0 20px 0;font-size:20px;color:#1a1a1a;">⭐ Early Admissions Report</h2>
      <p style="margin:0 0 24px 0;color:#555;">The following <strong>${clients.length} client${clients.length !== 1 ? 's' : ''}</strong> were admitted early in the past 7 days:</p>
      ${houseBlocks}
    `);

    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipients,
      subject: `Early Admissions Report — ${clients.length} client${clients.length !== 1 ? 's' : ''} this week`,
      html,
    });

    return res.status(200).json({
      success: true,
      count: clients.length,
      recipients: recipients.length,
    });

  } catch (err) {
    console.error('early-admissions-email error:', err);
    return res.status(500).json({ error: err.message });
  }
}