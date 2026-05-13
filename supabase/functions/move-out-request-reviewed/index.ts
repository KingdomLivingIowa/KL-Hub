import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const FROM_EMAIL = 'admissions@kingdomlivingia.com';
const LOGO_URL = 'https://pmvxnetpbxuzkrxitioc.supabase.co/storage/v1/object/public/assets/kingdom-living-logo.jpg';

function wrap(body) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#1a1a1a;padding:28px 40px;text-align:center;">
          <img src="${LOGO_URL}" width="160" style="display:block;margin:0 auto 12px;border-radius:6px;" onerror="this.style.display='none'"/>
          <p style="margin:0;color:#b22222;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Staff Notification</p>
        </td></tr>
        <tr><td style="background:#b22222;height:4px;">&nbsp;</td></tr>
        <tr><td style="padding:36px 40px;color:#333;font-size:15px;line-height:1.7;">${body}</td></tr>
        <tr><td style="background:#f9f9f9;border-top:1px solid #eee;padding:20px 40px;text-align:center;">
          <p style="margin:0;font-size:13px;color:#666;font-weight:600;">Kingdom Living Iowa</p>
          <p style="margin:4px 0 0;font-size:12px;color:#999;">This is an automated staff notification.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) console.error('Resend error:', await res.json());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { client_id, house_id, client_name, house_name, action, review_notes, move_out_date } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const isApproved = action === 'approved';
    const actionLabel = isApproved ? 'Approved' : 'Denied';
    const actionColor = isApproved ? '#4ade80' : '#f87171';
    const formattedDate = move_out_date
      ? new Date(move_out_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'Not specified';

    // Get recipients from email_notification_settings
    const { data: settings } = await supabase
      .from('email_notification_settings')
      .select('user_id')
      .eq('notification_type', 'move_out_request');

    const recipientIds = (settings || []).map(s => s.user_id);
    const { data: emailRecipients } = recipientIds.length
      ? await supabase.from('user_profiles').select('id, email').in('id', recipientIds)
      : { data: [] };

    // Get all admins + upper management for in-app notifications
    const { data: admins } = await supabase
      .from('user_profiles')
      .select('id, email')
      .in('role', ['admin', 'upper_management']);

    // Get house managers
    const { data: assignments } = await supabase
      .from('user_house_assignments')
      .select('user_id')
      .eq('house_id', house_id);

    const houseManagerIds = (assignments || []).map(a => a.user_id);
    const { data: houseManagers } = houseManagerIds.length
      ? await supabase.from('user_profiles').select('id, email').in('id', houseManagerIds).in('role', ['house_manager', 'head_house_manager'])
      : { data: [] };

    // Combine email recipients: those in settings + house managers
    const settingsEmails = (emailRecipients || []).map(p => p.email).filter(Boolean);
    const houseManagerEmails = (houseManagers || []).map(p => p.email).filter(Boolean);
    const allEmails = [...new Set([...settingsEmails, ...houseManagerEmails])];

    // In-app: all admins + upper management + house managers
    const adminIds = (admins || []).map(p => p.id);
    const houseManagerIds2 = (houseManagers || []).map(p => p.id);
    const allIds = [...new Set([...adminIds, ...houseManagerIds2])];

    const emailHtml = wrap(`
      <h2 style="margin:0 0 20px;font-size:20px;color:#1a1a1a;">🚪 Move-Out Request ${actionLabel}</h2>
      <p style="margin:0 0 16px;color:#555;">The move-out request from <strong>${client_name}</strong> at <strong>${house_name}</strong> has been <strong style="color:${actionColor};">${actionLabel.toLowerCase()}</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:13px;color:#666;width:40%;">Client</td><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:14px;color:#333;">${client_name}</td></tr>
        <tr><td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666;">House</td><td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#333;">${house_name}</td></tr>
        <tr><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:13px;color:#666;">Requested Move-Out Date</td><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:14px;color:#333;">${formattedDate}</td></tr>
        <tr><td style="padding:10px 12px;font-size:13px;color:#666;">Decision</td><td style="padding:10px 12px;font-size:14px;font-weight:600;color:${actionColor};">${actionLabel}</td></tr>
        ${review_notes ? `<tr><td style="padding:10px 12px;background:#f9f9f9;font-size:13px;color:#666;">Notes</td><td style="padding:10px 12px;background:#f9f9f9;font-size:14px;color:#333;font-style:italic;">${review_notes}</td></tr>` : ''}
      </table>
    `);

    // Send email to all
    if (allEmails.length) {
      await sendEmail(allEmails, `Move-Out Request ${actionLabel} — ${client_name} · ${house_name}`, emailHtml);
    }

    // In-app notification for all
    if (allIds.length) {
      await supabase.from('notifications').insert(
        allIds.map(id => ({
          user_id: id,
          type: 'move_out_request',
          message: `Move-out request for ${client_name} (${house_name}) has been ${actionLabel.toLowerCase()}${review_notes ? `: "${review_notes}"` : '.'}`,
          client_id: client_id,
          house_id: house_id,
          read: false,
        }))
      );
    }

    return respond({ success: true });

  } catch (err) {
    console.error('move-out-request-reviewed error:', err);
    return respond({ error: err.message }, 500);
  }
});