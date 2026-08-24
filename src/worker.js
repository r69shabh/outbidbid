// Outbidbid — the bid-to-rank board for bid-to-rank boards.
// Cloudflare Worker + D1. Payments via Dodo Payments official SDK. No other dependencies.

import { DurableObject } from 'cloudflare:workers';
import DodoPayments from 'dodopayments';

const MIN_BID_CENTS = 100;              // $1 minimum
const MAX_BID_CENTS = 1_000_000;        // $10,000 cap per bid
const BID_WINDOW_SECONDS = 30 * 86400;  // bids count toward rank for 30 days
const PENDING_TTL_SECONDS = 86400;      // unpaid bids abandoned after 24h
const MAX_SITES_RETURNED = 200;
const ONLINE_WINDOW_SECONDS = 65;       // presence window (page polls every 10s)
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

// ---------- validation helpers ----------

function cleanText(v, maxLen) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (t.length < 1 || t.length > maxLen) return null;
  return t;
}

function parseAmount(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < MIN_BID_CENTS || n > MAX_BID_CENTS) return null;
  return n;
}

// Accepts "foo.lol", "https://foo.lol/path" -> { url: 'https://foo.lol', host: 'foo.lol' }
function parseSiteUrl(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 300) return null;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host.length > 253 || /[^a-z0-9.-]/.test(host)) return null;
  if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(host)) return null;
  return { url: u.origin, host };
}

// ---------- presence & page view tracking ----------

function getVisitorId(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/obb_vid=([^;]+)/);
  if (match && match[1] && match[1].length >= 8) {
    return { vid: match[1], isNew: false };
  }
  const vid = 'v_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return { vid, isNew: true };
}

async function recordPresenceAndView(env, request) {
  const { vid, isNew } = getVisitorId(request);
  const t = now();
  const cutoff = t - ONLINE_WINDOW_SECONDS;

  // Track active presence
  try {
    await env.DB.prepare(
      `INSERT INTO presence (visitor_id, last_seen) VALUES (?1, ?2)
       ON CONFLICT(visitor_id) DO UPDATE SET last_seen = ?2`
    ).bind(vid, t).run();

    // Occasional cleanup of stale presence rows
    if (Math.random() < 0.05) {
      await env.DB.prepare('DELETE FROM presence WHERE last_seen < ?').bind(cutoff - 300).run();
    }
  } catch (e) {
    console.warn('Presence track error:', e);
  }

  // Track unique page view (once per 30 minutes per visitor)
  try {
    const recent = await env.DB.prepare(
      'SELECT id FROM page_views WHERE visitor_id = ? AND created_at > ? LIMIT 1'
    ).bind(vid, t - 1800).first();

    if (!recent) {
      await env.DB.prepare(
        'INSERT INTO page_views (visitor_id, created_at) VALUES (?, ?)'
      ).bind(vid, t).run();
    }
  } catch (e) {
    console.warn('Page view track error:', e);
  }

  return { vid, isNew };
}

// ---------- leaderboard ----------

async function getLeaderboard(env) {
  const cutoff = now() - BID_WINDOW_SECONDS;

  const sitesRes = await env.DB.prepare(
    `SELECT s.id, s.title, s.url, s.host, s.tagline, s.created_at,
            COALESCE(SUM(CASE WHEN b.status='paid' AND b.paid_at >= ?1 THEN b.amount_cents END), 0) AS total_cents,
            COALESCE(SUM(CASE WHEN b.status='paid' AND b.paid_at >= ?1 THEN 1 ELSE 0 END), 0) AS bid_count,
            COALESCE(MAX(CASE WHEN b.status='paid' AND b.paid_at >= ?1 THEN b.paid_at END), 0) AS last_bid_at
     FROM sites s LEFT JOIN bids b ON b.site_id = s.id
     GROUP BY s.id
     ORDER BY total_cents DESC, last_bid_at ASC, s.created_at ASC
     LIMIT ${MAX_SITES_RETURNED}`
  )
    .bind(cutoff)
    .all();

  const recentRes = await env.DB.prepare(
    `SELECT b.id, b.amount_cents, b.paid_at, b.provider, b.payer_name, s.title, s.host
     FROM bids b JOIN sites s ON s.id = b.site_id
     WHERE b.status = 'paid'
     ORDER BY b.paid_at DESC LIMIT 15`
  ).all();

  const pot = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS pot FROM bids
     WHERE status = 'paid' AND paid_at >= ?`
  )
    .bind(cutoff)
    .first();

  let onlineCount = 1;
  let viewCount = 1;

  if (env.PRESENCE) {
    try {
      const id = env.PRESENCE.idFromName('global');
      const stub = env.PRESENCE.get(id);
      const res = await stub.fetch('http://presence/stats?hit=1');
      if (res.ok) {
        const stats = await res.json();
        onlineCount = stats.online;
        viewCount = stats.views;
      }
    } catch (err) {
      console.warn('Presence DO query error:', err);
    }
  } else {
    try {
      const presenceRow = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM presence WHERE last_seen >= ?'
      ).bind(now() - ONLINE_WINDOW_SECONDS).first();
      if (presenceRow && typeof presenceRow.count === 'number') {
        onlineCount = Math.max(1, presenceRow.count);
      }

      const viewsRow = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM page_views'
      ).first();
      if (viewsRow && typeof viewsRow.count === 'number') {
        viewCount = Math.max(1, viewsRow.count);
      }
    } catch (err) {
      console.warn('Analytics query error:', err);
    }
  }

  const sites = sitesRes.results.map((s, i) => ({
    rank: s.total_cents > 0 ? i + 1 : null,
    id: s.id,
    title: s.title,
    url: s.url,
    host: s.host,
    tagline: s.tagline,
    total_cents: s.total_cents,
    bid_count: s.bid_count,
    last_bid_at: s.last_bid_at,
  }));

  const top = sites.find((s) => s.rank === 1);
  const npLive = !!env.NOWPAYMENTS_API_KEY;
  const dodoLive = !!(env.DODO_API_KEY && env.DODO_PRODUCT_ID);
  const stripeLive = !!env.STRIPE_SECRET_KEY;
  return {
    mode: npLive ? 'nowpayments' : stripeLive ? 'stripe' : dodoLive ? 'dodo' : 'demo',
    dodo_env: (env.DODO_BASE ?? '').includes('live') ? 'live' : 'test',
    min_bid_cents: MIN_BID_CENTS,
    pot_cents: pot?.pot ?? 0,
    take_over_cents: (top?.total_cents ?? 0) + MIN_BID_CENTS,
    window_days: BID_WINDOW_SECONDS / 86400,
    sites,
    recent_bids: recentRes.results,
    online_count: onlineCount,
    view_count: viewCount,
  };
}

// ---------- payment settlement (shared by webhook / confirm / demo) ----------

async function markPaid(env, { id, ref }) {
  const bid = await env.DB.prepare(
    'SELECT * FROM bids WHERE (?1 IS NOT NULL AND id = ?1) OR (?2 IS NOT NULL AND provider_ref = ?2) LIMIT 1'
  )
    .bind(id ?? null, ref ?? null)
    .first();

  if (!bid) return { ok: false, error: 'bid_not_found' };
  if (bid.status === 'paid') return { ok: true, already: true };
  if (bid.status !== 'pending') return { ok: false, error: 'not_pending' };

  let siteId = bid.site_id;
  if (!siteId && bid.new_url) {
    const parsed = parseSiteUrl(bid.new_url);
    if (!parsed) return { ok: false, error: 'invalid_url_on_settle' };
    const existing = await env.DB.prepare('SELECT id FROM sites WHERE host = ?').bind(parsed.host).first();
    if (existing) {
      siteId = existing.id;
    } else {
      const ins = await env.DB.prepare(
        'INSERT INTO sites (title, url, host, tagline, created_at) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(bid.new_title, parsed.url, parsed.host, bid.new_tagline ?? '', now())
        .run();
      siteId = ins.meta.last_row_id;
    }
  }

  await env.DB.prepare(
    "UPDATE bids SET status = 'paid', paid_at = ?, site_id = ? WHERE id = ? AND status = 'pending'"
  )
    .bind(now(), siteId, bid.id)
    .run();

  return { ok: true, site_id: siteId };
}

// ---------- Stripe (instant live-mode rail; wave standard) ----------

async function createStripeCheckout(env, { requestOrigin, bidId, amountCents, label }) {
  const p = new URLSearchParams();
  p.set('mode', 'payment');
  p.set('success_url', `${requestOrigin}/?paid=1&session_id={CHECKOUT_SESSION_ID}`);
  p.set('cancel_url', `${requestOrigin}/`);
  p.set('client_reference_id', `bid_${bidId}`);
  p.set('metadata[bid_id]', String(bidId));
  p.set('line_items[0][quantity]', '1');
  p.set('line_items[0][price_data][currency]', 'usd');
  p.set('line_items[0][price_data][unit_amount]', String(amountCents));
  p.set('line_items[0][price_data][product_data][name]', `Outbidbid bid — ${label}`);
  p.set('line_items[0][price_data][product_data][description]', 'Pay-to-rank listing. Bids count for 30 days. No refunds.');

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: p,
  });
  const session = await res.json().catch(() => ({}));
  if (!res.ok || !session.url) {
    return { error: session?.error?.message ?? 'stripe_session_failed' };
  }
  await env.DB.prepare("UPDATE bids SET provider = 'stripe', provider_ref = ? WHERE id = ?")
    .bind(session.id, bidId)
    .run();
  return { url: session.url };
}

const hexBuf = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(
    sigHeader.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  );
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
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_payload' }, 400);
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data?.object ?? {};
    await markPaid(env, { ref: s.id, id: Number(s.metadata?.bid_id) || null });
  }
  return json({ received: true });
}

// ---------- NOWPayments (instant crypto rail — no KYC, live tonight) ----------

const NP_BASE = 'https://api.nowpayments.io/v1';
const NP_SETTLED = new Set(['confirmed', 'finished']);

async function createNpInvoice(env, { requestOrigin, bidId, amountCents, label }) {
  const res = await fetch(`${NP_BASE}/invoice`, {
    method: 'POST',
    headers: {
      'x-nowpayments-api-key': env.NOWPAYMENTS_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      price_amount: amountCents / 100,
      price_currency: 'usd',
      order_id: `bid_${bidId}`,
      order_description: `Outbidbid bid — ${label}`,
      success_url: `${requestOrigin}/?paid=1`,
      cancel_url: `${requestOrigin}/`,
      ipn_callback_url: `${requestOrigin}/api/nowpayments/ipn`,
    }),
  });
  const inv = await res.json().catch(() => ({}));
  if (!res.ok || !inv.invoice_url) {
    return { error: inv?.message ?? 'np_invoice_failed' };
  }
  await env.DB.prepare("UPDATE bids SET provider = 'nowpayments', provider_ref = ? WHERE id = ?")
    .bind(String(inv.id), bidId)
    .run();
  return { url: inv.invoice_url };
}

// NP signs IPNs with HMAC-SHA512 over the JSON body with keys sorted alphabetically
function sortedStringify(v) {
  if (Array.isArray(v)) return `[${v.map(sortedStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${sortedStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

async function verifyNpSignature(bodyText, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  let obj;
  try {
    obj = JSON.parse(bodyText);
  } catch {
    return false;
  }
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
  try {
    ipn = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_payload' }, 400);
  }
  if (NP_SETTLED.has(ipn.payment_status)) {
    const bidId = Number(String(ipn.order_id ?? '').replace(/^bid_/, '')) || null;
    await markPaid(env, { id: bidId, ref: ipn.invoice_id ? String(ipn.invoice_id) : null });
  }
  return json({ received: true });
}

// ---------- Dodo Payments (plain REST, no SDK) ----------

const dodoHeaders = (env) => ({
  authorization: `Bearer ${env.DODO_API_KEY}`,
  'content-type': 'application/json',
});

const dodoClient = (env) =>
  new DodoPayments({
    bearerToken: env.DODO_API_KEY,
    environment: (env.DODO_BASE ?? '').includes('test') ? 'test_mode' : 'live_mode',
  });

async function createDodoCheckout(env, { requestOrigin, bidId, amountCents, label }) {
  // Dodo product carts price by quantity of a fixed-price product, so bids are
  // whole-dollar multiples of the $1 "Outbidbid Bid" product.
  const session = await dodoClient(env).checkoutSessions.create({
    product_cart: [{ product_id: env.DODO_PRODUCT_ID, quantity: amountCents / 100 }],
    return_url: `${requestOrigin}/?paid=1&bid_id=${bidId}`,
    metadata: { bid_id: String(bidId), label: label || 'Outbidbid Bid' },
  });
  if (!session?.checkout_url || !session?.session_id) {
    return { error: session?.message ?? 'dodo_checkout_failed' };
  }
  await env.DB.prepare("UPDATE bids SET provider = 'dodo', provider_ref = ? WHERE id = ?")
    .bind(session.session_id, bidId)
    .run();
  return { url: session.checkout_url };
}

// Standard Webhooks verification: HMAC-SHA256 over "{id}.{timestamp}.{body}", base64.
async function verifyDodoSignature(rawBody, headers, secret) {
  const id = headers.get('webhook-id');
  const ts = headers.get('webhook-timestamp');
  const sigHeader = headers.get('webhook-signature') ?? '';
  if (!id || !ts || !sigHeader || !secret) return false;
  if (Math.abs(now() - Number(ts)) > 300) return false;

  // header is "v1,<base64>" (possibly repeated) — parse pairs, not a naive split
  const provided = [...sigHeader.matchAll(/v1,([A-Za-z0-9+/=]+)/g)].map((m) => m[1]);
  if (provided.length === 0) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${id}.${ts}.${rawBody}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  // constant-time-ish: hash both sides before string comparison
  const safe = async (v) => hexOf(await crypto.subtle.digest('SHA-256', enc.encode(v)));
  return (await safe(expected)) === (await safe(provided[0]));
}

const hexOf = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// ---------- routes ----------

async function handleBid(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const npLive = !!env.NOWPAYMENTS_API_KEY;
  const dodoLive = !!(env.DODO_API_KEY && env.DODO_PRODUCT_ID);
  const stripeLive = !!env.STRIPE_SECRET_KEY;

  const amount = parseAmount(body.amount_cents);
  if (!amount) {
    return json({ error: 'invalid_amount', min: MIN_BID_CENTS, max: MAX_BID_CENTS }, 400);
  }
  if (!npLive && !stripeLive && dodoLive && amount % 100 !== 0) {
    return json({ error: 'whole_dollar_required', detail: 'Dodo-mode bids must be whole dollars' }, 400);
  }
  const payerName = body.payer_name ? cleanText(body.payer_name, 40) : '';
  if (body.payer_name && payerName === null) return json({ error: 'invalid_name' }, 400);

  // accept both flat (new_url/new_title) and nested ({new_site:{url,title,tagline}}) payloads
  const ns = body.new_site ?? {};
  const newUrl = body.new_url ?? ns.url;
  const newTitle = body.new_title ?? ns.title;
  const newTagline = body.new_tagline ?? ns.tagline;

  // expire stale pending bids so the board can't be squatted forever
  await env.DB.prepare("UPDATE bids SET status = 'abandoned' WHERE status = 'pending' AND created_at < ?")
    .bind(now() - PENDING_TTL_SECONDS)
    .run();

  let siteId = null;
  let label;

  if (body.site_id) {
    const site = await env.DB.prepare('SELECT * FROM sites WHERE id = ?').bind(Number(body.site_id)).first();
    if (!site) return json({ error: 'site_not_found' }, 404);
    siteId = site.id;
    label = site.title;
  } else {
    const parsed = parseSiteUrl(newUrl);
    const title = cleanText(newTitle, 60);
    if (!parsed || !title || title.length < 2) {
      return json({ error: 'invalid_site', detail: 'need title (2-60 chars) and a valid http(s) URL' }, 400);
    }
    const tagline = newTagline ? cleanText(newTagline, 140) ?? '' : '';

    const existing = await env.DB.prepare('SELECT id, title FROM sites WHERE host = ?').bind(parsed.host).first();
    if (existing) {
      siteId = existing.id;
      label = title || existing.title;
      if (title || tagline) {
        await env.DB.prepare('UPDATE sites SET title = COALESCE(?, title), tagline = COALESCE(?, tagline) WHERE id = ?')
          .bind(title || null, tagline || null, existing.id)
          .run();
      }
    } else {
      label = title;
      var newSite = { title, url: parsed.url, tagline };
    }
  }

  const ins = await env.DB.prepare(
    `INSERT INTO bids (site_id, new_title, new_url, new_tagline, amount_cents, payer_name, provider, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'demo', 'pending', ?)`
  )
    .bind(
      siteId,
      newSite ? newSite.title : null,
      newSite ? newSite.url : null,
      newSite ? newSite.tagline : null,
      amount,
      payerName,
      now()
    )
    .run();
  const bidId = ins.meta.last_row_id;

  if (npLive) {
    const origin = new URL(request.url).origin;
    const inv = await createNpInvoice(env, {
      requestOrigin: origin,
      bidId,
      amountCents: amount,
      label,
    });
    if (inv.error) {
      await env.DB.prepare("UPDATE bids SET status = 'abandoned' WHERE id = ?").bind(bidId).run();
      return json({ error: 'nowpayments_error', detail: inv.error }, 502);
    }
    return json({ type: 'nowpayments', checkout_url: inv.url, bid_id: bidId });
  }

  if (stripeLive) {
    const origin = new URL(request.url).origin;
    const checkout = await createStripeCheckout(env, {
      requestOrigin: origin,
      bidId,
      amountCents: amount,
      label,
    });
    if (checkout.error) {
      await env.DB.prepare("UPDATE bids SET status = 'abandoned' WHERE id = ?").bind(bidId).run();
      return json({ error: 'stripe_error', detail: checkout.error }, 502);
    }
    return json({ type: 'stripe', checkout_url: checkout.url, bid_id: bidId });
  }

  if (dodoLive) {
    const origin = new URL(request.url).origin;
    const checkout = await createDodoCheckout(env, {
      requestOrigin: origin,
      bidId,
      amountCents: amount,
      label,
    });
    if (checkout.error) {
      await env.DB.prepare("UPDATE bids SET status = 'abandoned' WHERE id = ?").bind(bidId).run();
      return json({ error: 'dodo_error', detail: checkout.error }, 502);
    }
    return json({ type: 'dodo', checkout_url: checkout.url, bid_id: bidId });
  }

  // demo mode: no Dodo keys configured — settle via /api/demo-pay
  return json({ type: 'demo', bid_id: bidId, amount_cents: amount });
}

async function handleDemoPay(request, env) {
  if ((env.DODO_API_KEY && env.DODO_PRODUCT_ID) || env.STRIPE_SECRET_KEY || env.NOWPAYMENTS_API_KEY) {
    return json({ error: 'demo_disabled_in_live_mode' }, 403);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const result = await markPaid(env, { id: Number(body.bid_id) || null });
  if (!result.ok) return json({ error: result.error }, 400);
  return json({ ok: true, ...result });
}

// Server-side confirmation: thanks page calls this with the provider session id.
// Stripe ids start with cs_, Dodo ids with cks_ — routed accordingly.
async function handleConfirm(request, env, url) {
  let sessionId = url.searchParams.get('session_id');
  const bidIdParam = url.searchParams.get('bid_id');

  if (!sessionId && bidIdParam) {
    const bid = await env.DB.prepare('SELECT provider_ref, provider FROM bids WHERE id = ?')
      .bind(Number(bidIdParam))
      .first();
    if (bid?.provider_ref) {
      sessionId = bid.provider_ref;
    }
  }

  if (!sessionId) {
    // Fallback: check latest pending bid from the last 15 minutes
    const recent = await env.DB.prepare("SELECT provider_ref, id FROM bids WHERE status = 'pending' AND created_at > ? ORDER BY id DESC LIMIT 1")
      .bind(now() - 900)
      .first();
    if (recent?.provider_ref) {
      sessionId = recent.provider_ref;
    }
  }

  if (!sessionId) return json({ error: 'missing_session_id' }, 400);

  // NOWPayments returns payment_id (and sometimes invoice params) on success_url
  const npId = url.searchParams.get('payment_id') ?? (sessionId && !sessionId.startsWith('cs_') && !sessionId.startsWith('cks_') ? sessionId : null);
  if (npId && env.NOWPAYMENTS_API_KEY) {
    const res = await fetch(`${NP_BASE}/payment/${encodeURIComponent(npId)}`, {
      headers: { 'x-nowpayments-api-key': env.NOWPAYMENTS_API_KEY },
    });
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
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
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
  try {
    session = await dodoClient(env).checkoutSessions.retrieve(sessionId);
  } catch (e) {
    return json({ error: 'dodo_lookup_failed', detail: String(e?.message ?? e).slice(0, 120) }, 502);
  }
  const isPaid =
    session?.payment_status === 'paid' ||
    session?.payment_status === 'succeeded' ||
    session?.status === 'succeeded' ||
    session?.status === 'complete';

  if (isPaid) {
    const result = await markPaid(env, { ref: sessionId });
    return json({ paid: true, ...result });
  }
  return json({ paid: false, status: session?.payment_status ?? session?.status ?? 'unknown' });
}

async function handleDodoWebhook(request, env) {
  if (!env.DODO_WEBHOOK_SECRET) {
    return json({ error: 'webhook_secret_not_configured' }, 400);
  }
  const raw = await request.text();
  const ok = await verifyDodoSignature(raw, request.headers, env.DODO_WEBHOOK_SECRET);
  if (!ok) return json({ error: 'invalid_signature' }, 400);

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_payload' }, 400);
  }

  if (event.type === 'payment.succeeded') {
    const d = event.data ?? {};
    const bidId = Number(d.metadata?.bid_id) || null;
    await markPaid(env, { id: bidId, ref: d.checkout_session_id ?? null });
  }
  return json({ received: true });
}

async function handleAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return json({ error: 'admin_not_configured' }, 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  // hash both sides before comparing to avoid straight string-compare leaks
  const enc = new TextEncoder();
  const [a, b] = await Promise.all(
    [body.token ?? '', env.ADMIN_TOKEN].map((v) =>
      crypto.subtle.digest('SHA-256', enc.encode(v)).then(hexOf)
    )
  );
  if (a !== b) return json({ error: 'unauthorized' }, 401);

  switch (body.action) {
    case 'remove_site': {
      const siteId = Number(body.site_id);
      if (!siteId) return json({ error: 'site_id_required' }, 400);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM bids WHERE site_id = ?').bind(siteId),
        env.DB.prepare('DELETE FROM sites WHERE id = ?').bind(siteId),
      ]);
      return json({ ok: true });
    }
    case 'wipe_demo': {
      // wipes ALL demo-provider paid bids (seed/test data) before going live
      const r = await env.DB.prepare("DELETE FROM bids WHERE provider = 'demo' AND status = 'paid'").run();
      return json({ ok: true, deleted: r.meta.changes });
    }
    case 'stats': {
      const row = await env.DB.prepare(
        `SELECT
           (SELECT COUNT(*) FROM sites) AS sites,
           (SELECT COUNT(*) FROM bids WHERE status='paid') AS paid_bids,
           (SELECT COALESCE(SUM(amount_cents),0) FROM bids WHERE status='paid') AS gross_cents,
           (SELECT COALESCE(SUM(amount_cents),0) FROM bids WHERE status='paid' AND paid_at >= ?) AS active_pot_cents`
      )
        .bind(now() - BID_WINDOW_SECONDS)
        .first();
      return json({ ok: true, ...row });
    }
    // one-time bootstrap: probes which Dodo environment accepts the API key,
    // creates the $1 bid product, and returns the product_id + base to store
    // as DODO_PRODUCT_ID / DODO_BASE. Run once, then remove nothing — idempotent.
    case 'dodo_setup': {
      if (!env.DODO_API_KEY) return json({ error: 'dodo_api_key_missing' }, 400);
      const probe = async (base) => {
        const r = await fetch(`${base}/products?limit=1`, { headers: dodoHeaders(env) });
        return { base, status: r.status };
      };
      const [test, live] = await Promise.all([
        probe(DODO_BASES.test_mode),
        probe(DODO_BASES.live_mode),
      ]);
      const working = live.status === 200 ? live : test.status === 200 ? test : null;
      if (!working) {
        return json({ ok: false, error: 'api_key_rejected_on_both_environments', test: test.status, live: live.status }, 502);
      }

      // reuse an existing product if one was already created (name match)
      const listRes = await fetch(`${working.base}/products?limit=100`, { headers: dodoHeaders(env) });
      const list = await listRes.json().catch(() => ({ items: [] }));
      const existing = (list.items ?? list ?? []).find?.(
        (p) => p.name === 'Outbidbid Bid' && p.price?.price === 100
      );
      if (existing) {
        return json({ ok: true, base: working.base, product_id: existing.product_id, reused: true });
      }

      const createRes = await fetch(`${working.base}/products`, {
        method: 'POST',
        headers: dodoHeaders(env),
        body: JSON.stringify({
          name: 'Outbidbid Bid',
          description: 'One dollar of ranking power on Outbidbid. Bid amount = quantity.',
          tax_category: 'digital_products',
          price: { type: 'one_time_price', currency: 'USD', price: 100, discount: 0 },
        }),
      });
      const product = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !product.product_id) {
        return json({ ok: false, error: 'product_create_failed', detail: product?.error?.message ?? product }, 502);
      }
      return json({ ok: true, base: working.base, product_id: product.product_id });
    }
    // validates the Stripe key + auto-creates the webhook endpoint, returning
    // its signing secret — run once after STRIPE_SECRET_KEY is set
    case 'stripe_setup': {
      if (!env.STRIPE_SECRET_KEY) return json({ error: 'stripe_key_missing' }, 400);
      const auth = { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` };

      const acctRes = await fetch('https://api.stripe.com/v1/account', { headers: auth });
      const acct = await acctRes.json().catch(() => ({}));
      if (!acctRes.ok) return json({ ok: false, error: 'stripe_key_invalid', detail: acct?.error?.message }, 502);

      const origin = new URL(request.url).origin;
      const whRes = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          url: `${origin}/api/stripe/webhook`,
          'enabled_events[0]': 'checkout.session.completed',
          'enabled_events[1]': 'checkout.session.async_payment_succeeded',
          description: 'outbidbid settlement',
        }),
      });
      const wh = await whRes.json().catch(() => ({}));
      if (!whRes.ok || !wh.secret) {
        return json({ ok: false, error: 'webhook_create_failed', detail: wh?.error?.message ?? wh }, 502);
      }
      return json({
        ok: true,
        account: { id: acct.id, country: acct.country, livemode: acct.livemode ?? true, payouts_enabled: acct.payouts_enabled ?? null },
        webhook_id: wh.id,
        webhook_secret: wh.secret,
        note: 'set STRIPE_WEBHOOK_SECRET to webhook_secret',
      });
    }
    // rebrands the Dodo product shown on hosted checkout
    case 'dodo_rename_product': {
      if (!env.DODO_API_KEY || !env.DODO_BASE || !env.DODO_PRODUCT_ID) {
        return json({ error: 'run_dodo_setup_first' }, 400);
      }
      const name = cleanText(body.name, 60);
      if (!name) return json({ error: 'name_required' }, 400);
      const res = await fetch(`${env.DODO_BASE}/products/${env.DODO_PRODUCT_ID}`, {
        method: 'PATCH',
        headers: dodoHeaders(env),
        body: JSON.stringify({ name }),
      });
      const out = await res.json().catch(() => ({}));
      return res.ok ? json({ ok: true, product_id: out.product_id ?? env.DODO_PRODUCT_ID, name })
                    : json({ ok: false, detail: out?.error?.message ?? out }, 502);
    }
    // register the webhook endpoint with Dodo (secret is dashboard-only —
    // paste it into DODO_WEBHOOK_SECRET after checking the dashboard)
    case 'dodo_webhook': {
      if (!env.DODO_API_KEY || !env.DODO_BASE) return json({ error: 'run_dodo_setup_first' }, 400);
      const origin = new URL(request.url).origin;
      const res = await fetch(`${env.DODO_BASE}/webhooks`, {
        method: 'POST',
        headers: dodoHeaders(env),
        body: JSON.stringify({
          url: `${origin}/api/dodo/webhook`,
          description: 'outbidbid payment settlement',
          filter_types: ['payment.succeeded'],
        }),
      });
      const wh = await res.json().catch(() => ({}));
      if (!res.ok) return json({ ok: false, error: 'webhook_create_failed', detail: wh?.error?.message ?? wh }, 502);
      return json({ ok: true, webhook_id: wh.id, url: wh.url, note: 'copy signing secret from dashboard -> DODO_WEBHOOK_SECRET' });
    }
    case 'dodo_info': {
      if (!env.DODO_API_KEY) return json({ error: 'no_dodo_api_key' }, 400);
      try {
        const client = dodoClient(env);
        const brands = await client.brands.list().catch((e) => ({ error: e?.message ?? e }));
        const products = await client.products.list().catch((e) => ({ error: e?.message ?? e }));
        return json({ ok: true, brands, products, current_product_id: env.DODO_PRODUCT_ID });
      } catch (err) {
        return json({ ok: false, error: err?.message ?? String(err) }, 500);
      }
    }
    default:
      return json({ error: 'unknown_action' }, 400);
  }
}

// ---------- PresenceTracker Durable Object (Cloudflare Native Real-Time) ----------

export class PresenceTracker extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.storage = ctx.storage;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // WebSocket connection for real-time presence
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      if (this.ctx.acceptWebSocket) {
        this.ctx.acceptWebSocket(server);
      } else {
        server.accept();
      }

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
      if (url.searchParams.get('hit') === '1') {
        views++;
        await this.storage.put('views', views);
      }
      const sockets = this.ctx.getWebSockets ? this.ctx.getWebSockets() : [];
      const count = Math.max(1, sockets.length);
      return new Response(JSON.stringify({ online: count, views: Math.max(1, views) }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketClose(ws, code, reason, wasClean) {
    const sockets = this.ctx.getWebSockets ? this.ctx.getWebSockets() : [];
    const count = Math.max(1, sockets.length);
    const views = (await this.storage.get('views')) || 1;
    this.broadcast(JSON.stringify({ type: 'presence', online: count, views }));
  }

  async webSocketError(ws, error) {
    try { ws.close(); } catch (e) {}
  }

  broadcast(message) {
    if (!this.ctx.getWebSockets) return;
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(message);
      } catch (e) {}
    }
  }
}

// ---------- entry ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Track active presence and page view
    let visitorInfo = { vid: '', isNew: false };
    try {
      visitorInfo = await recordPresenceAndView(env, request);
    } catch (e) {
      console.warn('Analytics tracking error:', e);
    }

    const attachCookies = (res) => {
      if (visitorInfo.isNew && visitorInfo.vid) {
        res.headers.append(
          'Set-Cookie',
          `${VID_COOKIE}=${visitorInfo.vid}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`
        );
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
          return attachCookies(json(await getLeaderboard(env)));
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

    // non-API unknown paths fall back to the SPA (asset miss reaches here)
    return attachCookies(Response.redirect(url.origin + '/', 302));
  },
};
