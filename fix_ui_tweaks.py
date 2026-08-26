import re

with open('/Users/rishabh/pgming/outbid/public/index.html', 'r') as f:
    html = f.read()

# 1. Remove line below header
html = html.replace('border-bottom: 2px solid var(--line);', 'border-bottom: none;')

# 2. Make CTA button same width (remove max-width)
html = html.replace('width: 100%; max-width: 380px;', 'width: 100%;')

# 3. Increase height of HoF cards
html = html.replace('padding: 16px 20px;', 'padding: 32px 24px;')

# 4. Remove throne section
throne_regex = re.compile(r'<section class="throne-section">.*?</section>', re.DOTALL)
html = throne_regex.sub('', html)

# 5. Fix King Avatar DOM in initial render and in renderKing JS
# Update the static placeholder
old_king_placeholder = """<div class="king-avatar"><span class="king-initial">👑</span></div>"""
new_king_placeholder = """<div class="king-avatar" style="position:relative;">
          <div style="position:absolute; top:-16px; left:-16px; transform:rotate(-20deg); font-size:36px; z-index:10; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">👑</div>
          <span class="king-initial">?</span>
        </div>"""
html = html.replace(old_king_placeholder, new_king_placeholder)

# Update renderKing in JS
old_render_king = """card.innerHTML = `
      <div class="king-card-inner">
        <div class="king-avatar">${avatarHTML(king.payer_name, king.payer_url, 'king')}</div>"""
new_render_king = """card.innerHTML = `
      <div class="king-card-inner">
        <div class="king-avatar" style="position:relative;">
          <div style="position:absolute; top:-16px; left:-16px; transform:rotate(-20deg); font-size:36px; z-index:10; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">👑</div>
          ${avatarHTML(king.payer_name, king.payer_url, 'king')}
        </div>"""
html = html.replace(old_render_king, new_render_king)

# If it didn't replace, we might need a regex
if new_render_king not in html:
    html = re.sub(r'card\.innerHTML = `\s*<div class="king-card-inner">\s*<div class="king-avatar">\$\{avatarHTML\(king\.payer_name, king\.payer_url, \'king\'\)\}</div>',
                  r'card.innerHTML = `\n      <div class="king-card-inner">\n        <div class="king-avatar" style="position:relative;">\n          <div style="position:absolute; top:-16px; left:-16px; transform:rotate(-20deg); font-size:36px; z-index:10; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">👑</div>\n          ${avatarHTML(king.payer_name, king.payer_url, \'king\')}\n        </div>',
                  html)

# 6. Rewrite avatarHTML to avoid string escaping injection & use google favicons
avatar_regex = re.compile(r'function avatarHTML.*?return `<span class="\$\{sizeClass === \'king\' \? \'king-initial\' : \'hof-initial\'\}">\$\{esc\(initial\)\}<\/span>`;\n  \}', re.DOTALL)

new_avatar_func = """function avatarHTML(name, url, sizeClass) {
    const initial = (name || '?')[0].toUpperCase();
    if (url) {
      let hostname = url.replace(/^https?:\\/\\//, '').split('/')[0];
      const fav = `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
      const fallback = `this.style.display='none'; this.nextElementSibling.style.display='flex';`;
      return `<img src="${fav}" alt="" style="width:100%; height:100%; object-fit:contain; border-radius:inherit;" onerror="${fallback}"><span class="${sizeClass === 'king' ? 'king-initial' : 'hof-initial'}" style="display:none; align-items:center; justify-content:center; width:100%; height:100%;">${esc(initial)}</span>`;
    }
    return `<span class="${sizeClass === 'king' ? 'king-initial' : 'hof-initial'}" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%;">${esc(initial)}</span>`;
  }"""

html = avatar_regex.sub(new_avatar_func, html)

# Also remove throneLabel references in JS
html = re.sub(r"\$\('throneLabel'\)\.textContent = '.*?';", "", html)

with open('/Users/rishabh/pgming/outbid/public/index.html', 'w') as f:
    f.write(html)
print("Applied UI tweaks")
