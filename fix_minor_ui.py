with open('/Users/rishabh/pgming/outbid/public/index.html', 'r') as f:
    html = f.read()

# Revert HoF card padding back to the original height
html = html.replace('.hof-card {\\n    background: var(--card);\\n    border-radius: 12px;\\n    padding: 32px 24px;', '.hof-card {\\n    background: var(--card);\\n    border-radius: 12px;\\n    padding: 16px 20px;')

# Remove overflow: hidden from king-avatar to allow crown to peek out
html = html.replace('flex-shrink: 0; overflow: hidden;', 'flex-shrink: 0; overflow: visible;')

with open('/Users/rishabh/pgming/outbid/public/index.html', 'w') as f:
    f.write(html)
print("Adjusted CSS rules.")
