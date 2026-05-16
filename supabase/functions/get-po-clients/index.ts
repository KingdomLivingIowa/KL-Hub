import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function decodeJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return respond({ error: 'No auth header' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const payload = decodeJwt(token);

    if (!payload?.email) return respond({ error: 'No email in token', payload }, 401);

    const poEmail = payload.email.toLowerCase();
    console.log('PO email from token:', poEmail);

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    const { data: clients, error } = await serviceClient
      .from('clients')
      .select('id, full_name, first_name, last_name, status, level, house_id, start_date, photo_url, program_type, application_type, houses(name)')
      .ilike('po_email', poEmail)
      .order('full_name');

    console.log('Clients found:', clients?.length, error?.message);

    if (error) return respond({ error: error.message }, 500);

    return respond({ clients: clients || [] });

  } catch (err) {
    console.error('get-po-clients error:', err.message);
    return respond({ error: err.message }, 500);
  }
});