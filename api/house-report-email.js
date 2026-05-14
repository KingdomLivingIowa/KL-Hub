import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'admissions@kingdomlivingia.com';
const LOGO_URL = 'https://pmvxnetpbxuzkrxitioc.supabase.co/storage/v1/object/public/assets/kingdom-living-logo.jpg';

function wrap(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#1a1a1a;padding:28px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="Kingdom Living Iowa" width="160" style="display:block;margin:0 auto 12px auto;border-radius:6px;" onerror="this.style.display='none'"/>
          <p style="margin:0;color:#b22222;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Weekly House Report</p>
        </td></tr>
        <tr><td style="background-color:#b22222;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:36px 40px;color:#333333;font-size:15px;line-height:1.7;">${body}</td></tr>
        <tr><td style="background-color:#f9f9f9;border-top:1px solid #eeeeee;padding:20px 40px;text-align:center;">
          <p style="margin:0 0 4px 0;font-size:13px;color:#666666;font-weight:600;">Kingdom Living Iowa</p>
          <p style="margin:0;font-size:12px;color:#999999;">This is an automated weekly staff report.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function sectionHeader(title, color = '#b22222') {
  return `<div style="margin:24px 0 12px;padding:8px 14px;background:#f5f5f5;border-left:4px solid ${color};border-radius:4px;">
    <strong style="color:#1a1a1a;font-size:14px;">${title}</strong>
  </div>`;
}

function emptyRow(text) {
  return `<p style="color:#999;font-size:13px;font-style:italic;margin:0 0 16px 0;">${text}</p>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get recipients from email_notification_settings
    const { data: settings } = await supabase
      .from('email_notification_settings')
      .select('user_id')
      .eq('notification_type', 'house_report');

    if (!settings?.length) {
      return res.status(200).json({ message: 'No recipients configured for house_report.' });
    }

    const userIds = settings.map(s => s.user_id);
    const { data: recipients } = await supabase
      .from('user_profiles')
      .select('id, email, full_name')
      .in('id', userIds);

    if (!recipients?.length) {
      return res.status(200).json({ message: 'No valid recipient emails found.' });
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const weekStart = sevenDaysAgo.toISOString();
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Get all houses
    const { data: allHouses } = await supabase
      .from('houses')
      .select('id, name, type')
      .order('name');

    if (!allHouses?.length) {
      return res.status(200).json({ message: 'No houses found.' });
    }

    let houseBlocks = '';

    for (const house of allHouses) {
        // Active clients
        const { data: activeClients } = await supabase
          .from('clients')
          .select('id, full_name, start_date, level')
          .eq('house_id', house.id)
          .eq('status', 'Active');

        const occupancy = activeClients?.length || 0;

        // Move-ins this week
        const { data: moveIns } = await supabase
          .from('clients')
          .select('full_name, start_date')
          .eq('house_id', house.id)
          .eq('status', 'Active')
          .gte('start_date', weekStart.split('T')[0]);

        // Discharges this week
        const { data: discharges } = await supabase
          .from('clients')
          .select('full_name, discharge_date')
          .eq('house_id', house.id)
          .eq('status', 'Discharged')
          .gte('discharge_date', weekStart.split('T')[0]);

        // Infractions this week
        const { data: infractions } = await supabase
          .from('client_timeline')
          .select('notes, severity, created_at, clients(full_name)')
          .eq('entry_type', 'Infraction')
          .in('client_id', (activeClients || []).map(c => c.id))
          .gte('created_at', weekStart);

        // Positive UAs this week
        const { data: positiveUAs } = await supabase
          .from('client_timeline')
          .select('created_at, clients(full_name)')
          .eq('entry_type', 'UA')
          .eq('result', 'Positive')
          .in('client_id', (activeClients || []).map(c => c.id))
          .gte('created_at', weekStart);

        // House timeline entries this week (new types)
        const { data: houseEntries } = await supabase
          .from('house_timeline')
          .select('entry_type, notes, inspection_result, maintenance_status, created_at, author')
          .eq('house_id', house.id)
          .in('entry_type', ['Maintenance/Repair', 'House Inspection', 'House Meeting Notes', 'Supplies/Inventory'])
          .gte('created_at', weekStart)
          .order('created_at', { ascending: false });

        // Clients with overdue balance
        const clientIds = (activeClients || []).map(c => c.id);
        let overdueClients = [];
        if (clientIds.length) {
          const { data: charges } = await supabase.from('charges').select('client_id, amount').in('client_id', clientIds);
          const { data: payments } = await supabase.from('payments').select('client_id, amount').in('client_id', clientIds);
          const chargeMap = {};
          const paymentMap = {};
          (charges || []).forEach(c => { chargeMap[c.client_id] = (chargeMap[c.client_id] || 0) + parseFloat(c.amount || 0); });
          (payments || []).forEach(p => { paymentMap[p.client_id] = (paymentMap[p.client_id] || 0) + parseFloat(p.amount || 0); });
          overdueClients = (activeClients || [])
            .map(c => ({ ...c, balance: Math.max(0, (chargeMap[c.id] || 0) - (paymentMap[c.id] || 0)) }))
            .filter(c => c.balance > 0)
            .sort((a, b) => b.balance - a.balance);
        }

        // Build house block
        houseBlocks += `
          <div style="margin-bottom:32px;padding-bottom:32px;border-bottom:2px solid #eee;">
            <h2 style="margin:0 0 4px;font-size:18px;color:#1a1a1a;">🏠 ${house.name}</h2>
            <p style="margin:0 0 16px;color:#888;font-size:13px;">${occupancy} active resident${occupancy !== 1 ? 's' : ''}</p>

            ${sectionHeader('Move-Ins This Week', '#16a34a')}
            ${moveIns?.length ? moveIns.map(c => `<p style="margin:0 0 6px;font-size:13px;color:#333;">✓ ${c.full_name} — moved in ${new Date(c.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>`).join('') : emptyRow('No move-ins this week.')}

            ${sectionHeader('Discharges This Week', '#6b7280')}
            ${discharges?.length ? discharges.map(c => `<p style="margin:0 0 6px;font-size:13px;color:#333;">→ ${c.full_name} — discharged ${new Date(c.discharge_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>`).join('') : emptyRow('No discharges this week.')}

            ${sectionHeader('Infractions This Week', '#dc2626')}
            ${infractions?.length ? infractions.map(i => `<p style="margin:0 0 6px;font-size:13px;color:#333;">⚠ ${i.clients?.full_name}${i.severity ? ` — <strong>${i.severity}</strong>` : ''}${i.notes ? `: ${i.notes}` : ''}</p>`).join('') : emptyRow('No infractions this week.')}

            ${sectionHeader('Positive UAs This Week', '#f97316')}
            ${positiveUAs?.length ? positiveUAs.map(u => `<p style="margin:0 0 6px;font-size:13px;color:#333;">🔴 ${u.clients?.full_name} — ${new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>`).join('') : emptyRow('No positive UAs this week.')}

            ${sectionHeader('Outstanding Balances', '#b22222')}
            ${overdueClients.length ? overdueClients.map(c => `<p style="margin:0 0 6px;font-size:13px;color:#333;">💰 ${c.full_name} — <strong style="color:#b22222;">$${c.balance.toFixed(2)}</strong></p>`).join('') : emptyRow('No outstanding balances.')}

            ${sectionHeader('House Updates This Week', '#06b6d4')}
            ${houseEntries?.length ? houseEntries.map(e => {
              const badge = e.inspection_result
                ? ` <span style="color:${e.inspection_result === 'Pass' ? '#16a34a' : '#dc2626'};font-weight:600;">[${e.inspection_result}]</span>`
                : e.maintenance_status
                ? ` <span style="color:#fb923c;font-weight:600;">[${e.maintenance_status}]</span>`
                : '';
              return `<div style="margin-bottom:8px;padding:8px 12px;background:#f9f9f9;border-radius:6px;">
                <p style="margin:0 0 2px;font-size:12px;color:#888;">${e.entry_type} — ${new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${e.author}</p>
                <p style="margin:0;font-size:13px;color:#333;">${badge}${e.notes || ''}</p>
              </div>`;
            }).join('') : emptyRow('No house updates logged this week.')}
          </div>
        `;
      }

      const html = wrap(`
        <p style="margin:0 0 6px;font-size:13px;color:#999;">${today}</p>
        <h2 style="margin:0 0 24px;font-size:20px;color:#1a1a1a;">Weekly House Report</h2>
        ${houseBlocks}
      `);

      const allEmails = recipients.map(r => r.email).filter(Boolean);
      await resend.emails.send({
        from: FROM_EMAIL,
        to: allEmails,
        subject: `Weekly House Report — ${today}`,
        html,
      });

      return res.status(200).json({ success: true, houses: allHouses.length, recipients: allEmails.length });

  } catch (err) {
    console.error('house-report-email error:', err);
    return res.status(500).json({ error: err.message });
  }
}