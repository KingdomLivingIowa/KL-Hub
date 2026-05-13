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

function wrap(body) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;line-height:1.6;">${body}<br/><br/><hr style="border:none;border-top:1px solid #eee;"/><p style="font-size:12px;color:#999;">Kingdom Living Iowa · Non-Profit Recovery Community</p></body></html>`;
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
      // Disability denial
      if (flag === 'disability_review') {
        await sendEmail(recipients, 'Kingdom Living Iowa — Application Decision', wrap(
          `<p>Thank you for your interest in Kingdom Living and for taking the time to complete an application with us. After reviewing your responses, we are unfortunately unable to move forward with your application at this time.</p>
          <p>Based on your responses of "yes" to the questions "Do you have serious difficulty walking or climbing stairs?" and "Do you have difficulty dressing or bathing?", we are unable to accommodate these needs within our current housing environment. Our homes are not equipped to provide accessibility features or assistance with activities of daily living, and we want to ensure that all residents are placed in housing that can safely meet their needs.</p>
          <p>We appreciate your understanding and wish you the very best moving forward.</p>`
        ));
      } else {
        // Generic manual denial
        await sendEmail(recipients, 'Kingdom Living Iowa — Application Decision', wrap(
          `<p>Thank you for your interest in Kingdom Living Iowa. After reviewing your application, we regret to inform you that we are unable to move forward at this time.</p>
          <p>We wish you all the best in your journey ahead.</p>`
        ));
      }
    }

    if (type === 'accepted_manual') {
      if (flag === 'past_balance' && balance) {
        // Accepted with outstanding balance — send balance payment email
        await sendEmail(recipients, 'Kingdom Living Iowa — Application Update', wrap(
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
        await sendEmail(recipients, 'Kingdom Living Iowa — Application Accepted', wrap(
          `<p>I am pleased to inform you that <strong>${full_name}</strong>'s application has been accepted into our program at Kingdom Living Iowa.</p>
          <p>Currently, we are at full capacity; however, we would like to know when <strong>${full_name}</strong> would be ready to move in once a spot becomes available. Please provide an estimated move-in date, and we will keep you informed as soon as an opening arises.</p>
          <p>Once you receive confirmation of <strong>${full_name}</strong>'s parole, please let me know so that I can add them to the waiting list. This will allow us to prepare for their potential move-in once a spot becomes available.</p>
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