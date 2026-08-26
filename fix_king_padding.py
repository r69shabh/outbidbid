with open('/Users/rishabh/pgming/outbid/public/index.html', 'r') as f:
    html = f.read()

import re
# We need to specifically replace the padding inside .king-card-inner
html = re.sub(r'(\.king-card-inner\s*\{\s*)\n\s*padding:\s*16px\s*20px;', r'\1\n    padding: 32px 24px;', html)

with open('/Users/rishabh/pgming/outbid/public/index.html', 'w') as f:
    f.write(html)
