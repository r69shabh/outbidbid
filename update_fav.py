import re

with open('/Users/rishabh/pgming/outbid/public/index.html', 'r') as f:
    html = f.read()

old_fav = "return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=128`;"
new_fav = "return `https://unavatar.io/${u.hostname}?fallback=false`; // unavatar is more reliable, otherwise it errors and we fallback to initial"

if old_fav in html:
    html = html.replace(old_fav, new_fav)
    print("Replaced Google favicons with unavatar")
else:
    print("Could not find Google favicons URL")

with open('/Users/rishabh/pgming/outbid/public/index.html', 'w') as f:
    f.write(html)
