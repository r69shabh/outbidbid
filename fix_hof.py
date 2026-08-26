import re

with open('/Users/rishabh/pgming/outbid/public/index.html', 'r') as f:
    html = f.read()

hof_func_old_regex = re.compile(r'function renderHof\(hof, currentKingId\) \{.*?\n  \}', re.DOTALL)

hof_func_new = '''function renderHof(hof, currentKingId) {
    const list = $('hofList');
    const title = $('hofTitle');
    // hof[0] is the current king — skip it, show rest as past kings
    const past = hof.filter((b, i) => i > 0);
    if (past.length === 0) { title.style.display = 'none'; list.innerHTML = ''; return; }
    title.style.display = 'block';
    list.innerHTML = past.map((b, i) => {
      const link = b.payer_url ? `<a href="${esc(b.payer_url)}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;font-size:13.5px; display:block; margin-top:3px; font-weight:700;">${esc(b.payer_url.replace(/^https?:\\/\\//, ''))}</a>` : '';
      const sub = b.payer_tagline ? `<div style="font-size:13.5px; color:var(--text-sub); margin-top:5px; font-weight:700; line-height:1.4;">${esc(b.payer_tagline)}</div>` : '';
      return `
        <li class="hof-card" style="align-items: flex-start;">
          <div class="hof-rank" style="margin-top:6px;">${i + 2}</div>
          <div class="hof-avatar" style="margin-top:2px;">${avatarHTML(b.payer_name, b.payer_url, 'hof')}</div>
          <div class="hof-info">
            <div class="hof-name" style="font-size:16px;">${esc(b.payer_name || 'Anonymous')}</div>
            ${link}
            ${sub}
          </div>
          <div class="hof-time" style="margin-top:6px; font-size:12px;">${timeAgo(b.paid_at)}</div>
        </li>`;
    }).join('');
  }'''

html = hof_func_old_regex.sub(hof_func_new, html)

with open('/Users/rishabh/pgming/outbid/public/index.html', 'w') as f:
    f.write(html)
