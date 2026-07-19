'use strict';

const { readState, exchangeCode, siteUrl } = require('../lib/integrations');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const origin = siteUrl(req);
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  const state = readState(req.query && req.query.state);
  const code = req.query && req.query.code;
  if (!state || !code) {
    res.statusCode = 302;
    res.setHeader('Location', origin + '/four?integration=error');
    res.end();
    return;
  }
  try {
    const saved = await exchangeCode(state.provider, String(code), state, req);
    if (!saved) throw new Error('connection could not be saved');
    res.statusCode = 302;
    res.setHeader('Location', origin + '/four?integration=' + encodeURIComponent(state.provider));
    res.end();
  } catch (_) {
    res.statusCode = 302;
    res.setHeader('Location', origin + '/four?integration=error');
    res.end();
  }
};
