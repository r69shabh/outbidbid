// Outbidbid — King of the Hill.
// Pay $1. Be #1. Get dethroned any second.
// Cloudflare Worker + D1. Payments via Dodo Payments SDK, Stripe, and NOWPayments.

import { DurableObject } from 'cloudflare:workers';
import DodoPayments from 'dodopayments';

const BID_AMOUNT_CENTS = 100;           // flat $1 to dethrone anyone
const PENDING_TTL_SECONDS = 86400;      // unpaid bids abandoned after 24h
const HALL_OF_FAME_LIMIT = 100;
const ONLINE_WINDOW_SECONDS = 65;
const VID_COOKIE = 'obb_vid';

const DODO_BASES = {
  test_mode: 'https://test.dodopayments.com',
  live_mode: 'https://live.dodopayments.com',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const now = () => Math.floor(Date.now() / 1000);

// ---------- validation ----------

function cleanText(v, maxLen) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (t.length < 1 || t.length > maxLen) return null;
  return t;
}

function parseUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s) return '';
  try {
    const u = new URL(s.startsWith('http') ? s : 'https://' + s);
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    const host = u.hostname.toLowerCase();
    if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(host)) return '';
    return u.origin + u.pathname.replace(/\/$/, '');
  } catch {
    return '';
  }
}

// ---------- presence ----------

function getVisitorId(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/obb_vid=([^;]+)/);
  if (match && match[1] && match[1].length >= 8) return { vid: match[1], isNew: false };
  const vid = 'v_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return { vid, isNew: true };
}

async function recordPresenceAndView(env, request) {
  const { vid, isNew } = getVisitorId(request);
  const t = now();
  try {
    await env.DB.prepare(
      `INSERT INTO presence (visitor_id, last_seen) VALUES (?1, ?2)
       ON CONFLICT(visitor_id) DO UPDATE SET last_seen = ?2`
    ).bind(vid, t).run();
    if (Math.random() < 0.05) {
      await env.DB.prepare('DELETE FROM presence WHERE last_seen < ?').bind(t - ONLINE_WINDOW_SECONDS - 300).run();
    }
  } catch (e) { console.warn('Presence track error:', e); }
  try {
    const recent = await env.DB.prepare(
      'SELECT id FROM page_views WHERE visitor_id = ? AND created_at > ? LIMIT 1'
    ).bind(vid, t - 1800).first();
    if (!recent) {
      await env.DB.prepare('INSERT INTO page_views (visitor_id, created_at) VALUES (?, ?)').bind(vid, t).run();
    }
  } catch (e) { console.warn('Page view track error:', e); }
  return { vid, isNew };
}

// ---------- king board ----------

async function getKingBoard(env) {
  // current king = most recent paid bid
  const kingRow = await env.DB.prepare(
    `SELECT id, payer_name, payer_url, payer_tagline, amount_cents, provider, paid_at
     FROM bids WHERE status = 'paid' ORDER BY paid_at DESC LIMIT 1`
  ).first();

  // hall of fame = last N paid bids (newest first, skip current king)
  const hofRes = await env.DB.prepare(
    `SELECT id, payer_name, payer_url, payer_tagline, amount_cents, provider, paid_at
     FROM bids WHERE status = 'paid' ORDER BY paid_at DESC LIMIT ${HALL_OF_FAME_LIMIT}`
  ).all();

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS dethrones, COALESCE(SUM(amount_cents), 0) AS pot FROM bids WHERE status = 'paid'`
  ).first();

  let onlineCount = 1;
  let viewCount = 1;

  try {
    const presenceRow = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM presence WHERE last_seen >= ?'
    ).bind(now() - ONLINE_WINDOW_SECONDS).first();
    if (presenceRow && typeof presenceRow.count === 'number') onlineCount = Math.max(1, presenceRow.count);
    const viewsRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM page_views').first();
    if (viewsRow && typeof viewsRow.count === 'number') viewCount = Math.max(1, viewsRow.count);
  } catch (err) { console.warn('Analytics DB query error:', err); }

  if (env.PRESENCE) {
    try {
      const id = env.PRESENCE.idFromName('global');
      const stub = env.PRESENCE.get(id);
      const res = await stub.fetch('http://presence/stats');
      if (res.ok) {
        const stats = await res.json();
        if (typeof stats.online === 'number' && stats.online > 0) onlineCount = Math.max(onlineCount, stats.online);
        if (typeof stats.views === 'number' && stats.views > 0) viewCount = Math.max(viewCount, stats.views);
      }
    } catch (err) { console.warn('Presence DO query error:', err); }
  }

  const npLive = !!env.NOWPAYMENTS_API_KEY;
  const dodoLive = !!(env.DODO_API_KEY && env.DODO_PRODUCT_ID);
  const stripeLive = !!env.STRIPE_SECRET_KEY;

  return {
    mode: npLive ? 'nowpayments' : stripeLive ? 'stripe' : dodoLive ? 'dodo' : 'demo',
    dodo_env: (env.DODO_BASE ?? '').includes('live') ? 'live' : 'test',
    bid_amount_cents: BID_AMOUNT_CENTS,
    dethrones: totalRow?.dethrones ?? 0,
    pot_cents: totalRow?.pot ?? 0,
    current_king: kingRow ?? null,
    hall_of_fame: hofRes.results ?? [],
    online_count: onlineCount,
    view_count: viewCount,
  };
}

// ---------- mark paid ----------

async function markPaid(env, { id, ref }) {
  const bid = await env.DB.prepare(
    'SELECT * FROM bids WHERE (?1 IS NOT NULL AND id = ?1) OR (?2 IS NOT NULL AND provider_ref = ?2) LIMIT 1'
  ).bind(id ?? null, ref ?? null).first();

  if (!bid) return { ok: false, error: 'bid_not_found' };
  if (bid.status === 'paid') return { ok: true, already: true };
  if (bid.status !== 'pending') return { ok: false, error: 'not_pending' };

  await env.DB.prepare(
    "UPDATE bids SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'"
  ).bind(now(), bid.id).run();

  return { ok: true, bid_id: bid.id };
}

// ---------- Stripe ----------

async function createStripeCheckout(env, { requestOrigin, bidId }) {
  const p = new URLSearchParams();
  p.set('mode', 'payment');
  p.set('success_url', `${requestOrigin}/?paid=1&bid_id=${bidId}`);
  p.set('cancel_url', `${requestOrigin}/`);
  p.set('client_reference_id', `bid_${bidId}`);
  p.set('metadata[bid_id]', String(bidId));
  p.set('line_items[0][quantity]', '1');
  p.set('line_items[0][price_data][currency]', 'usd');
  p.set('line_items[0][price_data][unit_amount]', String(BID_AMOUNT_CENTS));
  p.set('line_items[0][price_data][product_data][name]', 'Outbidbid — Claim the Throne');
  p.set('line_items[0][price_data][product_data][description]', 'Pay $1 to be #1. Get dethroned any second.');
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: p,
  });
  const session = await res.json().catch(() => ({}));
  if (!res.ok || !session.url) return { error: session?.error?.message ?? 'stripe_session_failed' };
  await env.DB.prepare("UPDATE bids SET provider = 'stripe', provider_ref = ? WHERE id = ?").bind(session.id, bidId).run();
  return { url: session.url };
}

const hexBuf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]; }));
  const ts = parts.t;
  const v1s = sigHeader.match(/v1=[0-9a-f]{64}/g)?.map((s) => s.slice(3)) ?? [];
  if (!ts || v1s.length === 0) return false;
  if (Math.abs(now() - Number(ts)) > 300) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${rawBody}`));
  return v1s.includes(hexBuf(mac));
}

async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'webhook_secret_not_configured' }, 400);
  const raw = await request.text();
  const ok = await verifyStripeSignature(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return json({ error: 'invalid_signature' }, 400);
  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: 'invalid_payload' }, 400); }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data?.object ?? {};
    await markPaid(env, { ref: s.id, id: Number(s.metadata?.bid_id) || null });
  }
  return json({ received: true });
}

// ---------- NOWPayments ----------

const NP_BASE = 'https://api.nowpayments.io/v1';
const NP_SETTLED = new Set(['confirmed', 'finished']);

async function createNpInvoice(env, { requestOrigin, bidId }) {
  const res = await fetch(`${NP_BASE}/invoice`, {
    method: 'POST',
    headers: { 'x-nowpayments-api-key': env.NOWPAYMENTS_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      price_amount: BID_AMOUNT_CENTS / 100,
      price_currency: 'usd',
      order_id: `bid_${bidId}`,
      order_description: 'Outbidbid — Claim the Throne for $1',
      success_url: `${requestOrigin}/?paid=1&bid_id=${bidId}`,
      cancel_url: `${requestOrigin}/`,
      ipn_callback_url: `${requestOrigin}/api/nowpayments/ipn`,
    }),
  });
  const inv = await res.json().catch(() => ({}));
  if (!res.ok || !inv.invoice_url) return { error: inv?.message ?? 'np_invoice_failed' };
  await env.DB.prepare("UPDATE bids SET provider = 'nowpayments', provider_ref = ? WHERE id = ?").bind(String(inv.id), bidId).run();
  return { url: inv.invoice_url };
}

function sortedStringify(v) {
  if (Array.isArray(v)) return `[${v.map(sortedStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${sortedStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

async function verifyNpSignature(bodyText, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  let obj;
  try { obj = JSON.parse(bodyText); } catch { return false; }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(sortedStringify(obj)));
  const expected = hexBuf(mac);
  const safe = async (v) => hexBuf(await crypto.subtle.digest('SHA-256', enc.encode(v)));
  return (await safe(expected)) === (await safe(sigHeader.trim()));
}

async function handleNpIpn(request, env) {
  if (!env.NOWPAYMENTS_IPN_SECRET) return json({ error: 'ipn_secret_not_configured' }, 400);
  const raw = await request.text();
  const ok = await verifyNpSignature(raw, request.headers.get('x-nowpayments-sig'), env.NOWPAYMENTS_IPN_SECRET);
  if (!ok) return json({ error: 'invalid_signature' }, 400);
  let ipn;
  try { ipn = JSON.parse(raw); } catch { return json({ error: 'invalid_payload' }, 400); }
  if (NP_SETTLED.has(ipn.payment_status)) {
    const bidId = Number(String(ipn.order_id ?? '').replace(/^bid_/, '')) || null;
    await markPaid(env, { id: bidId, ref: ipn.invoice_id ? String(ipn.invoice_id) : null });
  }
  return json({ received: true });
}

// ---------- Dodo Payments ----------

const dodoHeaders = (env) => ({ authorization: `Bearer ${env.DODO_API_KEY}`, 'content-type': 'application/json' });
const dodoClient = (env) => new DodoPayments({ bearerToken: env.DODO_API_KEY, environment: (env.DODO_BASE ?? '').includes('test') ? 'test_mode' : 'live_mode' });

async function createDodoCheckout(env, { requestOrigin, bidId }) {
  const productId = await getDodoProductForAmount(env, BID_AMOUNT_CENTS);
  const session = await dodoClient(env).checkoutSessions.create({
    product_cart: [{ product_id: productId, quantity: 1 }],
    return_url: `${requestOrigin}/?paid=1&bid_id=${bidId}`,
    metadata: { bid_id: String(bidId) },
  });
  if (!session?.checkout_url || !session?.session_id) return { error: session?.message ?? 'dodo_checkout_failed' };
  await env.DB.prepare("UPDATE bids SET provider = 'dodo', provider_ref = ? WHERE id = ?").bind(session.session_id, bidId).run();
  return { url: session.checkout_url };
}

async function getDodoProductForAmount(env, amountCents) {
  const cached = await env.DB.prepare('SELECT product_id FROM price_products WHERE amount_cents = ?1').bind(amountCents).first();
  if (cached) return cached.product_id;
  try {
    const listRes = await fetch(`${env.DODO_BASE}/products?limit=100`, { headers: dodoHeaders(env) });
    if (listRes.ok) {
      const list = await listRes.json().catch(() => ({}));
      const match = (list.items ?? []).find((p) => p.price === amountCents && p.currency === 'USD' && !p.is_recurring);
      if (match?.product_id) { await cachePriceProduct(env, amountCents, match.product_id); return match.product_id; }
    }
  } catch { /* fall through */ }
  const createRes = await fetch(`${env.DODO_BASE}/products`, {
    method: 'POST', headers: dodoHeaders(env),
    body: JSON.stringify({ name: 'Outbidbid — Claim the Throne', description: 'Pay $1 to be #1 on Outbidbid. Get dethroned any second.', tax_category: 'digital_products', price: { type: 'one_time_price', currency: 'USD', price: amountCents, discount: 0 } }),
  });
  const product = await createRes.json().catch(() => ({}));
  if (!createRes.ok || !product.product_id) throw new Error(product?.error?.message ?? 'dodo_product_create_failed');
  await cachePriceProduct(env, amountCents, product.product_id);
  return product.product_id;
}

const cachePriceProduct = (env, amountCents, productId) =>
  env.DB.prepare('INSERT OR REPLACE INTO price_products (amount_cents, product_id, created_at) VALUES (?1, ?2, ?3)')
    .bind(amountCents, productId, now()).run();

async function verifyDodoSignature(rawBody, headers, secret) {
  const id = headers.get('webhook-id');
  const ts = headers.get('webhook-timestamp');
  const sigHeader = headers.get('webhook-signature') ?? '';
  if (!id || !ts || !sigHeader || !secret) return false;
  if (Math.abs(now() - Number(ts)) > 300) return false;
  const provided = [...sigHeader.matchAll(/v1,([A-Za-z0-9+/=]+)/g)].map((m) => m[1]);
  if (provided.length === 0) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${id}.${ts}.${rawBody}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const safe = async (v) => hexOf(await crypto.subtle.digest('SHA-256', enc.encode(v)));
  return (await safe(expected)) === (await safe(provided[0]));
}

async function handleDodoWebhook(request, env) {
  if (!env.DODO_WEBHOOK_SECRET) return json({ error: 'webhook_secret_not_configured' }, 400);
  const raw = await request.text();
  const ok = await verifyDodoSignature(raw, request.headers, env.DODO_WEBHOOK_SECRET);
  if (!ok) return json({ error: 'invalid_signature' }, 400);
  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: 'invalid_payload' }, 400); }
  if (event.type === 'payment.succeeded') {
    const d = event.data ?? {};
    await markPaid(env, { id: Number(d.metadata?.bid_id) || null, ref: d.checkout_session_id ?? null });
  }
  return json({ received: true });
}

// ---------- handleBid ----------

async function handleBid(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const npLive = !!env.NOWPAYMENTS_API_KEY;
  const dodoLive = !!(env.DODO_API_KEY && env.DODO_PRODUCT_ID);
  const stripeLive = !!env.STRIPE_SECRET_KEY;

  // payer_name required
  const payerName = cleanText(body.payer_name, 40);
  if (!payerName) return json({ error: 'name_required', detail: 'Provide your name (1-40 chars)' }, 400);

  const payerUrl = parseUrl(body.payer_url ?? '');
  const payerTagline = body.payer_tagline ? (cleanText(body.payer_tagline, 100) ?? '') : '';

  // expire stale pending bids
  await env.DB.prepare("UPDATE bids SET status = 'abandoned' WHERE status = 'pending' AND created_at < ?")
    .bind(now() - PENDING_TTL_SECONDS).run();

  const ins = await env.DB.prepare(
    `INSERT INTO bids (payer_name, payer_url, payer_tagline, amount_cents, provider, status, created_at)
     VALUES (?, ?, ?, ?, 'demo', 'pending', ?)`
  ).bind(payerName, payerUrl, payerTagline, BID_AMOUNT_CENTS, now()).run();
  const bidId = ins.meta.last_row_id;

  const origin = new URL(request.url).origin;

  if (npLive) {
    const inv = await createNpInvoice(env, { requestOrigin: origin, bidId });
    if (inv.error) { await env.DB.prepare("UPDATE bids SET status = 'abandoned' WHERE id = ?").bind(bidId).run(); return json({ error: 'nowpayments_error', detail: inv.error }, 502); }
    return json({ type: 'nowpayments', checkout_url: inv.url, bid_id: bidId });
  }
  if (stripeLive) {
    const checkout = await createStripeCheckout(env, { requestOrigin: origin, bidId });
    if (checkout.error) { await env.DB.prepare("UPDATE bids SET status = 'abandoned' WHERE id = ?").bind(bidId).run(); return json({ error: 'stripe_error', detail: checkout.error }, 502); }
    return json({ type: 'stripe', checkout_url: checkout.url, bid_id: bidId });
  }
  if (dodoLive) {
    const checkout = await createDodoCheckout(env, { requestOrigin: origin, bidId });
    if (checkout.error) { await env.DB.prepare("UPDATE bids SET status = 'abandoned' WHERE id = ?").bind(bidId).run(); return json({ error: 'dodo_error', detail: checkout.error }, 502); }
    return json({ type: 'dodo', checkout_url: checkout.url, bid_id: bidId });
  }

  return json({ type: 'demo', bid_id: bidId, amount_cents: BID_AMOUNT_CENTS });
}

async function handleDemoPay(request, env) {
  if ((env.DODO_API_KEY && env.DODO_PRODUCT_ID) || env.STRIPE_SECRET_KEY || env.NOWPAYMENTS_API_KEY) {
    return json({ error: 'demo_disabled_in_live_mode' }, 403);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const result = await markPaid(env, { id: Number(body.bid_id) || null });
  if (!result.ok) return json({ error: result.error }, 400);
  return json({ ok: true, ...result });
}

async function handleConfirm(request, env, url) {
  let sessionId = url.searchParams.get('session_id');
  const bidIdParam = url.searchParams.get('bid_id');

  if (!sessionId && bidIdParam) {
    const bid = await env.DB.prepare('SELECT provider_ref FROM bids WHERE id = ?').bind(Number(bidIdParam)).first();
    if (bid?.provider_ref) sessionId = bid.provider_ref;
  }

  if (!sessionId) {
    const recent = await env.DB.prepare("SELECT provider_ref FROM bids WHERE status = 'pending' AND created_at > ? ORDER BY id DESC LIMIT 1")
      .bind(now() - 900).first();
    if (recent?.provider_ref) sessionId = recent.provider_ref;
  }

  if (!sessionId) return json({ error: 'missing_session_id' }, 400);

  const npId = url.searchParams.get('payment_id') ?? (sessionId && !sessionId.startsWith('cs_') && !sessionId.startsWith('cks_') ? sessionId : null);
  if (npId && env.NOWPAYMENTS_API_KEY) {
    const res = await fetch(`${NP_BASE}/payment/${encodeURIComponent(npId)}`, { headers: { 'x-nowpayments-api-key': env.NOWPAYMENTS_API_KEY } });
    const p = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: 'np_lookup_failed' }, 502);
    if (NP_SETTLED.has(p.payment_status)) {
      const bidId = Number(String(p.order_id ?? '').replace(/^bid_/, '')) || null;
      const result = await markPaid(env, { id: bidId, ref: p.invoice_id ? String(p.invoice_id) : null });
      return json({ paid: true, ...result });
    }
    return json({ paid: false, status: p.payment_status });
  }

  if (sessionId?.startsWith('cs_')) {
    if (!env.STRIPE_SECRET_KEY) return json({ paid: false });
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
    const session = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: 'stripe_lookup_failed' }, 502);
    if (session.payment_status === 'paid') {
      const result = await markPaid(env, { ref: sessionId, id: Number(session.metadata?.bid_id) || null });
      return json({ paid: true, ...result });
    }
    return json({ paid: false, status: session.payment_status });
  }

  if (!(env.DODO_API_KEY && env.DODO_BASE)) return json({ paid: false, mode: 'demo' });
  let session;
  try { session = await dodoClient(env).checkoutSessions.retrieve(sessionId); }
  catch (e) { return json({ error: 'dodo_lookup_failed', detail: String(e?.message ?? e).slice(0, 120) }, 502); }
  const isPaid = session?.payment_status === 'paid' || session?.payment_status === 'succeeded' || session?.status === 'succeeded' || session?.status === 'complete';
  if (isPaid) {
    const result = await markPaid(env, { ref: sessionId });
    return json({ paid: true, ...result });
  }
  return json({ paid: false, status: session?.payment_status ?? session?.status ?? 'unknown' });
}

// ---------- admin ----------

async function handleAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return json({ error: 'admin_not_configured' }, 404);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const enc = new TextEncoder();
  const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const [a, b] = await Promise.all([body.token ?? '', env.ADMIN_TOKEN].map((v) => crypto.subtle.digest('SHA-256', enc.encode(v)).then(hexOf)));
  if (a !== b) return json({ error: 'unauthorized' }, 401);

  switch (body.action) {
    case 'wipe_demo': {
      const r = await env.DB.prepare("DELETE FROM bids WHERE provider = 'demo' AND status = 'paid'").run();
      return json({ ok: true, deleted: r.meta.changes });
    }
    case 'remove_bid': {
      const bidId = Number(body.bid_id);
      if (!bidId) return json({ error: 'bid_id_required' }, 400);
      await env.DB.prepare('DELETE FROM bids WHERE id = ?').bind(bidId).run();
      return json({ ok: true });
    }
    case 'stats': {
      const row = await env.DB.prepare(
        `SELECT (SELECT COUNT(*) FROM bids WHERE status='paid') AS paid_bids,
                (SELECT COALESCE(SUM(amount_cents),0) FROM bids WHERE status='paid') AS gross_cents`
      ).first();
      return json({ ok: true, ...row });
    }
    case 'dodo_setup': {
      if (!env.DODO_API_KEY) return json({ error: 'dodo_api_key_missing' }, 400);
      const probe = async (base) => { const r = await fetch(`${base}/products?limit=1`, { headers: dodoHeaders(env) }); return { base, status: r.status }; };
      const [test, live] = await Promise.all([probe(DODO_BASES.test_mode), probe(DODO_BASES.live_mode)]);
      const working = live.status === 200 ? live : test.status === 200 ? test : null;
      if (!working) return json({ ok: false, error: 'api_key_rejected_on_both_environments' }, 502);
      const listRes = await fetch(`${working.base}/products?limit=100`, { headers: dodoHeaders(env) });
      const list = await listRes.json().catch(() => ({ items: [] }));
      const existing = (list.items ?? list ?? []).find?.((p) => p.name === 'Outbidbid — Claim the Throne' && p.price?.price === 100);
      if (existing) return json({ ok: true, base: working.base, product_id: existing.product_id, reused: true });
      const createRes = await fetch(`${working.base}/products`, {
        method: 'POST', headers: dodoHeaders(env),
        body: JSON.stringify({ name: 'Outbidbid — Claim the Throne', description: 'Pay $1 to be #1. Get dethroned any second.', tax_category: 'digital_products', price: { type: 'one_time_price', currency: 'USD', price: 100, discount: 0 } }),
      });
      const product = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !product.product_id) return json({ ok: false, error: 'product_create_failed', detail: product?.error?.message ?? product }, 502);
      return json({ ok: true, base: working.base, product_id: product.product_id });
    }
    case 'dodo_webhook': {
      if (!env.DODO_API_KEY || !env.DODO_BASE) return json({ error: 'run_dodo_setup_first' }, 400);
      const origin = new URL(request.url).origin;
      const res = await fetch(`${env.DODO_BASE}/webhooks`, {
        method: 'POST', headers: dodoHeaders(env),
        body: JSON.stringify({ url: `${origin}/api/dodo/webhook`, description: 'outbidbid payment settlement', filter_types: ['payment.succeeded'] }),
      });
      const wh = await res.json().catch(() => ({}));
      if (!res.ok) return json({ ok: false, error: 'webhook_create_failed', detail: wh?.error?.message ?? wh }, 502);
      return json({ ok: true, webhook_id: wh.id, url: wh.url, note: 'copy signing secret from dashboard -> DODO_WEBHOOK_SECRET' });
    }
    case 'seed': {
      // seed a demo paid bid so the board isn't empty on first deploy
      const ins = await env.DB.prepare(
        `INSERT INTO bids (payer_name, payer_url, payer_tagline, amount_cents, provider, status, created_at, paid_at)
         VALUES (?, ?, ?, ?, 'demo', 'paid', ?, ?)`
      ).bind('outbidbid', 'https://outbidbid.lol', 'The king of the hill game. Pay $1, be #1.', 100, now() - 3600, now() - 3600).run();
      return json({ ok: true, bid_id: ins.meta.last_row_id });
    }
    default:
      return json({ error: 'unknown_action' }, 400);
  }
}

// ---------- PresenceTracker Durable Object ----------

export class PresenceTracker extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.storage = ctx.storage;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      if (this.ctx.acceptWebSocket) { this.ctx.acceptWebSocket(server); } else { server.accept(); }
      let views = (await this.storage.get('views')) || 0;
      views++;
      await this.storage.put('views', views);
      const sockets = this.ctx.getWebSockets ? this.ctx.getWebSockets() : [];
      const count = Math.max(1, sockets.length);
      this.broadcast(JSON.stringify({ type: 'presence', online: count, views }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith('/stats')) {
      let views = (await this.storage.get('views')) || 0;
      if (url.searchParams.get('hit') === '1') { views++; await this.storage.put('views', views); }
      const sockets = this.ctx.getWebSockets ? this.ctx.getWebSockets() : [];
      const count = Math.max(1, sockets.length);
      return new Response(JSON.stringify({ online: count, views: Math.max(1, views) }), { headers: { 'content-type': 'application/json' } });
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketClose(ws) {
    const sockets = this.ctx.getWebSockets ? this.ctx.getWebSockets() : [];
    const count = Math.max(1, sockets.length);
    const views = (await this.storage.get('views')) || 1;
    this.broadcast(JSON.stringify({ type: 'presence', online: count, views }));
  }

  async webSocketError(ws) { try { ws.close(); } catch (e) {} }

  broadcast(message) {
    if (!this.ctx.getWebSockets) return;
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(message); } catch (e) {} }
  }
}

// ---------- entry ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    let visitorInfo = { vid: '', isNew: false };
    try { visitorInfo = await recordPresenceAndView(env, request); } catch (e) { console.warn('Analytics tracking error:', e); }

    const attachCookies = (res) => {
      if (visitorInfo.isNew && visitorInfo.vid) {
        res.headers.append('Set-Cookie', `${VID_COOKIE}=${visitorInfo.vid}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`);
      }
      return res;
    };

    if (pathname.startsWith('/api/')) {
      try {
        if (pathname === '/api/presence') {
          if (!env.PRESENCE) return json({ error: 'presence_not_configured' }, 501);
          const id = env.PRESENCE.idFromName('global');
          const stub = env.PRESENCE.get(id);
          return stub.fetch(request);
        }
        if (request.method === 'GET' && pathname === '/api/leaderboard') {
          return attachCookies(json(await getKingBoard(env)));
        }
        if (request.method === 'POST' && pathname === '/api/bid') {
          return attachCookies(await handleBid(request, env));
        }
        if (request.method === 'POST' && pathname === '/api/demo-pay') {
          return attachCookies(await handleDemoPay(request, env));
        }
        if (request.method === 'GET' && pathname === '/api/confirm') {
          return attachCookies(await handleConfirm(request, env, url));
        }
        if (request.method === 'POST' && pathname === '/api/dodo/webhook') {
          return await handleDodoWebhook(request, env);
        }
        if (request.method === 'POST' && pathname === '/api/stripe/webhook') {
          return await handleStripeWebhook(request, env);
        }
        if (request.method === 'POST' && pathname === '/api/nowpayments/ipn') {
          return await handleNpIpn(request, env);
        }
        if (request.method === 'POST' && pathname === '/api/admin') {
          return await handleAdmin(request, env);
        }
        return attachCookies(json({ error: 'not_found' }, 404));
      } catch (err) {
        return attachCookies(json({ error: 'internal', detail: String(err?.message ?? err) }, 500));
      }
    }

    if (pathname === '/thanks') {
      const target = new URL(url.origin + '/');
      url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
      target.searchParams.set('paid', '1');
      return Response.redirect(target.toString(), 302);
    }

    return attachCookies(Response.redirect(url.origin + '/', 302));
  },
};
