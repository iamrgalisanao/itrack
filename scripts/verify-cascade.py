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

# A missing engine must not read as a pass. This is assertion 0's failure mode
# moved up a level: the canary catches a stylesheet that did not load, and
# without this nothing catches a browser that never launched. Locally a dev
# without Chromium is skipped rather than blocked; in CI, where CASCADE_REQUIRED
# is set, a reordered install step must turn the job RED. The suite's whole
# premise is that green means measured.
REQUIRED = os.environ.get('CASCADE_REQUIRED') == '1'
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    if REQUIRED:
        print('FAIL: CASCADE_REQUIRED=1 but playwright is not importable. CI must never '
              'report this suite green without running it.')
        sys.exit(1)
    print('SKIP: playwright not installed (pip install playwright && playwright install '
          'chromium). Set CASCADE_REQUIRED=1 to make this an error.')
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
# Three-digit hex too. The minifier shortens #ffffff to #fff, so a
# six-digit-only pattern silently skipped every token that happened to have a
# short form -- `--background` and `--card` among them. It did not fail; it
# just never saw them, which is why this went unnoticed until a required-token
# check asked for one by name.
tokens = {
    name: ('#' + ''.join(c * 2 for c in val[1:]) if len(val) == 4 else val).lower()
    for name, val in re.findall(r'--([\w-]+):\s*(#[0-9a-fA-F]{3,6})', root.group(1))
}
for required in ('input', 'border', 'primary', 'background'):
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
    ('mixed',    '<div id="mixed" class="border border-destructive/60">x</div>'),
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

    # 0 -- CANARY. Did the stylesheet load at all?
    #
    # This read `border-input` and compared it to `--input`, on the stated
    # premise that "--input and --border are identical, so this must resolve
    # whether or not the utility wins". THIS FEATURE MAKES THAT PREMISE FALSE:
    # --input moves to #86868e and --border stays put. Left alone, the canary
    # would silently stop being a load check and become a duplicate of
    # assertion 1 -- and worse, if the `* { border-color }` rule ever left
    # @layer base (the regression that shipped four times), an inert utility
    # would resolve to --border and this would ABORT with "the stylesheet did
    # not load" on a CASCADE regression, sending the next engineer to debug a
    # build failure that does not exist.
    #
    # So it reads the custom property directly off the root element. That is
    # EMISSION-INDEPENDENT: it does not depend on `@theme` emitting a utility,
    # nor on that utility winning the cascade. Repointing it at `bg-background`
    # was the first plan and would have re-created PR #17's `bg-popover` defect
    # class one surface over -- conflating "did not load" with "did not win".
    # `bg-background` is now a SEPARATE emission assertion below.
    print('assertion 0 -- canary (did the stylesheet load at all?)')
    declared = page.evaluate(
        "() => getComputedStyle(document.documentElement)"
        ".getPropertyValue('--background').trim()")
    if not declared:
        print('  --background read off :root as %r' % declared)
        print('\nABORT: the stylesheet did not load -- :root declares no '
              '--background. Every other result below would be a false green.\n')
        sys.exit(1)
    print('  %-46s %-22s ok' % ('--background is declared on :root', declared))

    # 0b -- and, separately, that a utility built from it actually emits. This
    # is a different claim from 0, and conflating the two is the mistake above.
    check('bg-background emits a colour', read('appbg', 'backgroundColor'),
          expand(tokens['background']),
          'the token is declared but @theme emits no utility for it')

    # 1 -- R1's actual claim: a colour utility now beats the `*` rule.
    print('assertion 1 -- a border colour utility wins (PR #17, #20 defect class)')
    check('border-primary computes to --primary', read('primary', 'borderTopColor'),
          expand(tokens['primary']),
          'the * rule is still outranking border-* utilities')

    # The opacity path is a different code path -- it emits color-mix() rather
    # than a flat value -- and 31 of the 60 sites R1 changes use it. /60 is the
    # one that crosses 3:1, so this asserts something semantic and not just
    # "a value arrived".
    mixed = read('mixed', 'borderTopColor')
    check('border-destructive/60 is translucent, not flat', mixed,
          lambda v: v not in (expand(tokens['border']), expand(tokens['destructive'])),
          'the opacity modifier is inert again -- see PR #20')

    # 1b -- the input token moved, and --border did not follow.
    #
    # This is the whole of Story 4's claim. `--input` and `--border` were byte
    # identical before this feature; if they are equal after it, either the
    # token did not move or something is resolving both to the same value, and
    # the 41 control boundaries are still at 1.27:1.
    inp, bor = read('canary', 'borderTopColor'), read('bare', 'borderTopColor')
    check('border-input resolves to --input', inp, expand(tokens['input']),
          'the input token did not move, or a cascade regression is reverting it')
    check('border-input differs from --border', 'differ' if inp != bor else 'identical (%s)' % inp,
          'differ',
          'the two tokens are equal again -- the 41 control boundaries are back at 1.27:1')

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
    # Assert what Tab actually landed on. Today the button is the only focusable
    # element so this passes trivially -- but adding one focusable node above it
    # would silently move the measurement to a different element, and the check
    # would keep passing while testing nothing.
    landed = hc.evaluate('() => document.activeElement && document.activeElement.id')
    if landed != 'focusable':
        print('  Tab landed on %r, not the button -- the fixture gained a focusable '
              'element and this assertion is measuring the wrong node.' % landed)
        fails.append('assertion 3 measured %r instead of #focusable' % landed)
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
