# -*- coding: utf-8 -*-
"""FR-007: does the Work Program timeline actually withhold the contributor?

Two tests already cover parts of this and neither can see what a browser renders:

  * ganttA11y.test.js proves canSeeContributor answers correctly, in both
    directions, for every role including null. It knows nothing about the page.
  * WorkProgram.contributorGate.test.js proves the component asks that question
    at all five sites. It reads source text; it never runs React.

Both would stay green if a stylesheet hid the column for everyone, or if the
grid left a hole where the column used to be. This is the check that looks.

THE LAYOUT HALF IS NOT DECORATION. The contributor column and the two
column-span ternaries are one decision. Gate the data and leave the spans
behind, and the field is correctly hidden while the row keeps a col-span-5 task
name -- a gap that reads as a rendering bug rather than a policy. The spans
summing to 12 is what says the row closed up properly.
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import uicheck  # noqa: E402

MEASURE = """() => {
  const header = [...document.querySelectorAll('div')].find(
    d => typeof d.className === 'string'
      && d.className.includes('grid-cols-12')
      && d.textContent.includes('Task Name'));
  if (!header) return { error: 'the Gantt header row was not found' };
  return {
    hasContributor: header.textContent.includes('Contributor'),
    taskNameSpan: (header.children[0].className.match(/col-span-\\d+/) || ['?'])[0],
    spanSum: [...header.children]
      .map(c => parseInt((c.className.match(/col-span-(\\d+)/) || [0, 0])[1], 10))
      .reduce((a, b) => a + b, 0),
    columnCount: header.children.length,
    bodyMentionsContributor: document.body.innerText.includes('Contributor'),
  };
}"""

EXPECTED = {
    # role:      (sees contributor, task-name span, column count)
    'Admin': (True, 'col-span-5', 5),
    'Client': (False, 'col-span-7', 4),
}

failures = []
observed = {}

for role, (should_see, span, columns) in EXPECTED.items():
    with uicheck.session(role=role) as page:
        project_id = uicheck.select_first_project(page)
        if project_id is None:
            failures.append(
                '%s can see no projects at all, so nothing was measured. Run '
                '`php artisan db:seed` -- seedManualTestingFixtures assigns the '
                'Client persona to a project, and without it this check is '
                'vacuous rather than passing.' % role
            )
            continue
        uicheck.open_gantt(page)
        out = page.evaluate(MEASURE)

    observed[role] = out
    if out.get('error'):
        failures.append('%s: %s' % (role, out['error']))
        continue

    print('%-8s contributor=%-5s taskName=%-12s columns=%d spanSum=%d'
          % (role, out['hasContributor'], out['taskNameSpan'],
             out['columnCount'], out['spanSum']))

    if out['hasContributor'] != should_see:
        failures.append(
            '%s %s the contributor column' %
            (role, 'cannot see' if should_see else 'CAN SEE')
        )
    if out['taskNameSpan'] != span:
        failures.append(
            '%s task-name column is %s, expected %s -- the column span did not '
            'follow the gate, so the row has a hole in it'
            % (role, out['taskNameSpan'], span)
        )
    if out['spanSum'] != 12:
        failures.append(
            '%s header spans sum to %d, not 12 -- the grid does not add up'
            % (role, out['spanSum'])
        )
    if out['columnCount'] != columns:
        failures.append('%s renders %d header columns, expected %d'
                        % (role, out['columnCount'], columns))

# Both directions. A page that withholds the contributor from everyone passes
# every "Client must not see it" assertion and breaks the product for the four
# roles that are supposed to.
if observed.get('Client', {}).get('bodyMentionsContributor'):
    failures.append('the word "Contributor" appears somewhere in the Client\'s page text')

sys.exit(uicheck.report('GANTT CONTRIBUTOR GATE', failures))
