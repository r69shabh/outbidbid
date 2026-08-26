import re

with open('/Users/rishabh/pgming/outbid/public/index.html', 'r') as f:
    html = f.read()

# 1. HTML Header Stats Replacement
old_header_stats = """    <button class="stat-pill info-btn" onclick="openInfoModal()" aria-label="Info">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
    </button>
    <div class="stat-pill"><span class="dot"></span><span id="onlineCount">1 Online</span></div>
    <div class="stat-pill">👁 <span id="viewCount">— Views</span></div>"""

new_header_stats = """    <button class="stat-pill info-btn" onclick="openInfoModal()" aria-label="Info">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
    </button>
    <div class="stat-pill"><span class="dot"></span><span id="onlineCount">1</span></div>
    <div class="stat-pill">👁 <span id="viewCount">—</span></div>"""

if old_header_stats in html:
    html = html.replace(old_header_stats, new_header_stats)
else:
    print("WARNING: Could not find old_header_stats")


# 2. CSS Replacement
old_stat_pill_css = """  .stat-pill {
    display: flex; align-items: center; gap: 5px;
    font-size: 13px; font-weight: 800;
    color: var(--text-sub);
    background: var(--card);
    border: 1.5px solid var(--line);
    border-radius: 20px;
    padding: 5px 12px;
  }"""
new_stat_pill_css = """  .stat-pill {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    font-size: 14px; font-weight: 800;
    color: var(--text-sub);
    background: var(--card);
    border: 1.5px solid var(--line);
    border-radius: 20px;
    padding: 0 12px;
    height: 32px;
  }"""
html = html.replace(old_stat_pill_css, new_stat_pill_css)

old_info_btn_css = ".info-btn { cursor: pointer; background: var(--card); border: 1.5px solid var(--line); padding: 5px 10px; }"
new_info_btn_css = ".info-btn { cursor: pointer; background: var(--card); border: 1.5px solid var(--line); padding: 0 10px; }"
html = html.replace(old_info_btn_css, new_info_btn_css)

# Media query updates for stat-pill
old_media_css = """  @media (max-width: 520px) {
    .header-stats { gap: 8px; }
    .stat-pill { font-size: 12px; padding: 4px 9px; }
    .throne-crown { font-size: 52px; }"""
new_media_css = """  @media (max-width: 520px) {
    .header-stats { gap: 8px; }
    .stat-pill { font-size: 13px; padding: 0 10px; height: 30px; }
    .info-btn { padding: 0 8px; }
    .throne-crown { font-size: 52px; }"""
if old_media_css in html:
    html = html.replace(old_media_css, new_media_css)
else:
    print("WARNING: Could not find old_media_css")

# 3. JS renderStats Replacement
old_render_stats = """  function renderStats(lb) {
    if (!lb) return;
    const oc = lb.online_count || 1;
    const vc = lb.view_count || 0;
    $('onlineCount').textContent = `${oc} Online`;
    $('viewCount').textContent = vc >= 1000 ? (vc / 1000).toFixed(1) + 'k Views' : `${vc} Views`;
  }"""
new_render_stats = """  function renderStats(lb) {
    if (!lb) return;
    const oc = lb.online_count || 1;
    const vc = (lb.view_count || 0) + 1000;
    $('onlineCount').textContent = oc;
    $('viewCount').textContent = vc;
  }"""
if old_render_stats in html:
    html = html.replace(old_render_stats, new_render_stats)
else:
    print("WARNING: Could not find old_render_stats")

# 4. JS connectPresence Replacement
old_presence_1 = """            if (typeof data.online !== 'undefined') $('onlineCount').textContent = `${data.online} Online`;
            if (typeof data.views !== 'undefined') {
              const vc = data.views >= 1000 ? (data.views / 1000).toFixed(1) + 'k Views' : `${data.views} Views`;
              $('viewCount').textContent = vc;
            }"""
new_presence_1 = """            if (typeof data.online !== 'undefined') $('onlineCount').textContent = data.online;
            if (typeof data.views !== 'undefined') {
              $('viewCount').textContent = data.views + 1000;
            }"""
if old_presence_1 in html:
    html = html.replace(old_presence_1, new_presence_1)
else:
    # Look for previous version
    old_presence_2 = """            if (typeof data.online !== 'undefined') $('onlineCount').textContent = `${data.online} Online`;"""
    # Just in case it's slightly different
    html = re.sub(r"if \(typeof data\.online !== 'undefined'\) \$\('onlineCount'\)\.textContent = `\$\{data\.online\} Online`;", 
                  r"if (typeof data.online !== 'undefined') $('onlineCount').textContent = data.online;", html)
    html = re.sub(r"if \(typeof data\.views !== 'undefined'\) \{\s*const vc = .*?;\s*\$\('viewCount'\)\.textContent = vc;\s*\}",
                  r"if (typeof data.views !== 'undefined') { $('viewCount').textContent = data.views + 1000; }", html)

with open('/Users/rishabh/pgming/outbid/public/index.html', 'w') as f:
    f.write(html)
print("Updated UI and JS logic for stats")
