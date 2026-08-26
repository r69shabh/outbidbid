with open('/Users/rishabh/pgming/outbid/public/index.html', 'r') as f:
    html = f.read()

html = html.replace('padding: 24px;\\n    display: flex;\\n    align-items: flex-start;', 'padding: 32px 24px;\\n    display: flex;\\n    align-items: flex-start;')

with open('/Users/rishabh/pgming/outbid/public/index.html', 'w') as f:
    f.write(html)
