import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { clientId, amount, paymentType, description, paymentId } = req.body;

  if (!clientId || !amount || !paymentType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Get client info
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('full_name, email, phone')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Create a Stripe payment link
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: description || 'Kingdom Living Program Fee',
            description: `Payment for ${client.full_name}`,
          },
          unit_amount: Math.round(parseFloat(amount) * 100), // Stripe uses cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://kl-hub-xpmk.vercel.app'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://kl-hub-xpmk.vercel.app'}/payment-cancelled`,
      customer_email: client.email || undefined,
      metadata: {
        client_id: clientId,
        payment_id: paymentId || '',
        payment_type: paymentType,
      },
    });

    // If there's an existing pending payment record, update it with the session ID
    if (paymentId) {
      await supabaseAdmin
        .from('payments')
        .update({ notes: `Stripe session: ${session.id}` })
        .eq('id', paymentId);
    }

    return res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: err.message });
  }
}