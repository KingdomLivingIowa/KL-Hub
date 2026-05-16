import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    // Get the calling user's email from their JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return respond({ error: 'No auth header' }, 401);

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
    );

    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) return respond({ error: 'Invalid token' }, 401);

    const poEmail = user.email?.toLowerCase();
    if (!poEmail) return respond({ error: 'No email found' }, 400);

    // Use service role to bypass RLS
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    const { data: clients, error } = await serviceClient
      .from('clients')
      .select('id, full_name, first_name, last_name, status, level, house_id, start_date, photo_url, program_type, application_type, houses(name)')
      .ilike('po_email', poEmail)
      .order('full_name');

    if (error) return respond({ error: error.message }, 500);

    return respond({ clients: clients || [] });

  } catch (err) {
    console.error('get-po-clients error:', err);
    return respond({ error: err.message }, 500);
  }
});