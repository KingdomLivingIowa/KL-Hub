import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const resendApiKey = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = 'admissions@kingdomlivingia.com';

async function sendEmail(to, subject, html) {
  if (!resendApiKey) { console.error('No RESEND_API_KEY'); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + resendApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) { const err = await res.text(); console.error('Resend error:', err); }
}

const LOGO_URL = 'https://pmvxnetpbxuzkrxitioc.supabase.co/storage/v1/object/public/assets/kingdom-living-logo.jpg';

function wrap(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1a1a1a;padding:28px 40px;text-align:center;">
              <img src="${LOGO_URL}" alt="Kingdom Living Iowa" width="160" style="display:block;margin:0 auto 12px auto;border-radius:6px;" onerror="this.style.display='none'"/>
              <p style="margin:0;color:#b22222;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Non-Profit Recovery Community</p>
            </td>
          </tr>

          <!-- Red accent bar -->
          <tr>
            <td style="background-color:#b22222;height:4px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;color:#333333;font-size:15px;line-height:1.7;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9f9f9;border-top:1px solid #eeeeee;padding:20px 40px;text-align:center;">
              <p style="margin:0 0 4px 0;font-size:13px;color:#666666;font-weight:600;">Kingdom Living Iowa</p>
              <p style="margin:0 0 4px 0;font-size:12px;color:#999999;">Rise Recovery Center · 3120 SW 9th St. · Des Moines, IA 50009</p>
              <p style="margin:8px 0 0 0;font-size:12px;color:#999999;">
                <a href="https://www.kingdomlivingia.com" style="color:#b22222;text-decoration:none;">www.kingdomlivingia.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const respond = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { type, email, correspondence_contact, full_name, flag, balance } = await req.json();
    const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim());
    const recipients = [...new Set([email, correspondence_contact].filter(e => e && isValidEmail(e)))];

    if (type === 'denied_manual' || type === 'denied_disability') {
      if (flag?.includes('disability_review') && !flag?.includes('past_balance')) {
        // Disability-only denial
        await sendEmail(recipients, 'Kingdom Living Iowa — Application Decision', wrap(
          `<p>Thank you for your interest in Kingdom Living and for taking the time to complete an application with us. After reviewing your responses, we are unfortunately unable to move forward with your application at this time.</p>
          <p>Based on your responses of "yes" to the questions "Do you have serious difficulty walking or climbing stairs?" and "Do you have difficulty dressing or bathing?", we are unable to accommodate these needs within our current housing environment. Our homes are not equipped to provide accessibility features or assistance with activities of daily living, and we want to ensure that all residents are placed in housing that can safely meet their needs.</p>
          <p>We appreciate your understanding and wish you the very best moving forward.</p>`
        ));
      } else {
        // Generic manual denial (covers past_balance denial, multi-flag denial, etc.)
        await sendEmail(recipients, 'Kingdom Living Iowa — Application Decision', wrap(
          `<p>Thank you for your interest in Kingdom Living Iowa. After reviewing your application, we regret to inform you that we are unable to move forward at this time.</p>
          <p>We wish you all the best in your journey ahead.</p>`
        ));
      }
    }

    if (type === 'accepted_manual') {
      if (flag?.includes('past_balance') && balance) {
        // Accepted with outstanding balance — send balance payment email
        await sendEmail(recipients, `Kingdom Living Iowa — Application Update: ${full_name}`, wrap(
          `<p>Thank you for submitting your application. Before I can add you to the waiting list, your outstanding balance of <strong>$${parseFloat(balance).toFixed(2)}</strong> will need to be paid in full.</p>
          <p>You have the following payment options:</p>
          <ol>
            <li><strong>Mail a Check:</strong><br/>Payable to Kingdom Living IA<br/>Address: Rise Recovery Center, 3120 SW 9th St., Des Moines, IA 50009</li>
            <li><strong>Online Payment:</strong><br/>Use the Donate button on our website: <a href="https://www.kingdomlivingia.com">www.kingdomlivingia.com</a><br/>Be sure to include your name and indicate that the payment is for your outstanding balance in the notes section.</li>
            <li><strong>In-Person Payment:</strong><br/>Payments can be made on Thursdays at 6 PM at Rise Recovery Center.</li>
          </ol>
          <p>Please let me know once the payment has been made or if you have any questions. I appreciate your prompt attention to this matter.</p>`
        ));
      } else {
        const middleParagraph = current_situation === 'Currently Incarcerated'
          ? `<p>Once you receive confirmation of <strong>${full_name}</strong>'s parole, please let me know so that I can add them to the waiting list. This will allow us to prepare for their potential move-in once a spot becomes available.</p>`
          : `<p>Currently, we are at full capacity; however, we would like to know when <strong>${full_name}</strong> would be ready to move in once a spot becomes available. Please provide an estimated move-in date, and we will keep you informed as soon as an opening arises.</p>`;
        await sendEmail(recipients, `Kingdom Living Iowa — Application Accepted: ${full_name}`, wrap(
          `<p>I am pleased to inform you that <strong>${full_name}</strong>'s application has been accepted into our program at Kingdom Living Iowa.</p>
          ${middleParagraph}
          <p>If you have any questions or need further assistance, please don't hesitate to reach out.</p>`
        ));
      }
    }

    return respond({ success: true });
  } catch (err) {
    console.error('send-application-email error:', err);
    return respond({ error: err.message }, 500);
  }
});