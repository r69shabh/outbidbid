import re

with open('/Users/rishabh/pgming/outbid/public/index.html', 'r') as f:
    html = f.read()

old_grid = """  @media (min-width: 900px) {
    .top-split {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 48px;
      align-items: start;
    }"""

new_grid = """  @media (min-width: 1000px) {
    .top-split {
      display: grid;
      grid-template-columns: 280px 1fr 280px;
      gap: 32px;
      align-items: start;
    }
    .hero-main { grid-column: 2; }"""

if old_grid in html:
    html = html.replace(old_grid, new_grid)
    with open('/Users/rishabh/pgming/outbid/public/index.html', 'w') as f:
        f.write(html)
    print("Centered hero successfully")
else:
    print("Could not find old grid string")

