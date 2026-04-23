import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Allow manual trigger via POST or scheduled cron via GET
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Security check for manual triggers
  const authHeader = req.headers.authorization;
  if (req.method === 'POST' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get all active clients with their room type
    const { data: clients, error: clientsError } = await supabaseAdmin
      .from('clients')
      .select('id, full_name, room_type, is_live_out, house_id')
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
      // Determine which fee applies
      const roomType = client.is_live_out ? 'Live-Out' : (client.room_type || 'Double');
      const settings = feeMap[roomType];

      if (!settings || !settings.weekly_fee) {
        skipped.push({ client: client.full_name, reason: `No fee settings for room type: ${roomType}` });
        continue;
      }

      // Check if a weekly fee was already created this week (avoid duplicates)
      const weekStart = getWeekStart();
      const { data: existing } = await supabaseAdmin
        .from('payments')
        .select('id')
        .eq('client_id', client.id)
        .eq('payment_type', 'weekly_fee')
        .gte('payment_date', weekStart)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped.push({ client: client.full_name, reason: 'Already charged this week' });
        continue;
      }

      charges.push({
        client_id: client.id,
        amount: parseFloat(settings.weekly_fee),
        payment_type: 'weekly_fee',
        payment_method: 'cash',
        payment_date: today,
        status: 'pending',
        notes: `Auto-generated weekly fee — ${roomType}`,
        created_by: 'system',
      });
    }

    if (charges.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('payments')
        .insert(charges);

      if (insertError) {
        console.error('Error inserting charges:', insertError);
        return res.status(500).json({ error: insertError.message });
      }
    }

    return res.status(200).json({
      success: true,
      charged: charges.length,
      skipped: skipped.length,
      details: { charges: charges.map(c => c.client_id), skipped },
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