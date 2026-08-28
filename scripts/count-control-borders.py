#!/usr/bin/env python3
"""
Count native form controls by which border token draws their boundary.

WHY THIS IS A SCRIPT AND NOT A GREP
-----------------------------------
Feature 024 narrows FR-015 to the input token and ships a ratchet asserting the
`border-border` residue does not grow. A ratchet is only as good as a number
anyone can recompute -- and three plausible one-liners disagree about this one:

    <(input|select|textarea)\\b[^>]*?border-border      ->   0
    the multiline [^<]*? variant                        -> 499
    a plain count of `border-border`                    -> 228
    this scanner                                        ->  81

The 0 is the instructive one. `[^>]*?>` terminates on the `>` inside
`onChange={(e) => ...}`, so it never reaches the className. That exact regex
produced a confident "2 of 127" during planning, which is the reason this file
exists: a precise-looking wrong count is worse than no count.

So the tag scan tracks brace depth and only treats `>` as the end of the tag at
depth 0.

Run:  python scripts/count-control-borders.py [--assert-max N]
"""
import io, re, sys, glob

CONTROLS = ('input', 'select', 'textarea')
# The residue 024 measured. Feature 025 owns migrating these; until then this is
# a ceiling, not a target.
BASELINE_BORDER_BORDER = 81


def tag_text(src, start):
    """Return the full opening tag beginning at `start`, honouring braces.

    JSX attribute values contain `>` (arrow functions, comparisons) and nested
    quotes. Depth counting is the whole point -- a character class cannot do it.
    """
    depth = 0
    quote = None
    for i in range(start, min(len(src), start + 4000)):
        c = src[i]
        if quote:
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
    return src[start:start + 4000]


def classify(tag):
    if 'border-input' in tag:
        return 'input'
    if re.search(r'\bborder-border\b', tag):
        return 'border'
    return 'neither'


def main():
    counts = {'input': 0, 'border': 0, 'neither': 0}
    by_file = {}

    for path in sorted(glob.glob('frontend/src/**/*.jsx', recursive=True)):
        src = io.open(path, encoding='utf-8').read()
        for m in re.finditer(r'<(%s)\b' % '|'.join(CONTROLS), src):
            kind = classify(tag_text(src, m.start()))
            counts[kind] += 1
            if kind == 'border':
                by_file[path] = by_file.get(path, 0) + 1

    total = sum(counts.values())
    print('native form controls: %d' % total)
    print('  border-input  %3d   covered by FR-015' % counts['input'])
    print('  border-border %3d   the residue -- feature 025' % counts['border'])
    print('  neither       %3d' % counts['neither'])
    print()
    for path, n in sorted(by_file.items(), key=lambda kv: -kv[1])[:8]:
        print('  %-52s %d' % (path.replace('\\', '/'), n))

    limit = BASELINE_BORDER_BORDER
    if '--assert-max' in sys.argv:
        limit = int(sys.argv[sys.argv.index('--assert-max') + 1])
    if counts['border'] > limit:
        print()
        print('RATCHET VIOLATED: %d native controls draw their boundary from --border, '
              'above the %d recorded when 024 narrowed FR-015.' % (counts['border'], limit))
        print('A new control must use border-input. The residue may shrink, never grow.')
        return 1

    print()
    print('RATCHET HOLDS (%d <= %d)' % (counts['border'], limit))
    return 0


if __name__ == '__main__':
    sys.exit(main())
