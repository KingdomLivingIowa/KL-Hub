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
    const recipients = [...new Set([email, app.correspondence_contact].filter(e => e && isValidEmail(e)))];

    // ── RULE 1: Sex offender → auto deny ─────────────────────────────────────
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
          'Kingdom Living Iowa — Application Update',
          `<p>Thank you for your interest in Kingdom Living Iowa and for taking the time to submit your application. After a thorough review, we regret to inform you that we are unable to accept your application at this time.</p>
          <p>As part of our admissions policy, we are not able to accept individuals who have been convicted of a sex crime or are listed on the sex offender registry. Unfortunately, this policy prevents us from moving forward with your application.</p>
          <p>We understand this may be disappointing, and we encourage you to seek out other programs that may better align with your needs. We wish you all the best in your journey ahead.</p>`
        );
      }

      await notifyAdmins(supabase, `Application from ${fullName} was automatically denied (sex offender).`, 'new_application');
      return respond({ result: 'denied', reason: 'sex_offender' });
    }

    // ── RULE 2: Disability → flag for review ──────────────────────────────────
    if (app.on_disability === 'Yes') {
      await supabase.from('applications').update({
        status: 'pending',
        auto_flag: 'disability_review',
        flag_reason: 'Needs review: applicant reported difficulty with physical activities of daily living.',
        auto_processed: true,
      }).eq('id', application_id);

      await notifyAdmins(supabase, `Application from ${fullName} needs review — disability flagged.`, 'new_application');
      return respond({ result: 'flagged', reason: 'disability_review' });
    }

    // ── RULE 3: Lived here before → check past balance ────────────────────────
    if (app.lived_here_before === 'Yes') {
      // Look for existing client by name + DOB or email
      const { data: existingClients } = await supabase
        .from('clients')
        .select('id, full_name, email')
        .or(`email.eq.${app.email},full_name.eq.${fullName}`);

      if (existingClients?.length > 0) {
        const existingClient = existingClients[0];

        // Check for past balance using charges - payments
        const { data: charges } = await supabase
          .from('charges')
          .select('amount')
          .eq('client_id', existingClient.id);

        const { data: payments } = await supabase
          .from('payments')
          .select('amount')
          .eq('client_id', existingClient.id);

        const totalCharged = (charges || []).reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
        const totalPaid = (payments || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const totalPastBalance = Math.max(0, totalCharged - totalPaid);

        if (totalPastBalance > 0) {
          // Has past balance — flag for review, notify admins
          await supabase.from('applications').update({
            status: 'pending',
            auto_flag: 'past_balance',
            flag_reason: `Needs review: returning client with outstanding balance of $${totalPastBalance.toFixed(2)}.`,
            auto_processed: true,
          }).eq('id', application_id);

          await notifyAdmins(supabase, `Application from ${fullName} needs review — returning client with past balance of $${totalPastBalance.toFixed(2)}.`, 'new_application');
          return respond({ result: 'flagged', reason: 'past_balance', balance: totalPastBalance });
        } else {
          // No past balance — flag for merge with existing profile
          await supabase.from('applications').update({
            status: 'pending',
            auto_flag: 'returning_merge',
            flag_reason: `Returning client — no past balance. Please merge with existing profile for ${existingClient.full_name}.`,
            auto_processed: true,
          }).eq('id', application_id);

          await notifyAdmins(supabase, `Application from ${fullName} is a returning client with no past balance. Review and merge with existing profile.`, 'new_application');
          return respond({ result: 'flagged', reason: 'returning_merge' });
        }
      }
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
      await sendEmail(
        recipients,
        'Kingdom Living Iowa — Application Accepted',
        `<p>I am pleased to inform you that <strong>${fullName}</strong>'s application has been accepted into our program at Kingdom Living Iowa.</p>
        <p>Currently, we are at full capacity; however, we would like to know when <strong>${fullName}</strong> would be ready to move in once a spot becomes available. Please provide an estimated move-in date, and we will keep you informed as soon as an opening arises.</p>
        <p>Once you receive confirmation of <strong>${fullName}</strong>'s parole, please let me know so that I can add them to the waiting list. This will allow us to prepare for their potential move-in once a spot becomes available.</p>
        <p>If you have any questions or need further assistance, please don't hesitate to reach out.</p>`
      );
    }

    await notifyAdmins(supabase, `Application from ${fullName} was automatically accepted.`, 'new_application');
    return respond({ result: 'accepted' });

  } catch (err) {
    console.error('process-application error:', err);
    return respond({ error: err.message }, 500);
  }
});