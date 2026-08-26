import re, io, sys

css = io.open('frontend/src/index.css', encoding='utf-8').read()
# Strip comments FIRST: this feature adds a ratio comment beside the tokens, and
# an unstripped `--foo: #abcdef` inside it would parse as a real declaration.
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)

def block(sel):
    m = re.search(re.escape(sel) + r'\s*\{(.*?)\}', css, re.S)
    return dict(re.findall(r'--([\w-]+):\s*(#[0-9a-fA-F]{6})', m.group(1)))

def lum(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    c = [(v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4) for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def ratio(a, b):
    la, lb = lum(a), lum(b); hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

def blend(fg, bg, a):
    f = [int(fg.lstrip('#')[i:i+2], 16) for i in (0, 2, 4)]
    b = [int(bg.lstrip('#')[i:i+2], 16) for i in (0, 2, 4)]
    return '#%02x%02x%02x' % tuple(round(f[i] * a + b[i] * (1 - a)) for i in range(3))

ok = True
print('%-6s%-12s %6s %6s %6s   %s' % ('theme', 'state', 'text', 'tint', 'fill', 'verdict'))
for theme, sel in (('light', ':root'), ('dark', '.dark')):
    t = block(sel)
    surfaces = [t[k] for k in ('background', 'card', 'muted') if k in t]
    for state in ('destructive', 'success', 'warning', 'info'):
        col, fg = t[state], t[state + '-foreground']
        as_text = min(ratio(col, s) for s in surfaces)
        on_tint = min(ratio(col, blend(col, s, a)) for s in surfaces for a in (0.10, 0.15))
        as_fill = ratio(fg, col)
        bad = min(as_text, on_tint, as_fill) < 4.5
        ok &= not bad
        print('%-6s%-12s %6.2f %6.2f %6.2f   %s'
              % (theme, state, as_text, on_tint, as_fill, 'FAIL' if bad else 'ok'))

print('\nCONTRACT', 'HOLDS' if ok else 'VIOLATED')
sys.exit(0 if ok else 1)
