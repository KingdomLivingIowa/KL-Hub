import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const FROM_EMAIL = 'admissions@kingdomlivingia.com';
const LOGO_URL = 'https://pmvxnetpbxuzkrxitioc.supabase.co/storage/v1/object/public/assets/kingdom-living-logo.jpg';

function decodeJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { client_name, house_id, departure, return_dt, reason } = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get house name
    const { data: house } = await supabase.from('houses').select('name').eq('id', house_id).single();
    const houseName = house?.name || 'Unknown House';

    const fmtDate = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
    const submitted = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

    // Get recipients from email notification settings only
    const { data: settingsRows } = await supabase.from('email_notification_settings')
      .select('user_id').eq('notification_type', 'overnight_pass_request');
    const allIds = [...new Set((settingsRows || []).map(r => r.user_id))];

    // Send in-app notifications
    if (allIds.length) {
      await supabase.from('notifications').insert(
        allIds.map(userId => ({
          user_id: userId,
          type: 'overnight_request',
          message: `${client_name} submitted an overnight pass request (${houseName}) — ${fmtDate(departure)}`,
          read: false,
        }))
      );
    }

    // Get emails for notifications
    if (allIds.length) {
      const { data: profiles } = await supabase.from('user_profiles').select('email').in('id', allIds);
      const emails = (profiles || []).map(p => p.email).filter(Boolean);

      if (emails.length) {
        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#1a1a1a;padding:28px 40px;text-align:center;">
          <img src="${LOGO_URL}" width="160" style="display:block;margin:0 auto 12px;border-radius:6px;" onerror="this.style.display='none'"/>
          <p style="margin:0;color:#b22222;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Overnight Pass Request</p>
        </td></tr>
        <tr><td style="background:#b22222;height:4px;">&nbsp;</td></tr>
        <tr><td style="padding:36px 40px;color:#333;font-size:15px;line-height:1.7;">
          <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;font-weight:600;">New Overnight Pass Request</p>
          <p style="margin:0 0 6px;color:#666;font-size:13px;">${submitted}</p>
          <table width="100%" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin-top:16px;">
            <tr><td colspan="2" style="padding:10px 16px;background:#f9f9f9;font-size:12px;color:#b22222;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Request Details</td></tr>
            <tr><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;color:#666;">Resident</td><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:500;">${client_name}</td></tr>
            <tr><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;color:#666;">House</td><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:500;">${houseName}</td></tr>
            <tr><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;color:#666;">Departure</td><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:500;">${fmtDate(departure)}</td></tr>
            <tr><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;color:#666;">Return</td><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:500;">${fmtDate(return_dt)}</td></tr>
            <tr><td style="padding:10px 16px;color:#666;">Reason</td><td style="padding:10px 16px;font-weight:500;">${reason || '—'}</td></tr>
          </table>
          <p style="margin:20px 0 0;color:#888;font-size:13px;">Log in to KL Hub to review and approve or deny this request.</p>
        </td></tr>
        <tr><td style="background:#f9f9f9;border-top:1px solid #eee;padding:20px 40px;text-align:center;">
          <p style="margin:0;font-size:13px;color:#666;font-weight:600;">Kingdom Living Iowa</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM_EMAIL, to: emails, subject: `Overnight Pass Request — ${client_name} (${houseName})`, html }),
        });
      }
    }

    return respond({ success: true });
  } catch (err) {
    console.error('overnight-request-notify error:', err);
    return respond({ error: err.message }, 500);
  }
});