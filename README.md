# 👑 OUTBIDBID

**The bid-to-rank board for bid-to-rank boards.** List your bidding site, pay to climb, outbid the outbidders. The King takes the throne.

**LIVE:** https://outbidbid.rishabhgusain-6.workers.dev

Built on the August 2026 `.lol` pay-to-rank frenzy (outbid.lol, payluck.lol, ringrank.lol, vibewar.lol…) — this is the *meta* version: the leaderboard where the bidding sites themselves fight for #1.

## Stack ($0/month)

- **Cloudflare Workers + D1** (both free tier) — backend, DB, hosting
- **Dodo Payments** (Merchant of Record) — hosted checkout, cards/Apple Pay/Google Pay, handles global sales tax
- Zero npm dependencies in production. Vanilla JS frontend.

## How it works

| Rule | Detail |
|---|---|
| Minimum bid | $1, whole dollars (Dodo prices bids as quantity × a $1 product) |
| Ranking | Site total = sum of paid bids in the last 30 days. Highest = #1. Ties go to whoever hit the number first. |
| Expiry | Bids older than 30 days stop counting (rank decays automatically) |
| Listing | A site appears on the board only when its first bid is PAID (no squatting) |
| Settlement | Signed `payment.succeeded` webhook (primary) + authenticated `/api/confirm` session lookup on return (both idempotent) |
| Data | **No seed data.** The board starts empty — every listing and every dollar comes from a real paid bid |

### Payment flow

```
POST /api/bid  ──►  creates pending bid ──►  POST {DODO_BASE}/checkouts
                                              (product_cart: $1 "Outbidbid Bid" × quantity)
                 ◄─  {checkout_url}  ────────── user pays on Dodo's hosted page
user returns to /thanks?session_id=cks_…  ──►  GET /api/confirm
Dodo also POSTs /api/dodo/webhook (Standard Webhooks HMAC)  ──►  either path settles the bid
```

### API

```
GET  /api/leaderboard        # board + live feed + pot + takeover price
POST /api/bid                # {site_id} or {new_site:{title,url,tagline}} + amount_cents + payer_name
GET  /api/confirm?session_id # server-side session verification (return URL path)
POST /api/dodo/webhook       # signed payment.succeeded events
POST /api/admin              # {token, action: stats|remove_site|wipe_demo|dodo_setup|dodo_webhook}
```

Secrets/vars on the Worker:

| Var | Kind | Value |
|---|---|---|
| `DODO_API_KEY` | secret | your Dodo API key (currently a **test** key) |
| `DODO_BASE` | var | `https://test.dodopayments.com` → switch to `https://live.dodopayments.com` with a live key |
| `DODO_PRODUCT_ID` | var | `pdt_0Nm2RvrIp9B6H5GqDB1Ai` ($1 "Outbidbid Bid" product, auto-created) |
| `DODO_WEBHOOK_SECRET` | secret | ⚠ paste from Dodo dashboard → Developer → Webhooks (see below) |
| `ADMIN_TOKEN` | secret | in `.admin_token` (gitignored) |

## ✅ Already done (verified on production)

- Dodo checkout sessions with dynamic amounts ($1 × quantity) — verified with a real session
- Webhook endpoint registered with Dodo (`/api/dodo/webhook`, payment.succeeded only)
- Signature verification verified end-to-end: valid HMAC settles the bid, invalid rejected
- `/api/confirm` authenticated session lookup verified
- All seed/mock data wiped from production — empty board, real bids only from here on

## 🚀 GO-LIVE CHECKLIST (real money)

1. **Get the webhook signing secret** (2 min): Dodo dashboard → Developer → Webhooks → the `outbidbid` endpoint → copy the signing secret:
   ```bash
   npx wrangler secret put DODO_WEBHOOK_SECRET   # paste whsec/secret from dashboard
   ```
   Until then, settlement happens via the return-URL confirm path (works fine); the webhook is redundancy for users who close the tab.
2. **Switch to live mode**: Dodo dashboard → activate your business/payouts → create a **live API key**:
   ```bash
   npx wrangler secret put DODO_API_KEY      # paste live key
   ```
   Then edit `wrangler.jsonc`: `DODO_BASE` → `https://live.dodopayments.com`, and run `npx wrangler d1_setup`-style: actually just re-run setup for live:
   ```bash
   curl -X POST https://outbidbid.rishabhgusain-6.workers.dev/api/admin \
     -H 'content-type: application/json' \
     -d "{\"token\":\"$(cat .admin_token)\",\"action\":\"dodo_setup\"}"
   # → returns live product_id; put it in wrangler.jsonc → npx wrangler deploy
   ```
3. **Test a $1 bid yourself**, then post the link on X / get listed on lolrouter.lol & rankmarkets.lol.

⚠ Security: your Dodo API key was shared in a chat — rotate it in the dashboard when convenient (`wrangler secret put DODO_API_KEY`).

## 🌐 Free domain options (all $0)

| Option | URL | Notes |
|---|---|---|
| **us.kg** (DigitalPlat) ⭐ | [domain.digitalplat.org](https://domain.digitalplat.org/) | Best free option — real-looking domain like `outbidbid.us.kg`, free Cloudflare-compatible NS. Registration needs account + verification; approval usually days. |
| **eu.org** | [nic.eu.org](https://nic.eu.org/) | Free since 1996, most reputable. `outbidbid.eu.org`. Approval can take weeks. |
| **pp.ua** | via registrars like [nics.pp.ua](https://nics.pp.ua/) | Free Ukrainian subdomains. |
| workers.dev | (already yours) | `outbidbid.rishabhgusain-6.workers.dev` — free forever. |

Attach any of them once approved (example: `outbidbid.us.kg`):
1. Register at DigitalPlat, get the domain.
2. Add the domain to Cloudflare (dashboard → Add site → Free plan) → Cloudflare gives you 2 nameservers.
3. Set those nameservers in DigitalPlat's panel.
4. Attach:
   ```bash
   npx wrangler domains attach outbidbid.us.kg
   ```
A real `.lol` still costs ~$20–35/yr (Porkbun/Namecheap/Cloudflare Registrar) if you want the trend-native look.

## Local dev

```bash
npm install
npm run setup:local     # schema into local D1 (empty board)
npm run dev             # http://localhost:8787 (change port if busy)
```

Local dev runs in **demo mode** (simulated payments) unless you put Dodo vars in `.dev.vars`. Note: Dodo's API blocks direct calls from some residential networks — production calls run from Cloudflare's edge and work fine (verified).

## Testing

```bash
node test-dodo-webhook.js   # verifies signature verification + settlement (needs .dodo_whsec_test)
```

Dodo test card: `4242 4242 4242 4242`, any future expiry, any CVC (test mode only).

## ⚠️ Honest notes

- "Money overnight" is hype — outbid.lol was first with an audience. The product is done; distribution is the work.
- Dodo as Merchant of Record handles taxes/compliance and takes a fee + payout schedule — check their pricing.
- No refunds is enforced socially, not legally — check local consumer law if bids grow.
- Costs at $0: Workers free tier (100k req/day), D1 free tier (5M rows/day). Viral traffic ≈ Cloudflare's $5/mo paid plan.

## Files

```
src/worker.js            # entire backend (~500 lines, no deps)
public/index.html        # the whole frontend (one file)
public/thanks.html       # post-payment verification page
schema.sql               # D1 schema (no seed data by design)
test-dodo-webhook.js     # webhook signature test
.admin_token / .dodo_key # secrets (gitignored)
```
