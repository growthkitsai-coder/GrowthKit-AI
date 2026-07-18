'use strict';

/**
 * GrowthKit AI — POST /api/checkout
 *
 * Starts a Stripe Checkout Session for the Pro monthly subscription and returns
 * its hosted URL ({ url }); the browser redirects there. Stripe's hosted page
 * collects the card — we never touch card data (PCI stays out of scope).
 *
 * Requires a signed-in user: the caller sends Authorization: Bearer <supabase
 * access token>. We verify it, find-or-create that user's Stripe Customer, and
 * stamp the Supabase user_id onto both the session (client_reference_id +
 * metadata) and the subscription (subscription_data.metadata) so the webhook can
 * map Stripe events back to the user. On success Stripe returns the user to
 * /four?checkout=success; on cancel, to /pricing.
 *
 * ── Env vars (Vercel — NEVER in git) ──
 *   STRIPE_SECRET_KEY   required
 *   STRIPE_PRICE_PRO    the Pro monthly Price id (falls back to the known id)
 *   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY  (see lib)
 *   SITE_URL            optional canonical origin for redirects
 */

const Stripe = require('stripe');
const { verifyUserToken, bearer, getSubscription, upsertSubscription } = require('../lib/subscriptions');

// Price ids are not secret; keep a default so it works once the secret key is set.
const PRICE_PRO = process.env.STRIPE_PRICE_PRO || 'price_1TuYYfIVRk8akpLyNoKcatRw';

function originOf(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const host = (req.headers && req.headers.host) || 'growthkitai.com';
  return 'https://' + host;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    res.status(503).json({ error: 'Billing is not configured yet.' });
    return;
  }

  // Must be signed in — checkout is tied to a Supabase user.
  const user = await verifyUserToken(bearer(req));
  if (!user) {
    res.status(401).json({ error: 'Please sign in before subscribing.' });
    return;
  }

  const stripe = new Stripe(secret);
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const price = typeof body.price === 'string' && body.price ? body.price : PRICE_PRO;
  const origin = originOf(req);

  try {
    // Reuse the user's existing Stripe Customer if we already have one; otherwise
    // create one and remember it immediately so we never double-create.
    let customerId = null;
    const existing = await getSubscription(user.id);
    if (existing && existing.stripe_customer_id) {
      customerId = existing.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id }
      });
      customerId = customer.id;
      await upsertSubscription({ user_id: user.id, stripe_customer_id: customerId, status: 'none', plan: 'pro' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: price, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { metadata: { user_id: user.id } },
      metadata: { user_id: user.id },
      success_url: origin + '/four?checkout=success',
      cancel_url: origin + '/pricing'
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(502).json({ error: 'Could not start checkout. Please try again.' });
  }
};
