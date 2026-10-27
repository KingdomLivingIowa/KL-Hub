import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Where the staff invite email link sends them — kl-hub itself (not the
// resident portal). The staff_invite=1 marker lets App.js tell this apart
// from a resident invite link, which also lands with type=invite.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kl-hub.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, full_name, role } = req.body;

  if (!email || !full_name || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Invite the new staff member — this creates their auth account AND sends
  // them an email with a secure link to set their own password, instead of
  // creating the account silently with a password typed in here.
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${APP_URL}/?staff_invite=1`,
  });

  if (authError) {
    return res.status(400).json({ error: authError.message });
  }

  // Create their profile
  const { error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .insert([{
      id: authData.user.id,
      full_name,
      email,
      role,
    }]);

  if (profileError) {
    // Rollback: delete the auth user if profile creation fails
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return res.status(400).json({ error: profileError.message });
  }

  return res.status(200).json({ success: true, userId: authData.user.id });
}