import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Stripe's processing fees are passed through to the client rather than
// absorbed by Kingdom Living. Rates per Stripe's published pricing
// (stripe.com/pricing) — update these if Stripe ever changes them.
const CARD_FEE_PCT = 0.029;   // 2.9%
const CARD_FEE_FIXED = 0.30;  // + $0.30 per transaction
const ACH_FEE_PCT = 0.008;    // 0.8%
const ACH_FEE_CAP = 5.00;     // capped at $5 per transaction

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Computes what to actually charge the client so that, after Stripe takes
// its cut, Kingdom Living still nets the full original `amount` owed.
function calcTotalWithFee(amount, method) {
  if (method === 'ach') {
    // ACH's fee is capped, so there's no clean "gross-up" formula like card
    // has below — we just add the fee on top of the amount owed. In the rare
    // case a payment lands right at the $5 cap, Kingdom Living absorbs a few
    // cents rather than the client (not worth the complexity to avoid).
    const fee = Math.min(round2(amount * ACH_FEE_PCT), ACH_FEE_CAP);
    return { fee, total: round2(amount + fee) };
  }
  // Card: Stripe takes its cut out of the TOTAL amount charged, so we have
  // to solve for the total that, after the % + fixed fee comes out, leaves
  // the original `amount` fully intact.
  const total = round2((amount + CARD_FEE_FIXED) / (1 - CARD_FEE_PCT));
  const fee = round2(total - amount);
  return { fee, total };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { clientId, amount, paymentType, description, chargeId, paymentMethod } = req.body;

  if (!clientId || !amount || !paymentType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const method = paymentMethod === 'ach' ? 'ach' : 'card';
  const baseAmount = round2(parseFloat(amount));
  const { fee, total } = calcTotalWithFee(baseAmount, method);

  try {
    // Get client info
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('full_name, email')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const feeLabel = method === 'ach' ? 'bank transfer (ACH) processing fee' : 'card processing fee';

    // Create a Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: method === 'ach' ? ['us_bank_account'] : ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: description || 'Kingdom Living Program Fee',
            description: `Payment for ${client.full_name} — includes $${fee.toFixed(2)} ${feeLabel}`,
          },
          unit_amount: Math.round(total * 100), // Stripe uses cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://kl-hub-xpmk.vercel.app'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://kl-hub-xpmk.vercel.app'}/payment-cancelled`,
      customer_email: client.email || undefined,
      metadata: {
        client_id: clientId,
        charge_id: chargeId || '',
        payment_type: paymentType,
        payment_channel: method,
        // The balance actually owed, BEFORE the processing fee was added on
        // top — the webhook uses this so a client's balance only moves by
        // what they owed, not by the inflated total Stripe charged them.
        original_amount: baseAmount.toFixed(2),
        fee_amount: fee.toFixed(2),
      },
    });

    return res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
      amount: baseAmount,
      fee,
      total,
      paymentMethod: method,
    });
  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: err.message });
  }
}