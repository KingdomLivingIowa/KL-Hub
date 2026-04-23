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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { client_id, charge_id, payment_type } = session.metadata || {};

    if (!client_id) {
      console.error('No client_id in session metadata');
      return res.status(200).json({ received: true });
    }

    const amountPaid = session.amount_total / 100; // Convert from cents

    try {
      // Insert payment record
      await supabaseAdmin.from('payments').insert([{
        client_id,
        charge_id: charge_id || null,
        amount: amountPaid,
        payment_method: 'online',
        payment_date: new Date().toISOString().split('T')[0],
        notes: `Paid online via Stripe — session ${session.id}`,
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
          const newAmountPaid = parseFloat(charge.amount_paid || 0) + amountPaid;
          const newStatus = newAmountPaid >= parseFloat(charge.amount) ? 'paid' : 'partial';
          await supabaseAdmin
            .from('charges')
            .update({ amount_paid: newAmountPaid, status: newStatus })
            .eq('id', charge_id);
        }
      }

      console.log(`Payment recorded for client ${client_id}: $${amountPaid}`);
    } catch (err) {
      console.error('Error recording payment:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(200).json({ received: true });
}