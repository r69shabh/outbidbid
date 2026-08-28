// Brand My Setup — Backend Worker (Cloudflare Worker + D1 + Durable Objects + Dodo Payments)
// tinyspot.lol — Sponsor my MacBook, Mechanical Keyboard, and Mouse

import { DurableObject } from 'cloudflare:workers';
import DodoPayments from 'dodopayments';

const ONLINE_WINDOW_SECONDS = 65;
const VID_COOKIE = 'tny_vid';

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

// ---------- presence & analytics ----------

function getVisitorId(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/tny_vid=([^;]+)/);
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

// ---------- setup spots board ----------

async function getSpotsBoard(env) {
  const spotsRes = await env.DB.prepare(
    `SELECT id, category, name, subtitle, price_cents, status, sponsor_name, sponsor_url, sponsor_tagline, sponsor_logo_url, paid_at, sort_order
     FROM setup_spots ORDER BY sort_order ASC`
  ).all();

  const spots = spotsRes.results || [];

  let claimedCount = 0;
  let totalRaisedCents = 0;
  spots.forEach((s) => {
    if (s.status === 'paid') {
      claimedCount++;
      totalRaisedCents += s.price_cents;
    }
  });

  let onlineCount = 1;
  let viewCount = 1000;

  try {
    const presenceRow = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM presence WHERE last_seen >= ?'
    ).bind(now() - ONLINE_WINDOW_SECONDS).first();
    if (presenceRow && typeof presenceRow.count === 'number') onlineCount = Math.max(1, presenceRow.count);
    const viewsRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM page_views').first();
    if (viewsRow && typeof viewsRow.count === 'number') viewCount = viewsRow.count + 1000;
  } catch (err) { console.warn('Analytics DB query error:', err); }

  if (env.PRESENCE) {
    try {
      const id = env.PRESENCE.idFromName('global');
      const stub = env.PRESENCE.get(id);
      const res = await stub.fetch('http://presence/stats');
      if (res.ok) {
        const stats = await res.json();
        if (typeof stats.online === 'number' && stats.online > 0) onlineCount = Math.max(onlineCount, stats.online);
        if (typeof stats.views === 'number' && stats.views > 0) viewCount = stats.views + 1000;
      }
    } catch (err) { console.warn('Presence DO query error:', err); }
  }

  return {
    spots,
    stats: {
      total_spots: spots.length,
      claimed_spots: claimedCount,
      available_spots: spots.length - claimedCount,
      total_raised_cents: totalRaisedCents,
      online_count: onlineCount,
      view_count: viewCount,
    },
    live_mode: (env.DODO_BASE ?? '').includes('live'),
  };
}

// ---------- mark spot paid ----------

async function markSpotPaid(env, { orderId, spotId, ref }) {
  let order = null;
  if (orderId) {
    order = await env.DB.prepare('SELECT * FROM orders WHERE id = ? LIMIT 1').bind(orderId).first();
  } else if (ref) {
    order = await env.DB.prepare('SELECT * FROM orders WHERE provider_ref = ? LIMIT 1').bind(ref).first();
  }

  if (!order) {
    // If order not found, fallback to spot directly if spotId provided
    if (!spotId) return { ok: false, error: 'order_not_found' };
    const spot = await env.DB.prepare('SELECT * FROM setup_spots WHERE id = ? LIMIT 1').bind(spotId).first();
    if (!spot) return { ok: false, error: 'spot_not_found' };
    return { ok: true, spot_id: spot.id };
  }

  const t = now();
  // Mark order paid
  await env.DB.prepare(
    "UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?"
  ).bind(t, order.id).run();

  // Mark spot paid with sponsor metadata
  await env.DB.prepare(
    `UPDATE setup_spots 
     SET status = 'paid', sponsor_name = ?, sponsor_url = ?, sponsor_tagline = ?, sponsor_logo_url = ?, paid_at = ?, order_id = ?
     WHERE id = ?`
  ).bind(
    order.sponsor_name,
    order.sponsor_url,
    order.sponsor_tagline,
    order.sponsor_logo_url,
    t,
    order.id,
    order.spot_id
  ).run();

  return { ok: true, spot_id: order.spot_id, order_id: order.id };
}

// ---------- Dodo Payments ----------

const dodoHeaders = (env) => ({ authorization: `Bearer ${env.DODO_API_KEY}`, 'content-type': 'application/json' });
const dodoClient = (env) => new DodoPayments({ bearerToken: env.DODO_API_KEY, environment: (env.DODO_BASE ?? '').includes('live') ? 'live_mode' : 'test_mode' });

async function getDodoProductForAmount(env, amountCents, spotName) {
  // Check cached price tier
  const cached = await env.DB.prepare('SELECT product_id FROM price_products WHERE amount_cents = ?1').bind(amountCents).first();
  if (cached) return cached.product_id;

  const base = env.DODO_BASE || 'https://live.dodopayments.com';
  try {
    const listRes = await fetch(`${base}/products?limit=100`, { headers: dodoHeaders(env) });
    if (listRes.ok) {
      const list = await listRes.json().catch(() => ({}));
      const match = (list.items ?? []).find((p) => p.price === amountCents && p.currency === 'USD' && !p.is_recurring);
      if (match?.product_id) {
        await env.DB.prepare('INSERT OR REPLACE INTO price_products (amount_cents, product_id, created_at) VALUES (?1, ?2, ?3)')
          .bind(amountCents, match.product_id, now()).run();
        return match.product_id;
      }
    }
  } catch { /* fall through to create */ }

  const formattedPrice = (amountCents / 100).toFixed(0);
  const createRes = await fetch(`${base}/products`, {
    method: 'POST',
    headers: dodoHeaders(env),
    body: JSON.stringify({
      name: `Brand My Setup — $${formattedPrice} Spot`,
      description: `Sponsor a custom spot on my desk setup (MacBook, Keyboard keycap, or Mouse) on tinyspot.lol`,
      tax_category: 'digital_products',
      price: { type: 'one_time_price', currency: 'USD', price: amountCents, discount: 0 },
    }),
  });
  const product = await createRes.json().catch(() => ({}));
  if (!createRes.ok || !product.product_id) throw new Error(product?.error?.message || product?.message || 'dodo_product_create_failed');
  
  await env.DB.prepare('INSERT OR REPLACE INTO price_products (amount_cents, product_id, created_at) VALUES (?1, ?2, ?3)')
    .bind(amountCents, product.product_id, now()).run();
  return product.product_id;
}

async function createDodoCheckout(env, { requestOrigin, orderId, spot, sponsorName }) {
  try {
    const productId = await getDodoProductForAmount(env, spot.price_cents, spot.name);
    const base = env.DODO_BASE || 'https://live.dodopayments.com';
    const res = await fetch(`${base}/checkouts`, {
      method: 'POST',
      headers: dodoHeaders(env),
      body: JSON.stringify({
        product_cart: [{ product_id: productId, quantity: 1 }],
        return_url: `${requestOrigin}/?paid=1&order_id=${orderId}&spot_id=${spot.id}`,
        metadata: { order_id: String(orderId), spot_id: spot.id, sponsor_name: sponsorName },
      }),
    });
    const session = await res.json().catch(() => ({}));
    if (!res.ok || !session.checkout_url || !session.session_id) {
      console.error('Dodo checkout creation failed:', res.status, session);
      return { error: 'dodo_error', detail: session?.message || session?.error || 'dodo_checkout_failed' };
    }
    await env.DB.prepare("UPDATE orders SET provider = 'dodo', provider_ref = ? WHERE id = ?").bind(session.session_id, orderId).run();
    return { url: session.checkout_url, session_id: session.session_id };
  } catch (err) {
    console.error('Dodo checkout exception:', err);
    return { error: 'dodo_error', detail: err?.message || String(err) };
  }
}

// ---------- handleClaim ----------

async function handleClaim(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const spotId = cleanText(body.spot_id, 40);
  if (!spotId) return json({ error: 'spot_required', detail: 'Please choose a spot to sponsor.' }, 400);

  const sponsorName = cleanText(body.sponsor_name, 40);
  if (!sponsorName) return json({ error: 'name_required', detail: 'Please enter your Brand / Sponsor Name.' }, 400);

  const sponsorUrl = parseUrl(body.sponsor_url ?? '');
  const sponsorTagline = body.sponsor_tagline ? (cleanText(body.sponsor_tagline, 100) ?? '') : '';
  let sponsorLogoUrl = parseUrl(body.sponsor_logo_url ?? '');
  if (!sponsorLogoUrl && sponsorUrl) {
    try {
      const hostname = new URL(sponsorUrl).hostname;
      sponsorLogoUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
    } catch {}
  }

  // Check spot existence and availability
  const spot = await env.DB.prepare('SELECT * FROM setup_spots WHERE id = ?').bind(spotId).first();
  if (!spot) return json({ error: 'spot_not_found', detail: 'This spot does not exist.' }, 404);
  if (spot.status === 'paid') return json({ error: 'spot_taken', detail: 'This spot has already been claimed!' }, 409);

  // Create pending order
  const ins = await env.DB.prepare(
    `INSERT INTO orders (spot_id, amount_cents, sponsor_name, sponsor_url, sponsor_tagline, sponsor_logo_url, provider, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'dodo', 'pending', ?)`
  ).bind(spotId, spot.price_cents, sponsorName, sponsorUrl, sponsorTagline, sponsorLogoUrl, now()).run();
  const orderId = ins.meta.last_row_id;

  const origin = new URL(request.url).origin;
  const checkout = await createDodoCheckout(env, { requestOrigin: origin, orderId, spot, sponsorName });

  if (checkout.error) {
    await env.DB.prepare("UPDATE orders SET status = 'abandoned' WHERE id = ?").bind(orderId).run();
    return json({ error: 'checkout_failed', detail: checkout.detail || checkout.error }, 502);
  }

  return json({ type: 'dodo', checkout_url: checkout.url, order_id: orderId, spot_id: spotId });
}

// ---------- handleConfirm ----------

async function handleConfirm(request, env, url) {
  const orderIdParam = url.searchParams.get('order_id');
  const spotIdParam = url.searchParams.get('spot_id');
  let sessionId = url.searchParams.get('session_id');

  if (orderIdParam) {
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(Number(orderIdParam)).first();
    if (order?.status === 'paid') return json({ paid: true, spot_id: order.spot_id, order_id: order.id });
    if (order?.provider_ref) sessionId = order.provider_ref;
  }

  if (!sessionId && spotIdParam) {
    const spot = await env.DB.prepare('SELECT * FROM setup_spots WHERE id = ?').bind(spotIdParam).first();
    if (spot?.status === 'paid') return json({ paid: true, spot_id: spot.id });
  }

  if (!sessionId) return json({ error: 'missing_session_id' }, 400);

  const base = env.DODO_BASE || 'https://live.dodopayments.com';
  let session = null;
  try {
    const res = await fetch(`${base}/checkouts/${encodeURIComponent(sessionId)}`, { headers: dodoHeaders(env) });
    session = await res.json().catch(() => ({}));
  } catch (e) {
    return json({ error: 'dodo_lookup_failed', detail: String(e?.message ?? e) }, 502);
  }

  const isPaid = session?.payment_status === 'paid' || session?.payment_status === 'succeeded' || session?.status === 'succeeded' || session?.status === 'complete';
  if (isPaid) {
    const result = await markSpotPaid(env, { orderId: Number(orderIdParam) || null, spotId: spotIdParam || null, ref: sessionId });
    return json({ paid: true, ...result });
  }

  return json({ paid: false, status: session?.payment_status ?? session?.status ?? 'unknown' });
}

// ---------- Webhook ----------

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
    await markSpotPaid(env, {
      orderId: Number(d.metadata?.order_id) || null,
      spotId: d.metadata?.spot_id || null,
      ref: d.checkout_session_id ?? null,
    });
  }
  return json({ received: true });
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
      this.broadcast(JSON.stringify({ type: 'presence', online: count, views: views + 1000 }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith('/stats')) {
      let views = (await this.storage.get('views')) || 0;
      if (url.searchParams.get('hit') === '1') { views++; await this.storage.put('views', views); }
      const sockets = this.ctx.getWebSockets ? this.ctx.getWebSockets() : [];
      const count = Math.max(1, sockets.length);
      return new Response(JSON.stringify({ online: count, views: views + 1000 }), { headers: { 'content-type': 'application/json' } });
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketClose(ws) {
    const sockets = this.ctx.getWebSockets ? this.ctx.getWebSockets() : [];
    const count = Math.max(1, sockets.length);
    const views = (await this.storage.get('views')) || 1;
    this.broadcast(JSON.stringify({ type: 'presence', online: count, views: views + 1000 }));
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
        if (request.method === 'GET' && pathname === '/api/spots') {
          return attachCookies(json(await getSpotsBoard(env)));
        }
        if (request.method === 'POST' && pathname === '/api/claim') {
          return attachCookies(await handleClaim(request, env));
        }
        if (request.method === 'GET' && pathname === '/api/confirm') {
          return attachCookies(await handleConfirm(request, env, url));
        }
        if (request.method === 'POST' && pathname === '/api/dodo/webhook') {
          return await handleDodoWebhook(request, env);
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
