'use strict';

const { verifyUserToken, bearer, checkAccess } = require('../lib/subscriptions');
const {
  PROVIDERS,
  authorizationUrl,
  publicConnections,
  listIntegrations,
  getIntegration,
  upsertIntegration,
  deleteIntegration
} = require('../lib/integrations');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  const user = await verifyUserToken(bearer(req));
  if (!user) {
    res.status(401).json({ error: 'Please sign in again.' });
    return;
  }
  const access = await checkAccess(user);
  if (!access.allowed) {
    res.status(402).json({ error: 'Upgrade to Pro to connect data sources.', code: 'subscription_required' });
    return;
  }

  if (req.method === 'GET') {
    const rows = await listIntegrations(user.id);
    res.status(200).json({ connections: publicConnections(rows) });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const provider = String(body.provider || '');
  if (PROVIDERS.indexOf(provider) === -1) {
    res.status(400).json({ error: 'Unknown integration provider.' });
    return;
  }

  if (body.action === 'connect') {
    try {
      res.status(200).json({ url: authorizationUrl(provider, user.id, req) });
    } catch (err) {
      res.status(503).json({ error: err.message || 'This integration is not configured yet.' });
    }
    return;
  }

  if (body.action === 'disconnect') {
    const ok = await deleteIntegration(user.id, provider);
    res.status(ok ? 200 : 502).json(ok ? { disconnected: true } : { error: 'Could not disconnect this source.' });
    return;
  }

  if (body.action === 'configure') {
    const row = await getIntegration(user.id, provider);
    if (!row) {
      res.status(404).json({ error: 'Connect this source first.' });
      return;
    }
    const config = Object.assign({}, row.config || {});
    if (provider === 'google_analytics') {
      const propertyId = String(body.property_id || '').replace(/\D/g, '');
      const valid = (config.properties || []).some(function (p) { return String(p.id) === propertyId; });
      if (!valid) {
        res.status(400).json({ error: 'Choose an available Google Analytics property.' });
        return;
      }
      config.property_id = propertyId;
      row.provider_account_id = propertyId;
    } else if (provider === 'linkedin') {
      const organizationId = String(body.organization_id || '').replace(/\D/g, '');
      if (!organizationId) {
        res.status(400).json({ error: 'Enter a valid LinkedIn Page ID.' });
        return;
      }
      config.organization_id = organizationId;
      row.provider_account_id = organizationId;
    }
    const saved = await upsertIntegration(Object.assign({}, row, { config: config }));
    res.status(saved ? 200 : 502).json(saved ? { connection: publicConnections([saved])[PROVIDERS.indexOf(provider)] } : { error: 'Could not save this integration.' });
    return;
  }

  res.status(400).json({ error: 'Unknown integration action.' });
};
