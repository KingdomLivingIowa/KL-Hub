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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { house_name, issue_type, issue_location, description, submitted_by, previously_submitted } = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: settings } = await supabase
      .from('email_notification_settings')
      .select('user_id')
      .eq('notification_type', 'maintenance_request');

    if (!settings?.length) return respond({ message: 'No recipients configured.' });

    const userIds = settings.map(s => s.user_id);
    const { data: profiles } = await supabase.from('user_profiles').select('email').in('id', userIds);
    const emails = (profiles || []).map(r => r.email).filter(Boolean);
    if (!emails.length) return respond({ message: 'No valid emails found.' });

    const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#1a1a1a;padding:28px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="Kingdom Living Iowa" width="160" style="display:block;margin:0 auto 12px auto;border-radius:6px;" onerror="this.style.display='none'"/>
          <p style="margin:0;color:#b22222;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Maintenance Request</p>
        </td></tr>
        <tr><td style="background-color:#b22222;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:36px 40px;color:#333333;font-size:15px;line-height:1.7;">
          <p style="margin:0 0 20px;font-size:16px;color:#1a1a1a;font-weight:600;">New Maintenance Request Submitted</p>
          <p style="margin:0 0 6px;color:#666;font-size:13px;">${date}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin-top:16px;">
            <tr><td style="padding:10px 16px;background:#f9f9f9;font-size:12px;color:#b22222;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Request Details</td></tr>
            <tr><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;"><strong>House:</strong> ${house_name || '—'}</td></tr>
            <tr><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;"><strong>Issue Type:</strong> ${issue_type || '—'}</td></tr>
            <tr><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;"><strong>Location:</strong> ${issue_location || '—'}</td></tr>
            <tr><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;"><strong>Previously Reported:</strong> ${previously_submitted || 'No'}</td></tr>
            <tr><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;"><strong>Submitted By:</strong> ${submitted_by || '—'}</td></tr>
            <tr><td style="padding:10px 16px;"><strong>Description:</strong><br/><span style="color:#555;">${description || '—'}</span></td></tr>
          </table>
        </td></tr>
        <tr><td style="background-color:#f9f9f9;border-top:1px solid #eeeeee;padding:20px 40px;text-align:center;">
          <p style="margin:0;font-size:13px;color:#666666;font-weight:600;">Kingdom Living Iowa</p>
          <p style="margin:4px 0 0;font-size:12px;color:#999999;">This is an automated notification.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: emails, subject: `Maintenance Request — ${house_name || 'Unknown House'}`, html }),
    });

    return respond({ success: true });
  } catch (err) {
    console.error('maintenance-request-notify error:', err);
    return respond({ error: err.message }, 500);
  }
});