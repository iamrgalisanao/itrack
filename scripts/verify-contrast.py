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

import re, io, sys, glob

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
for theme, sel in (('light', ':root'), ('dark', '.dark')):
    t = block(sel)
    for name, surface, need in NON_TEXT_TIER:
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

if non_text_fail:
    ok = False
    print()
    print('A NON-TEXT CONTRAST PAIR IS BELOW ITS THRESHOLD:')
    for d in non_text_fail:
        print('  ' + d)

print('\nCONTRACT', 'HOLDS' if ok else 'VIOLATED')
sys.exit(0 if ok else 1)
