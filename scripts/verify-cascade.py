#!/usr/bin/env python3
"""
Render-time cascade check.

WHY THIS EXISTS, AND WHY IT IS NOT verify-contrast.py
-----------------------------------------------------
verify-contrast.py reads source text: it parses token declarations and computes
ratios. It cannot see whether a rule that is *valid CSS* actually *wins*. Four
defects have now shipped in that blind spot, each looking correct in the diff
and rendering as though absent:

  * the tooltip edge and both hover-card separators (PR #17)
  * 112 border opacity modifiers that never rendered (PR #20)
  * `bg-popover` emitting nothing for three features (PR #17)

All four were cascade or emission failures, not value failures. This file loads
the real built stylesheet into a real browser and asks what actually computed.

DELIBERATELY NARROW. Every assertion below traces to a defect that shipped. It
is not a general sweep: a general dead-utility sweep over this codebase was
measured at 87 reports, 87 false positives, 0 true. Breadth is what made that
worthless, so keep this list short and keep every entry anchored to an incident.

THE CANARY IS THE MOST IMPORTANT ASSERTION HERE.
Two independent probes in this project reported a confident, uniform, GREEN
result while measuring nothing at all -- one had no stylesheet linked and was
reading browser defaults, the other shared a build directory with the change it
was supposed to be the "before" of. Neither was visible from reading the probe.
Assertion 0 fails loudly rather than passing quietly when that happens.

Run:  python scripts/verify-cascade.py        (needs: pip install playwright
                                               && playwright install chromium)
"""
import io, os, re, sys, glob, shutil, tempfile, pathlib

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('SKIP: playwright not installed (pip install playwright && playwright install chromium)')
    sys.exit(0)

DIST = sorted(glob.glob('frontend/dist/assets/*.css'), key=os.path.getmtime)
if not DIST:
    print('FAIL: no built CSS under frontend/dist/assets -- run `npm run build` first')
    sys.exit(1)

# Fresh temp dir every run. NEVER share a build directory between a before and
# an after: that is exactly how a "before" measurement became a copy of the
# "after" and reported a real fix as a no-op.
tmp = tempfile.mkdtemp(prefix='itrack-cascade-')
shutil.copy(DIST[-1], os.path.join(tmp, 'app.css'))

css_text = io.open(DIST[-1], encoding='utf-8').read()
root = re.search(r':root\{(.*?)\}', css_text, re.S)
if not root:
    print('FAIL: %s contains no :root block. The newest file in frontend/dist/assets '
          'is not the app stylesheet -- a stale or stray .css there will be picked '
          'up instead. Rebuild, and remove anything you dropped in that directory.'
          % DIST[-1])
    sys.exit(1)
tokens = dict(re.findall(r'--([\w-]+):\s*(#[0-9a-fA-F]{6})', root.group(1)))
for required in ('input', 'border', 'primary'):
    if required not in tokens:
        print('FAIL: --%s is missing from :root in the built CSS. Nothing below '
              'could be measured meaningfully.' % required)
        sys.exit(1)

def expand(h):
    h = h.lstrip('#')
    return 'rgb(%d, %d, %d)' % tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

CASES = [
    ('canary',   '<div id="canary" class="border border-input">x</div>'),
    ('primary',  '<div id="primary" class="border border-primary">x</div>'),
    ('bare',     '<div id="bare" class="border">x</div>'),
    ('focusable','<button id="focusable" class="outline-none focus-visible:ring-2">x</button>'),
    ('popbg',    '<div id="popbg" class="bg-popover">x</div>'),
    ('appbg',    '<div id="appbg" class="bg-background">x</div>'),
]
html = ('<!doctype html><html><head><link rel="stylesheet" href="app.css"></head>'
        '<body>' + ''.join(h for _, h in CASES) + '</body></html>')
io.open(os.path.join(tmp, 'i.html'), 'w', encoding='utf-8').write(html)
url = pathlib.Path(tmp).as_uri() + '/i.html'

fails = []

def check(label, got, want, why):
    ok = got == want if not callable(want) else want(got)
    print('  %-46s %-22s %s' % (label, got, 'ok' if ok else 'FAIL'))
    if not ok:
        fails.append('%s: got %r -- %s' % (label, got, why))

with sync_playwright() as pw:
    browser = pw.chromium.launch()

    page = browser.new_page()
    page.goto(url); page.wait_for_load_state('networkidle')
    read = lambda i, p: page.evaluate(
        '([i,p]) => getComputedStyle(document.getElementById(i))[p]', [i, p])

    # 0 -- CANARY. --input and --border are identical, and the `*` rule applies
    # to everything, so this must resolve whether or not the utility wins. If it
    # does not, the stylesheet did not load and every result below is garbage.
    print('assertion 0 -- canary (did the stylesheet load at all?)')
    canary = read('canary', 'borderTopColor')
    if canary != expand(tokens['input']):
        print('  canary = %s, expected %s' % (canary, expand(tokens['input'])))
        print('\nABORT: the stylesheet did not load. Every other result would be a '
              'false green.\n')
        sys.exit(1)
    print('  %-46s %-22s ok' % ('border-input resolves to --input', canary))

    # 1 -- R1's actual claim: a colour utility now beats the `*` rule.
    print('assertion 1 -- a border colour utility wins (PR #17, #20 defect class)')
    check('border-primary computes to --primary', read('primary', 'borderTopColor'),
          expand(tokens['primary']),
          'the * rule is still outranking border-* utilities')

    # 2 -- and the shim still does its job for elements that set no colour.
    print('assertion 2 -- a bare `border` still gets --border (the shim still works)')
    check('bare border computes to --border', read('bare', 'borderTopColor'),
          expand(tokens['border']),
          'moving the rule into @layer base broke the v3 compat default')

    page.close()

    # 4 -- guards PR #17; gates the dropdown/select unification.
    #
    # DARK ONLY, and that is the whole point. In light both are #ffffff by
    # design -- the floating surface deliberately matches the page ground, as
    # dropdown-menu.jsx and select.jsx already do. The surfaces only separate in
    # dark, where --card would sit at 1.11:1 against the cards a popover floats
    # over. A theme-agnostic version of this assertion fails on a correct
    # stylesheet, which is how the first draft of it failed here.
    print('assertion 4 -- --popover is a distinct surface from --background (dark)')
    dark = browser.new_page(color_scheme='dark')
    dark.goto(url); dark.wait_for_load_state('networkidle')
    dark.evaluate("() => document.documentElement.classList.add('dark')")
    pbg, abg = (dark.evaluate('(i) => getComputedStyle(document.getElementById(i)).backgroundColor', i)
                for i in ('popbg', 'appbg'))
    check('bg-popover != bg-background', 'differ' if pbg != abg else 'identical (%s)' % pbg,
          'differ', 'the floating surface has collapsed onto the page ground')
    dark.close()

    # 3 -- guards PR #19. R1 is precisely the kind of change that threatens it:
    # if the forced-colors block is ever moved into a layer, `outline-none` wins
    # again and every focus indicator silently disappears in High Contrast.
    print('assertion 3 -- focus is still indicated in forced-colors')
    hc = browser.new_page(forced_colors='active')
    hc.goto(url); hc.wait_for_load_state('networkidle')
    hc.keyboard.press('Tab')
    style = hc.evaluate("""() => { const c = getComputedStyle(
        document.getElementById('focusable')); return c.outlineStyle; }""")
    check('focus-visible outline-style is not none', style,
          lambda v: v != 'none',
          'HCM users have no focus indicator -- see the DO-NOT-DELETE note in index.css')
    hc.close()
    browser.close()

shutil.rmtree(tmp, ignore_errors=True)

if fails:
    print('\nCASCADE CONTRACT VIOLATED:')
    for f in fails:
        print('  ' + f)
    sys.exit(1)
print('\nCASCADE CONTRACT HOLDS')
