import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get all active clients who are NOT on Level 4 (they pay Live-Out rate separately)
    // and NOT discharged
    const { data: clients, error: clientsError } = await supabaseAdmin
      .from('clients')
      .select('id, full_name, room_type, is_live_out, level, status')
      .eq('status', 'Active');

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      return res.status(500).json({ error: clientsError.message });
    }

    // Get fee settings
    const { data: feeSettings, error: feeError } = await supabaseAdmin
      .from('fee_settings')
      .select('*');

    if (feeError) {
      console.error('Error fetching fee settings:', feeError);
      return res.status(500).json({ error: feeError.message });
    }

    const feeMap = {};
    (feeSettings || []).forEach(f => { feeMap[f.room_type] = f; });

    const today = new Date().toISOString().split('T')[0];
    const charges = [];
    const skipped = [];

    for (const client of (clients || [])) {
      // Determine room type:
      // - Live-Out clients pay $35/week
      // - Level 4 clients pay $35/week (Live-Out rate)
      // - Everyone else pays their room rate
      const roomType = (client.is_live_out || client.level === 4) ? 'Live-Out' : (client.room_type || 'Double');
      const settings = feeMap[roomType];

      if (!settings || !settings.weekly_fee) {
        skipped.push({ client: client.full_name, reason: `No fee settings for room type: ${roomType}` });
        continue;
      }

      // Check if already charged this week
      const weekStart = getWeekStart();
      const { data: existing } = await supabaseAdmin
        .from('charges')
        .select('id')
        .eq('client_id', client.id)
        .eq('charge_type', 'weekly_fee')
        .gte('due_date', weekStart)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped.push({ client: client.full_name, reason: 'Already charged this week' });
        continue;
      }

      charges.push({
        client_id: client.id,
        charge_type: 'weekly_fee',
        amount: parseFloat(settings.weekly_fee),
        due_date: today,
        description: `Weekly program fee — ${client.level === 4 ? 'Level 4 (Live-Out rate)' : roomType}`,
        status: 'unpaid',
        amount_paid: 0,
        created_by: 'system',
      });
    }

    if (charges.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('charges')
        .insert(charges);

      if (insertError) {
        console.error('Error inserting charges:', insertError);
        return res.status(500).json({ error: insertError.message });
      }
    }

    console.log(`Weekly charges created: ${charges.length}, skipped: ${skipped.length}`);

    return res.status(200).json({
      success: true,
      charged: charges.length,
      skipped: skipped.length,
      details: { skipped },
    });
  } catch (err) {
    console.error('Unexpected error in weekly-charge:', err);
    return res.status(500).json({ error: err.message });
  }
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}