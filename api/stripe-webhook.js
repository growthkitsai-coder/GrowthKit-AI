'use strict';

/**
 * GrowthKit AI — POST /api/stripe-webhook
 *
 * The SOURCE OF TRUTH for subscription state. Stripe calls this endpoint; we
 * verify the signature, then mirror the subscription's status into Supabase
 * (`subscriptions` table) via the service_role key. The frontend never writes
 * billing state — it only reads its own row, and access is enforced server-side
 * in api/advise.js against what this webhook wrote.
 *
 * Handled events:
 *   checkout.session.completed        — first payment done; record the subscription
 *   customer.subscription.created     — subscription exists
 *   customer.subscription.updated     — status/renewal/plan changed
 *   customer.subscription.deleted     — canceled → revoke access
 *   invoice.payment_failed            — mark past_due (access lapses)
 *
 * ── Raw body ──
 *   Stripe signs the exact bytes it sent, so we DISABLE Vercel's body parser
 *   (config below) and read the raw stream. Parsing to JSON first would break
 *   signature verification — the classic webhook bug.
 *
 * ── Env vars (Vercel — NEVER in git) ──
 *   STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET (the `whsec_…` signing secret)
 *   SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY (see lib/subscriptions.js)
 */

const Stripe = require('stripe');
const { upsertSubscription } = require('../lib/subscriptions');

// Only one paid plan today. Map every subscription to 'pro'; add price→plan
// logic here if more paid tiers get real Stripe prices later.
function planFor(_sub) { return 'pro'; }

// current_period_end lives on the subscription in older Stripe API versions and
// on the first item in newer ones — read both so we don't depend on the pin.
function periodEndISO(sub) {
  const ts = sub.current_period_end ||
    (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end);
  return ts ? new Date(ts * 1000).toISOString() : null;
}

function customerId(sub) {
  return typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null;
}

// Mirror a Stripe subscription object into our table. user_id comes from the
// metadata we stamped at checkout; fall back to an explicit id (checkout.session
// carries client_reference_id) when metadata is somehow absent.
async function syncSubscription(sub, fallbackUserId) {
  const userId = (sub.metadata && sub.metadata.user_id) || fallbackUserId;
  if (!userId) return;
  await upsertSubscription({
    user_id: userId,
    stripe_customer_id: customerId(sub),
    stripe_subscription_id: sub.id,
    plan: planFor(sub),
    status: sub.status,
    current_period_end: periodEndISO(sub)
  });
}

function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !whSecret) {
    res.status(503).json({ error: 'Billing webhook not configured.' });
    return;
  }

  const stripe = new Stripe(secret);

  let event;
  try {
    const raw = await readRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (err) {
    // Bad signature or malformed payload — reject so Stripe retries/flags it.
    res.status(400).json({ error: 'Invalid signature.' });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          await syncSubscription(sub, session.client_reference_id || (session.metadata && session.metadata.user_id));
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        await syncSubscription(event.data.object, null);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata && sub.metadata.user_id;
        if (userId) {
          await upsertSubscription({
            user_id: userId,
            stripe_customer_id: customerId(sub),
            stripe_subscription_id: sub.id,
            plan: planFor(sub),
            status: 'canceled',
            current_period_end: periodEndISO(sub)
          });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subId = invoice.subscription ||
          (invoice.parent && invoice.parent.subscription_details && invoice.parent.subscription_details.subscription);
        if (subId) {
          // Pull the subscription so we get its metadata.user_id and true status.
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(sub, null);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // Log-and-500 so Stripe retries; never leak internals to the caller.
    res.status(500).json({ error: 'Webhook handler failed.' });
    return;
  }

  res.status(200).json({ received: true });
}

// Stripe needs the raw request body to verify the signature.
handler.config = { api: { bodyParser: false } };

module.exports = handler;
module.exports.config = handler.config;
