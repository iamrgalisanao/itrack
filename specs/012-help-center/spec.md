# Feature Specification: In-App Help Center

**Feature Branch**: `012-help-center`

**Created**: 2026-08-01

**Status**: Draft

**Input**: User description: "Add an in-app Help Center knowledge base that surfaces the seven role-based user guides already written in docs/user-guides/ (admin, project-manager, department-head, team-member, client-viewer, client-contributor, client-admin), so signed-in users can read documentation for their own role without leaving the app. Wire up the existing "Help Center" sidebar/footer link (currently a dead stub button in App.jsx with no route and no onClick) to a new route that renders the markdown guide matching the signed-in user's role — System role Admin/Project Manager/Department Head/Team Member map one-to-one to their guide; a Client-role user's guide is selected by their ProjectMembership role (client_viewer/client_contributor/client_admin) on their accessible project, defaulting to the Client Viewer guide if no membership role can be resolved. Render the markdown to HTML client-side, including its embedded screenshots (currently in docs/user-guides/images/). Phase 1 scope only: one auto-selected guide per user, no search, no cross-role browsing (e.g. an Admin cannot browse the Client Contributor guide from this view), and no in-app editing of guide content — the source of truth stays the markdown files in the repo, edited by developers/tech writers the same way as today. Search and cross-role browsing for Admins are explicitly deferred to a later phase."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open my own role's guide from Help Center (Priority: P1)

A signed-in user selects "Help Center" from the sidebar and lands directly on the documentation written for their role — an Admin sees the Admin Guide, a Team Member sees the Team Member Guide — without picking from a list or searching for it.

**Why this priority**: This is the entire point of the feature. Without it, "Help Center" stays the dead stub it is today, and none of the documentation work already done is reachable from inside the product.

**Independent Test**: Sign in as a Project Manager, select Help Center from the sidebar, and confirm the Project Manager Guide's content renders on screen — its section headings, task steps, and terminology matching the guide as written.

**Acceptance Scenarios**:

1. **Given** a signed-in Admin, **When** they select Help Center, **Then** the Admin Guide renders.
2. **Given** a signed-in Project Manager, **When** they select Help Center, **Then** the Project Manager Guide renders.
3. **Given** a signed-in Department Head, **When** they select Help Center, **Then** the Department Head Guide renders.
4. **Given** a signed-in Team Member, **When** they select Help Center, **Then** the Team Member Guide renders.
5. **Given** the Help Center link previously did nothing when selected, **When** this feature ships, **Then** selecting it always navigates to a guide — it is never a dead click again.

---

### User Story 2 - Client users see the guide matching their access level (Priority: P1)

A signed-in Client-role user selects Help Center and sees the guide that matches how much they're actually allowed to do on their project — a read-only member sees the Client Viewer Guide, someone who can also invite teammates sees the Client Admin Guide — rather than a generic, one-size-fits-all client document.

**Why this priority**: Three of the seven guides exist specifically because Client-role access varies by membership level. Showing the wrong one would tell a Client Admin they can't do something they actually can, or worse, walk a Client Viewer through steps that will fail. This is as central to the feature's value as User Story 1.

**Independent Test**: Approve a user's project membership as `client_contributor`, sign in as that user, select Help Center, and confirm the Client Contributor Guide renders rather than the Viewer or Admin guide.

**Acceptance Scenarios**:

1. **Given** a Client user with an approved `client_viewer` membership, **When** they select Help Center, **Then** the Client Viewer Guide renders.
2. **Given** a Client user with an approved `client_contributor` membership, **When** they select Help Center, **Then** the Client Contributor Guide renders.
3. **Given** a Client user with an approved `client_admin` membership, **When** they select Help Center, **Then** the Client Admin Guide renders.
4. **Given** a Client user with no approved project membership yet (for example, only a pending invitation), **When** they select Help Center, **Then** the Client Viewer Guide renders as the default, rather than an error or a blank page.
5. **Given** a Client user approved at different membership levels on more than one project, **When** they select Help Center, **Then** the guide for their highest-access level across those memberships renders (Client Admin over Contributor over Viewer) — the goal is to never under-explain what they're capable of.

---

### User Story 3 - See the guide's screenshots, not just its text (Priority: P2)

A user reading their guide in Help Center sees the same screenshots that appear in the source documentation — sign-in screen, dashboards, task dialogs, and so on — rendered inline with the text, not as broken image icons or missing placeholders.

**Why this priority**: The guides were deliberately written with screenshots to show real UI labels and layouts rather than describing them in the abstract. Text alone still delivers value (a smaller, still-independently-useful slice than User Story 1's routing), which is why this is separable and ranked below it — but a guide with broken images undermines the "stranger test" the documentation was written to pass.

**Independent Test**: Open any guide known to contain screenshots (for example, the Admin Guide) in Help Center and confirm every image referenced in that guide's source markdown displays correctly, at a readable size, in the order the text presents them.

**Acceptance Scenarios**:

1. **Given** a guide whose source markdown embeds one or more screenshots, **When** that guide renders in Help Center, **Then** every one of those screenshots displays successfully in place.
2. **Given** a screenshot displayed in Help Center, **When** a user views it, **Then** it is legible at the width of the content area (not clipped, not stretched illegibly small).

---

### User Story 4 - Preview mode shows the guide for the previewed role (Priority: P3)

An Admin using the product's existing "Preview as this user" feature selects Help Center while previewing another role, and sees that role's guide — consistent with every other page in the app already changing to match the previewed role.

**Why this priority**: This is a consistency refinement on top of User Story 1, not a new capability — Preview mode already governs navigation and page content everywhere else. Lowest priority because the feature is still coherent without it (an Admin can simply stop previewing and read their own guide), but leaving Help Center as an exception to Preview mode would be a confusing, easily-noticed gap.

**Independent Test**: As an Admin, start previewing a Team Member, select Help Center, and confirm the Team Member Guide renders rather than the Admin Guide; stop previewing and confirm Help Center reverts to the Admin Guide.

**Acceptance Scenarios**:

1. **Given** an Admin currently previewing a Department Head, **When** they select Help Center, **Then** the Department Head Guide renders.
2. **Given** an Admin who ends a preview session, **When** they select Help Center afterward, **Then** the Admin Guide renders again.
3. **Given** an Admin currently previewing a Client-role user who holds an approved `client_admin` membership, **When** they select Help Center, **Then** the Client Admin Guide renders — the same guide resolution rule from User Story 2 applies to the previewed identity, not just the previewed system role.

---

### Edge Cases

- A guide's source markdown contains a link to a different role's guide (for example, the Admin Guide links to the Project Manager Guide for day-to-day project work). Since cross-role browsing is out of scope for Phase 1, selecting that link MUST NOT crash, error, or dead-end the page — see FR-009.
- A user's role cannot be resolved at all (a defensive case; the platform's existing access rules already fail closed before a request reaches this feature in practice) — Help Center MUST show a clear, non-technical explanation rather than a blank page or a raw error.
- A Client user's only approved membership is later suspended or removed while they're viewing Help Center — the next time they open Help Center, it MUST re-resolve their guide rather than continue showing a guide for access they no longer have.
- Whatever information Help Center needs to resolve a guide (system role, and Client membership tier when applicable) MUST be available for a *previewed* identity exactly as completely as it is for a real signed-in identity — the previewed-user data the rest of the product already exposes during a Preview session MUST carry the same membership-tier information used in User Story 2, not a narrower subset of it (see FR-006).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a working Help Center destination reachable from the existing Help Center link in the sidebar/footer, replacing its current non-functional behavior.
- **FR-002**: System MUST render, for a signed-in Admin, Project Manager, Department Head, or Team Member, the single guide written for that exact role.
- **FR-003**: System MUST render, for a signed-in Client-role user, the guide matching their approved project membership role (Viewer, Contributor, or Admin). When a user holds more than one approved membership at different levels, the highest-access guide (Admin, then Contributor, then Viewer) MUST be shown.
- **FR-004**: System MUST render the Client Viewer guide as the default for a Client-role user with no approved project membership role to resolve.
- **FR-005**: System MUST display every screenshot embedded in a guide's source content, in place, alongside that guide's text.
- **FR-006**: System MUST resolve the guide using the effective identity currently in use — including an Admin's previewed user during an active Preview session — consistent with how the rest of the product already determines the acting user under Preview mode. This applies equally when the previewed user is a Client-role user: their approved membership tier MUST be resolvable from the previewed identity's data, the same as FR-003 requires for a real signed-in Client user, not just their system role.
- **FR-007**: System MUST NOT expose a way, in this phase, to browse, search, or switch to a guide other than the one resolved for the current effective role or membership.
- **FR-008**: System MUST NOT provide any in-app mechanism to create, edit, or delete guide content; the underlying documentation files remain the sole source of truth and are changed outside the running application.
- **FR-009**: System MUST NOT error, crash, or dead-end when rendered guide content contains a link to another role's guide; that link is not required to navigate to another in-app guide in this phase.
- **FR-010**: System MUST re-resolve which guide to show each time Help Center is opened, rather than caching a guide selection from a prior session or role state.

### Key Entities *(include if feature involves data)*

- **User Guide**: One of the seven existing role-based documents (Admin, Project Manager, Department Head, Team Member, Client Viewer, Client Contributor, Client Admin). Read-only content for purposes of this feature; not a new data record, and not user-editable at runtime.
- **Role-to-Guide Resolution**: The rule that maps a user's current effective role — system role directly, or Client membership level for Client-role users — to exactly one User Guide. Not a stored entity; a computed relationship evaluated each time Help Center is opened.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in user reaches documentation written specifically for their role in a single navigation step (one selection of Help Center), with no additional picking or searching required.
- **SC-002**: All seven existing guides are each reachable by at least one real account configuration exercised in testing (one per system role, plus one per client membership level).
- **SC-003**: Zero broken or missing images appear across any guide when viewed through Help Center.
- **SC-004**: 100% of tested Client accounts see the guide matching their actual current membership level, verified across all three client access levels and the no-membership default case.
- **SC-005**: Selecting the Help Center link never results in a dead click, blank page, or unhandled error, for any signed-in role.

## Assumptions

- The seven markdown guides in `docs/user-guides/` are treated as finished, ready-to-ship content for this feature; this feature does not change their wording or structure.
- Guide content stays a developer/tech-writer-maintained workflow (editing the source files and shipping a new build), not a runtime content-management capability — no authoring UI is in scope.
- The existing data model's one-membership-role-per-user-per-project structure is sufficient to resolve a Client user's guide; this feature does not need to reconcile conflicting roles from a single membership record.
- Search across guides and an Admin's ability to browse every guide (not just their own) are explicitly deferred to a later phase, per the source request.
- This feature depends on the existing Preview mode / effective-user resolution already used elsewhere in the product (introduced in `specs/007-permission-hardening/` and extended by `specs/011-project-client-access-control/`) continuing to be the source of truth for "who is the user acting as right now."
