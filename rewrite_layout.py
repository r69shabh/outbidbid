import re

with open('/Users/rishabh/pgming/outbid/public/index.html', 'r') as f:
    html = f.read()

# EXTRACT JS
js_start = html.find('<script>')
js_content = html[js_start:]

# EXTRACT HEAD up to CSS LAYOUT
# We will completely replace CSS from /* ── LAYOUT ── */ down to </style>
css_start = html.find('/* ── LAYOUT ── */')
if css_start == -1:
    css_start = html.find('/* ── SIDEBAR CARDS ── */') # fallback if modified
head_top = html[:css_start]

new_css = """  /* ── LAYOUT ── */
  .page-wrapper {
    max-width: 1400px;
    margin: 0 auto;
    padding: 100px 20px 60px;
    display: flex;
    flex-direction: column;
    gap: 48px;
  }
  .desktop-only { display: none; }
  
  @media (min-width: 1080px) {
    .page-wrapper {
      display: grid;
      grid-template-columns: 1fr minmax(auto, 760px) 1fr;
      gap: 40px;
      align-items: start;
    }
    .desktop-only { 
      display: block; 
      position: sticky; 
      top: 100px;
      grid-column: 1;
      justify-self: end;
      width: 280px;
    }
    .mobile-only { display: none; }
    .main-center { grid-column: 2; width: 100%; }
  }

  /* ── SIDEBAR CARDS ── */
  .sidebar-card {
    background: var(--card);
    border-radius: var(--radius);
    padding: 24px;
    margin-bottom: 16px;
  }
  .sidebar-title {
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-bottom: 20px;
  }
  .how-steps { display: flex; flex-direction: column; gap: 16px; }
  .how-step { display: flex; align-items: flex-start; gap: 12px; }
  .how-num {
    width: 24px; height: 24px; border-radius: 50%;
    background: var(--card2);
    color: var(--text-faint);
    font-size: 12px; font-weight: 900;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-top: -2px;
  }
  .how-text { font-size: 13.5px; font-weight: 600; color: var(--text-sub); line-height: 1.5; }
  .how-text strong { color: var(--text); font-weight: 800; }

  .credit-card {
    background: var(--bg);
    border: 1.5px solid var(--card2);
    border-radius: 12px;
    padding: 16px 20px;
    display: flex; justify-content: space-between; align-items: center;
  }

  /* ── HERO MAIN ── */
  .main-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
  }
  .throne-section { text-align: center; margin-bottom: 24px; }
  .throne-crown { font-size: 48px; line-height: 1; margin-bottom: 8px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5)); }
  .throne-label { font-size: 12px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: var(--text-faint); }

  /* KING CARD */
  .king-card {
    width: 100%;
    background: var(--card);
    border-radius: 12px;
    position: relative;
    margin-bottom: 20px;
  }
  .king-card-inner {
    padding: 24px;
    display: flex;
    align-items: flex-start;
    gap: 20px;
  }
  .king-avatar {
    width: 80px; height: 80px;
    border-radius: 16px;
    background: var(--card2);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; overflow: hidden;
  }
  .king-avatar img { width: 100%; height: 100%; max-width:100%; max-height:100%; object-fit: contain; padding: 4px; display: block; border-radius: inherit; }
  .king-initial { font-size: 36px; font-weight: 900; color: var(--text-faint); }
  
  .king-info { flex: 1; min-width: 0; padding-top: 4px; }
  .king-name { font-size: 22px; font-weight: 900; color: var(--text); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 80px; }
  .king-url { font-size: 14px; font-weight: 700; color: var(--text-faint); text-decoration: none; display: block; margin-bottom: 6px; }
  .king-url:hover { color: var(--blue); }
  .king-tagline { font-size: 14px; font-weight: 600; color: var(--text-sub); line-height: 1.5; }
  .king-time { position:absolute; top:24px; right:24px; margin-top:0; font-size:12px; font-weight:800; color:var(--text-faint); text-transform:uppercase; }

  /* CTA */
  .cta-wrap { text-align: center; width: 100%; margin-bottom: 48px; }
  .btn-claim {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    background: #4ade80; color: #064e3b;
    font-family: var(--font); font-size: 20px; font-weight: 900;
    padding: 16px 40px; border-radius: 12px; border: none; cursor: pointer;
    box-shadow: 0 6px 0 #166534; transition: transform .1s, box-shadow .1s;
    width: 100%; max-width: 380px; text-transform: uppercase; letter-spacing: 0.5px;
  }
  .btn-claim:hover { transform: translateY(-2px); box-shadow: 0 8px 0 #166534; }
  .btn-claim:active { transform: translateY(6px); box-shadow: 0 0px 0 #166534; }
  .btn-claim .btn-price { background: rgba(0,0,0,0.15); border-radius: 6px; padding: 2px 8px; font-size: 16px; }
  .cta-hint { font-size: 12px; font-weight: 700; color: var(--text-faint); margin-top: 16px; }

  /* ── HALL OF FAME ── */
  .hof-section { width: 100%; }
  .section-title { font-size: 12px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: var(--text-faint); margin-bottom: 16px; padding-left: 8px; text-align: left; width: 100%; }
  .hof-list { list-style: none; display: flex; flex-direction: column; gap: 8px; width: 100%; }
  .hof-card {
    background: var(--card);
    border-radius: 12px;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    transition: background .15s;
    width: 100%;
  }
  .hof-card:hover { background: var(--card2); }
  .hof-rank { font-size: 14px; font-weight: 900; color: var(--text); width: 24px; text-align: center; flex-shrink: 0; margin-top:0 !important; }
  .hof-avatar { width: 44px; height: 44px; border-radius: 10px; background: var(--card2); overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink:0; margin-top:0 !important; }
  .hof-avatar img { width: 100%; height: 100%; max-width:100%; max-height:100%; object-fit: contain; padding: 3px; display: block; border-radius: inherit; }
  .hof-initial { font-size: 20px; font-weight: 900; color: var(--text-faint); }
  .hof-info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; text-align: left; }
  .hof-name { font-size: 15px; font-weight: 900; color: var(--text); margin-bottom: 2px; }
  .hof-time { flex-shrink: 0; font-size:12px; font-weight:800; color:var(--text-faint); text-transform: uppercase; text-align: right; }
"""

# Include responsive CSS that might have been removed
responsive_css = """
  /* ── RESPONSIVE ── */
  @media (max-width: 520px) {
    .header-stats { gap: 8px; }
    .stat-pill { font-size: 12px; padding: 4px 9px; }
    .throne-crown { font-size: 52px; }
    .king-name { font-size: 19px; }
    .btn-claim { font-size: 18px; padding: 15px 28px; }
  }
"""

new_head = head_top + new_css + responsive_css + "</style>\n</head>\n<body>\n"

sidebar_html = """
      <div class="sidebar-card">
        <div class="sidebar-title">How it works</div>
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
      </div>
      <div class="credit-card">
        <span style="font-size:13px; font-weight:800; color:var(--text-sub);">Made by r69shabh</span>
        <div style="display:flex; gap: 12px;">
          <a href="https://github.com/r69shabh" target="_blank" style="color:var(--text-faint);"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg></a>
          <a href="https://x.com/r69shabh" target="_blank" style="color:var(--text-faint);"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
        </div>
      </div>
"""

body = f"""
<!-- HEADER -->
<header class="header">
  <a class="logo" href="/">
    <img src="/logo.png" alt="Outbidbid logo">
    <span class="logo-text">outbidbid</span>
  </a>
  <div class="header-stats">
    <button class="stat-pill info-btn" onclick="openInfoModal()" aria-label="Info">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
    </button>
    <div class="stat-pill"><span class="dot"></span><span id="onlineCount">1 Online</span></div>
    <div class="stat-pill">👁 <span id="viewCount">— Views</span></div>
  </div>
</header>

<div class="page-wrapper">
  
  <aside class="sidebar desktop-only">
{sidebar_html}
  </aside>

  <main class="main-center">
    <section class="throne-section">
      <div class="throne-crown">👑</div>
      <div class="throne-label" id="throneLabel">CURRENT KING OF THE HILL</div>
    </section>

    <!-- KING CARD -->
    <div id="kingCard" class="king-card">
      <div class="king-card-inner">
        <div class="king-avatar"><span class="king-initial">👑</span></div>
        <div class="king-info">
          <div class="king-name">Loading…</div>
        </div>
      </div>
    </div>

    <!-- CTA -->
    <div class="cta-wrap">
      <button class="btn-claim" onclick="openModal()">
        CLAIM THE THRONE <span class="btn-price">$1</span>
      </button>
      <div class="cta-hint">Most recent $1 is always #1 · Dethrone anyone instantly</div>
    </div>

    <!-- HOF SECTION -->
    <div class="hof-section">
      <div class="section-title" id="hofTitle" style="display:none">HALL OF PAST KINGS</div>
      <ul class="hof-list" id="hofList"></ul>
    </div>

    <div class="mobile-only" style="margin-top: 48px; width: 100%;">
{sidebar_html}
    </div>
  </main>

</div>
"""

# Extract modals
modal_match = re.search(r'<!-- INFO MODAL -->.*?(?=<script>)', html, re.DOTALL)
modals = modal_match.group(0) if modal_match else ""

# Overwrite renderKing to ensure JS injects King Card HTML without hardcoded styling that overrides CSS
js_content = js_content.replace(
    '<div class="king-time" style="position:absolute; top:20px; right:20px; margin-top:0; font-size:12px; font-weight:800; color:var(--text-faint); text-transform:uppercase;">${timeAgo(king.paid_at)}</div>',
    '<div class="king-time">${timeAgo(king.paid_at)}</div>'
)

# Overwrite renderHof to strip inline styles and use CSS
hof_func_old = re.search(r'function renderHof\(hof, currentKingId\) \{.*?\n  \}', js_content, re.DOTALL)
if hof_func_old:
    hof_func_new = """function renderHof(hof, currentKingId) {
    const list = $('hofList');
    const title = $('hofTitle');
    const past = hof.filter((b, i) => i > 0);
    if (past.length === 0) { title.style.display = 'none'; list.innerHTML = ''; return; }
    title.style.display = 'block';
    list.innerHTML = past.map((b, i) => {
      const link = b.payer_url ? `<a href="${esc(b.payer_url)}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;font-size:13.5px; display:block; margin-top:3px; font-weight:700;">${esc(b.payer_url.replace(/^https?:\\/\\//, ''))}</a>` : '';
      const sub = b.payer_tagline ? `<div style="font-size:13.5px; color:var(--text-sub); margin-top:5px; font-weight:700; line-height:1.4;">${esc(b.payer_tagline)}</div>` : '';
      return `
        <li class="hof-card">
          <div class="hof-rank">${i + 2}</div>
          <div class="hof-avatar">${avatarHTML(b.payer_name, b.payer_url, 'hof')}</div>
          <div class="hof-info">
            <div class="hof-name">${esc(b.payer_name || 'Anonymous')}</div>
            ${link}
            ${sub}
          </div>
          <div class="hof-time">${timeAgo(b.paid_at)}</div>
        </li>`;
    }).join('');
  }"""
    js_content = js_content.replace(hof_func_old.group(0), hof_func_new)

full_html = new_head + body + "\n" + modals + js_content

with open('/Users/rishabh/pgming/outbid/public/index.html', 'w') as f:
    f.write(full_html)
print("Rewrote index.html")
