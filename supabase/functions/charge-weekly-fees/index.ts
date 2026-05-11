import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    const { data: feeSettings, error: feeErr } = await supabase.from('fee_settings').select('room_type, weekly_fee');
    if (feeErr) throw new Error('Failed to load fee settings: ' + feeErr.message);

    const feeMap = {};
    (feeSettings || []).forEach(f => { feeMap[f.room_type] = parseFloat(f.weekly_fee) || 0; });

    const { data: clients, error: clientErr } = await supabase.from('clients').select('id, full_name, room_type, house_id').eq('status', 'Active').not('room_type', 'is', null);
    if (clientErr) throw new Error('Failed to load clients: ' + clientErr.message);

    const clientIds = (clients || []).map(c => c.id);

    const { data: existingCharges } = await supabase.from('charges').select('client_id').eq('charge_type', 'weekly_fee').gte('due_date', weekStartStr).in('client_id', clientIds);
    const alreadyCharged = new Set((existingCharges || []).map(c => c.client_id));

    const toInsert = [];
    let chargedCount = 0;
    let skippedCount = 0;

    for (const client of (clients || [])) {
      if (alreadyCharged.has(client.id)) { skippedCount++; continue; }
      const weeklyFee = feeMap[client.room_type] ?? 0;
      if (weeklyFee <= 0) { skippedCount++; continue; }
      toInsert.push({ client_id: client.id, charge_type: 'weekly_fee', amount: weeklyFee, due_date: todayStr, description: 'Weekly program fee — ' + client.room_type, status: 'unpaid', amount_paid: 0, created_by: 'system' });
      chargedCount++;
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await supabase.from('charges').insert(toInsert);
      if (insertErr) throw new Error('Failed to insert charges: ' + insertErr.message);
    }

    if (chargedCount > 0) {
      const { data: managers } = await supabase.from('user_profiles').select('id, notification_preferences').in('role', ['admin', 'upper_management']);
      const eligible = (managers || []).filter(m => { const prefs = m.notification_preferences; if (!prefs) return true; return prefs['weekly_charges'] !== false; });
      if (eligible.length > 0) {
        await supabase.from('notifications').insert(eligible.map(m => ({ user_id: m.id, type: 'weekly_charges', message: 'Weekly fees charged: ' + chargedCount + ' client' + (chargedCount !== 1 ? 's' : '') + ' charged for the week of ' + weekStartStr + '.', read: false })));
      }
    }

    return new Response(JSON.stringify({ success: true, charged: chargedCount, skipped: skippedCount }), { headers: { 'Content-Type': 'application/json' }, status: 200 });

  } catch (err) {
    console.error('charge-weekly-fees error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { headers: { 'Content-Type': 'application/json' }, status: 500 });
  }
});
