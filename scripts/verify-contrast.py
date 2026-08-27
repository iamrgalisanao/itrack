import re, io, sys

RAW = io.open('frontend/src/index.css', encoding='utf-8').read()
# Strip comments FIRST for the declaration parse: this feature adds a ratio comment
# beside the tokens, and an unstripped `--foo: #abcdef` inside it would parse as a
# real declaration and silently shadow the value it documents. RAW is kept because
# the documented-ratio check below has to read the comments on purpose.
css = re.sub(r'/\*.*?\*/', '', RAW, flags=re.S)

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

# The ratio table written into index.css's comments, as
#   --destructive #b91c1c 5.82  4.54  6.47
# Parsed so the comment is a *checked* artifact rather than prose. Three drafts of
# this feature's artifacts carried hand-transcribed ratios; two of them were wrong.
# Keyed by hex, not by state name: each state appears once per theme with a
# different value, so keying by name would silently collapse 8 rows into 4.
DOCUMENTED = {
    m.group(2).lower(): (m.group(1), float(m.group(3)), float(m.group(4)), float(m.group(5)))
    for m in re.finditer(
        r'--([a-z]+)\s+(#[0-9a-fA-F]{6})\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)',
        '\n'.join(re.findall(r'/\*.*?\*/', RAW, flags=re.S)))
}

ok = True
measured = {}
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
        measured[(theme, state)] = (col.lower(), as_text, on_tint, as_fill)
        print('%-6s%-12s %6.2f %6.2f %6.2f   %s'
              % (theme, state, as_text, on_tint, as_fill, 'FAIL' if bad else 'ok'))

# --primary is governed by the same AA Floor Rule but does NOT satisfy it in light
# mode. It is a recorded exception, not an oversight (DESIGN.md, beside the rule).
# It is printed here rather than omitted for three reasons: the exception stays
# visible on every PR instead of decaying into folklore; if someone fixes it this
# row fails and forces promotion to a real checked row; and if someone makes it
# worse, the drift check catches that too. It never fails the build on its own.
# Recorded worst case per theme, and whether that theme is expected to fail.
# Only light is the exception; dark passes and is shown for completeness.
XFAIL = {'light': (3.40, True), 'dark': (4.78, False)}
xfail_drift = []
print()
for theme, sel in (('light', ':root'), ('dark', '.dark')):
    t = block(sel)
    surfaces = [t[k] for k in ('background', 'card', 'muted') if k in t]
    col = t['primary']
    worst = min([ratio(col, s) for s in surfaces]
                + [ratio(col, blend(col, s, a)) for s in surfaces for a in (0.10, 0.15)])
    expected, should_fail = XFAIL[theme]
    fails_now = worst < 4.5
    if abs(worst - expected) > 0.005:
        xfail_drift.append('%s --primary: recorded worst case %.2f, computed %.2f'
                           % (theme, expected, worst))
    if should_fail and not fails_now:
        xfail_drift.append('%s --primary now passes at %.2f - fix DESIGN.md and drop it '
                           'from XFAIL' % (theme, worst))
    note = 'xfail (known exception, see DESIGN.md)' if fails_now else 'ok'
    print('%-6s%-12s %6.2f %6s %6s   %s' % (theme, 'primary', worst, '-', '-', note))

# Every state must be documented in both themes: 4 states x 2 themes = 8 rows.
drift = []
for (theme, state), (col, t_, ti, f_) in sorted(measured.items()):
    if col not in DOCUMENTED:
        drift.append('%s %s (%s): no documented row in index.css' % (theme, state, col))
        continue
    dstate, dt, dti, df = DOCUMENTED[col]
    if dstate != state:
        drift.append('%s: %s is documented as --%s' % (col, state, dstate))
    for label, doc, act in (('text', dt, t_), ('tint', dti, ti), ('fill', df, f_)):
        if abs(doc - round(act, 2)) > 0.005:
            drift.append('%s %s %s: comment says %.2f, computed %.2f'
                         % (theme, state, label, doc, act))
if len(DOCUMENTED) != 8:
    drift.append('expected 8 documented rows in index.css comments, found %d' % len(DOCUMENTED))

if drift:
    ok = False
    print('\nDOCUMENTED RATIOS DO NOT MATCH THE VALUES:')
    for d in drift:
        print('  ' + d)

if xfail_drift:
    ok = False
    print('\nTHE --primary EXCEPTION HAS MOVED:')
    for d in xfail_drift:
        print('  ' + d)
    print('  Update DESIGN.md and this script together, or fix --primary and'
          ' remove it from XFAIL.')

print('\nCONTRACT', 'HOLDS' if ok else 'VIOLATED')
sys.exit(0 if ok else 1)
