// Verify the Dodo webhook endpoint on production:
// - a correctly-signed payment.succeeded settles bid 13
// - a bad signature is rejected
const crypto = require('crypto');
const fs = require('fs');
const BASE = 'https://outbidbid.rishabhgusain-6.workers.dev';

const secret = fs.readFileSync('.dodo_whsec_test', 'utf8').trim();
const id = 'evt_' + crypto.randomBytes(8).toString('hex');
const ts = Math.floor(Date.now() / 1000).toString();
const body = JSON.stringify({
  type: 'payment.succeeded',
  data: {
    payload_type: 'Payment',
    payment_id: 'pay_test_e2e',
    status: 'succeeded',
    total_amount: 500,
    currency: 'USD',
    metadata: { bid_id: '13' },
    checkout_session_id: 'cks_0Nm2SBbypZZcie8CBdcz2',
  },
});

const sign = (s) => 'v1,' + crypto.createHmac('sha256', s).update(`${id}.${ts}.${body}`).digest('base64');
const headers = (sig) => ({
  'content-type': 'application/json',
  'webhook-id': id,
  'webhook-timestamp': ts,
  'webhook-signature': sig,
});

(async () => {
  const good = await fetch(`${BASE}/api/dodo/webhook`, { method: 'POST', headers: headers(sign(secret)), body });
  console.log('valid signature ->', good.status, await good.text());
  const bad = await fetch(`${BASE}/api/dodo/webhook`, { method: 'POST', headers: headers(sign('wrong-secret')), body });
  console.log('bad signature  ->', bad.status, await bad.text());

  const lb = await (await fetch(`${BASE}/api/leaderboard`)).json();
  console.log('top of board:', lb.sites.filter((s) => s.total_cents > 0).map((s) => `#${s.rank} ${s.title} $${s.total_cents / 100}`).join(' | ') || '(all $0)');
})();
