import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = {
  api: {
    bodyParser: false, // Required for Stripe webhook signature verification
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function recordPayment(session) {
  const { client_id, charge_id, payment_channel, original_amount } = session.metadata || {};

  if (!client_id) {
    console.error('No client_id in session metadata');
    return;
  }

  // original_amount is the balance owed BEFORE the processing fee was added
  // on top (see create-payment-link.js) — that's what should move the
  // client's balance, not the inflated total Stripe actually charged them.
  // Older sessions created before fee-passthrough existed won't have this
  // metadata field, so fall back to the full charged amount for those.
  const totalCharged = session.amount_total / 100;
  const amountOwed = original_amount ? parseFloat(original_amount) : totalCharged;
  const fee = Math.max(0, totalCharged - amountOwed);
  const channelLabel = payment_channel === 'ach' ? 'bank transfer (ACH)' : 'card';

  // Insert payment record — only the amount actually owed moves the balance;
  // the fee the client additionally covered is noted but doesn't count
  // toward what they owed Kingdom Living.
  await supabaseAdmin.from('payments').insert([{
    client_id,
    charge_id: charge_id || null,
    amount: amountOwed,
    payment_method: 'online',
    payment_date: new Date().toISOString().split('T')[0],
    notes: fee > 0
      ? `Paid online via Stripe (${channelLabel}) — session ${session.id}. Client was charged $${totalCharged.toFixed(2)} total, including a $${fee.toFixed(2)} processing fee.`
      : `Paid online via Stripe — session ${session.id}`,
    stripe_session_id: session.id,
    created_by: 'stripe',
  }]);

  // Update charge balance if charge_id exists
  if (charge_id) {
    const { data: charge } = await supabaseAdmin
      .from('charges')
      .select('amount, amount_paid')
      .eq('id', charge_id)
      .single();

    if (charge) {
      const newAmountPaid = parseFloat(charge.amount_paid || 0) + amountOwed;
      const newStatus = newAmountPaid >= parseFloat(charge.amount) ? 'paid' : 'partial';
      await supabaseAdmin
        .from('charges')
        .update({ amount_paid: newAmountPaid, status: newStatus })
        .eq('id', charge_id);
    }
  }

  console.log(`Payment recorded for client ${client_id}: $${amountOwed}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    // Card payments settle instantly, so `checkout.session.completed` with
    // payment_status "paid" already means the money is in. Bank transfer
    // (ACH) payments are "delayed" — Stripe marks the session completed
    // right away but the money hasn't actually cleared yet, and only
    // confirms a few days later via a separate async_payment_succeeded (or
    // _failed) event. Only record a payment once Stripe actually confirms
    // it's paid, so an ACH transfer that later bounces never shows as paid.
    if (
      (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      await recordPayment(event.data.object);
    }

    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object;
      console.error(`ACH payment failed for client ${session.metadata?.client_id} — session ${session.id}`);
      // Nothing to reverse here — a failed/bounced ACH payment was never
      // recorded as paid in the first place, per the guard above.
    }
  } catch (err) {
    console.error('Error recording payment:', err);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
}