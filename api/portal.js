'use strict';

/**
 * GrowthKit AI — POST /api/portal
 *
 * Returns a Stripe Billing Customer Portal URL ({ url }) for the signed-in user
 * so they can update their card, or cancel/upgrade their subscription, on
 * Stripe's hosted page. The browser redirects there; Stripe returns them to
 * /four afterwards.
 *
 * Requires Authorization: Bearer <supabase access token>. The user must already
 * have a Stripe Customer (created at checkout) — otherwise there is nothing to
 * manage and we return 400.
 *
 * ── Env vars (Vercel — NEVER in git) ──
 *   STRIPE_SECRET_KEY   required
 *   SUPABASE_* (see lib) · SITE_URL optional
 */

const Stripe = require('stripe');
const { verifyUserToken, bearer, getSubscription } = require('../lib/subscriptions');

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

  const user = await verifyUserToken(bearer(req));
  if (!user) {
    res.status(401).json({ error: 'Please sign in to manage billing.' });
    return;
  }

  const sub = await getSubscription(user.id);
  if (!sub || !sub.stripe_customer_id) {
    res.status(400).json({ error: 'No billing account yet, subscribe first.' });
    return;
  }

  const stripe = new Stripe(secret);
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: originOf(req) + '/four'
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(502).json({ error: 'Could not open the billing portal. Please try again.' });
  }
};
