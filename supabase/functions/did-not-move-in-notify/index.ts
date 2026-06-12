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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { client_name, house_name, reason } = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: settings } = await supabase
      .from('email_notification_settings')
      .select('user_id')
      .eq('notification_type', 'did_not_move_in');

    if (!settings?.length) return respond({ message: 'No recipients configured.' });

    const userIds = settings.map(s => s.user_id);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('email')
      .in('id', userIds);

    const emails = (profiles || []).map(r => r.email).filter(Boolean);
    if (!emails.length) return respond({ message: 'No valid emails found.' });

    const html = wrap(`
      <h2 style="margin:0 0 20px;font-size:20px;color:#1a1a1a;">🚫 Did Not Move In</h2>
      <p style="margin:0 0 20px;color:#555;"><strong>${client_name}</strong> was marked as Did Not Move In for <strong>${house_name}</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:13px;color:#666;width:40%;">Client</td><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:14px;color:#333;">${client_name}</td></tr>
        <tr><td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666;">House</td><td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#333;">${house_name}</td></tr>
        <tr><td style="padding:10px 12px;background:#f9f9f9;font-size:13px;color:#666;">Reason</td><td style="padding:10px 12px;background:#f9f9f9;font-size:14px;color:#333;">${reason}</td></tr>
      </table>
    `);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: emails,
        subject: `Did Not Move In — ${client_name} · ${house_name}`,
        html,
      }),
    });

    if (!res.ok) console.error('Resend error:', await res.json());

    return respond({ success: true });

  } catch (err) {
    console.error('did-not-move-in-notify error:', err);
    return respond({ error: err.message }, 500);
  }
});