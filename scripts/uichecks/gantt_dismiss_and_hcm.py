# -*- coding: utf-8 -*-
"""Dismissal, the chevron's name, and the critical path in High Contrast.
(1.4.13, 4.1.2, 1.3.1)

The Escape and chevron halves are fully checkable here. The forced-colors half
is NOT, and the limit is stated rather than implied:

  * Chromium's forced-colors emulation does not faithfully reproduce the
    inline-style override that `getGanttBarStyles` applies, which is the whole
    mechanism the dashed outline compensates for (T073);
  * headless additionally reports outline width, colour and offset stuck at
    their initial values, so only `outline-style` is readable at all.

`outline-style` happens to be the one property that carries the distinction
this rule makes, so it is asserted -- and nothing else about High Contrast is.
Real Windows HCM is the instrument for the rest, and this file must not be
cited in its place (Contract 4).
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import uicheck  # noqa: E402

failures = []


def card_opacity(page):
    return page.evaluate(
        """() => {
            const bar = document.activeElement;
            if (!bar || !bar.matches('[data-gantt-bar]')) return 'NOT ON A BAR';
            const card = bar.parentElement.querySelector('.w-64');
            return card ? getComputedStyle(card).opacity : 'NO CARD';
        }"""
    )


def focus_first_bar(page):
    page.evaluate('() => document.body.focus()')
    for _ in range(300):
        page.keyboard.press('Tab')
        if page.evaluate("() => !!(document.activeElement && document.activeElement.matches('[data-gantt-bar]'))"):
            return True
    return False


with uicheck.session(role='Admin') as page:
    if uicheck.select_first_project(page) is None:
        sys.exit(uicheck.report('GANTT DISMISS + HCM', ['Admin sees no projects; run php artisan db:seed']))
    uicheck.open_gantt(page)

    # --- the chevron has a name and a state (4.1.2, 1.3.1) -------------------
    chevrons = page.evaluate(
        """() => [...document.querySelectorAll('button[aria-expanded]')]
                 .filter(b => (b.getAttribute('aria-label') || '').startsWith('Sub-items of'))
                 .map(b => ({
                   name: b.getAttribute('aria-label'),
                   expanded: b.getAttribute('aria-expanded'),
                   type: b.getAttribute('type'),
                 }))"""
    )
    print('named chevrons: %d' % len(chevrons))
    if not chevrons:
        failures.append('no toggle carries both a name and aria-expanded -- an icon-only button '
                        'whose SVG is aria-hidden announces as "button" and nothing else')
    for i, c in enumerate(chevrons):
        if c['expanded'] not in ('true', 'false'):
            failures.append('chevron %d has aria-expanded=%r' % (i, c['expanded']))
        if len(c['name'].strip()) <= len('Sub-items of '):
            failures.append('chevron %d has an empty target in its name: %r' % (i, c['name']))
    if chevrons:
        print('first chevron: %r expanded=%s' % (chevrons[0]['name'][:60], chevrons[0]['expanded']))

    # The state must actually track the row, not be a constant.
    #
    # Guarded, because the unguarded version CRASHED when a tamper removed the
    # chevron's name: `.find(...)` returned undefined and `.click()` threw. The
    # run went red for the right underlying cause and reported a TypeError,
    # which tells a reader that something broke but not what -- the same
    # attribution failure this suite has now hit three times. The name
    # assertion above already records the real problem; this step just declines
    # to run when there is nothing to click.
    states_before = [c['expanded'] for c in chevrons]
    clicked = page.evaluate("""() => {
        const b = [...document.querySelectorAll('button[aria-expanded]')]
            .find(x => (x.getAttribute('aria-label') || '').startsWith('Sub-items of'));
        if (!b) return false;
        b.click();
        return true;
    }""")
    page.wait_for_timeout(700)
    after = page.evaluate(
        """() => [...document.querySelectorAll('button[aria-expanded]')]
             .filter(b => (b.getAttribute('aria-label') || '').startsWith('Sub-items of'))
             .map(b => b.getAttribute('aria-expanded'))"""
    )
    if not clicked:
        print('  (no named chevron to toggle -- the state check did not run)')
    elif after and states_before and after[0] == states_before[0]:
        failures.append('aria-expanded did not change when the row was toggled -- it is a '
                        'hard-coded attribute rather than the row state')
    else:
        print('aria-expanded tracks the row: %s -> %s' % (states_before[0], after[0]))
    if clicked:
        page.evaluate("""() => {
            const b = [...document.querySelectorAll('button[aria-expanded]')]
                .find(x => (x.getAttribute('aria-label') || '').startsWith('Sub-items of'));
            if (b) b.click();
        }""")
        page.wait_for_timeout(700)

    # --- Escape dismisses without moving focus (1.4.13) ----------------------
    if not focus_first_bar(page):
        failures.append('could not focus a timeline bar')
    else:
        page.wait_for_timeout(500)
        before = card_opacity(page)
        page.keyboard.press('Escape')
        page.wait_for_timeout(500)
        after_esc = card_opacity(page)
        still_focused = page.evaluate(
            "() => !!(document.activeElement && document.activeElement.matches('[data-gantt-bar]'))")
        print('card opacity: %s -> %s after Escape (focus retained: %s)'
              % (before, after_esc, still_focused))

        if before != '1':
            failures.append('the card was not showing before Escape (%r), so dismissal proved '
                            'nothing' % before)
        elif after_esc != '0':
            failures.append('Escape did not dismiss the card (opacity %r) -- 1.4.13 requires it be '
                            'dismissable without moving focus' % after_esc)
        if not still_focused:
            failures.append('Escape moved focus off the bar -- 1.4.13 requires the trigger keep it')

        # ...and the dismissal must not be sticky. Tab away and back.
        page.keyboard.press('Shift+Tab')
        page.wait_for_timeout(200)
        page.keyboard.press('Tab')
        page.wait_for_timeout(600)
        back = card_opacity(page)
        print('card opacity after leaving and returning: %s' % back)
        if back != '1':
            failures.append('the card stayed dismissed (opacity %r) after focus left and returned '
                            '-- a session-sticky dismissal loses the content permanently, which is '
                            'worse than the defect 1.4.13 asks to fix' % back)

# --- the critical path in forced colours ------------------------------------
# ONLY outline-style, and only because it is the one outline property this
# environment reports faithfully. See the module docstring.
with uicheck.session(role='Admin') as page:
    uicheck.select_first_project(page)
    page.emulate_media(forced_colors='active')
    uicheck.open_gantt(page)
    styles = page.evaluate(
        """() => [...document.querySelectorAll('[data-gantt-bar]')].map(b => ({
             critical: b.getAttribute('data-critical'),
             outlineStyle: getComputedStyle(b).outlineStyle,
           }))"""
    )
    crit = [s for s in styles if s['critical'] == 'true']
    print('forced-colors: %d bars, %d marked critical by the app, styles=%s'
          % (len(styles), len(crit), sorted({s['outlineStyle'] for s in styles})))
    for s in crit:
        if s['outlineStyle'] != 'dashed':
            failures.append('a critical-path bar draws outline-style %r in forced colours, not '
                            'dashed -- it is indistinguishable from a focused bar' % s['outlineStyle'])

    # THE RULE ITSELF, exercised directly.
    #
    # The seed data puts nothing on the critical path, so the loop above ran
    # zero times and passed. That is a vacuous pass, and reporting it as
    # verification of T066 would be the same mistake as the Client contributor
    # assertion in C4. Setting the attribute by hand proves the CSS selector and
    # declaration work, which is the half this environment CAN see.
    #
    # It does not prove the app ever sets it. That is what the structural test
    # asserts, and what real High Contrast on real data would confirm.
    injected = page.evaluate(
        """() => {
            const bar = document.querySelector('[data-gantt-bar]');
            if (!bar) return null;
            const before = getComputedStyle(bar).outlineStyle;
            bar.setAttribute('data-critical', 'true');
            const after = getComputedStyle(bar).outlineStyle;
            bar.removeAttribute('data-critical');
            return { before, after };
        }"""
    )
    print('rule exercised by injection: outline-style %s -> %s'
          % (injected['before'], injected['after']))
    if injected['after'] != 'dashed':
        failures.append('setting data-critical in forced colours gives outline-style %r, not '
                        'dashed -- the rule in index.css does not match the bar'
                        % injected['after'])
    if not crit:
        print('  NOTE: no bar in the seeded data is on the critical path, so only the RULE is '
              'verified here, not that the app ever marks one.')

sys.exit(uicheck.report('GANTT DISMISS + HCM', failures))
