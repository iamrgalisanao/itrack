# -*- coding: utf-8 -*-
"""Can the project timeline be operated without a mouse? (FR-001..FR-003, SC-001)

WorkProgram.ganttBar.test.js proves the source says `<button>`, carries an
aria-label from the tested formatter, and indicates focus with an outline rather
than a ring. None of that proves a browser agrees: a button can be covered by an
overlay, given `display: none` by an ancestor, or have its outline suppressed by
a cascade rule written somewhere else entirely. This is the check that presses
Tab.

What it does NOT prove: that a screen reader announces any of it. An accessible
name in the tree is not an announcement, and the two have diverged in this
project before. That is the manual matrix's job (Contract 4).
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import uicheck  # noqa: E402

# A structural hook, deliberately not a styling class. Selecting on
# `focus-visible:outline-2` meant that deleting the focus outline made this
# report "no bars found" -- the right verdict for the wrong reason, which is
# the failure mode every gate in this repo is written to avoid.
BARS = "[data-gantt-bar]"

failures = []

with uicheck.session(role='Admin') as page:
    if uicheck.select_first_project(page) is None:
        sys.exit(uicheck.report('GANTT KEYBOARD', ['Admin can see no projects; run php artisan db:seed']))
    uicheck.open_gantt(page)

    bars = page.evaluate(
        """(sel) => [...document.querySelectorAll(sel)].map(el => ({
            tag: el.tagName,
            type: el.getAttribute('type'),
            name: (el.getAttribute('aria-label') || '').trim(),
            tabIndex: el.tabIndex,
            top: Math.round(el.getBoundingClientRect().top),
            parentClickable: !!el.parentElement.getAttribute('onclick')
                || el.parentElement.tabIndex >= 0,
        }))""",
        BARS,
    )

    print('bars found: %d' % len(bars))
    if not bars:
        sys.exit(uicheck.report('GANTT KEYBOARD', [
            'no timeline bars matched %s -- either the timeline did not render or '
            'the bar is no longer a named, outline-focused element' % BARS
        ]))

    for i, b in enumerate(bars):
        if b['tag'] != 'BUTTON':
            failures.append('bar %d is a <%s>, not a <button>' % (i, b['tag'].lower()))
        if b['type'] != 'button':
            failures.append('bar %d has type=%r, not "button"' % (i, b['type']))
        if not b['name']:
            failures.append('bar %d has an empty accessible name -- it announces only "button"' % i)
        if b['tabIndex'] > 0:
            failures.append('bar %d has a positive tabIndex (%d)' % (i, b['tabIndex']))
        if b['parentClickable']:
            failures.append('bar %d sits in a focusable/clickable wrapper -- two activation paths' % i)

    print('first name: %r' % bars[0]['name'])

    # --- reachable by Tab, in visual order (2.1.1, 2.4.3) --------------------
    page.evaluate('() => document.body.focus()')
    page.keyboard.press('Tab')
    # Stop at the number of bars that actually exist. Asking for a fixed five
    # when four rows are expanded tabs past the last one, wraps around to the
    # first, and reports "tab order does not follow row order" -- a real-looking
    # accessibility failure invented entirely by the check.
    want = min(5, len(bars))
    reached, guard = [], 0
    while guard < 400:
        guard += 1
        info = page.evaluate(
            """(sel) => {
                const a = document.activeElement;
                if (!a || !a.matches(sel)) return null;
                return { name: (a.getAttribute('aria-label') || '').trim(),
                         top: Math.round(a.getBoundingClientRect().top),
                         outlineStyle: getComputedStyle(a).outlineStyle,
                         outlineWidth: getComputedStyle(a).outlineWidth };
            }""",
            BARS,
        )
        if info:
            reached.append(info)
            if len(reached) >= want:
                break
        page.keyboard.press('Tab')

    if not reached:
        failures.append(
            'no timeline bar could be reached with Tab in %d presses -- the bar '
            'is focusable in source and unreachable in fact' % guard
        )
    else:
        print('reached %d bars by Tab after %d presses' % (len(reached), guard))
        tops = [r['top'] for r in reached]
        if tops != sorted(tops):
            failures.append('Tab order does not follow row order: tops were %s' % tops)

        # The focus indicator, measured while the element actually holds keyboard
        # focus -- :focus-visible cannot be read any other way.
        #
        # ONLY outline-style is asserted, and the omission is deliberate.
        # In headless Chromium, getComputedStyle reports outline-width, -color
        # and -offset stuck at their initial values (medium / currentColor / 0)
        # regardless of what is set. Setting `outline: 4px dashed red` INLINE --
        # which no author rule can override -- still computes as
        # `dashed 3px currentColor offset 0`: the style changes, the other three
        # do not. Headed, the same build reports `solid 2px rgb(180,83,255)
        # offset 1.33px`, which is --ring at the intended width.
        #
        # That artifact cost an afternoon: the utilities were declared broken,
        # replaced with an unlayered index.css rule, and the rule "did not work
        # either" -- because the instrument could not see either of them. Both
        # were fine. Asserting a width here would re-manufacture that failure
        # for whoever runs this next.
        #
        # So width, colour and offset belong to the manual pass, which is what
        # T073 already says about trusting emulation.
        first = reached[0]
        print('focus indicator: %s %s (width/colour not measurable headless -- see note)'
              % (first['outlineStyle'], first['outlineWidth']))
        if first['outlineStyle'] == 'none':
            failures.append('a keyboard-focused bar has outline-style: none -- no visible focus')

    # --- Enter and Space do what a click does (2.1.1) ------------------------
    for key in ('Enter', 'Space'):
        page.evaluate("(sel) => document.querySelector(sel).focus()", BARS)
        page.keyboard.press(key)
        page.wait_for_timeout(900)
        opened = page.evaluate("() => !!document.querySelector('[role=dialog]')")
        if not opened:
            failures.append('%s on a focused bar did not open the task editor' % key)
        else:
            print('%-6s opens the editor' % key)
            page.keyboard.press('Escape')
            page.wait_for_timeout(600)

sys.exit(uicheck.report('GANTT KEYBOARD', failures))
