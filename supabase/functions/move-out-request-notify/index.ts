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
    const {
      client_id, house_id, client_name, move_out_date,
      requirements_completed, all_requirements_met,
      po_name, po_phone, moving_to, change_of_address,
      continuing_level_4, liked, disliked, other_notes, marketing_permission
    } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const formattedDate = move_out_date
      ? new Date(move_out_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'Not specified';

    const LEVEL_REQS = [
      'Completed Thursday Night Alive Sessions', '90 days in house residency',
      'Employed (min. 30 hours/week)', 'Sponsor (min. 4 contacts/week)',
      'Attend 4 AA or NA meetings per week', 'Sunday morning house meeting',
      'Participate in weekly house dinner', 'Zero balance',
      'Complete Step 9 with a sponsor', 'Must have a service position in your home group',
    ];

    const reqRows = LEVEL_REQS.map(r => {
      const done = (requirements_completed || []).includes(r);
      return `<tr><td style="padding:7px 12px;border-bottom:1px solid #eee;font-size:13px;color:#555;">${r}</td><td style="padding:7px 12px;border-bottom:1px solid #eee;font-size:13px;font-weight:600;color:${done ? '#16a34a' : '#dc2626'};">${done ? '✓ Yes' : '○ No'}</td></tr>`;
    }).join('');

    // ── Get recipients from email_notification_settings ───────────────────────
    const { data: settings } = await supabase
      .from('email_notification_settings')
      .select('user_id')
      .eq('notification_type', 'move_out_request');

    const recipientIds = (settings || []).map(s => s.user_id);
    const { data: emailRecipients } = recipientIds.length
      ? await supabase.from('user_profiles').select('id, email').in('id', recipientIds)
      : { data: [] };

    // ── Get admin + upper management for in-app notifications ─────────────────
    const { data: admins } = await supabase
      .from('user_profiles')
      .select('id, email, full_name')
      .in('role', ['admin', 'upper_management']);

    // ── Get house managers for this house ─────────────────────────────────────
    const { data: assignments } = await supabase
      .from('user_house_assignments')
      .select('user_id')
      .eq('house_id', house_id);

    const houseManagerIds = (assignments || []).map(a => a.user_id);
    const { data: houseManagers } = houseManagerIds.length
      ? await supabase.from('user_profiles').select('id, email, full_name').in('id', houseManagerIds).in('role', ['house_manager', 'head_house_manager'])
      : { data: [] };

    // ── Get house name ────────────────────────────────────────────────────────
    const { data: house } = await supabase.from('houses').select('name').eq('id', house_id).single();
    const houseName = house?.name || 'Unknown House';

    const emailHtml = wrap(`
      <h2 style="margin:0 0 20px;font-size:20px;color:#1a1a1a;">🚪 Move-Out Request Submitted</h2>
      <p style="margin:0 0 20px;color:#555;"><strong>${client_name}</strong> from <strong>${houseName}</strong> has submitted a move-out request.</p>

      <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Basic Info</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;border:1px solid #eee;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:13px;color:#666;width:45%;">Client</td><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:14px;color:#333;">${client_name}</td></tr>
        <tr><td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666;">House</td><td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#333;">${houseName}</td></tr>
        <tr><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:13px;color:#666;">Requested Move-Out Date</td><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:14px;color:#b22222;font-weight:600;">${formattedDate}</td></tr>
        <tr><td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666;">Moving To</td><td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#333;">${moving_to || '—'}</td></tr>
        <tr><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:13px;color:#666;">All Requirements Met?</td><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:14px;font-weight:600;color:${all_requirements_met === 'Yes' ? '#16a34a' : '#dc2626'};">${all_requirements_met || '—'}</td></tr>
        <tr><td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666;">PO Name</td><td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#333;">${po_name || '—'}</td></tr>
        <tr><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:13px;color:#666;">PO Phone</td><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:14px;color:#333;">${po_phone || '—'}</td></tr>
        <tr><td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666;">Change of Address Filed?</td><td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#333;">${change_of_address || '—'}</td></tr>
        <tr><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:13px;color:#666;">Continuing Level 4?</td><td style="padding:10px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-size:14px;color:#333;">${continuing_level_4 || '—'}</td></tr>
        <tr><td style="padding:10px 12px;font-size:13px;color:#666;">Marketing Permission?</td><td style="padding:10px 12px;font-size:14px;color:#333;">${marketing_permission || '—'}</td></tr>
      </table>

      <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Level Requirements Checklist</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;border:1px solid #eee;border-radius:8px;overflow:hidden;">
        ${reqRows}
      </table>

      ${liked ? `<p style="margin:0 0 6px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">What They Liked</p><p style="margin:0 0 20px;font-size:14px;color:#333;font-style:italic;padding:12px;background:#f9f9f9;border-radius:8px;">${liked}</p>` : ''}
      ${disliked ? `<p style="margin:0 0 6px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">What They Didn't Like</p><p style="margin:0 0 20px;font-size:14px;color:#333;font-style:italic;padding:12px;background:#f9f9f9;border-radius:8px;">${disliked}</p>` : ''}
      ${other_notes ? `<p style="margin:0 0 6px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Other Notes</p><p style="margin:0 0 20px;font-size:14px;color:#333;font-style:italic;padding:12px;background:#f9f9f9;border-radius:8px;">${other_notes}</p>` : ''}

      <p style="color:#888;font-size:13px;margin-top:8px;">Please log into KL Hub to approve or deny this request.</p>
    `);

    // Email only those in email_notification_settings
    const adminEmails = (emailRecipients || []).map(a => a.email).filter(Boolean);
    if (adminEmails.length) {
      await sendEmail(adminEmails, `Move-Out Request — ${client_name} · ${houseName}`, emailHtml);
    }

    // In-app notification for admins + upper management
    if (admins?.length) {
      await supabase.from('notifications').insert(
        admins.map(a => ({
          user_id: a.id,
          type: 'move_out_request',
          message: `${client_name} submitted a move-out request (${houseName}) — requested date: ${formattedDate}`,
          client_id: client_id,
          house_id: house_id,
          read: false,
        }))
      );
    }

    // In-app notification for house managers only (no email on submit)
    if (houseManagers?.length) {
      await supabase.from('notifications').insert(
        houseManagers.map(m => ({
          user_id: m.id,
          type: 'move_out_request',
          message: `${client_name} submitted a move-out request — requested date: ${formattedDate}`,
          client_id: client_id,
          house_id: house_id,
          read: false,
        }))
      );
    }

    return respond({ success: true });

  } catch (err) {
    console.error('move-out-request-notify error:', err);
    return respond({ error: err.message }, 500);
  }
});