# WHAT THIS GATE CANNOT SEE
#
# Read this before citing a green run as evidence that a colour decision is
# sound. A Section 508 review of the system this script guards found three
# blind spots, and the first is not a gap -- it is a way this gate makes things
# worse.
#
# 1. It NEVER COMPARES TWO PALETTE COLOURS TO EACH OTHER. Every measurement here
#    is token-vs-surface or ink-vs-fill. Distinguishability between statuses is
#    a between-token property and there is no such check anywhere in this file.
#    Worse: tuning every token to clear a similar ratio against the same shared
#    surfaces drives them toward EQUAL LUMINANCE RELATIVE TO ONE ANOTHER, which
#    is exactly what makes them collapse when hue is removed. Measured under
#    simulated dichromacy, the status fills sit at 1.00-1.66:1 against each
#    other -- failure and success become indistinguishable. This gate's passing
#    condition and that failure are causally linked. Running it harder makes it
#    worse. See DESIGN.md's Hue-Loss Rule.
#
# 2. ITS 3:1 TIER IS AN ALLOWLIST, NOT A SWEEP. There IS a 3:1 tier now
#    (NON_TEXT_TIER, below) and `--input` is in it at 3.61 light / 4.15 dark --
#    this paragraph used to say "there is no 3:1 tier, and --input sits at
#    1.27:1", which the feature that added the tier left standing. It is the
#    one place a reader is told what the gate cannot see, so a stale entry here
#    is worse than none. What remains outside: focus rings, bar edges, and
#    chart segment adjacency have no rows, and only the (token, surface) pairs
#    written into that list are measured -- a token added to index.css is
#    invisible here until someone adds it, and nothing detects the omission.
#
# 3. IT READS `--name: #hex` AND ONE JS OBJECT. Every Tailwind utility is
#    invisible to it: taskStatus.js, groupSummary.js, and Reports.jsx's
#    matchStatusColor are all unchecked, which is most status colour in the app
#    by surface area. Absence is invisible too -- a reference to an undefined
#    token yields no row and no error, which is how `bg-popover` shipped
#    transparent app-wide.
#
# Full analysis, including the proposed assertions 8-10 that would close these:
# specs/023-gantt-reports-tokens/accessibility-review.md

import re, io, sys, glob, math, itertools

RAW = io.open('frontend/src/index.css', encoding='utf-8').read()
# Strip comments FIRST for the declaration parse: this feature adds a ratio comment
# beside the tokens, and an unstripped `--foo: #abcdef` inside it would parse as a
# real declaration and silently shadow the value it documents. RAW is kept because
# the documented-ratio check below has to read the comments on purpose.
css = re.sub(r'/\*.*?\*/', '', RAW, flags=re.S)

def block(sel):
    # Three-digit hex too -- the same bug verify-cascade.py was fixed for in
    # this feature, still open here. This reads SOURCE css (not minified), so
    # the trigger is a hand-written `#fff` rather than the minifier, but the
    # consequence is worse: `surfaces` below silently drops a shortened token
    # from every min() instead of failing, so a status colour would be checked
    # against two surfaces while reporting as though checked against three.
    m = re.search(re.escape(sel) + r'\s*\{(.*?)\}', css, re.S)
    found = re.findall(r'--([\w-]+):\s*(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3}))(?![0-9a-fA-F])',
                       m.group(1))
    return {n: ('#' + ''.join(c * 2 for c in v[1:]) if len(v) == 4 else v).lower()
            for n, v in found}

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
    # `if k in t` silently shrank the surface set: a token the parser could not
    # read dropped out of every min() below and the status colour was then
    # measured against two surfaces while reporting as though measured against
    # three. Fewer surfaces means a HIGHER minimum, so the omission reads as a
    # better score. Fail instead.
    absent = [k for k in ('background', 'card', 'muted') if k not in t]
    if absent:
        print('FAIL: %s declares no %s -- the surface set is incomplete and every '
              'ratio below would be measured against too few surfaces.'
              % (sel, ', '.join('--' + a for a in absent)))
        sys.exit(1)
    surfaces = [t[k] for k in ('background', 'card', 'muted')]
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
    # `if k in t` silently shrank the surface set: a token the parser could not
    # read dropped out of every min() below and the status colour was then
    # measured against two surfaces while reporting as though measured against
    # three. Fewer surfaces means a HIGHER minimum, so the omission reads as a
    # better score. Fail instead.
    absent = [k for k in ('background', 'card', 'muted') if k not in t]
    if absent:
        print('FAIL: %s declares no %s -- the surface set is incomplete and every '
              'ratio below would be measured against too few surfaces.'
              % (sel, ', '.join('--' + a for a in absent)))
        sys.exit(1)
    surfaces = [t[k] for k in ('background', 'card', 'muted')]
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

# ---------------------------------------------------------------- Gantt (023)
# The timeline's bar/label pairings. Read from frontend/src/lib/ganttPalette.js
# rather than from the component: getGanttBarStyles is a switch with
# fall-through, and a regex over that would stop matching after any refactor and
# go quiet. This checks the MAP; whether the component uses the map is Gate 4's
# job (a literal sweep) and the browser pass, not this script's.
GANTT_JS = 'frontend/src/lib/ganttPalette.js'
PHP_ENUMS = ['backend/app/Http/Controllers/DetailedActivityController.php',
             'backend/app/Http/Controllers/TaskboardController.php']
gantt_fail = []

js = io.open(GANTT_JS, encoding='utf-8').read()

# Anchor to the named export, not to loose `fill:`/`ink:` pairs. An earlier
# version matched entries anywhere in the file, so renaming the export left all
# eight parseable: the app broke on import while the gate stayed green. Found by
# tamper proof A, which is the entire reason that proof exists.
_blk = re.search(r'export\s+const\s+GANTT_STATUS_TOKENS\s*=\s*\{(.*?)\n\}', js, re.S)
STATUS_TOKENS = {} if not _blk else {
    m.group(1): (m.group(2), m.group(3))
    for m in re.finditer(r"(\w+):\s*\{\s*fill:\s*'([\w-]+)',\s*ink:\s*'([\w-]+)'\s*\}",
                         _blk.group(1))
}
_ov = re.search(r"export\s+const\s+GANTT_PROGRESS_OVERLAY\s*=\s*\{\s*token:\s*'([\w-]+)',"
                r"\s*alpha:\s*([\d.]+)", js)

# Assertion 1 - parse guard. Structural only: is the export there, and did it
# yield anything? Deliberately NOT a >= 8 count -- that duplicated assertion 2
# and short-circuited it, so removing a status reported "parse guard" instead of
# naming the uncovered status (tamper proof B). Completeness is assertion 2's
# job; this one only answers "did the parser find its subject at all".
if not _blk:
    gantt_fail.append('parse guard: GANTT_STATUS_TOKENS export not found in %s' % GANTT_JS)
elif not STATUS_TOKENS:
    gantt_fail.append('parse guard: GANTT_STATUS_TOKENS parsed to zero entries in %s' % GANTT_JS)
if not _ov:
    gantt_fail.append('parse guard: GANTT_PROGRESS_OVERLAY did not parse in %s' % GANTT_JS)

if not gantt_fail:
    ov_token, ov_alpha = _ov.group(1), float(_ov.group(2))

    # Assertion 2 - enum coverage. The backend is authoritative for what a status
    # can be; `pending` is synthesised client-side for parent rows. This is the
    # assertion that would have caught the original bug, where backlog, for_review
    # and blocked reached red through a `default` branch.
    # Union across every controller that validates the list, not just the first
    # match: the same enum is repeated on store, on update, and in the Taskboard
    # controller as `sometimes|in:`. Adding a status to one and not the others
    # would otherwise slip past.
    declared = set()
    for path in PHP_ENUMS:
        php = io.open(path, encoding='utf-8').read()
        for m in re.finditer(r"'status'\s*=>\s*'(?:sometimes\|)?in:([a-z_,]+)'", php):
            declared |= set(m.group(1).split(','))
    if not declared:
        gantt_fail.append('enum coverage: could not read a status list from %s'
                          % ', '.join(PHP_ENUMS))
    for s in sorted(declared | {'pending'}):
        if s not in STATUS_TOKENS:
            gantt_fail.append('enum coverage: status %r has no Gantt colour' % s)

    print()
    print('%-6s%-14s %8s %8s   %s' % ('theme', 'gantt', 'bar', 'overlay', 'verdict'))
    gantt_measured = {}
    for theme, sel in (('light', ':root'), ('dark', '.dark')):
        t = block(sel)
        seen = set()
        for status in sorted(STATUS_TOKENS):
            fill_tok, ink_tok = STATUS_TOKENS[status]
            if fill_tok not in t or ink_tok not in t:
                gantt_fail.append('%s %s: token --%s or --%s missing from %s'
                                  % (theme, status, fill_tok, ink_tok, sel))
                continue
            fill, ink = t[fill_tok], t[ink_tok]
            # Assertion 3 - the bare bar. With assertion 5 holding, this is the
            # binding case: the overlay can only move contrast away from here.
            on_bar = ratio(ink, fill)
            # Assertion 4 - the composited overlay, at the alpha the module
            # declares. Change the alpha in JS and this recomputes; it is not
            # hard-coded here.
            on_ov = ratio(ink, blend(t[ov_token], fill, ov_alpha))
            if min(on_bar, on_ov) < 4.5:
                gantt_fail.append('%s %s: bar %.2f, overlay %.2f (need 4.5)'
                                  % (theme, status, on_bar, on_ov))
            # Assertion 5 - the direction invariant. This is what makes assertion
            # 4 durable instead of a lucky number: ink and overlay must sit on
            # opposite sides of the fill, so contrast rises monotonically with
            # alpha. Revert the overlay to white in light mode and this fires
            # even at an alpha that happens to squeak past assertion 4.
            if (lum(t[ov_token]) > lum(fill)) == (lum(ink) > lum(fill)):
                gantt_fail.append('%s %s: overlay --%s and ink --%s are on the SAME side of '
                                  '--%s; contrast no longer rises with alpha'
                                  % (theme, status, ov_token, ink_tok, fill_tok))
            # ...and check the interval, not just the endpoints. Opposite total
            # luminance does NOT imply monotonicity: with fill #0000ff, overlay
            # #ff8800 and black ink it dips 2.44 -> 2.17 before rising. Three of
            # the ten shipped pairs fail the per-channel dominance that would
            # guarantee it, so the property is true here by arithmetic rather
            # than by structure -- which means it has to be measured, not argued.
            sweep = min(ratio(ink, blend(t[ov_token], fill, a / 20.0)) for a in range(21))
            if sweep < min(on_bar, on_ov) - 0.01:
                gantt_fail.append('%s %s: contrast dips to %.2f mid-alpha, below both endpoints '
                                  '(%.2f / %.2f) - the overlay is not monotone here'
                                  % (theme, status, sweep, on_bar, on_ov))
            # One printed row per fill family, not per status: delayed/blocked
            # share a fill, and the three not-started statuses share another.
            if fill_tok not in seen:
                seen.add(fill_tok)
                fam = 'neutral' if fill_tok == 'muted-foreground' else fill_tok
                gantt_measured[(fam, theme)] = (on_bar, on_ov)
                print('%-6s%-14s %8.2f %8.2f   %s'
                      % (theme, fam, on_bar, on_ov,
                         'ok' if min(on_bar, on_ov) >= 4.5 else 'FAIL'))

    # Assertion 6 - the recorded ratios in index.css. Its own sentinel and its own
    # two-float regex, keyed by (fill family, theme). It cannot collide with the
    # status-token parser above: those rows need `--name` plus three floats, and
    # these carry no `--` prefix and two columns. 022's len(DOCUMENTED) check is
    # deliberately left alone -- the count is unaffected either way.
    GANTT_DOC = {}
    for tm in re.finditer(r'Gantt,\s*(light|dark):(.*?)(?=Gantt,|\*/)', RAW, re.S):
        for row in re.finditer(r'^\s*([a-z]+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s*$',
                               tm.group(2), re.M):
            GANTT_DOC[(row.group(1), tm.group(1))] = (float(row.group(2)), float(row.group(3)))
    # Non-vacuity guard: without this, deleting the comment block makes the loop
    # below iterate over nothing and pass. Assertion 1 guards the module parse;
    # this guards the comment parse.
    if len(GANTT_DOC) != 10:
        gantt_fail.append('assertion 6: expected 10 documented Gantt rows in index.css, found %d'
                          % len(GANTT_DOC))
    # Both directions. Walking only measured -> documented let a fill family drop
    # out of the map entirely and go unchecked: it produces no measured row, the
    # loop below skips it, and the count above still passes because it counts
    # comment rows, not families. Remapping for_review from warning back to
    # destructive -- the exact semantic bug this feature fixed -- passed a green
    # gate until this check existed.
    for key in sorted(set(GANTT_DOC) - set(gantt_measured)):
        gantt_fail.append('assertion 6: %s %s is documented but never measured - has a status '
                          'been remapped away from that fill?' % (key[1], key[0]))
    for key, (b, o) in sorted(gantt_measured.items()):
        if key not in GANTT_DOC:
            gantt_fail.append('assertion 6: %s %s has no documented row' % (key[1], key[0]))
            continue
        db, do = GANTT_DOC[key]
        for label, doc, act in (('bar', db, b), ('overlay', do, o)):
            if abs(doc - round(act, 2)) > 0.005:
                gantt_fail.append('assertion 6: %s %s %s: comment says %.2f, computed %.2f'
                                  % (key[1], key[0], label, doc, act))

    # Assertion 7 - the module and the component must actually be joined.
    # Everything above proves the MAP is legible. None of it proves the component
    # uses the map: reverting the overlay to bg-white/20 drops three light
    # families below AA, and deleting the inline `color` drops every pairing to
    # 1.40-3.52, both with a green gate. Gate 4's literal sweep does not catch
    # either -- they are Tailwind classes and a deleted line, not hex.
    #
    # This is presence-checking single literals, not parsing the switch. The plan
    # declined the latter because a regex over branching goes quiet after a
    # refactor; a presence assertion fails loudly instead, which is the opposite
    # failure mode. Needles are derived from the module, so changing the alpha
    # there moves this check with it.
    wp_path = 'frontend/src/pages/WorkProgram.jsx'
    wp = io.open(wp_path, encoding='utf-8').read()
    for needle in ('bg-%s/%d' % (ov_token, round(ov_alpha * 100)),
                   'background: `var(--${fill})`',
                   'color: `var(--${ink})`'):
        if needle not in wp:
            gantt_fail.append('component drift: %r not found in %s - the module and the '
                              'component have come apart' % (needle, wp_path))

if gantt_fail:
    ok = False
    print('\nGANTT BAR/LABEL CONTRACT VIOLATED:')
    for d in gantt_fail:
        print('  ' + d)

if xfail_drift:
    ok = False
    print('\nTHE --primary EXCEPTION HAS MOVED:')
    for d in xfail_drift:
        print('  ' + d)
    print('  Update DESIGN.md and this script together, or fix --primary and'
          ' remove it from XFAIL.')

# ------------------------------------------- Assertion 8: the mapping bijection
#
# Every ratio above is computed from a `--name` declaration. None of them can
# tell whether Tailwind ever EMITS a utility for that name -- that needs a
# `--color-name: var(--name)` line in `@theme inline`.
#
# Not hypothetical. `--popover` and `--popover-foreground` were referenced by
# tooltip.jsx and WorkProgram's Gantt hover card and declared NOWHERE, so
# `bg-popover` emitted no CSS at all and every tooltip in the app rendered
# transparent -- through a fully green gate, for three consecutive features.
#
# It also closes the tamper the ratio rows structurally cannot see: rename
# `--color-popover` while leaving `--popover` declared, and every measured ratio
# still passes while the utility silently stops existing.
theme_inline = re.search(r'@theme inline\s*\{(.*?)\n\}', css, re.S)
bijection = []
if not theme_inline:
    bijection.append('@theme inline block not found - the mapping cannot be checked')
else:
    # Identity-checked. Capturing only the var() argument verifies "this token is
    # referenced somewhere in @theme inline", NOT "this token has a --color-X
    # line" -- and the utility name is what decides whether `bg-popover` emits.
    # Without the `n == v` test, renaming --color-popover to --color-poopover
    # while leaving --popover declared passes GREEN, which is the exact tamper
    # the comment above claims to catch. All 26 mappings are already identity,
    # so this costs nothing.
    mapped = set(n for n, v in re.findall(
        r'--color-([\w-]+):\s*var\(--([\w-]+)\)', theme_inline.group(1)) if n == v)
    light_t, dark_t = set(block(':root')), set(block('.dark'))

    for miss in sorted(light_t - dark_t):
        bijection.append('--%s is declared in :root but not in .dark' % miss)
    for miss in sorted(dark_t - light_t):
        bijection.append('--%s is declared in .dark but not in :root' % miss)
    for miss in sorted(light_t - mapped):
        bijection.append('--%s is declared but never mapped in @theme inline, so no '
                         'utility is emitted for it' % miss)

    for miss in sorted(mapped - (light_t | dark_t)):
        bijection.append('--%s is mapped in @theme inline but never declared, so the '
                         'utility emits an empty var()' % miss)

if bijection:
    ok = False
    print()
    print('TOKEN DECLARATIONS AND @theme inline HAVE COME APART:')
    for d in bijection:
        print('  ' + d)

# --------------------------- Assertion 10-lite: the -foreground suffix sweep
#
# Deliberately NOT the general bg-*/text-*/border-* sweep. Measured, that version
# gives 43 hits: 2 true positives and 41 false positives, because Tailwind ships
# builtin colours (bg-white, text-red-500) that legitimately need no token.
# Restricted to names ending in `-foreground` it has zero false positives
# *provably*: Tailwind ships no builtin colour with that suffix, so the suffix is
# itself the design-token marker.
# Every .jsx/.js under src, not a hand-listed four. The zero-false-positive
# property comes from the SUFFIX, not from the file list -- widening is free, and
# the hand-listed version covered 4 of 39 files, so `text-sidebar-foreground`
# injected into App.jsx passed a green gate. No try/except either: a rename must
# fail loudly rather than silently shrink coverage, which is the going-quiet mode
# this script's own header refuses.
src = [io.open(f, encoding='utf-8').read()
       for f in sorted(glob.glob('frontend/src/**/*.jsx', recursive=True)
                       + glob.glob('frontend/src/**/*.js', recursive=True))]

undefined = []
declared = set(block(':root'))
for used in sorted(set(re.findall(
        r'\b(?:bg|text|border|ring|fill|stroke)-([\w-]*-foreground)\b', '\n'.join(src)))):
    if used not in declared:
        undefined.append('--%s is used as a utility but never declared - it emits nothing'
                         % used)

if undefined:
    ok = False
    print()
    print('A -foreground UTILITY REFERS TO A TOKEN THAT DOES NOT EXIST:')
    for d in undefined:
        print('  ' + d)

# ------------------------------- Popover: the 3:1 tier this script never had
#
# The floating-surface pair. The binding ratio is NOT the same-named pair
# (20.15 light / 13.70 dark) but --muted-foreground, because both consumers place
# muted text inside the popover.
#
# Fill and outline are COMPLEMENTARY -- neither carries the boundary alone. Over
# the status bars the outline drops to 1.56-2.58 and the fill carries at
# 5.45-9.03; over grid and background the fill is 1.00-1.19 and the outline
# carries at 3.12-4.15. One measured gap: the baseline bar leaves fill 1.65 and
# outline 2.18/2.12.
#
# 3.0 is asserted as a VOLUNTARY tier, not a binding one. 1.4.11 governs the
# boundaries of UI *components*, and a non-interactive tooltip is not one -- so
# no success criterion requires this. It is held anyway because the value is a
# design-system decision that should not drift silently.
non_text_fail = []
# (token, surface, need) triples.
#
# This loop hardcoded `t['popover']` as the surface, printed "on --popover", and
# filed every failure under "THE POPOVER SURFACE IS NOT LEGIBLE". Adding an
# --input row to it as it stood would have measured --input against --popover
# ONLY, under a false heading, with no way to express --background or --card.
# Generalised first, then extended -- in that order, because the instruction
# "add to the existing loop, do not write a second one" was not executable
# against the loop that existed.
#
# --input covers 41 of the 126 literal native control tags in .jsx source, plus
# every control rendered through the shadcn primitives (<Input> x40,
# <SelectTrigger> x29, <Textarea> x3), which draw from the same token and which
# the scanner never sees. The residue is 81 hand-rolled controls drawn from
# --border, which cannot move; scripts/count-control-borders.py ratchets that at
# 81 so it cannot grow, and feature 025 owns migrating it. "41 of 127" was the
# earlier phrasing here and it understated real conformance about threefold --
# it is a source-tag count, not a census of the controls a user sees.
NON_TEXT_TIER = [
    ('popover-foreground', 'popover',    4.5),
    ('foreground',         'popover',    4.5),
    ('muted-foreground',   'popover',    4.5),
    ('popover-border',     'popover',    3.0),
    ('input',              'background', 3.0),
    ('input',              'card',       3.0),
    ('input',              'popover',    3.0),
    # The surfaces the value was actually CHOSEN against, and the tightest
    # margins in the set at 3.25. index.css rejects #949494 because it "FAILS at
    # 2.71 against --secondary and --muted, which form controls also sit on" --
    # and those were the three surfaces the tier did not measure. The gate held
    # the loose constraints (3.49-4.15) and left the binding one open, so a
    # future nudge to --muted could break 1.4.11 on every form control with the
    # whole suite green, and the recorded reason for rejecting #949494 would
    # stop being a checked artifact.
    ('input',              'secondary',  3.0),
    ('input',              'muted',      3.0),
    ('input',              'accent',     3.0),
]

print()
non_text_rows = 0
for theme, sel in (('light', ':root'), ('dark', '.dark')):
    t = block(sel)
    for name, surface, need in NON_TEXT_TIER:
        non_text_rows += 1
        missing = [n for n in (name, surface) if n not in t]
        if missing:
            non_text_fail.append('%s: --%s is not declared'
                                 % (theme, ', --'.join(missing)))
            continue
        r = ratio(t[name], t[surface])
        print('%-6s%-20s on --%-11s %6.2f  needs %.1f   %s'
              % (theme, '--' + name, surface, r, need, 'ok' if r >= need else 'FAIL'))
        if r < need:
            non_text_fail.append('%s: --%s on --%s is %.2f, below %.1f'
                            % (theme, name, surface, r, need))

# Same reasoning as verify-cascade.py's EXPECTED_CHECKS -- and the FIRST draft
# of this guard was itself vacuous, which is worth recording because it is the
# exact defect the guard exists to catch.
#
# It read `!= 2 * len(NON_TEXT_TIER)`. Delete a row and the expected value
# shrinks with it, so the comparison is true by construction and a deleted row
# passes green. Caught by tamper-testing the guard rather than by reading it;
# reading it, it looks obviously correct.
#
# The literal must be FROZEN. 10 rows x 2 themes.
EXPECTED_NON_TEXT_ROWS = 20
if non_text_rows != EXPECTED_NON_TEXT_ROWS:
    ok = False
    print('  measured %d non-text rows, expected %d -- a row was added or '
          'REMOVED from NON_TEXT_TIER, or a branch skipped one. If deliberate, '
          'update EXPECTED_NON_TEXT_ROWS in the same commit.'
          % (non_text_rows, EXPECTED_NON_TEXT_ROWS))

if non_text_fail:
    ok = False
    print()
    print('A NON-TEXT CONTRAST PAIR IS BELOW ITS THRESHOLD:')
    for d in non_text_fail:
        print('  ' + d)


# ============================================================================
# FEATURE 024 / PR B1 -- assertions that must exist BEFORE Stories 2 and 3 pick
# a single colour. Every number here is fixed while it is still expensive to
# change, rather than after the implementer has seen which value passes.
# ============================================================================

# ---------------------------------------------------------------- register pin
#
# SC-005 makes GANTT_STATUS_TOKENS the register of which statuses may share a
# fill -- and nothing asserted the sharing. The register is SELF-AMENDING: the
# planned check was `STATUS_FILL_TOKENS[s] === GANTT_STATUS_TOKENS[s].fill`, so
# giving `delayed` its own hue means editing both maps and the assertion still
# passes. Its paired tamper ("give delayed its own hue, the contract must fail")
# fires only if you edit one map and not the other -- against a mistake, never
# against a decision.
#
# So the sanctioned partition is frozen HERE, as a literal in the gate. Changing
# who shares a fill now requires editing this file: a diff a reviewer sees.
#
# `pending` is excluded deliberately -- it is synthesised client-side for parent
# rollups and is not a value the API accepts.
SANCTIONED_SHARED_FILLS = {
    ('backlog', 'not_started'),
    ('blocked', 'delayed'),
}

_gantt = io.open('frontend/src/lib/ganttPalette.js', encoding='utf-8').read()
_body = re.search(r'GANTT_STATUS_TOKENS\s*=\s*\{(.*?)\n\}', _gantt, re.S)
if not _body:
    print('FAIL: GANTT_STATUS_TOKENS is not parseable in ganttPalette.js. The '
          'register cannot be read, so the pin below would assert nothing.')
    sys.exit(1)

_register = dict(re.findall(r"(\w+):\s*\{\s*fill:\s*'([\w-]+)'", _body.group(1)))
_register.pop('pending', None)
if len(_register) < 7:
    print('FAIL: read only %d statuses from GANTT_STATUS_TOKENS, expected 7. The '
          'parse is wrong and the register pin would be measuring a subset.'
          % len(_register))
    sys.exit(1)

_groups = {}
for _status, _fill in _register.items():
    _groups.setdefault(_fill, []).append(_status)
_observed_shared = {tuple(sorted(v)) for v in _groups.values() if len(v) > 1}

print()
print('register pin -- which statuses may share a fill')
for _fill, _statuses in sorted(_groups.items()):
    print('  %-18s %s' % ('--' + _fill, ', '.join(sorted(_statuses))))

if _observed_shared != SANCTIONED_SHARED_FILLS:
    ok = False
    print()
    print('THE SHARED-FILL REGISTER CHANGED:')
    for _p in sorted(_observed_shared - SANCTIONED_SHARED_FILLS):
        print('  NOT SANCTIONED: %s now share a fill' % ' + '.join(_p))
    for _p in sorted(SANCTIONED_SHARED_FILLS - _observed_shared):
        print('  NO LONGER SHARED: %s' % ' + '.join(_p))
    print('  SC-005 makes this a recorded decision, not a map edit. Update')
    print('  SANCTIONED_SHARED_FILLS in this file, deliberately.')


# ------------------------------------------------ dichromatic separation
#
# THE THRESHOLD IS STATED HERE, BEFORE THE FILLS ARE CHOSEN -- AND IT IS NOT A
# PASS/FAIL LINE ON THE FILLS.
#
# Every 024 artifact said the fills must clear "a stated dE00" and not one of
# them stated it. That leaves the implementer to measure first and then choose a
# number the measurement clears, which is not a threshold but a rationalisation.
#
# 11.0 is the "clearly a different colour" bound. THE STATUS PALETTE DOES NOT
# CLEAR IT, AND CANNOT BE MADE TO. These are semantic red / amber / green, and
# that triad is the canonical set that collapses under dichromacy. Measured
# (Vienot-Brettel-Mollon 1999 + CIEDE2000), six of the forty theme/deficiency/
# pair combinations fall below 11, and EVERY ONE of them lies inside the
# red-amber-green triad -- `muted-foreground` and `info` separate cleanly in all
# four conditions. The worst is for_review vs blocked/delayed at 3.98 in light
# deuteranopia, and those two segments ABUT in the summary bar.
#
# Tuning the tokens does not fix this. Driving every token to clear a similar
# ratio against the same shared surfaces pushes them toward equal luminance
# relative to one another, which is the mechanism described at the top of this
# file: running the 4.5:1 gate harder makes dichromatic collapse worse.
#
# So the contract is NOT "fills clear 11". It is: EVERY PAIR BELOW 11 MUST BE
# SEPARATED BY A CHANNEL THAT IS NOT COLOUR. That is WCAG 1.4.1 expressed as an
# arithmetic precondition instead of an intention, and it makes the glyph US2
# adds load-bearing by construction rather than decorative.
#
# The set is EXACT equality, not a ceiling: a pair leaving it (an improvement)
# must be recorded as deliberately as one joining it (a regression). Either way
# the list of statuses that need a non-colour channel has changed, and that is
# US2's whole input.
DICHROMACY_THRESHOLD = 11.0
DICHROMACY_SUB_THRESHOLD = {
    ('light', 'protan', 'destructive', 'success'),   # 8.18
    ('light', 'protan', 'destructive', 'warning'),   # 4.85
    ('light', 'protan', 'success', 'warning'),       # 7.28
    ('light', 'deutan', 'destructive', 'warning'),   # 3.98
    ('dark', 'protan', 'success', 'warning'),        # 9.37
    ('dark', 'deutan', 'destructive', 'success'),    # 7.07
}
STATUS_FILLS = ['muted-foreground', 'info', 'warning', 'destructive', 'success']


def _srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _lin_to_srgb(c):
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def simulate(hexval, kind):
    """Vienot-Brettel-Mollon (1999) dichromacy, on Smith-Pokorny LMS."""
    h = hexval.lstrip('#')
    r, g, b = [_srgb_to_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)]
    l = 17.8824 * r + 43.5161 * g + 4.11935 * b
    m = 3.45565 * r + 27.1554 * g + 3.86714 * b
    s = 0.0299566 * r + 0.184309 * g + 1.46709 * b
    if kind == 'protan':
        l = 2.02344 * m - 2.52581 * s
    elif kind == 'deutan':
        m = 0.494207 * l + 1.24827 * s
    return (_lin_to_srgb(0.0809444479 * l - 0.1305044090 * m + 0.1167721270 * s),
            _lin_to_srgb(-0.0102485286 * l + 0.0540193266 * m - 0.1136147080 * s),
            _lin_to_srgb(-0.0003652968 * l - 0.0041216147 * m + 0.6935022498 * s))


def _lab(rgb):
    r, g, b = [_srgb_to_lin(c) for c in rgb]
    x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
    y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
    z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b

    def f(t):
        return t ** (1 / 3.0) if t > 216 / 24389.0 else (841 / 108.0) * t + 4 / 29.0
    fx, fy, fz = f(x / 0.95047), f(y / 1.0), f(z / 1.08883)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def ciede2000(lab1, lab2):
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cb = (C1 + C2) / 2.0
    G = 0.5 * (1 - math.sqrt(Cb ** 7 / (Cb ** 7 + 25.0 ** 7))) if Cb > 0 else 0.5
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360 if (a1p or b1) else 0.0
    h2p = math.degrees(math.atan2(b2, a2p)) % 360 if (a2p or b2) else 0.0
    dLp, dCp = L2 - L1, C2p - C1p
    if C1p * C2p == 0:
        dhp = 0.0
    elif abs(h2p - h1p) <= 180:
        dhp = h2p - h1p
    elif h2p - h1p > 180:
        dhp = h2p - h1p - 360
    else:
        dhp = h2p - h1p + 360
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp) / 2)
    Lbp, Cbp = (L1 + L2) / 2.0, (C1p + C2p) / 2.0
    if C1p * C2p == 0:
        hbp = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hbp = (h1p + h2p) / 2.0
    elif h1p + h2p < 360:
        hbp = (h1p + h2p + 360) / 2.0
    else:
        hbp = (h1p + h2p - 360) / 2.0
    T = (1 - 0.17 * math.cos(math.radians(hbp - 30))
         + 0.24 * math.cos(math.radians(2 * hbp))
         + 0.32 * math.cos(math.radians(3 * hbp + 6))
         - 0.20 * math.cos(math.radians(4 * hbp - 63)))
    Rc = 2 * math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25.0 ** 7)) if Cbp > 0 else 0.0
    Sl = 1 + (0.015 * (Lbp - 50) ** 2) / math.sqrt(20 + (Lbp - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cbp, 1 + 0.015 * Cbp * T
    Rt = -math.sin(math.radians(2 * (30 * math.exp(-(((hbp - 275) / 25.0) ** 2))))) * Rc
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2
                     + Rt * (dCp / Sc) * (dHp / Sh))


print()
print('dichromatic separation of the status fills (threshold %.1f)'
      % DICHROMACY_THRESHOLD)
_observed_sub = set()
_measured = 0
for _theme, _sel in (('light', ':root'), ('dark', '.dark')):
    _t = block(_sel)
    _absent = [f for f in STATUS_FILLS if f not in _t]
    if _absent:
        ok = False
        print('  %s: --%s not declared -- pairs involving it were NOT measured'
              % (_theme, ', --'.join(_absent)))
        continue
    for _kind in ('protan', 'deutan'):
        _labs = {f: _lab(simulate(_t[f], _kind)) for f in STATUS_FILLS}
        for _a, _b in itertools.combinations(sorted(STATUS_FILLS), 2):
            _d = ciede2000(_labs[_a], _labs[_b])
            _measured += 1
            if _d < DICHROMACY_THRESHOLD:
                _observed_sub.add((_theme, _kind, _a, _b))
                print('  %-5s %-6s %-18s vs %-18s %6.2f  BELOW -- needs a '
                      'non-colour channel' % (_theme, _kind, _a, _b, _d))

if _measured != 40:
    ok = False
    print('  measured %d pairs, expected 40 -- the sweep did not cover the '
          'palette and the set below proves nothing.' % _measured)

if _observed_sub != DICHROMACY_SUB_THRESHOLD:
    ok = False
    print()
    print('THE SET OF COLOUR-INDISTINGUISHABLE PAIRS CHANGED:')
    for _p in sorted(_observed_sub - DICHROMACY_SUB_THRESHOLD):
        print('  NEW: %s/%s %s vs %s is now below %.1f -- it needs a glyph or '
              'other non-colour channel' % (_p + (DICHROMACY_THRESHOLD,)))
    for _p in sorted(DICHROMACY_SUB_THRESHOLD - _observed_sub):
        print('  RESOLVED: %s/%s %s vs %s now clears %.1f -- record it'
              % (_p + (DICHROMACY_THRESHOLD,)))
    print('  US2 takes this set as its input: these are the statuses whose')
    print('  separation may not rest on colour. Update the literal deliberately.')
else:
    print('  %d of %d pairs below threshold, matching the recorded set'
          % (len(_observed_sub), _measured))


# ------------------------------------------- raw palette literals, ratcheted
#
# T040 planned to assert "no bg-<palette>-<weight> in Reports.jsx". Two holes.
#
# 1. WRONG FILE. The identical defect class lives in taskStatus.js, which is
#    what US2 rewrites, and in WorkProgram's LIST_STATUS_SEGMENT_CLASSES. The
#    -foreground sweep above only catches undeclared *-foreground tokens, and
#    the on_tint assertion measures token VALUES -- neither can see a badge
#    painted bg-purple-500.
#
# 2. A TOKEN UTILITY IS NOT A LITERAL, AND THE LIVE BUG IS A TOKEN UTILITY.
#    Reports.jsx's matchStatusColor ends `default: return 'bg-primary/70'`,
#    which is what collapses not_started, completed and delayed into one violet
#    today. A palette-literal ban would not have caught the defect the ban was
#    written to prevent. Feature 025 owns the token-default half; this ratchet
#    owns the literal half and is honest about the boundary.
#
# Ratcheted rather than forbidden, because these files are FULL of literals
# right now and a flat ban would be red on day one -- at which point the
# implementer either expands scope or weakens the regex, and weakening it is
# what removes the coverage the contract claims.
# Scoped to the NAMED MAPS, not whole files. WorkProgram.jsx carries 18 palette
# literals of which only 4 are status vocabulary; ratcheting the file would tie
# this gate to unrelated churn and produce a red that says nothing about status
# colour. The map is the unit of meaning.
#
# LIST_STATUS_SEGMENT_CLASSES covers only FOUR statuses -- not_started,
# in_progress, completed, delayed. backlog, for_review and blocked are absent,
# which is precisely the silent-drop defect taskStatus.js's own header warns
# about ("the four-value set used by Work Program's List view predates
# backlog/for_review/blocked and silently drops rows holding those statuses").
# US2 owns fixing that; the count here will RISE to 7 when it does, and the
# ratchet will demand the baseline move in that commit -- which is the correct
# conversation to force.
PALETTE_LITERAL_BASELINE = {
    ('frontend/src/lib/taskStatus.js', 'STATUS_SEGMENT_CLASSES'): 7,
    ('frontend/src/lib/taskStatus.js', 'STATUS_BADGE_CLASSES'): 28,
    ('frontend/src/pages/WorkProgram.jsx', 'LIST_STATUS_SEGMENT_CLASSES'): 4,
}
_palette_rx = re.compile(
    r'\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline)-'
    r'(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|'
    r'emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-'
    r'[0-9]{2,3}\b')

print()
print('raw palette literals in the status vocabularies (ceiling, must not grow)')
for (_path, _const), _limit in sorted(PALETTE_LITERAL_BASELINE.items()):
    try:
        _src = io.open(_path, encoding='utf-8').read()
    except IOError:
        ok = False
        print('  %s :: %s -- FILE NOT FOUND, the ratchet measured nothing'
              % (_path, _const))
        continue
    _m = re.search(re.escape(_const) + r'\s*=\s*\{(.*?)\n\}', _src, re.S)
    if not _m:
        ok = False
        print('  %s :: %s -- MAP NOT FOUND. It was renamed, moved or reshaped; '
              'this row measured nothing.' % (_path, _const))
        continue
    _n = len(_palette_rx.findall(_m.group(1)))
    print('  %-58s %3d / %3d' % (_const, _n, _limit))
    if _n > _limit:
        ok = False
        print('    ABOVE BASELINE: a raw palette literal entered the status')
        print('    vocabulary. Use a semantic token -- US2 exists to remove these.')
    elif _n < _limit:
        ok = False
        print('    BELOW BASELINE: good. Lower PALETTE_LITERAL_BASELINE to %d in'
              % _n)
        print('    the same commit, or the ceiling stops guarding the new floor.')


print('\nCONTRACT', 'HOLDS' if ok else 'VIOLATED')
sys.exit(0 if ok else 1)
