import re

with open('/Users/rishabh/pgming/outbid/public/index.html', 'r') as f:
    html = f.read()

# 1. Update Layout CSS
old_layout_css = """  /* ── LAYOUT ── */
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
  }"""

new_layout_css = """  /* ── LAYOUT ── */
  .page-wrapper {
    max-width: 680px;
    margin: 0 auto;
    padding: 80px 20px 40px;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }
  .desktop-only { display: none; }
  
  @media (min-width: 1080px) {
    .page-wrapper {
      max-width: 1400px;
      display: grid;
      grid-template-columns: 1fr 640px 1fr;
      align-items: start;
    }
    .desktop-only { 
      display: block; 
      position: sticky; 
      top: 90px; 
      grid-column: 1;
      justify-self: end;
      width: 300px;
    }
    .mobile-only { display: none; }
    .page { 
      grid-column: 2;
      padding: 0 !important; 
      max-width: 640px; 
      width: 100%; 
      margin: 0 auto; 
    }
  }"""

if old_layout_css in html:
    html = html.replace(old_layout_css, new_layout_css)
else:
    print("Could not find old layout css")

# 2. Update Favicon CSS
old_king_avatar_css = """  .king-avatar img {
    width: 100%; height: 100%; object-fit: contain; padding: 4px;
    background: transparent;
  }"""
new_king_avatar_css = """  .king-avatar img {
    width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain; padding: 4px;
    background: transparent; display: block;
  }"""
if old_king_avatar_css in html:
    html = html.replace(old_king_avatar_css, new_king_avatar_css)

old_hof_avatar_css = """  .hof-avatar img { width: 100%; height: 100%; object-fit: contain; padding: 3px; background: transparent; }"""
new_hof_avatar_css = """  .hof-avatar img { width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain; padding: 3px; background: transparent; display: block; }"""
if old_hof_avatar_css in html:
    html = html.replace(old_hof_avatar_css, new_hof_avatar_css)

# Also let's try an alternative favicon service just in case Google's is returning a weird aspect ratio.
# Google usually preserves aspect ratio but sometimes it pads. Let's switch to DuckDuckGo or IconHorse.
# Actually, the user's issue might just be caused by the image tag behaving weirdly in flex box.
# If we add max-width and max-height and display block, it should be fixed. We'll leave the Google URL for now.

with open('/Users/rishabh/pgming/outbid/public/index.html', 'w') as f:
    f.write(html)
print("Updated index.html")
