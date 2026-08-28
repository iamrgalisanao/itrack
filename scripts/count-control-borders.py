#!/usr/bin/env python3
"""
Count native form controls by which border token draws their boundary.

WHY THIS IS A SCRIPT AND NOT A GREP
-----------------------------------
Feature 024 narrows FR-015 to the input token and ships a ratchet asserting the
`border-border` residue does not grow. A ratchet is only as good as a number
anyone can recompute -- and the plausible one-liners disagree with each other
and with reality. Re-derived against the tree at the time of writing, so these
are reproducible rather than remembered:

    <(input|select|textarea)\\b[^>]*?border-border          ->   2
    <(input|select|textarea)\\b[^<]*?border-border  (re.S)  ->  81
    a plain count of `border-border` anywhere               -> 228
    this scanner                                           ->  81

The 2 is the instructive one. `[^>]*?` terminates on the `>` inside
`onChange={(e) => ...}`, so it never reaches the className. That exact regex
produced a confident "2 of 127" during planning, which is the reason this file
exists: a precise-looking wrong count is worse than no count.

The 81 is the *dangerous* one, and the earlier version of this docstring
recorded it as 499, which was wrong. The `[^<]*?` variant agrees with the
scanner today -- and that agreement is a coincidence, not a validation. It
matches across the end of the opening tag (nothing stops it at `>`), so it is
one refactor away from attributing a following sibling's `border-border` to a
control. It also shares both of the blind spots fixed below: it cannot see a
bare `border`, and it reads JSX comments as code.

So the scan (a) masks comments, (b) tracks brace depth and only treats `>` as
the end of the tag at depth 0, and (c) classifies a bare `border` as residue,
because that is what it renders as.

WHAT THIS DOES NOT COUNT, and therefore does not constrain
----------------------------------------------------------
Literal `<input|select|textarea>` tags in .jsx source, and nothing else. The app
renders many more controls through shared shadcn primitives -- `<Input>` (40
usages), `<SelectTrigger>` (29), `<Textarea>` (3), `<Checkbox>` (2) -- which all
draw from `border-input` already and are invisible here. A control whose
className comes from a variable is counted but cannot be classified, and lands
in `neither`, which is why `neither` is ratcheted too.

So "N native controls" below means N literal native control tags in source. It
is NOT a census of the controls a user sees. Do not quote it as one -- an
earlier draft of frontend/src/index.css did, and understated the app's real
conformance by roughly a factor of three.

Run:  python scripts/count-control-borders.py [--assert-max N]
"""
import re
import sys
import pathlib

CONTROLS = ('input', 'select', 'textarea')

# Anchored to THIS FILE, not to the caller's working directory.
#
# The previous version globbed 'frontend/src/**/*.jsx' relative to the CWD with
# no guard on the result, so from any other directory it printed
# "RATCHET HOLDS (0 <= 81)" and exited 0. A gate written to stop a vacuous green
# was itself the only one of the three that could return one. It survived in CI
# only because the `design-tokens` job happens not to set a
# defaults.run.working-directory -- one line away from a permanently green
# no-op. Both sibling gates (verify-contrast, verify-cascade) already fail
# closed from the wrong directory; this one now does too, twice over: an empty
# file list is fatal, and so is a suspiciously small total.
ROOT = pathlib.Path(__file__).resolve().parent.parent

# The residue 024 measured. Feature 025 owns migrating these; until then this is
# a ceiling, not a target. It is enforced in BOTH directions -- see main().
BASELINE_BORDER = 81
# Controls whose boundary this scanner cannot attribute (className from a
# variable, or no border utility at all). Ratcheted for the same reason as the
# residue: it is the bucket an unclassifiable control falls into, so an
# unbounded `neither` is an unbounded escape hatch.
BASELINE_NEITHER = 4
# A floor, not a measurement. If the scanner ever reports fewer control tags
# than this, it has stopped seeing the app and every number below is noise.
MIN_TOTAL = 100
# The closure scan reads .jsx AND .js, so it needs its own floor -- MIN_TOTAL
# counts control tags, which .js files do not contain.
MIN_CLOSURE_FILES = 40


def mask_comments(src):
    """Blank out `//` and `/* */` bodies, preserving offsets.

    Two reasons, and the second is the one that bit.

    1. A `<select>` written in prose inside a comment is not a control.
       frontend/src/pages/Retrospectives.jsx has exactly that, and the earlier
       version counted it -- so the advertised total was 127 when the real
       number of literal control tags is 126.

    2. An apostrophe in a comment INSIDE a tag ("// don't trim here") opened a
       string that never closed, so `>` stopped being recognised at depth 0 and
       the scan ran on into following markup, absorbing the next control and
       classifying it by the wrong className. Nothing in the tree triggers that
       today -- verified, 0 runaways -- but it fails toward under-counting the
       residue, which is the direction the ratchet cannot see.

    Offsets are preserved (bodies become spaces) so tag_text can still index
    into the ORIGINAL source and return real text.
    """
    out = list(src)
    i, n = 0, len(src)
    while i < n:
        ch = src[i]
        if ch in '"\'`':
            i += 1
            while i < n and src[i] != ch:
                if src[i] == '\\':
                    i += 1
                i += 1
            i += 1
            continue
        if src[i:i + 2] == '//':
            while i < n and src[i] != '\n':
                out[i] = ' '
                i += 1
            continue
        if src[i:i + 2] == '/*':
            out[i] = out[i + 1] = ' '
            i += 2
            while i < n and src[i - 1:i + 1] != '*/':
                out[i] = ' '
                i += 1
            continue
        i += 1
    return ''.join(out)


def tag_text(src, start, limit=4000):
    """Return the full opening tag beginning at `start`, or None.

    JSX attribute values contain `>` (arrow functions, comparisons) and nested
    quotes. Depth counting is the whole point -- a character class cannot do it.

    Returns None rather than a truncated window when the end is never found.
    The old fallback returned `src[start:start+4000]` SILENTLY, so a scan that
    had lost track of the tag boundary still produced a confident
    classification. A gate that cannot parse its input must say so.
    """
    depth = 0
    quote = None
    for i in range(start, min(len(src), start + limit)):
        c = src[i]
        if quote:
            if c == '\\':
                continue
            if c == quote:
                quote = None
            continue
        if c in '"\'`':
            quote = c
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
        elif c == '>' and depth == 0:
            return src[start:i + 1]
    return None


def classify(tag):
    """Which token draws this control's boundary, as RENDERED.

    `border-input` is word-bounded on both sides now. The old check was a bare
    substring for input and word-bounded for border, so a tag carrying
    `border-border focus:border-input` classified as migrated -- an
    under-count of the residue, again in the direction the ratchet cannot see.
    Nothing in the tree does that today; `both` exists so it surfaces instead
    of being absorbed if anything ever does.

    The bare-`border` case is the one that mattered. `className="... border ..."`
    with no border-<colour> utility resolves through the unlayered
    `* { border-color: var(--border) }` shim in index.css -- the very shim
    verify-cascade.py assertion 2 exists to prove still works. So it renders at
    the OLD 1.27:1 boundary and is residue, but the old classifier filed it
    under `neither` and the ratchet never saw it. Three new controls written in
    the house style (82 of the existing tags carry a bare `border`) could be
    added with CI green. Zero tags in the tree take this branch today, so
    closing it does not move the baseline -- it closes the likely path, not a
    corner case.
    """
    has_input = re.search(r'\bborder-input\b', tag)
    has_border = re.search(r'\bborder-border\b', tag)
    if has_input and has_border:
        return 'both'
    if has_input:
        return 'input'
    if has_border:
        return 'border'
    if re.search(r'\bborder\b(?!-)', tag) and not re.search(r'\bborder-[a-z]', tag):
        return 'border'
    return 'neither'


# Every `border-input` site in the app. This is a CLOSURE claim, not a count:
# moving --input is only safe to reason about if `border-input` is the sole
# utility that consumes it.
BASELINE_INPUT_SITES = 45


def check_input_closure(files):
    """Assert `border-input` is the ONLY consumer of --input, and count it.

    research.md R11a established by hand that --input has no bg-/text-/ring-/
    divide-/outline- consumer, and SC-009's "nothing unintended moved" rests
    entirely on that. A hand-verified closure claim living in a research
    document is exactly the artifact class this feature exists to stop
    trusting -- so it is asserted here, where it can go red.

    Once this holds, "nothing else moved" is true BY CONSTRUCTION rather than
    by inspection, which is what lets the residual visual check be four
    elements instead of four screens.
    """
    # `files` here is .jsx AND .js -- deliberately wider than the tag scan.
    #
    # This globbed .jsx only, while the class maps that carry Tailwind strings
    # (`taskStatus.js`, `groupSummary.js`) are .js. A `bg-input` or `ring-input`
    # written into one of those maps was invisible, and SC-009's "nothing
    # unintended moved" quietly stopped being true. `verify-contrast.py` has
    # globbed both since it was written; this is an alignment, not a new idea.
    # Caught before the feature that rewrites exactly those two files, not after.
    if len(files) < MIN_CLOSURE_FILES:
        print('FAIL: only %d source files found for the closure scan, below the '
              'floor of %d. The glob is not seeing the app.'
              % (len(files), MIN_CLOSURE_FILES))
        return 1

    other = {}
    sites = 0
    rx_any = re.compile(r'\b([a-z]+)-input(/[0-9]+)?\b')
    for path in files:
        src = mask_comments(path.read_text(encoding='utf-8'))
        for m in rx_any.finditer(src):
            util, alpha = m.group(1), m.group(2)
            if util == 'border' and not alpha:
                sites += 1
            else:
                other.setdefault(m.group(0), []).append(path.relative_to(ROOT).as_posix())

    if other:
        print('FAIL: --input has a consumer other than plain `border-input`:')
        for util, where in sorted(other.items()):
            print('  %-24s %s' % (util, where[0]))
        print('The blast radius of moving --input is no longer the set 024 reasoned')
        print('about. Re-derive it before trusting any "nothing else moved" claim.')
        return 1
    if sites != BASELINE_INPUT_SITES:
        print('FAIL: %d `border-input` sites, expected %d. The token\'s blast radius '
              'changed; update BASELINE_INPUT_SITES deliberately, in the commit that '
              'changed it.' % (sites, BASELINE_INPUT_SITES))
        return 1
    print('closure: `border-input` is the only consumer of --input, at %d sites' % sites)
    return 0


def main():
    files = sorted(ROOT.glob('frontend/src/**/*.jsx'))
    if not files:
        print('FAIL: no .jsx found under %s/frontend/src -- this gate measured '
              'nothing.' % ROOT)
        return 1

    # Closure over BOTH extensions; the tag scan below stays .jsx-only, because
    # a .js file has no JSX tags to count.
    if check_input_closure(files + sorted(ROOT.glob('frontend/src/**/*.js'))):
        return 1
    print()

    counts = {'input': 0, 'border': 0, 'both': 0, 'neither': 0}
    by_file = {}
    unparsed = []
    rx = re.compile(r'<(%s)\b' % '|'.join(CONTROLS))

    for path in files:
        # Scan AND extract from the masked text. Passing the raw source to
        # tag_text left the comment apostrophe in place, so a tag containing
        # `// don't trim here` failed to parse and the run aborted as
        # unparseable -- red, but the wrong diagnosis. Masked, the tag parses
        # and the control is counted, which is the answer that was wanted. The
        # None branch stays as a genuine backstop for anything else.
        src = mask_comments(path.read_text(encoding='utf-8'))
        for m in rx.finditer(src):
            tag = tag_text(src, m.start())
            if tag is None:
                unparsed.append('%s offset %d' % (path.as_posix(), m.start()))
                continue
            kind = classify(tag)
            counts[kind] += 1
            if kind in ('border', 'both'):
                key = path.relative_to(ROOT).as_posix()
                by_file[key] = by_file.get(key, 0) + 1

    if unparsed:
        print('FAIL: %d control tags whose closing `>` the scanner never found. '
              'Every count below is untrustworthy.' % len(unparsed))
        for u in unparsed[:10]:
            print('  ' + u)
        return 1

    total = sum(counts.values())
    residue = counts['border'] + counts['both']

    print('native control tags in .jsx source: %d' % total)
    print('  border-input  %3d   covered by FR-015' % counts['input'])
    print('  border-border %3d   the residue -- feature 025' % counts['border'])
    print('  both          %3d   unclassifiable, counted as residue' % counts['both'])
    print('  neither       %3d   no border utility, or className from a variable'
          % counts['neither'])
    print()
    for path, n in sorted(by_file.items(), key=lambda kv: -kv[1])[:8]:
        print('  %-52s %d' % (path, n))
    print()

    if total < MIN_TOTAL:
        print('FAIL: only %d control tags found, below the floor of %d. The scanner '
              'is not seeing the app -- check the glob, not the baseline.'
              % (total, MIN_TOTAL))
        return 1

    limit = BASELINE_BORDER
    if '--assert-max' in sys.argv:
        i = sys.argv.index('--assert-max') + 1
        if i >= len(sys.argv):
            print('FAIL: --assert-max needs a value.')
            return 1
        limit = int(sys.argv[i])
        if limit > BASELINE_BORDER:
            print('FAIL: --assert-max %d is above the recorded baseline of %d. This '
                  'flag exists to tighten the ceiling, never to raise it.'
                  % (limit, BASELINE_BORDER))
            return 1

    # TWO-SIDED, which is what makes a ratchet a ratchet.
    #
    # A one-sided check only fails on a rise, so deleting a page full of residue
    # dropped the count and left the baseline over-provisioned by exactly the
    # slack a later feature could then spend in silence. A ceiling that is never
    # lowered drifts away from the floor until it constrains nothing.
    if residue > limit:
        print('RATCHET VIOLATED: %d native controls draw their boundary from --border, '
              'above the %d recorded when 024 narrowed FR-015.' % (residue, limit))
        print('A new control must use border-input. The residue may shrink, never grow.')
        return 1
    if residue < limit:
        print('RATCHET SLACK: the residue fell to %d, below the recorded %d.'
              % (residue, limit))
        print('Lower BASELINE_BORDER to %d in the same commit that shrank it, or the '
              'gate goes on guarding a ceiling nothing reaches.' % residue)
        return 1
    # Two-sided, for the same reason the residue is. This was `>` only while the
    # residue was already `> / <`, and the docstring three screens up argues at
    # length that a one-sided ceiling drifts away from the floor until it
    # constrains nothing. Same argument, same file, applied inconsistently.
    if counts['neither'] > BASELINE_NEITHER:
        print('RATCHET VIOLATED: %d controls are unclassifiable, above the %d recorded. '
              'An unbounded `neither` is an unbounded escape hatch -- give the new '
              'control a literal border-input.' % (counts['neither'], BASELINE_NEITHER))
        return 1
    if counts['neither'] < BASELINE_NEITHER:
        print('RATCHET SLACK: `neither` fell to %d, below the recorded %d. Lower '
              'BASELINE_NEITHER to %d in the same commit that shrank it.'
              % (counts['neither'], BASELINE_NEITHER, counts['neither']))
        return 1

    print('RATCHET HOLDS (residue %d == %d, neither %d <= %d)'
          % (residue, limit, counts['neither'], BASELINE_NEITHER))
    return 0


if __name__ == '__main__':
    sys.exit(main())
