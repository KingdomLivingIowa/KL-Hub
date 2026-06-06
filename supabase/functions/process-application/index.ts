import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const resendApiKey = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = 'admissions@kingdomlivingia.com';

const LOGO_URL = 'https://pmvxnetpbxuzkrxitioc.supabase.co/storage/v1/object/public/assets/kingdom-living-logo.jpg';

function wrap(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#1a1a1a;padding:28px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="Kingdom Living Iowa" width="160" style="display:block;margin:0 auto 12px auto;border-radius:6px;" onerror="this.style.display='none'"/>
          <p style="margin:0;color:#b22222;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Non-Profit Recovery Community</p>
        </td></tr>
        <tr><td style="background-color:#b22222;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:36px 40px;color:#333333;font-size:15px;line-height:1.7;">${body}</td></tr>
        <tr><td style="background-color:#f9f9f9;border-top:1px solid #eeeeee;padding:20px 40px;text-align:center;">
          <p style="margin:0 0 4px 0;font-size:13px;color:#666666;font-weight:600;">Kingdom Living Iowa</p>
          <p style="margin:0 0 4px 0;font-size:12px;color:#999999;">Rise Recovery Center · 3120 SW 9th St. · Des Moines, IA 50009</p>
          <p style="margin:8px 0 0 0;font-size:12px;color:#999999;"><a href="https://www.kingdomlivingia.com" style="color:#b22222;text-decoration:none;">www.kingdomlivingia.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendEmail(to, subject, html) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + resendApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    const data = await res.json();
    if (!res.ok) console.error('Resend error:', data);
    return res.ok;
  } catch (err) {
    console.error('sendEmail error:', err);
    return false;
  }
}

async function notifyAdmins(supabase, message, type) {
  const { data: managers } = await supabase
    .from('user_profiles')
    .select('id')
    .in('role', ['admin', 'upper_management']);
  if (managers?.length) {
    await supabase.from('notifications').insert(
      managers.map(m => ({ user_id: m.id, type, message, read: false }))
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const respond = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { application_id } = await req.json();
    if (!application_id) return respond({ error: 'Missing application_id' }, 400);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the application
    const { data: app, error: appErr } = await supabase
      .from('applications')
      .select('*')
      .eq('id', application_id)
      .single();
    if (appErr || !app) return respond({ error: 'Application not found' }, 404);

    const fullName = `${app.first_name || ''} ${app.last_name || ''}`.trim();
    const email = app.email;
    const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim());

    // Notify new_application recipients
    const { data: newAppRecipients } = await supabase
      .from('email_notification_settings')
      .select('user_id').eq('notification_type', 'new_application');
    const newAppUserIds = (newAppRecipients || []).map(r => r.user_id);
    if (newAppUserIds.length) {
      const { data: recipientProfiles } = await supabase
        .from('user_profiles').select('email').in('id', newAppUserIds);
      const recipientEmails = (recipientProfiles || []).map(p => p.email).filter(Boolean);
      if (recipientEmails.length) {
        const submitted = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: recipientEmails,
            subject: `New Application — ${fullName}`,
            html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:30px;">
              <table width="600" style="background:#fff;border-radius:10px;padding:32px;margin:0 auto;">
                <tr><td style="background:#1a1a1a;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
                  <p style="margin:0;color:#b22222;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">New Application Received</p>
                </td></tr>
                <tr><td style="background:#b22222;height:4px;"></td></tr>
                <tr><td style="padding:28px;">
                  <p style="font-size:16px;font-weight:600;color:#1a1a1a;margin:0 0 6px;">${fullName}</p>
                  <p style="color:#888;font-size:13px;margin:0 0 20px;">${submitted}</p>
                  <table width="100%" style="border:1px solid #eee;border-radius:8px;overflow:hidden;">
                    <tr><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;color:#666;">Email</td><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;">${app.email || '—'}</td></tr>
                    <tr><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;color:#666;">Phone</td><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;">${app.phone || '—'}</td></tr>
                    <tr><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;color:#666;">Program</td><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;">${app.program || '—'}</td></tr>
                    <tr><td style="padding:10px 16px;color:#666;">Current Situation</td><td style="padding:10px 16px;">${app.current_situation || '—'}</td></tr>
                  </table>
                  <p style="margin:20px 0 0;color:#888;font-size:13px;">Log in to KL Hub to review this application.</p>
                </td></tr>
                <tr><td style="background:#f9f9f9;border-top:1px solid #eee;padding:16px;text-align:center;">
                  <p style="margin:0;font-size:13px;color:#666;font-weight:600;">Kingdom Living Iowa</p>
                </td></tr>
              </table>
            </body></html>`,
          }),
        });
      }
    }
    const recipients = [...new Set([email, app.correspondence_contact].filter(e => e && isValidEmail(e)))];

    // ── RULE 1: Sex offender → auto deny immediately, no further checks ──────
    if (app.sex_offender === 'Yes') {
      await supabase.from('applications').update({
        status: 'denied',
        auto_flag: 'sex_offender',
        flag_reason: 'Automatically denied: registered sex offender.',
        auto_processed: true,
      }).eq('id', application_id);

      if (recipients.length) {
        await sendEmail(
          recipients,
          `Kingdom Living Iowa — Application Update: ${fullName}`,
          wrap(`<p>Thank you for your interest in Kingdom Living Iowa and for taking the time to submit your application. After a thorough review, we regret to inform you that we are unable to accept your application at this time.</p>
          <p>As part of our admissions policy, we are not able to accept individuals who have been convicted of a sex crime or are listed on the sex offender registry. Unfortunately, this policy prevents us from moving forward with your application.</p>
          <p>We understand this may be disappointing, and we encourage you to seek out other programs that may better align with your needs. We wish you all the best in your journey ahead.</p>`)
        );
      }

      await notifyAdmins(supabase, `Application from ${fullName} was automatically denied (sex offender).`, 'new_application');
      return respond({ result: 'denied', reason: 'sex_offender' });
    }

    // ── RULES 2-4: Collect all flags that apply ───────────────────────────────
    const flags = [];
    const flagReasons = [];

    // Rule 2: Disability
    if (app.on_disability === 'Yes') {
      flags.push('disability_review');
      flagReasons.push('Needs review: applicant reported a disability.');
    }

    // Rule 3: Returning client — always check regardless of lived_here_before answer
    // Matching rules: SSN match alone = duplicate, name+email = duplicate,
    // name+DOB = duplicate. Email alone is NOT enough (prevents false positives).
    {
      const { data: allClients } = await supabase
        .from('clients')
        .select('id, full_name, email, date_of_birth, ssn, not_allowed_back, needs_review_before_readmit');

      const existingClients = (allClients || []).filter(c => {
        const nameMatch = c.full_name?.toLowerCase().trim() === fullName.toLowerCase().trim();
        const emailMatch = app.email && c.email?.toLowerCase() === app.email.toLowerCase();
        const dobMatch = app.date_of_birth && c.date_of_birth === app.date_of_birth;
        const ssnMatch = app.ssn && c.ssn && app.ssn === c.ssn;
        return ssnMatch || (nameMatch && emailMatch) || (nameMatch && dobMatch);
      });

      if (existingClients?.length > 0) {
        const existingClient = existingClients[0];

        // Auto-deny if not allowed back
        if (existingClient.not_allowed_back) {
          await supabase.from('applications').update({
            status: 'denied', auto_flag: 'not_allowed_back',
            flag_reason: 'Automatically denied: client is flagged as not allowed back.',
            auto_processed: true,
          }).eq('id', application_id);
          if (recipients.length) {
            await sendEmail(recipients, `Kingdom Living Iowa — Application Update: ${fullName}`, wrap(
              `<p>Thank you for your interest in Kingdom Living Iowa. After reviewing your record with us, we are unable to accept your application at this time.</p><p>If you have questions, please contact us directly.</p>`
            ));
          }
          await notifyAdmins(supabase, `Application from ${fullName} was automatically denied — flagged as not allowed back.`, 'new_application');
          return respond({ result: 'denied', reason: 'not_allowed_back' });
        }

        // Flag for upper management review if needed
        if (existingClient.needs_review_before_readmit) {
          flags.push('needs_review_before_readmit');
          flagReasons.push('Needs review by upper management before re-admitting — flagged from previous stay.');
        }

        const { data: charges } = await supabase.from('charges').select('amount').eq('client_id', existingClient.id);
        const { data: payments } = await supabase.from('payments').select('amount').eq('client_id', existingClient.id);
        const totalCharged = (charges || []).reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
        const totalPaid = (payments || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const totalPastBalance = Math.max(0, totalCharged - totalPaid);

        if (totalPastBalance > 0) {
          flags.push('past_balance');
          flagReasons.push(`Needs review: returning client with outstanding balance of $${totalPastBalance.toFixed(2)}.`);
        } else {
          flags.push('returning_merge');
          flagReasons.push(`Returning client — no past balance. Please merge with existing profile for ${existingClient.full_name}.`);
        }
      }
    }

    // If any flags, update application and notify admins
    if (flags.length > 0) {
      await supabase.from('applications').update({
        status: 'pending',
        auto_flag: flags.join(','),
        flag_reason: flagReasons.join(' | '),
        auto_processed: true,
      }).eq('id', application_id);

      for (const reason of flagReasons) {
        await notifyAdmins(supabase, `Application from ${fullName} needs review — ${reason}`, 'new_application');
      }

      return respond({ result: 'flagged', reasons: flags });
    }

    // ── RULE 4: Everything else → auto accept ─────────────────────────────────
    // Create client record
    const uniqueId =
      (app.first_name || '').slice(0, 2).toLowerCase() +
      (app.last_name || '').slice(0, 2).toLowerCase() +
      (app.date_of_birth ? app.date_of_birth.replace(/-/g, '').slice(2) : '000000');

    const clientPayload = {
      full_name: fullName,
      first_name: app.first_name || null,
      last_name: app.last_name || null,
      date_of_birth: app.date_of_birth || null,
      ssn: app.ssn || null,
      gender: app.assigned_sex || app.gender || null,
      ethnicity: app.ethnicity || null,
      marital_status: app.marital_status || null,
      unique_id: uniqueId,
      photo_url: app.photo_url || null,
      status: 'Accepted',
      level: 1,
      start_date: null,
      personal_status: app.current_situation || null,
      application_type: app.program || null,
      phone: app.phone || null,
      email: app.email || null,
      emergency_contact_name: app.emergency_contact || null,
      po_name: app.po_name || null,
      po_phone: app.po_phone || null,
      on_probation: app.on_probation || null,
      on_parole: app.on_parole || null,
      sex_offender: app.sex_offender || null,
      criminal_history: app.criminal_history || null,
      substance_history: app.substance_history || null,
      treatment_history: app.attended_treatment || null,
      recovery_meetings: app.recovery_meetings || null,
      oud: app.oud_diagnosis || null,
      application_id: app.id,
      medication_details: app.medication_details || null,
      drug_of_choice: app.drug_of_choice || null,
      sponsor_name: app.sponsor_name || null,
      sponsor_phone: app.sponsor_phone || null,
    };

    // Check if client already exists for this application
    const { data: existingForApp } = await supabase
      .from('clients')
      .select('id')
      .eq('application_id', app.id)
      .maybeSingle();

    if (!existingForApp) {
      await supabase.from('clients').insert([clientPayload]);
    }

    await supabase.from('applications').update({
      status: 'accepted',
      auto_flag: null,
      flag_reason: null,
      auto_processed: true,
    }).eq('id', application_id);

    // Send acceptance email
    if (recipients.length) {
      const middleParagraph = app.current_situation === 'Currently Incarcerated'
        ? `<p>Once you receive confirmation of <strong>${fullName}</strong>'s parole, please let me know so that I can add them to the waiting list. This will allow us to prepare for their potential move-in once a spot becomes available.</p>`
        : `<p>Currently, we are at full capacity; however, we would like to know when <strong>${fullName}</strong> would be ready to move in once a spot becomes available. Please provide an estimated move-in date, and we will keep you informed as soon as an opening arises.</p>`;
      await sendEmail(
        recipients,
        `Kingdom Living Iowa — Application Accepted: ${fullName}`,
        wrap(`<p>I am pleased to inform you that <strong>${fullName}</strong>'s application has been accepted into our program at Kingdom Living Iowa.</p>
        ${middleParagraph}
        <p>If you have any questions or need further assistance, please don't hesitate to reach out.</p>`)
      );
    }

    await notifyAdmins(supabase, `Application from ${fullName} was automatically accepted.`, 'new_application');
    return respond({ result: 'accepted' });

  } catch (err) {
    console.error('process-application error:', err);
    return respond({ error: err.message }, 500);
  }
});