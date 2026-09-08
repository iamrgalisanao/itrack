# -*- coding: utf-8 -*-
"""Shared plumbing for the local UI verification checks in scripts/uichecks/.

WHY THIS EXISTS, and why it is not a CI gate.

Feature 024 kept reaching questions that no committed gate can answer. Does the
Reports chart still draw its bars when printed? Does a Client actually receive a
page without the contributor column? Is a status still distinguishable when hue
is removed? Those are properties of a RENDERED APPLICATION, and every gate this
repo has needs either source text (verify-contrast.py) or a stylesheet in a
hand-built fixture (verify-cascade.py). verify-cascade.py deliberately never
executes React -- that is recorded in its own header and in
contracts/ui-contracts.md Contract 4, and it is the reason task T041 was deleted
rather than implemented.

So the answers came from throwaway Playwright scripts. Three of them, each
rewriting the same login-and-navigate preamble, each thrown away afterwards, and
each taking its hard-won knowledge with it:

  * the Gantt is reachable only via `?view=gantt`
  * Work Program deliberately does NOT fall back to projects[0]; it restores an
    explicit choice from localStorage under a specific key
  * /api/projects is not shaped `{data: [...]}` in every deployment
  * ProjectAssignment requires assigned_by_user_id, which is not nullable
  * the seeded Client has no assignment, so no Client-facing view is reachable
    at all without creating one

Every one of those cost a failed run to learn. They belong in a file.

WHAT THIS IS: a developer tool, run locally against a running app, by a human
who wants an answer. It is NOT wired into .github/workflows/ci.yml and should
not be. It needs a server, a database and a real session; a CI job that needs
all three is a CI job that fails for reasons unrelated to the change under test,
and this repo has spent several PRs establishing that a gate which is red for
the wrong reason is worse than no gate.

WHAT IT PROVES: what the browser rendered, for a real logged-in role. What it
does NOT prove: anything about assistive technology semantics. An accessible
name in the tree is not the same as a screen reader announcing it. That
distinction belongs to the manual matrix and must not be blurred here.

USAGE

    cd backend && php artisan serve --port=8011     # terminal 1
    cd frontend && npm run dev                      # terminal 2
    python scripts/uichecks/<name>.py               # terminal 3

Each check exits 0 when it passes and non-zero with a named reason when it does
not, so they compose into a shell loop if you want to run the set.
"""

import os
import sys
from contextlib import contextmanager

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - operator-facing message, not logic
    sys.exit(
        'playwright is not installed. It is the same dependency verify-cascade.py\n'
        'uses:\n\n'
        '    python -m pip install playwright\n'
        '    python -m playwright install --with-deps chromium\n'
    )

BASE_URL = os.environ.get('ITRACK_UI_BASE', 'http://localhost:5173')

# Seeded by DatabaseSeeder. The password is a fixture committed in the seeder
# itself, not a credential -- see database/seeders/DatabaseSeeder.php.
FIXTURE_PASSWORD = 'password'
PERSONAS = {
    'Admin': 'admin@itrack.test',
    'Project Manager': 'pm@itrack.test',
    'Department Head': 'depthead@itrack.test',
    'Team Member': 'team@itrack.test',
    'Client': 'client@itrack.test',
}

# WorkProgram.jsx:161. Work Program restores the last EXPLICITLY chosen project
# and deliberately does not fall back to projects[0] -- with nothing stored it
# shows a "No project selected" empty state, so a check that just navigates
# finds no Gantt and reports a confusing "element not found".
SELECTED_PROJECT_STORAGE_KEY = 'itrack.workProgram.selectedProjectId'


@contextmanager
def session(role='Admin', width=1600, height=1000, headless=True):
    """A logged-in page for `role`, with a project already selected."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page(viewport={'width': width, 'height': height})
        try:
            login(page, role)
            select_first_project(page)
            yield page
        finally:
            browser.close()


def login(page, role='Admin'):
    email = PERSONAS.get(role, role)  # accepts a role name or a raw email
    page.goto(f'{BASE_URL}/login', wait_until='networkidle')
    page.fill('input[type=email]', email)
    page.fill('input[type=password]', FIXTURE_PASSWORD)
    page.click('button[type=submit]')
    page.wait_for_timeout(2500)
    if '/login' in page.url:
        raise RuntimeError(f'login failed for {email} -- is the API on :8011 and seeded?')
    return page


def select_first_project(page):
    """Store an explicit project choice, the way the UI would.

    Returns the project id, or None when the role can see no projects at all --
    which is the seeded Client's situation and is a fact worth surfacing rather
    than failing on.
    """
    project_id = page.evaluate(
        """async () => {
            const r = await (await fetch('/api/projects', {credentials: 'include'})).json();
            const list = Array.isArray(r) ? r : (r.data || r.projects || []);
            return list.length ? list[0].id : null;
        }"""
    )
    if project_id is not None:
        page.evaluate(
            'id => localStorage.setItem(%r, String(id))' % SELECTED_PROJECT_STORAGE_KEY,
            project_id,
        )
    return project_id


def open_gantt(page):
    """Work Program's timeline. Only reachable by URL parameter."""
    page.goto(f'{BASE_URL}/work-program?view=gantt', wait_until='networkidle')
    page.wait_for_timeout(3000)
    return page


def open_reports(page):
    page.goto(f'{BASE_URL}/reports', wait_until='networkidle')
    page.wait_for_selector('text=Task Breakdown', timeout=20000)
    page.wait_for_timeout(1000)
    return page


def set_theme(page, theme):
    """`theme` is 'light' or 'dark'. The app persists it in localStorage and
    reads it on mount, so this reloads rather than clicking the toggle -- the
    toggle's accessible name differs between collapsed and expanded sidebars."""
    page.evaluate('t => localStorage.setItem("theme", t)', theme)
    page.reload(wait_until='networkidle')
    page.wait_for_timeout(1500)
    return page


# Vienot-Brettel-Mollon (1999) dichromacy, the same model verify-contrast.py
# measures dE00 against. Applied as an SVG filter over the whole document so
# what you see is what the arithmetic in the gate is talking about.
_CVD_MATRICES = {
    'protan': '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  '
              '-0.003882 -0.048116 1.051998 0 0  0 0 0 1 0',
    'deutan': '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  '
              '-0.011820 0.042940 0.968881 0 0  0 0 0 1 0',
}


def simulate_cvd(page, kind=None):
    """`kind` is 'protan', 'deutan', or None to clear."""
    if kind is not None and kind not in _CVD_MATRICES:
        raise ValueError(f'unknown deficiency {kind!r}; expected protan, deutan or None')
    page.evaluate(
        """([kind, matrix]) => {
            document.getElementById('uicheck-cvd')?.remove();
            document.documentElement.style.filter = '';
            if (!kind) return;
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = 'uicheck-cvd';
            svg.setAttribute('style', 'position:absolute;width:0;height:0');
            svg.innerHTML =
                '<filter id="uicheck-cvd-f" color-interpolation-filters="linearRGB">' +
                '<feColorMatrix type="matrix" values="' + matrix + '"/></filter>';
            document.body.appendChild(svg);
            document.documentElement.style.filter = 'url(#uicheck-cvd-f)';
        }""",
        [kind, _CVD_MATRICES.get(kind, '')],
    )
    return page


def report(name, failures):
    """Uniform verdict line, so a set of checks reads as one result."""
    print()
    print('%s %s' % (name, 'PASSES' if not failures else 'FAILS'))
    for f in failures:
        print('  ' + f)
    return 1 if failures else 0
