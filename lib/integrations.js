'use strict';

const crypto = require('crypto');
const Stripe = require('stripe');
const {
  encrypt,
  decrypt,
  getIntegration,
  listIntegrations,
  upsertIntegration,
  deleteIntegration
} = require('./product');

const PROVIDERS = ['stripe', 'google_analytics', 'linkedin'];

function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const host = req && req.headers && req.headers.host ? req.headers.host : 'growthkitai.com';
  if (host.indexOf('localhost') !== -1 || host.indexOf('127.0.0.1') !== -1) return 'http://' + host;
  return 'https://growthkitai.com';
}

function callbackUrl(req) {
  return siteUrl(req) + '/api/integration-callback';
}

function stateSecret() {
  return process.env.GK_OAUTH_STATE_SECRET || process.env.GK_INTEGRATION_ENCRYPTION_KEY || '';
}

function createState(userId, provider) {
  const secret = stateSecret();
  if (!secret) throw new Error('OAuth state is not configured');
  const payload = Buffer.from(JSON.stringify({
    user_id: userId,
    provider: provider,
    exp: Date.now() + 10 * 60 * 1000,
    nonce: crypto.randomBytes(12).toString('hex')
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + sig;
}

function readState(value) {
  const secret = stateSecret();
  const parts = String(value || '').split('.');
  if (!secret || parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', secret).update(parts[0]).digest();
  let actual;
  try { actual = Buffer.from(parts[1], 'base64url'); } catch (_) { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!data.user_id || PROVIDERS.indexOf(data.provider) === -1 || Number(data.exp) < Date.now()) return null;
    return data;
  } catch (_) {
    return null;
  }
}

function authorizationUrl(provider, userId, req) {
  const state = createState(userId, provider);
  const redirectUri = callbackUrl(req);
  if (provider === 'stripe') {
    if (!process.env.STRIPE_CONNECT_CLIENT_ID) throw new Error('Stripe Connect is not configured');
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.STRIPE_CONNECT_CLIENT_ID,
      scope: 'read_only',
      redirect_uri: redirectUri,
      state: state
    });
    return 'https://connect.stripe.com/oauth/authorize?' + q.toString();
  }
  if (provider === 'google_analytics') {
    if (!process.env.GOOGLE_ANALYTICS_CLIENT_ID) throw new Error('Google Analytics is not configured');
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.GOOGLE_ANALYTICS_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state: state
    });
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + q.toString();
  }
  if (provider === 'linkedin') {
    if (!process.env.LINKEDIN_CLIENT_ID) throw new Error('LinkedIn is not configured');
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINKEDIN_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: process.env.LINKEDIN_SCOPES || 'rw_organization_admin r_organization_social',
      state: state
    });
    return 'https://www.linkedin.com/oauth/v2/authorization?' + q.toString();
  }
  throw new Error('Unknown provider');
}

async function formPost(url, body, basicSecret) {
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (basicSecret) headers.authorization = 'Basic ' + Buffer.from(basicSecret + ':').toString('base64');
  const r = await fetch(url, { method: 'POST', headers: headers, body: new URLSearchParams(body).toString() });
  const data = await r.json().catch(function () { return {}; });
  if (!r.ok) throw new Error(data.error_description || data.error || 'OAuth token exchange failed');
  return data;
}

async function googleProperties(accessToken) {
  const r = await fetch('https://analyticsadmin.googleapis.com/v1alpha/accountSummaries?pageSize=200', {
    headers: { authorization: 'Bearer ' + accessToken }
  });
  if (!r.ok) return [];
  const data = await r.json();
  const out = [];
  (data.accountSummaries || []).forEach(function (account) {
    (account.propertySummaries || []).forEach(function (p) {
      out.push({ id: String(p.property || '').replace(/^properties\//, ''), name: p.displayName || p.property });
    });
  });
  return out.slice(0, 100);
}

function linkedinHeaders(token) {
  return {
    authorization: 'Bearer ' + token,
    'Linkedin-Version': process.env.LINKEDIN_VERSION || '202606',
    'X-Restli-Protocol-Version': '2.0.0'
  };
}

async function linkedinOrganizations(accessToken) {
  const url = 'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100';
  const r = await fetch(url, { headers: linkedinHeaders(accessToken) });
  if (!r.ok) return [];
  const data = await r.json();
  const ids = [];
  (data.elements || []).forEach(function (row) {
    const raw = row.organization || row.organizationalTarget || row.organizationTarget || '';
    const match = String(raw).match(/organization:(\d+)/);
    if (match && ids.indexOf(match[1]) === -1) ids.push(match[1]);
  });
  const orgs = await Promise.all(ids.slice(0, 30).map(async function (id) {
    const rr = await fetch('https://api.linkedin.com/rest/organizations/' + encodeURIComponent(id), { headers: linkedinHeaders(accessToken) });
    if (!rr.ok) return { id: id, name: 'LinkedIn Page ' + id };
    const d = await rr.json().catch(function () { return {}; });
    const localized = d.localizedName || (d.name && d.name.localized && Object.values(d.name.localized)[0]);
    return { id: id, name: localized || 'LinkedIn Page ' + id };
  }));
  return orgs;
}

async function exchangeCode(provider, code, state, req) {
  const redirectUri = callbackUrl(req);
  let token;
  let config = {};
  let accountId = null;
  if (provider === 'stripe') {
    token = await formPost('https://connect.stripe.com/oauth/token', {
      grant_type: 'authorization_code', code: code
    }, process.env.STRIPE_SECRET_KEY);
    accountId = token.stripe_user_id || null;
  } else if (provider === 'google_analytics') {
    token = await formPost('https://oauth2.googleapis.com/token', {
      grant_type: 'authorization_code',
      code: code,
      client_id: process.env.GOOGLE_ANALYTICS_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_ANALYTICS_CLIENT_SECRET || '',
      redirect_uri: redirectUri
    });
    const properties = await googleProperties(token.access_token);
    config = { properties: properties, property_id: properties[0] ? properties[0].id : null };
    accountId = config.property_id;
  } else if (provider === 'linkedin') {
    token = await formPost('https://www.linkedin.com/oauth/v2/accessToken', {
      grant_type: 'authorization_code',
      code: code,
      client_id: process.env.LINKEDIN_CLIENT_ID || '',
      client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
      redirect_uri: redirectUri
    });
    const organizations = await linkedinOrganizations(token.access_token);
    config = { organizations: organizations, organization_id: organizations[0] ? organizations[0].id : null };
    accountId = config.organization_id;
  } else {
    throw new Error('Unknown provider');
  }

  const expiresAt = token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null;
  return upsertIntegration({
    user_id: state.user_id,
    provider: provider,
    provider_account_id: accountId,
    access_token_ciphertext: encrypt(token.access_token),
    refresh_token_ciphertext: token.refresh_token ? encrypt(token.refresh_token) : null,
    token_expires_at: expiresAt,
    config: config
  });
}

async function refreshGoogle(row) {
  const expires = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (expires > Date.now() + 60 * 1000) return decrypt(row.access_token_ciphertext);
  const refreshToken = decrypt(row.refresh_token_ciphertext);
  if (!refreshToken) throw new Error('Google Analytics needs reconnecting');
  const token = await formPost('https://oauth2.googleapis.com/token', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_ANALYTICS_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_ANALYTICS_CLIENT_SECRET || ''
  });
  await upsertIntegration(Object.assign({}, row, {
    access_token_ciphertext: encrypt(token.access_token),
    token_expires_at: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString()
  }));
  return token.access_token;
}

function utcRange(daysAgoStart, daysAgoEnd) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - daysAgoStart);
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - daysAgoEnd);
  return { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000) };
}

async function stripeListAll(fetchPage, max) {
  const out = [];
  let startingAfter;
  for (;;) {
    const page = await fetchPage(startingAfter);
    const rows = page && page.data ? page.data : [];
    Array.prototype.push.apply(out, rows);
    if (!page || !page.has_more || !rows.length || out.length >= (max || 300)) break;
    startingAfter = rows[rows.length - 1].id;
  }
  return out.slice(0, max || 300);
}

async function stripeMetrics(row) {
  const account = row.provider_account_id;
  if (!account || !process.env.STRIPE_SECRET_KEY) throw new Error('Stripe connection needs reconnecting');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const yesterday = utcRange(1, 0);
  const eightDays = utcRange(8, 0);
  const opts = { stripeAccount: account };
  const customers = await stripeListAll(function (cursor) {
    return stripe.customers.list({ created: { gte: eightDays.start, lt: eightDays.end }, limit: 100, starting_after: cursor }, opts);
  });
  const charges = await stripeListAll(function (cursor) {
    return stripe.charges.list({ created: { gte: eightDays.start, lt: eightDays.end }, limit: 100, starting_after: cursor }, opts);
  });
  const churn = await stripeListAll(function (cursor) {
    return stripe.events.list({ type: 'customer.subscription.deleted', created: { gte: eightDays.start, lt: eightDays.end }, limit: 100, starting_after: cursor }, opts);
  });
  const yesterdayCustomers = customers.filter(function (x) { return x.created >= yesterday.start && x.created < yesterday.end; });
  const paidCharges = charges.filter(function (x) { return x.paid && !x.refunded; });
  const yesterdayCharges = paidCharges.filter(function (x) { return x.created >= yesterday.start && x.created < yesterday.end; });
  const yesterdayChurn = churn.filter(function (x) { return x.created >= yesterday.start && x.created < yesterday.end; });
  const baselineCustomers = customers.filter(function (x) { return x.created < yesterday.start; });
  const baselineCharges = paidCharges.filter(function (x) { return x.created < yesterday.start; });
  const baselineChurn = churn.filter(function (x) { return x.created < yesterday.start; });
  const revenue = yesterdayCharges.reduce(function (sum, x) { return sum + Math.max(0, Number(x.amount || 0) - Number(x.amount_refunded || 0)); }, 0);
  const sevenDayRevenue = baselineCharges.reduce(function (sum, x) { return sum + Math.max(0, Number(x.amount || 0) - Number(x.amount_refunded || 0)); }, 0) / 7;
  return {
    currency: (yesterdayCharges[0] && yesterdayCharges[0].currency) || (paidCharges[0] && paidCharges[0].currency) || null,
    signups: yesterdayCustomers.length,
    signups_7d_daily_average: Number((baselineCustomers.length / 7).toFixed(1)),
    revenue_minor: revenue,
    revenue_7d_daily_average_minor: Math.round(sevenDayRevenue),
    churned_subscriptions: yesterdayChurn.length,
    churn_7d_daily_average: Number((baselineChurn.length / 7).toFixed(1))
  };
}

async function gaRun(token, property, startDate, endDate) {
  const r = await fetch('https://analyticsdata.googleapis.com/v1beta/properties/' + encodeURIComponent(property) + ':runReport', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: startDate, endDate: endDate }],
      metrics: ['activeUsers', 'sessions', 'newUsers', 'totalRevenue'].map(function (name) { return { name: name }; })
    })
  });
  if (!r.ok) throw new Error('Google Analytics report failed');
  const data = await r.json();
  const values = data.rows && data.rows[0] ? data.rows[0].metricValues || [] : [];
  return {
    active_users: Number(values[0] && values[0].value || 0),
    sessions: Number(values[1] && values[1].value || 0),
    new_users: Number(values[2] && values[2].value || 0),
    total_revenue: Number(values[3] && values[3].value || 0),
    currency: data.metadata && data.metadata.currencyCode || null
  };
}

async function googleAnalyticsMetrics(row) {
  const property = row.config && row.config.property_id;
  if (!property) throw new Error('Choose a Google Analytics property');
  const token = await refreshGoogle(row);
  const yesterday = await gaRun(token, property, 'yesterday', 'yesterday');
  const week = await gaRun(token, property, '8daysAgo', '2daysAgo');
  Object.keys(week).forEach(function (key) {
    if (typeof week[key] === 'number') week[key] = Number((week[key] / 7).toFixed(1));
  });
  return { yesterday: yesterday, seven_day_daily_average: week };
}

function sumLinkedin(data, key) {
  const elements = data && data.elements || [];
  return elements.reduce(function (sum, el) {
    const stats = el.totalShareStatistics || el.followerGains || {};
    return sum + Number(stats[key] || 0);
  }, 0);
}

async function linkedinRecentPosts(token, urn, since) {
  const url = 'https://api.linkedin.com/rest/posts?author=' + encodeURIComponent(urn) + '&q=author&count=10&sortBy=LAST_MODIFIED';
  const headers = Object.assign({ 'X-RestLi-Method': 'FINDER' }, linkedinHeaders(token));
  const r = await fetch(url, { headers: headers });
  if (!r.ok) return [];
  const data = await r.json();
  return (data.elements || []).filter(function (post) {
    return post && post.id && post.lifecycleState === 'PUBLISHED' && Number(post.publishedAt || post.createdAt || 0) >= since;
  }).slice(0, 10);
}

async function linkedinPostStats(token, organizationUrn, post) {
  const base = 'https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=' + encodeURIComponent(organizationUrn);
  const id = String(post.id || '');
  const filter = id.indexOf('urn:li:ugcPost:') === 0
    ? '&ugcPosts[0]=' + encodeURIComponent(id)
    : '&shares=List(' + encodeURIComponent(id) + ')';
  const r = await fetch(base + filter, { headers: linkedinHeaders(token) });
  if (!r.ok) return null;
  const data = await r.json();
  const stats = data.elements && data.elements[0] && data.elements[0].totalShareStatistics;
  if (!stats) return null;
  return {
    urn: id,
    published_at: new Date(Number(post.publishedAt || post.createdAt)).toISOString(),
    commentary: String(post.commentary || '').slice(0, 280),
    impressions: Number(stats.impressionCount || 0),
    clicks: Number(stats.clickCount || 0),
    likes: Number(stats.likeCount || 0),
    comments: Number(stats.commentCount || 0),
    shares: Number(stats.shareCount || 0),
    engagement: Number(stats.engagement || 0),
    public_url: 'https://www.linkedin.com/feed/update/' + encodeURIComponent(id)
  };
}

async function linkedinMetrics(row) {
  const org = row.config && row.config.organization_id;
  if (!org) throw new Error('Choose a LinkedIn Page');
  const token = decrypt(row.access_token_ciphertext);
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  const range = '(timeRange:(start:' + start.getTime() + ',end:' + end.getTime() + '),timeGranularityType:DAY)';
  const urn = 'urn:li:organization:' + org;
  const baseUrl = 'https://api.linkedin.com/rest/';
  const common = '?q=organizationalEntity&organizationalEntity=' + encodeURIComponent(urn) + '&timeIntervals=' + encodeURIComponent(range);
  const responses = await Promise.all([
    fetch(baseUrl + 'organizationalEntityFollowerStatistics' + common, { headers: linkedinHeaders(token) }),
    fetch(baseUrl + 'organizationalEntityShareStatistics' + common, { headers: linkedinHeaders(token) }),
    linkedinRecentPosts(token, urn, start.getTime())
  ]);
  if (!responses[0].ok || !responses[1].ok) throw new Error('LinkedIn analytics are not available for this Page');
  const followerData = await responses[0].json();
  const shareData = await responses[1].json();
  const postStats = (await Promise.all((responses[2] || []).map(function (post) {
    return linkedinPostStats(token, urn, post);
  }))).filter(Boolean);
  postStats.sort(function (a, b) {
    const scoreA = a.clicks + a.likes + (a.comments * 2) + (a.shares * 3);
    const scoreB = b.clicks + b.likes + (b.comments * 2) + (b.shares * 3);
    return scoreB - scoreA || b.impressions - a.impressions;
  });
  const followerElements = followerData.elements || [];
  const followersGained = followerElements.reduce(function (sum, el) {
    const gains = el.followerGains || {};
    return sum + Number(gains.organicFollowerGain || 0) + Number(gains.paidFollowerGain || 0);
  }, 0);
  return {
    seven_day_followers_gained: followersGained,
    seven_day_impressions: sumLinkedin(shareData, 'impressionCount'),
    seven_day_unique_impressions: sumLinkedin(shareData, 'uniqueImpressionsCount'),
    seven_day_clicks: sumLinkedin(shareData, 'clickCount'),
    seven_day_likes: sumLinkedin(shareData, 'likeCount'),
    seven_day_comments: sumLinkedin(shareData, 'commentCount'),
    seven_day_shares: sumLinkedin(shareData, 'shareCount'),
    best_performing_post: postStats[0] || null
  };
}

async function collectMetrics(userId) {
  const providers = {};
  const rows = await listIntegrations(userId);
  await Promise.all(rows.map(async function (row) {
    try {
      if (row.provider === 'stripe') providers.stripe = { connected: true, data: await stripeMetrics(await getIntegration(userId, 'stripe')) };
      if (row.provider === 'google_analytics') providers.google_analytics = { connected: true, data: await googleAnalyticsMetrics(await getIntegration(userId, 'google_analytics')) };
      if (row.provider === 'linkedin') providers.linkedin = { connected: true, data: await linkedinMetrics(await getIntegration(userId, 'linkedin')) };
    } catch (err) {
      providers[row.provider] = { connected: true, error: err.message || 'Connection needs attention' };
    }
  }));
  return providers;
}

function publicConnections(rows) {
  const byProvider = {};
  PROVIDERS.forEach(function (provider) { byProvider[provider] = { provider: provider, connected: false }; });
  (rows || []).forEach(function (row) {
    byProvider[row.provider] = {
      provider: row.provider,
      connected: true,
      provider_account_id: row.provider_account_id,
      config: row.config || {},
      token_expires_at: row.token_expires_at,
      updated_at: row.updated_at
    };
  });
  return PROVIDERS.map(function (provider) { return byProvider[provider]; });
}

module.exports = {
  PROVIDERS,
  siteUrl,
  callbackUrl,
  createState,
  readState,
  authorizationUrl,
  exchangeCode,
  collectMetrics,
  publicConnections,
  listIntegrations,
  getIntegration,
  upsertIntegration,
  deleteIntegration
};
