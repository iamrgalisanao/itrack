# Feature Specification: Project Ownership and PM-Scoped Administration

**Feature Branch**: `008-project-ownership`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "Project Ownership and PM-Scoped Administration — convert `project_owner` from a free-text label into a real, user-linked ownership relationship, and restrict a Project Manager's authority to assign/remove Team Member and Client access to only the projects they own (Admins remain unrestricted). Deferred out of 007-permission-hardening, where PM assignment authority was deliberately left unrestricted as a temporary, non-ideal stance pending this feature."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Projects have a real, assignable owner (Priority: P1)

Today, `project_owner` is a free-text field an Admin or PM can type anything into ("Project Manager Lead" on every seeded project) — it has no connection to an actual user account and enforces nothing. An Admin needs to be able to designate one or more real Project Manager accounts as the owner(s) of a specific project, see who owns what, and change ownership at any time.

**Why this priority**: Every other story in this feature depends on ownership being a real, queryable relationship first. Without this, "PM-scoped administration" (User Story 2) has nothing to scope against.

**Independent Test**: As an Admin, assign a specific Project Manager as the owner of a specific project; confirm the project now shows that PM as its owner, and confirm a different PM is not shown as an owner of it.

**Acceptance Scenarios**:

1. **Given** a project with no owner, **When** an Admin assigns a Project Manager as its owner, **Then** that PM appears as an owner of that project and no other project.
2. **Given** a project already owned by one PM, **When** an Admin assigns a second Project Manager as an additional owner, **Then** both PMs are recorded as owners of that project (ownership supports more than one owner per project — see Assumptions).
3. **Given** an Admin, **When** they view any project, **Then** they can see its current owner(s), regardless of how many or how few there are.
4. **Given** a non-Admin, non-owning user (any role), **When** they attempt to add or remove a project's owner directly via the same mechanism Admins use, **Then** the request is denied.

---

### User Story 2 - A Project Manager can only administer projects they own (Priority: P2)

Today, per 007-permission-hardening's FR-012, any Project Manager can assign or remove any Team Member's or Client's access to any project, regardless of department or any ownership concept — because no real ownership concept existed yet. Now that Story 1 gives ownership a real, queryable meaning, a PM's authority to assign or remove Team Member/Client project access is scoped to only the project(s) they own. Admins remain unrestricted, exactly as before.

**Why this priority**: This is the actual governance gap this feature exists to close — the reason 007 flagged its own PM-assignment rule as "temporary, not an ideal end state." It depends entirely on Story 1 existing first.

**Independent Test**: As a PM who owns Project A but not Project B, confirm you can grant/revoke a Team Member's access to Project A, and confirm the identical action against Project B is denied.

**Acceptance Scenarios**:

1. **Given** a PM who owns Project A, **When** they assign a Team Member or Client to Project A, **Then** the assignment succeeds, exactly as it does today.
2. **Given** the same PM, **When** they attempt to assign a Team Member or Client to Project B, which they do not own and which is owned by a *different* Project Manager, **Then** the request is denied.
3. **Given** a PM who owns no projects at all, **When** they attempt to assign or remove Team Member/Client access on a project that already has a different owner, **Then** the request is denied — but the identical action on a project with no owner at all succeeds (FR-018; see Edge Cases).
4. **Given** an Admin, **When** they assign or remove Team Member/Client access on any project regardless of who owns it, **Then** the action succeeds — Admin authority is never scoped by ownership (see Edge Cases).
5. **Given** a PM who owns a project, **When** they view Dashboard, Kanban, Work Program, Schedule, or Reports, **Then** they continue to see every project their role already lets them see today — ownership narrows *administrative* authority only, never *visibility* (see Edge Cases).

---

### User Story 3 - Ownership changes hands cleanly and is fully audited (Priority: P3)

Project Managers change teams, go on leave, or leave the organization. An Admin needs to be able to transfer a project's ownership from one PM to another (or add/remove an owner) without any gap in who can administer the project, and every ownership change needs to be visible in the audit trail — matching how every other sensitive access change in this app is already audited.

**Why this priority**: This is a lifecycle/operational-continuity concern layered on top of Stories 1 and 2 — the feature is usable without it (an Admin can always fall back to manual, one-off owner add/remove), but a dedicated transfer flow and full audit coverage is what makes ownership changes safe and traceable in practice, not just possible.

**Independent Test**: As an Admin, replace a project's sole owner with a different PM in one action; confirm the prior owner no longer has administrative authority over that project and the new owner does; confirm both the removal and the addition appear in the audit log.

**Acceptance Scenarios**:

1. **Given** a project owned by PM A, **When** an Admin transfers ownership to PM B, **Then** PM A can no longer assign/remove that project's Team Member/Client access, and PM B immediately can.
2. **Given** an ownership transfer, **When** it completes, **Then** the audit log records a single transfer entry capturing both which PM was removed and which PM was added — not two separate addition/removal entries — identifying the acting Admin, the project, and both PMs involved.
3. **Given** a PM who owns a project, **When** their account is disabled or their role changes away from Project Manager, **Then** their ownership record is not silently deleted, but no longer grants them administrative authority (see Edge Cases) — matching how 007 already handles a dormant, no-longer-relevant project assignment.

---

### Edge Cases

- **What happens to a project's administrative authority while it has zero owners?** This is the expected default state, not an error — every project starts here (no backfill, FR-016) and any project returns here any time an Admin removes its last owner without adding a replacement in the same action. While ownerless, **any** Project Manager retains today's unrestricted authority to assign/remove that project's Team Member/Client access, identical to pre-008 behavior (FR-018). This is a deliberate rollout safety net, not a lockdown: it guarantees no PM loses any assignment authority the instant this feature ships, since no project has a real owner yet on day one. The moment an Admin assigns at least one owner to a project, administrative authority for that specific project narrows to only its owner(s) among PMs, and every other PM — including one who owned it before a later ownership change removed them — is denied for that project from that point on.
- **What happens if a project's sole owner is disabled or has their role changed away from Project Manager?** (This app has no user hard-delete path — accounts are only ever disabled/reactivated, per 006 — so "owner account deleted" is not a real scenario; see Assumptions.) The ownership record persists but becomes dormant — it grants no administrative authority while the account is disabled or non-PM, exactly mirroring 007's existing "assignments persist-but-dormant across a role change" behavior for Team Member/Client assignments. If the account is later re-enabled and restored to Project Manager, its ownership (and the authority that comes with it) resumes automatically, with no re-assignment needed. The project itself is never left permanently unrecoverable — an Admin can always add a different owner regardless.
- **What happens if an Admin transfers a project's ownership to a Project Manager who already co-owns it?** Treated as consolidation, not an error: the prior owner's ownership record is removed, the target's existing ownership record is left exactly as it was (never duplicated), and the action is still recorded as a `project_ownership.transferred` audit entry — the practical intent ("ownership moved from A to B") is fully satisfied even though B's row itself doesn't change.
- **Can an Admin override or bypass ownership restrictions?** Yes, unconditionally and always — this mirrors every other access rule in this app (Admin is never scoped by department, assignment, or now ownership). This is not a special case to build; it is the existing, unchanged Admin behavior.
- **Does ownership change what a PM can see, as opposed to what they can administer?** No. A Project Manager's read visibility (Dashboard, Kanban, Work Program, Schedule, Reports, and every project-scoped surface hardened in 007) remains exactly what it is today — unrestricted across all projects. Ownership only narrows the specific administrative action of assigning/removing a Team Member's or Client's project access. This is the central distinction the feature turns on, and it must not be blurred: "can see" and "can administer" are two different questions with two different answers for a non-owning PM.
- **What happens to a project's assigned Team Members/Clients (007's `project_assignments` records) when its ownership changes or is removed?** Nothing — existing assignments are untouched by an ownership change. Ownership governs who may *make future changes* to assignments, not the assignments themselves.
- **What happens if two Admins edit the same project's ownership at the same time (e.g., both remove the last owner while adding different replacements)?** The system must not end up in a corrupted or ambiguous state (e.g., two conflicting "sole owner" records, or a silently dropped addition) — the losing concurrent request is rejected or its result is clearly reflected in what the winning request actually persisted, never silently merged into an inconsistent result.
- **What happens to a project deleted while it still has owners?** Its ownership records are removed along with it, following the same cascade-delete precedent 007 already established for `project_assignments` when a project is deleted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an Admin to designate one or more Project Manager accounts as the owner(s) of a specific project.
- **FR-002**: System MUST allow an Admin to remove a project's owner, independent of whether a replacement is assigned in the same action.
- **FR-003**: System MUST allow a project to have zero owners at any time — this is a valid state, not an error condition, and MUST NOT block any other operation on the project.
- **FR-004**: System MUST allow a project to have more than one owner at the same time.
- **FR-005**: Only Project Manager role accounts, with active (non-disabled) status, MAY be designated as a project owner — matching 007's existing target-validation precedent for project assignments (FR-016).
- **FR-006**: A Project Manager MUST be able to assign or remove a Team Member's or Client's access to a project (007's existing project-assignment mechanism) for any project they currently own, and — as a deliberate rollout safety net, see FR-018 — for any project that currently has zero owners at all.
- **FR-007**: A Project Manager who is not an owner of a specific project MUST be denied when attempting to assign or remove that project's Team Member/Client access, **if that project currently has at least one owner assigned**. A PM who owns zero projects is therefore denied on every project that already has an owner, but not on a project that has none (FR-018).
- **FR-008**: An Admin's authority to assign or remove any project's Team Member/Client access, or to manage project ownership itself, MUST NOT be restricted by ownership in any way — this is unchanged from 007 and from every existing Admin capability in this app.
- **FR-009**: Ownership MUST NOT change a Project Manager's read visibility of any project, task, dashboard, report, or any other project-scoped surface — that visibility remains exactly as broad as it is today, for every PM, regardless of what they own.
- **FR-010**: System MUST allow an Admin to transfer a project's ownership from one Project Manager to another (removing one owner and adding another) as a single, coherent action from the Admin's perspective — the Independent Test for this is indistinguishable from a remove-then-add, but a dedicated transfer action MUST be available so an Admin never needs to reason about an ownerless intermediate state themselves.
- **FR-011**: If a project's owner's account becomes disabled, or their role changes away from Project Manager, System MUST continue to store the ownership record without granting any administrative authority based on it, and MUST automatically restore that authority if the account is later re-enabled and/or restored to the Project Manager role — no re-assignment required.
- **FR-012**: System MUST record an audit log entry for every project-ownership addition, removal, and transfer, identifying the acting Admin, the project, and the Project Manager(s) involved.
- **FR-013**: System MUST enforce every ownership-based restriction at the point where the underlying action is actually performed (the same layer 007's project-assignment and project-scoping rules are enforced at) — never as a client-side-only restriction that a direct request could bypass.
- **FR-014**: System MUST remove a project's ownership records when that project is deleted, with no orphaned ownership rows remaining — matching 007's existing cascade-delete precedent for project assignments.
- **FR-015**: System MUST NOT silently corrupt or ambiguously merge ownership data when two administrative changes to the same project's ownership are made at nearly the same time — one MUST clearly take effect, and the other MUST either be rejected or leave a clearly-attributable, non-contradictory result.
- **FR-016**: The migration from the existing free-text `project_owner` field to a real ownership relationship MUST NOT automatically assign any Project Manager as the owner of any existing project — see Assumptions for why, and for what happens to existing projects immediately after migration.
- **FR-017**: Removing 007's existing "Project Manager may assign to any project" rule and replacing it with the owned-projects-only rule in this feature MUST NOT change any Department Head, Team Member, Client, or Admin behavior in any way.
- **FR-018**: A project with zero owners currently assigned MUST permit any Project Manager to assign or remove its Team Member/Client access, identical to 007's pre-existing unrestricted-PM behavior. This is the deliberate default/rollout state — no backfill exists (FR-016), so every project starts here — and is expected to narrow project-by-project only as an Admin deliberately assigns real owner(s) to a given project; it is not a permanent end state to design further around, just the safe starting behavior every project has until an Admin opts it into ownership-scoped administration.

### Key Entities

- **Project Ownership**: Links one Project Manager–role User to one Project they administratively own. Distinct from 007's Project Assignment (which links a Team Member/Client to a project they may access) — a Project Manager is never a Project Assignment target (FR-016 of 007 already forbids this), and a Team Member/Client is never a Project Ownership holder. A project may have zero, one, or several owners at once; a Project Manager may own zero, one, or several projects at once.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of project-ownership-restricted actions (assigning or removing a Team Member's/Client's project access as a Project Manager) are denied when attempted against a project that already has at least one owner and that Project Manager isn't one of them, verified by an automated test covering every such endpoint. (A project with zero owners remains unrestricted per FR-018 — not part of this criterion's denial set.)
- **SC-002**: Zero change in what any Project Manager can see (which projects, tasks, dashboards, or reports appear) as a direct result of this feature shipping — verified by comparing a representative PM's visible data before and after.
- **SC-003**: An Admin can transfer a project's ownership from one Project Manager to another, and the prior owner loses (and the new owner gains) administrative authority over that project on their very next request — no re-login required.
- **SC-004**: 100% of project-ownership additions, removals, and transfers produce a corresponding audit log entry, verified by automated test.
- **SC-005**: Zero existing project-assignment (Team Member/Client access) records are altered or removed as a side effect of any ownership change.

## Assumptions

- **No automatic ownership backfill from the existing `project_owner` free-text field.** Investigation confirmed this field is populated with a generic, non-identifying role label (e.g., "Project Manager Lead") rather than any real person's name, identically across every existing project — there is no reliable signal in the existing data to derive real ownership from. Every existing project becomes ownerless immediately after migration (a valid state per FR-003), and an Admin must deliberately assign real owners afterward. **This does not narrow any existing access, by design, and needs no separate rollout step or feature flag**: every ownerless project — which is every project, on day one — remains fully unrestricted for any Project Manager (FR-018), the exact same behavior as pre-008. PM-scoped restriction isn't something an Admin "enables"; it is simply what automatically starts applying to a given project the moment that project acquires its first real owner. This per-project, opt-in-by-assignment mechanism is what prevents a deploy-day access regression — not a migration step or toggle.
- **The old free-text `project_owner` field is retained, not destructively dropped, in the same change that introduces real ownership** — matching this project's constitution (small, additive, reversible migrations). It may be deprecated or removed in a later, separate change once real ownership data exists and any remaining display dependencies on the free-text field are confirmed unused.
- **This app has no user hard-delete path.** Accounts are only ever disabled or reactivated (006's existing lifecycle) — there is no "delete a user" operation anywhere in this codebase today. "Owner account deleted" is therefore not a real scenario this spec needs behavior for; the `project_ownerships.user_id` foreign key's `cascadeOnDelete()` exists only as defensive referential integrity for a lifecycle event that doesn't currently occur, not as a designed-for path with its own dormancy semantics (that's FR-011's disabled/role-changed case, which is the only reachable case in practice).
- **This feature's Project Manager-facing surface is API-only, matching 007's own precedent.** Project Manager accounts cannot reach the Admin Control Center today — 007 already restricts it to Admin-only, independent of this feature. So ownership management (add/remove/transfer) is usable through the UI only by Admins, exactly like 007's own project-assignment management, even though the underlying `project_assignments` API has always accepted PM callers directly. This feature does not add a PM-facing UI for either concern; that would be a separate, future UX feature, not in scope here.
- **`GET /api/project-assignments` remains unrestricted for Project Manager readers, unchanged by this feature.** Ownership narrows administrative *writes* only (FR-006/FR-007), never *reads*. Narrowing this list endpoint too would actually be the more inconsistent design: a PM can already see full task/module/activity detail for any project via Dashboard/Kanban/etc. regardless of what they own (FR-009), so restricting just this one assignment-list view would be an arbitrary carve-out, not a coherent privacy boundary.
- **Ownership supports multiple owners per project, with no distinction between a "primary" and "secondary" owner.** This mirrors 007's own `project_assignments` table, which already supports multiple Team Members/Clients per project with no ranking between them, and avoids forcing a single-owner bottleneck during PM handoffs, leave, or shared management of a large project. A future spec could introduce a "primary owner" concept if a real need for one emerges; nothing here should be read as ruling that out.
- **No approval workflow for ownership changes or PM-initiated assignment requests.** The historical planning note that prompted this feature ("Project Managers can manage access for projects they own, if approved") is treated as motivation for the ownership concept itself, not as a mandate for an approval/request queue — matching 007's own precedent of deferring that additional complexity rather than folding it in here. If a future need for PM-proposes/Admin-approves emerges, it is its own feature.
- **This feature depends on 007-permission-hardening's `project_assignments` mechanism already existing** (it does — 007 has shipped) and narrows 007's FR-012 specifically; it does not touch any other 007 behavior (project-scoped visibility, preview mode, non-enumeration, or the consistent access-denied UI all remain exactly as 007 left them).
