import re

with open('/Users/rishabh/pgming/outbid/public/index.html', 'r') as f:
    html = f.read()

# 1. Header background
html = html.replace(
    'background: rgba(17,27,33,0.88);\n    backdrop-filter: blur(12px);\n    -webkit-backdrop-filter: blur(12px);',
    'background: var(--bg);'
)

# 2. Page Layout (CSS)
css_insert = """
  /* ── LAYOUT ── */
  .page-wrapper {
    max-width: 1040px;
    margin: 0 auto;
    padding: 80px 20px 40px;
    display: grid;
    grid-template-columns: 1fr;
    gap: 32px;
  }
  .desktop-only { display: none; }
  
  @media (min-width: 900px) {
    .page-wrapper {
      grid-template-columns: 320px 1fr;
      align-items: start;
    }
    .desktop-only { display: block; position: sticky; top: 90px; }
    .mobile-only { display: none; }
    .page { padding: 0 !important; max-width: 640px; width: 100%; margin: 0; }
  }

  .info-btn { cursor: pointer; background: var(--card); border: 1.5px solid var(--line); padding: 5px 10px; }
  .info-btn:hover { background: var(--line); }
"""

html = html.replace('/* ── MAIN LAYOUT ── */', css_insert + '\n  /* ── MAIN LAYOUT ── */')

# 3. Header i icon
header_stats_old = '<div class="header-stats">'
header_stats_new = '''<div class="header-stats">
    <button class="stat-pill info-btn" onclick="openInfoModal()" aria-label="Info">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
    </button>'''
html = html.replace(header_stats_old, header_stats_new)

# 4. Extract How Card
how_card_html = '''<div class="how-card">
    <div class="how-title">How it works</div>
    <div class="how-steps">
      <div class="how-step">
        <span class="how-num">1</span>
        <div class="how-text"><strong>Pay $1</strong> — enter your name, link, and a message. Then pay one dollar.</div>
      </div>
      <div class="how-step">
        <span class="how-num">2</span>
        <div class="how-text"><strong>You're #1</strong> — you instantly become the current king of the hill.</div>
      </div>
      <div class="how-step">
        <span class="how-num">3</span>
        <div class="how-text"><strong>Get dethroned</strong> — the moment anyone else pays $1, they take your crown. Most recent always wins.</div>
      </div>
    </div>
  </div>'''

# 5. Restructure HTML (wrap in page-wrapper)
main_open = '<main class="page">'
main_close = '</main>'

# Remove the existing how-card from the middle
how_card_regex = re.compile(r'<!-- HOW IT WORKS -->.*?</div>\s*</div>\s*</div>', re.DOTALL)
html = how_card_regex.sub('', html)

# Build the new layout
new_layout = f'''<div class="page-wrapper">
  <aside class="sidebar desktop-only">
    {how_card_html}
    <div class="credit-card" style="margin-top: 16px; padding: 16px 20px; border: 2px solid var(--line); border-radius: var(--radius); background: var(--card); display: flex; justify-content: space-between; align-items: center;">
       <span style="font-size:14px; font-weight:800; color:var(--text-sub);">Made by r69shabh</span>
       <div style="display:flex; gap: 16px;">
         <a href="https://github.com/r69shabh" target="_blank" style="color:var(--text-faint);"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg></a>
         <a href="https://x.com/r69shabh" target="_blank" style="color:var(--text-faint);"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
       </div>
    </div>
  </aside>
  <main class="page">'''

html = html.replace('<main class="page">', new_layout)

# Add mobile how-card
html = html.replace('<!-- HALL OF FAME -->', f'<!-- HOW IT WORKS (MOBILE) -->\n<div class="mobile-only">\n{how_card_html}\n</div>\n\n  <!-- HALL OF FAME -->')

# Close page-wrapper
html = html.replace('</main>', '</main>\n</div>')

# 6. Info Modal HTML
info_modal_html = f'''
<!-- INFO MODAL -->
<div class="modal-overlay" id="infoModalOverlay" role="dialog">
  <div class="modal-window">
    <button class="modal-close" onclick="closeInfoModal()" aria-label="Close">✕</button>
    <div class="how-title" style="margin-top:10px; font-size:16px;">How it works</div>
    <div class="how-steps" style="margin-bottom: 24px;">
      <div class="how-step">
        <span class="how-num">1</span>
        <div class="how-text"><strong>Pay $1</strong> — enter your name, link, and a message. Then pay one dollar.</div>
      </div>
      <div class="how-step">
        <span class="how-num">2</span>
        <div class="how-text"><strong>You're #1</strong> — you instantly become the current king of the hill.</div>
      </div>
      <div class="how-step">
        <span class="how-num">3</span>
        <div class="how-text"><strong>Get dethroned</strong> — the moment anyone else pays $1, they take your crown. Most recent always wins.</div>
      </div>
    </div>
    <div style="border-top: 2px solid var(--line); padding-top: 20px; display: flex; justify-content: space-between; align-items: center;">
       <span style="font-size:14px; font-weight:800; color:var(--text-sub);">Made by r69shabh</span>
       <div style="display:flex; gap: 16px;">
         <a href="https://github.com/r69shabh" target="_blank" style="color:var(--text-faint);"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg></a>
         <a href="https://x.com/r69shabh" target="_blank" style="color:var(--text-faint);"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
       </div>
    </div>
  </div>
</div>
'''
html = html.replace('<!-- MODAL -->', info_modal_html + '\n<!-- MODAL -->')

# Info Modal JS
info_js = '''
  window.openInfoModal = function() {
    $('infoModalOverlay').classList.add('open');
  };
  window.closeInfoModal = function() {
    $('infoModalOverlay').classList.remove('open');
  };
  $('infoModalOverlay').addEventListener('click', (e) => { if (e.target === $('infoModalOverlay')) closeInfoModal(); });
'''
html = html.replace('// ---------- modal ----------', '// ---------- modal ----------\n' + info_js)

# 7. Modal Text
html = html.replace('Pay $1 · Be #1 · Get dethroned any second', 'Pay $1 · Be #1')

# 8. Throne emoji and time location
html = html.replace("$('throneLabel').textContent = '👑 Current King of the Hill';", "$('throneLabel').textContent = 'Current King of the Hill';")
html = html.replace('<div class="king-time">👑 Crowned ${timeAgo(king.paid_at)}</div>', '<div class="king-time" style="position:absolute; top:24px; right:22px; margin-top:0;">${timeAgo(king.paid_at)}</div>')

# 9. Hof Render changes
hof_render_old = '''<li class="hof-card">
          <div class="hof-rank">${i + 2}</div>
          <div class="hof-avatar">${avatarHTML(b.payer_name, b.payer_url, 'hof')}</div>
          <div class="hof-info">
            <div class="hof-name">${esc(b.payer_name || 'Anonymous')}</div>
            <div class="hof-sub">${link || sub || 'Was king'}</div>
          </div>
          <div class="hof-time">${timeAgo(b.paid_at)}</div>
        </li>'''

hof_render_new = '''<li class="hof-card" style="align-items: flex-start;">
          <div class="hof-rank" style="margin-top:6px;">${i + 2}</div>
          <div class="hof-avatar" style="margin-top:2px;">${avatarHTML(b.payer_name, b.payer_url, 'hof')}</div>
          <div class="hof-info">
            <div class="hof-name" style="font-size:16px;">${esc(b.payer_name || 'Anonymous')}</div>
            ${b.payer_url ? `<a href="${esc(b.payer_url)}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;font-size:13.5px; display:block; margin-top:3px; font-weight:700;">${esc(b.payer_url.replace(/^https?:\\/\\//, ''))}</a>` : ''}
            ${b.payer_tagline ? `<div style="font-size:13.5px; color:var(--text-sub); margin-top:5px; font-weight:700; line-height:1.4;">${esc(b.payer_tagline)}</div>` : ''}
          </div>
          <div class="hof-time" style="margin-top:6px; font-size:12px;">${timeAgo(b.paid_at)}</div>
        </li>'''
html = html.replace(hof_render_old, hof_render_new)

# 10. Favicon URL
fav_old = 'return `https://icons.duckduckgo.com/ip3/${u.hostname}.ico`;'
fav_new = 'return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=128`;'
html = html.replace(fav_old, fav_new)

with open('/Users/rishabh/pgming/outbid/public/index.html', 'w') as f:
    f.write(html)
