# -*- coding: utf-8 -*-
"""Is each timeline task announced ONCE, with the fields the row does not show?
(FR-004, FR-005, SC-002)

The structural test proves the source says `aria-hidden` and `aria-describedby`.
It cannot see a dangling id, a description that renders empty, or a card whose
text still reaches the accessibility tree through a second path. This looks.

What it still does NOT prove: that a screen reader reads any of it in this
order, or at all. Nothing that runs in a browser proves that -- an accessible
name present in the tree is not an announcement. C7's manual matrix owns that,
and this file must not be cited in its place (Contract 4).
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import uicheck  # noqa: E402

MEASURE = """() => {
  const bars = [...document.querySelectorAll('[data-gantt-bar]')];
  const rows = bars.map(bar => {
    const id = bar.getAttribute('aria-describedby');
    const node = id ? document.getElementById(id) : null;
    return {
      name: (bar.getAttribute('aria-label') || '').trim(),
      describedbyId: id,
      nodeFound: !!node,
      description: node ? node.textContent.replace(/\\s+/g, ' ').trim() : null,
      // The card is a sibling of the button inside the positioning wrapper.
      cardHidden: (() => {
        const card = bar.parentElement.querySelector('.w-64');
        return card ? !!card.closest('[aria-hidden="true"]') : 'NO CARD';
      })(),
    };
  });

  // Which elements expose "Level:" WITHOUT sitting inside an aria-hidden
  // subtree? Exactly the sr-only description nodes, and nothing else. Anything
  // additional means the visual card is still being read alongside them, which
  // is the defect FR-004 names.
  //
  // Compared against the DESCRIPTION count, not the bar count. A first version
  // compared it to the number of bars and reported "8 exposed for 4 bars" as a
  // duplicate announcement -- but a row with no dates renders a left row and no
  // bar, so eight descriptions beside four bars is correct. The check invented
  // a failure out of a fact about the data.
  const hasLevel = el => (el.textContent || '').includes('Level:');
  const exposedNodes = [...document.querySelectorAll('*')].filter(el => {
    if (!hasLevel(el)) return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    return ![...el.children].some(hasLevel);   // innermost carrier only
  });
  const exposed = exposedNodes.length;
  const exposedNotDescription = exposedNodes
    .filter(el => !(el.id || '').startsWith('gantt-desc-'))
    .map(el => (el.className || '').toString().slice(0, 40) + ' :: ' + el.textContent.slice(0, 40));
  const descriptionCount = document.querySelectorAll('span.sr-only[id^="gantt-desc-"]').length;

  // The left-pane rows must still be h-12. The description span is `sr-only`
  // and absolutely positioned, but if it were ever put inside the 12-column
  // grid it would wrap and push every left row out of line with its bar.
  const leftRowHeights = [...document.querySelectorAll('.h-12.flex.items-center.px-4')]
    .slice(0, 6).map(el => Math.round(el.getBoundingClientRect().height));

  return {
    rows,
    exposedLevelNodes: exposed,
    exposedNotDescription,
    descriptionCount,
    barCount: bars.length,
    leftRowHeights,
    clickInstructionPresent: /Click timeline bar/i.test(document.body.innerText),
    // T062: row 0's card opens DOWNWARD. Upward it renders over the sticky
    // header, which is not a place a card can be read or dismissed.
    cardPlacement: bars.map(bar => {
      const card = bar.parentElement.querySelector('.w-64');
      if (!card) return 'none';
      return card.classList.contains('top-full') ? 'down'
           : card.classList.contains('bottom-full') ? 'up' : 'unplaced';
    }),
    duplicateIds: (() => {
      const ids = rows.map(r => r.describedbyId).filter(Boolean);
      return ids.length !== new Set(ids).size;
    })(),
  };
}"""

failures = []

with uicheck.session(role='Admin') as page:
    if uicheck.select_first_project(page) is None:
        sys.exit(uicheck.report('GANTT ANNOUNCEMENT', ['Admin sees no projects; run php artisan db:seed']))
    uicheck.open_gantt(page)
    out = page.evaluate(MEASURE)

    print('bars: %d   exposed "Level:" nodes: %d   left row heights: %s'
          % (out['barCount'], out['exposedLevelNodes'], out['leftRowHeights']))
    print('description nodes: %d' % out['descriptionCount'])
    if out['rows']:
        print('description[0]: %r' % (out['rows'][0]['description'] or '')[:110])

    if not out['barCount']:
        sys.exit(uicheck.report('GANTT ANNOUNCEMENT', ['no timeline bars found']))

    for i, r in enumerate(out['rows']):
        if not r['describedbyId']:
            failures.append('bar %d has no aria-describedby' % i)
            continue
        if not r['nodeFound']:
            failures.append('bar %d points at id %r, which is not in the document -- a dangling '
                            'aria-describedby announces nothing and reports nothing'
                            % (i, r['describedbyId']))
        elif not r['description']:
            failures.append('bar %d has a description node that renders empty' % i)
        elif 'Level:' not in r['description']:
            failures.append('bar %d description is missing the fields the row summary omits: %r'
                            % (i, r['description'][:80]))
        if r['cardHidden'] is not True:
            failures.append('bar %d card is not inside an aria-hidden subtree (%r) -- opacity-0 '
                            'leaves it in the accessibility tree' % (i, r['cardHidden']))

    if out['duplicateIds']:
        failures.append('two bars share a description id -- getElementById resolves to one node '
                        'and the other row is described by someone else\'s task')

    # THE DUPLICATE-ANNOUNCEMENT ASSERTION (FR-004, SC-002). The only nodes
    # exposing the detail fields must be the sr-only descriptions themselves.
    # Anything else means the card is being announced alongside them.
    if out['exposedNotDescription']:
        failures.append('%d node(s) expose the detail fields without being a description: %s'
                        % (len(out['exposedNotDescription']), out['exposedNotDescription'][:3]))
    if out['exposedLevelNodes'] != out['descriptionCount']:
        failures.append('%d nodes expose "Level:" but there are %d description nodes -- the card '
                        'is announced as well as the description'
                        % (out['exposedLevelNodes'], out['descriptionCount']))

    placement = out['cardPlacement']
    print('card placement by row: %s' % placement)
    if placement and placement[0] != 'down':
        failures.append('the first row card opens upward (%r) -- over the sticky header'
                        % placement[0])
    if any(p != 'up' for p in placement[1:]):
        failures.append('a card below row 0 opens downward: %s' % placement)

    if out['clickInstructionPresent']:
        failures.append('the mouse-only "Click timeline bar to edit" instruction is still rendered')

    if any(h != 48 for h in out['leftRowHeights']):
        failures.append('left-pane rows are %s px, not 48 -- the description span is wrapping the '
                        'row grid and the panes no longer line up' % out['leftRowHeights'])

    # --- the card must reveal on keyboard focus, not only hover ---------------
    page.evaluate('() => document.body.focus()')
    for _ in range(300):
        page.keyboard.press('Tab')
        if page.evaluate("() => !!(document.activeElement && document.activeElement.matches('[data-gantt-bar]'))"):
            break
    # The card fades in over `duration-200`. Reading opacity in the same frame
    # as the focus reports 0 and looks exactly like "still hover-only".
    page.wait_for_timeout(500)
    revealed = page.evaluate(
        """() => {
            const bar = document.activeElement;
            const card = bar.parentElement.querySelector('.w-64');
            return card ? getComputedStyle(card).opacity : null;
        }"""
    )
    print('card opacity on keyboard focus: %s' % revealed)
    if revealed is None:
        failures.append('no card found beside the focused bar')
    elif float(revealed) < 1:
        failures.append('the card stays at opacity %s when the bar has keyboard focus -- it is '
                        'still hover-only for sighted keyboard users (1.4.13)' % revealed)


# --- FR-007 on a NEW rendering path -------------------------------------------
#
# The sr-only description is a fourth consumer of the contributor gate, and the
# first one that is invisible: a leak here would be absent from the page and
# present in the accessibility tree, where nobody would notice it by looking.
#
# BUT THE DESCRIPTION ASSERTION BELOW IS VACUOUS BY CONSTRUCTION, and saying so
# is the point of this comment. Measured against the API: a Client's
# /projects/{id}/modules response omits `responsible` ENTIRELY (the field is
# absent, not null) while an Admin receives its values. There is no contributor
# in the Client's payload for the description to leak. Tampering
# `includeContributor` to a hard `true` and re-running left the check green --
# which is the correct result and a useless one.
#
# So the assertion that carries weight is the one on the RESPONSE, not on the
# rendered text. That is also where FR-007 is genuinely enforced: server-side,
# fail-closed at the source, with the frontend gate as defence in depth. The
# rendered-text assertion is kept because it stops being vacuous the day the
# resource starts sending the field -- but it is not evidence of anything today,
# and citing it as such would be exactly the "fixture that made the sentinel
# structurally ineligible" this project has already been caught by once.
with uicheck.session(role='Client') as page:
    if uicheck.select_first_project(page) is None:
        failures.append('the Client sees no projects, so FR-007 could not be checked at all -- '
                        'run php artisan db:seed')
    else:
        payload_fields = page.evaluate(
            """async () => {
                const r = await (await fetch('/api/projects/1/modules', {credentials:'include'})).json();
                const mods = Array.isArray(r) ? r : (r.data || []);
                return mods.map(m => Object.prototype.hasOwnProperty.call(m, 'responsible'));
            }"""
        )
        print('client module payloads carrying a `responsible` key: %d of %d'
              % (sum(1 for f in payload_fields if f), len(payload_fields)))
        if any(payload_fields):
            failures.append('the API sends `responsible` to a Client -- FR-007 is being enforced '
                            'only in the browser, where the client decides what to hide')

        uicheck.open_gantt(page)
        client_descriptions = page.evaluate(
            """() => [...document.querySelectorAll('span.sr-only[id^="gantt-desc-"]')]
                     .map(el => el.textContent)"""
        )
        print('client description nodes: %d (leak assertion is vacuous while the API withholds)'
              % len(client_descriptions))
        leaked = [d for d in client_descriptions if 'Contributor:' in d]
        if leaked:
            failures.append('a Client description exposes the contributor in the accessibility '
                            'tree while the visible column is correctly hidden: %r' % leaked[0][:90])

with uicheck.session(role='Admin') as page:
    uicheck.select_first_project(page)
    uicheck.open_gantt(page)
    admin_descriptions = page.evaluate(
        """() => [...document.querySelectorAll('span.sr-only[id^="gantt-desc-"]')]
                 .map(el => el.textContent)"""
    )
    named = [d for d in admin_descriptions if 'Contributor:' in d]
    print('admin descriptions carrying a contributor: %d of %d'
          % (len(named), len(admin_descriptions)))
    if admin_descriptions and not named:
        failures.append('no Admin description carries a contributor -- the description withholds '
                        'it from everyone, which passes the leak test and breaks the product')

sys.exit(uicheck.report('GANTT ANNOUNCEMENT', failures))
