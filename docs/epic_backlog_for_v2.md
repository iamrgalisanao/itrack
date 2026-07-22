# iTrack P2 Epic Backlog — Project Management Application

**Version:** 1.0
**Status:** Draft for Review
**Priority:** P2 — High Priority, Post-V1
**Owner:** Product Management
**Context:** Follows deployment of real authentication using Sanctum SPA cookies

---

## Introduction

This backlog structures the next ten planned P2 features for iTrack into actionable epics. The goal is to help stakeholders understand the business sequencing while giving engineering a clear starting point for technical scoping, story breakdown, and implementation planning.

The roadmap should be treated as an exploration of structure and dependencies, not a final locked delivery plan. Some epics may need to be split further after technical discovery.

The sequencing logic is:

1. **Epics 1–2: Foundational Enablers**
   User Management and Permission Hardening are required before broader production use. Now that real authentication exists, the system needs real account administration and more precise access control.

2. **Epics 3–6: Core Functionality Strengthening**
   Activity Feed, Project Templates, Gantt Enhancements, and Task Dependencies v2 improve daily project execution, repeatability, and schedule control.

3. **Epics 7–10: Use Case and Market Expansion**
   Advanced Reports, Workload Planning, Client Portal v2, and Approval Workflow expand iTrack into management reporting, resource planning, client collaboration, and formal delivery governance.

---

# Epic 1: User Management

## Goal

Enable Admins to manage real users directly inside iTrack after the migration from mock authentication to real Sanctum-based authentication. This solves the operational gap where users are currently seeded or managed manually by engineering.

Business value: reduces developer dependency, enables real rollout to teams and clients, and creates the administrative foundation for permissions, workload planning, approvals, and client portal access.

## Scope

Included:

* Admin user list
* Create user
* Edit user profile fields
* Assign system role
* Assign department
* Activate / deactivate user
* Reset password or trigger password setup
* Search, filter, and paginate users
* Audit log for user actions

System roles:

* Admin
* Project Manager
* Department Head
* Team Member
* Client

## Out of Scope

* Public registration
* Self-service signup
* Social login
* SSO
* Email verification
* Complex multi-role users
* Organization-level billing users
* Full user profile customization

## User Stories

1. As an Admin, I want to create a user, so that new team members or clients can access iTrack without developer support.
2. As an Admin, I want to assign a role and department to a user, so that access rules work correctly.
3. As an Admin, I want to deactivate a user, so that former employees or inactive clients can no longer access the system.
4. As an Admin, I want to search and filter users, so that I can manage large teams efficiently.
5. As an Admin, I want user changes to be audit logged, so that permission-sensitive actions are traceable.

## Acceptance Criteria

* Admin can create a user with name, email, role, department, and status.
* Email must be unique.
* Admin can edit user role and department.
* Admin can deactivate and reactivate users.
* Deactivated users cannot access protected routes.
* Non-Admin users cannot access user management APIs.
* All create, update, deactivate, reactivate, and password reset actions create audit log entries.
* User list supports search and pagination.
* API responses return curated user fields only, never password or remember token.

## Dependencies

Depends on:

* Real authentication
* Existing role model
* Existing department concept
* Audit log infrastructure

Enables:

* Permission Hardening
* Workload Planning
* Client Portal v2
* Approval Workflow

## Technical Notes

* Extend existing `users` table.
* Add Admin-only endpoints for user CRUD.
* Add user status, such as `active` or `disabled`.
* Auth middleware should reject disabled users.
* Preserve current five-role vocabulary.
* Consider adding `password_changed_at` and `last_login_at` later, but not required for first increment.

---

# Epic 2: Permission Hardening

## Goal

Strengthen access control beyond simple role checks by introducing project-level access, client-specific access, consistent permission enforcement, and safer access-denied behavior.

Business value: protects client and internal data, prepares the product for real customers, and reduces security risk as more users are onboarded.

## Scope

Included:

* Project-level user access
* Client-to-project assignment
* Team Member project access
* Department Head department-scoped access
* Cross-department access support
* Admin preview as Client / role
* Consistent 403 screens
* Backend enforcement across all modules
* Permission audit logging

## Out of Scope

* Fully customizable RBAC permission builder
* Per-field permission configuration for every object
* SSO group sync
* Enterprise policy engine
* Billing permission model

## User Stories

1. As an Admin, I want to assign users to specific projects, so that users only access relevant work.
2. As an Admin, I want to assign Client users to specific projects, so that clients do not see unrelated projects.
3. As a Department Head, I want to see only projects under my department or granted departments, so that visibility follows my responsibility.
4. As an Admin, I want to preview access as a Client, so that I can verify what external users can see.
5. As a user without permission, I want a clear access-denied message, so that I understand why I cannot access a page.

## Acceptance Criteria

* Project access is enforced on backend APIs.
* Client users can only view explicitly assigned projects and client-visible tasks/files/comments.
* Department Heads can only view assigned department and granted department projects.
* Team Members can only access assigned or allowed projects, depending on final rule.
* Access scope is applied before filters.
* Direct API calls cannot bypass access rules.
* Admin can preview client or role-based visibility in read-only mode.
* Non-authorized users receive 403, not hidden failures.
* Permission changes are audit logged.

## Dependencies

Depends on:

* User Management
* Real authentication
* Existing client visibility fields
* Existing audit logs

Enables:

* Client Portal v2
* Advanced Reports
* Approval Workflow
* Safe external collaboration

## Technical Notes

* Centralize access in model scopes or access services.
* Suggested entities:

  * `project_user_access`
  * `client_project_access`
* Avoid duplicating access logic in every controller.
* Ensure exports and reports reuse the same access scope.
* Add automated tests for every role and major module.

## Sequencing Concern

This epic should start immediately after User Management. If delayed, later P2 features risk building on weak access assumptions.

---

# Epic 3: Activity Feed

## Goal

Provide a human-readable project and task activity timeline that shows what changed, who changed it, and when. This is separate from audit logs, which are security-focused.

Business value: improves project transparency, reduces status clarification, and helps managers quickly understand recent activity.

## Scope

Included:

* Project-level activity feed
* Task-level activity feed
* Recent activity widget
* Events for task changes, comments, files, health updates, assignments, status changes, and client-sharing changes
* Client-safe activity filtering
* Pagination and filtering by event type

## Out of Scope

* Real-time WebSocket updates
* AI-generated activity summaries
* Editable activity history
* External integrations
* Full audit log replacement

## User Stories

1. As a Project Manager, I want to see recent project activity, so that I know what changed without opening every task.
2. As a Team Member, I want to see task-level history, so that I understand context before updating work.
3. As a Client, I want to see client-visible updates, so that I can track progress without seeing internal operations.
4. As a Department Head, I want recent activity across department projects, so that I can monitor delivery health.
5. As a Project Manager, I want to filter activity by type, so that I can focus on important changes.

## Acceptance Criteria

* Activity events are created for key project and task changes.
* Project feed shows newest events first.
* Task feed shows relevant task-specific events.
* Clients only see client-visible activity.
* Internal comments and files never appear in client activity feed.
* Feed supports pagination.
* Feed supports event-type filtering.
* Activity events include actor, action, entity, timestamp, and readable description.

## Dependencies

Depends on:

* Real authentication
* Permission Hardening
* Existing audit/event patterns
* Comments, attachments, tasks, project health

Enables:

* Approval Workflow history
* Advanced Reports context
* Client Portal activity section

## Technical Notes

* Use a dedicated `activity_events` table instead of reusing `audit_logs`.
* Activity feed should be domain-event driven.
* Consider a service like `ActivityLogger`.
* Add visibility field or derive visibility from related entity.
* Must not expose internal-only activity to Clients.

---

# Epic 4: Project Templates

## Goal

Allow teams to create repeatable project structures with predefined phases, tasks, milestones, durations, assignee placeholders, and dependencies.

Business value: reduces setup time, standardizes delivery, and improves consistency across similar implementation projects.

## Scope

Included:

* Create project template
* Save existing project as template
* Create project from template
* Template tasks
* Template milestones
* Relative dates and durations
* Default assignee role or placeholder
* Basic dependencies
* Activate / deactivate templates

## Out of Scope

* Public template marketplace
* Template version branching
* Cross-organization template library
* AI-generated templates
* Template billing packages

## User Stories

1. As a Project Manager, I want to create a project from a template, so that I can start repeatable projects faster.
2. As an Admin, I want to manage standard templates, so that delivery teams follow consistent project structures.
3. As a Project Manager, I want template dates to calculate from a project start date, so that schedules are created automatically.
4. As a Project Manager, I want to save an existing project as a template, so that successful project patterns can be reused.
5. As a Project Manager, I want to edit tasks after project creation, so that templates do not lock the project into a rigid structure.

## Acceptance Criteria

* Admin/PM can create templates.
* Admin/PM can create a project from a template.
* Template-created projects include tasks, milestones, and sections.
* Relative dates are calculated based on selected project start date.
* Template-created tasks can be edited independently after creation.
* Inactive templates cannot be used for new projects.
* Template creation and use are audit logged.
* Template-created projects track the source template ID.

## Dependencies

Depends on:

* User Management
* Permission Hardening
* Stable project/task data model

Enables:

* Faster onboarding
* Standard delivery methodology
* Better workload forecasting
* More consistent reports

## Technical Notes

* Prefer normalized template tables if editing is required:

  * `project_templates`
  * `template_tasks`
  * `template_milestones`
  * `template_dependencies`
* Use relative day offsets instead of fixed dates.
* Support role placeholders before real assignees are chosen.
* Avoid template changes mutating already-created projects.

---

# Epic 5: Gantt Enhancements

## Goal

Improve the existing Gantt view into a more interactive schedule management tool with drag-to-reschedule, milestone visibility, dependency visualization, and export-friendly output.

Business value: gives Project Managers stronger planning control and improves executive timeline communication.

## Scope

Included:

* Drag task bars to adjust dates
* Resize task duration
* Milestone markers
* Visual dependency lines
* Day/week/month zoom
* Read-only mobile Gantt view
* Print/PDF-friendly Gantt export
* Schedule risk indicators

## Out of Scope

* Full critical path engine in first increment
* Automatic rescheduling by default
* Resource leveling
* Offline editing
* Advanced baseline comparison unless separately scoped

## User Stories

1. As a Project Manager, I want to drag Gantt task bars, so that I can adjust schedules visually.
2. As a Project Manager, I want to resize task bars, so that I can update task duration quickly.
3. As a Department Head, I want to see milestones in Gantt, so that I can understand delivery checkpoints.
4. As a Project Manager, I want dependency lines, so that I can understand schedule sequence.
5. As a stakeholder, I want to print or export the Gantt view, so that I can review the timeline outside the app.

## Acceptance Criteria

* User can drag a task bar to change start and due dates.
* User can resize task duration.
* System validates date changes before saving.
* Permission rules control who can edit Gantt dates.
* Milestones render distinctly.
* Dependency lines render between connected tasks.
* Overdue, blocked, completed, and at-risk tasks are visually distinct.
* Gantt export/print hides unnecessary navigation.
* Mobile view is usable in read-only mode.

## Dependencies

Depends on:

* Permission Hardening
* Task date model
* Existing Gantt baseline
* Task Dependencies v2 for advanced dependency lines

Enables:

* Better schedule control
* Dependency risk visualization
* Stronger client/executive reporting

## Technical Notes

* Date edits must use task update APIs.
* Add undo or confirmation for large schedule changes.
* Consider virtualization for large projects.
* Add keyboard-accessible fallback for date updates.
* Gantt should use the same access scope as tasks and projects.

## Sequencing Concern

Some dependency visuals can ship before full Task Dependencies v2, but richer dependency behavior depends on Epic 6.

---

# Epic 6: Task Dependencies v2

## Goal

Expand dependency management so teams can understand blocked work, predecessor/successor relationships, and downstream schedule risks.

Business value: improves delivery predictability and makes schedule risk visible before deadlines are missed.

## Scope

Included:

* Dependency types:

  * Finish-to-start
  * Start-to-start
  * Finish-to-finish
* Blocked-by relationship
* Dependency panel on task detail
* Circular dependency prevention
* Dependency risk detection
* Dependency warnings in Gantt and Reports
* Dependency notifications for high-risk events

## Out of Scope

* Automatic rescheduling by default
* Full critical path engine
* Cross-project dependencies
* Resource-based dependency constraints
* Enterprise dependency modeling

## User Stories

1. As a Project Manager, I want to link tasks with dependencies, so that the team understands work sequence.
2. As a Team Member, I want to see what my task is blocked by, so that I know what must happen first.
3. As a Project Manager, I want the system to prevent circular dependencies, so that invalid schedules cannot be created.
4. As a Department Head, I want dependency risk counts, so that I can identify projects at risk.
5. As a Project Manager, I want warnings when predecessor tasks are overdue or blocked, so that I can act early.

## Acceptance Criteria

* Users can create supported dependency types.
* Users can remove dependencies.
* System prevents circular dependencies.
* Dependency panel shows predecessors and successors.
* Overdue predecessor creates dependency risk.
* Blocked predecessor creates dependency risk.
* Dependency risks appear in reports.
* Dependency lines appear in Gantt.
* Dependency changes create activity events.

## Dependencies

Depends on:

* Permission Hardening
* Gantt baseline
* Task model
* Activity Feed

Enables:

* Stronger Gantt Enhancements
* Advanced Reports
* Approval Workflow sequencing
* Future critical path analysis

## Technical Notes

* Add or extend task dependency table with:

  * `predecessor_task_id`
  * `successor_task_id`
  * `dependency_type`
  * `lag_days`
* Circular dependency validation must be server-side.
* Dependency risk calculation should be centralized.
* Avoid automatic rescheduling in P2 unless separately approved.

---

# Epic 7: Advanced Reports

## Goal

Expand reporting into a stronger management visibility layer with curated report types for project health, overdue tasks, risks, blockers, department performance, and client progress.

Business value: reduces manual reporting effort and gives leadership better decision-making visibility.

## Scope

Included:

* Weekly project status report
* Overdue task report
* Risk and blockers report
* Department performance report
* Client progress report
* Saved filters
* CSV export
* Print / Save as PDF
* Client-safe report mode
* Report generation timestamp

## Out of Scope

* Custom report builder
* BI tool embedding
* Scheduled email reports in first increment
* Financial/budget reports
* Report snapshot history unless needed later

## User Stories

1. As a Project Manager, I want a weekly project status report, so that I can update stakeholders quickly.
2. As a Department Head, I want department-level reports, so that I can monitor project delivery across my area.
3. As a Client, I want a client-safe progress report, so that I can understand project status without seeing internal details.
4. As a Project Manager, I want to export reports to CSV, so that I can analyze or share the data.
5. As a user, I want to save report filters, so that I can quickly reuse common views.

## Acceptance Criteria

* Reports use role-scoped data.
* Clients receive only client-safe report content.
* Report filters include project, department, health, assignee, status, and date range where permitted.
* CSV export uses authenticated download.
* Print/PDF view hides app navigation.
* Saved filters can be created, used, and deleted.
* Report metrics match dashboard/reporting service calculations.
* Reports include generated timestamp.

## Dependencies

Depends on:

* Permission Hardening
* Activity Feed for richer context, optional
* Task Dependencies v2 for dependency risk details
* Existing Reports v1

Enables:

* Executive reporting
* Client Portal v2
* Workload Planning visibility
* Approval Workflow reporting

## Technical Notes

* Use shared reporting service to avoid metric drift.
* Use separate serializers for internal and client-safe reports.
* Exports must enforce backend access scope.
* Saved filters may require `saved_report_views`.
* Consider caching only after performance testing.

---

# Epic 8: Workload Planning

## Goal

Provide visibility into team capacity, task load, overloaded members, and upcoming work by person and department.

Business value: helps prevent delays caused by over-allocation and supports better staffing decisions.

## Scope

Included:

* Estimated effort per task
* Weekly capacity per user
* Workload calendar/grid
* Overload indicators
* Underutilization indicators
* Department workload summary
* Filters by user, project, department, role, and date range
* Read-only Department Head view

## Out of Scope

* Timesheet approval
* Payroll
* Billing calculations
* Automatic resource assignment
* Skills-based matching
* Leave management

## User Stories

1. As a Project Manager, I want to see workload by user, so that I avoid assigning too much work to one person.
2. As a Department Head, I want to see department capacity, so that I can identify staffing risks.
3. As a Project Manager, I want to add estimated hours to tasks, so that workload calculations are meaningful.
4. As a Team Member, I want to see my workload, so that I understand upcoming commitments.
5. As a Project Manager, I want overload warnings, so that I can rebalance work before delays happen.

## Acceptance Criteria

* Tasks support estimated effort.
* Users support weekly capacity.
* Workload view groups work by user and week.
* Overloaded users are clearly marked.
* Completed tasks do not count toward future workload.
* Users only see workload data they are authorized to view.
* Department Heads see department-scoped workload.
* Missing estimates are clearly indicated.
* Workload calculations are consistent and documented.

## Dependencies

Depends on:

* User Management
* Permission Hardening
* Task date model
* Task assignment model

Enables:

* Better planning
* Better reports
* Future time tracking
* Future resource forecasting

## Technical Notes

* Add `estimated_hours` to tasks.
* Add `weekly_capacity_hours` to users.
* Define allocation formula:

  * simple first version can spread task effort evenly across task duration.
* Must handle missing dates or missing estimates.
* Add indexes for date-range workload queries.

## Sequencing Concern

This epic should not start before User Management and Permission Hardening are stable, because workload visibility depends heavily on user identity and access scope.

---

# Epic 9: Client Portal v2

## Goal

Create a dedicated client-facing experience that consolidates project summaries, shared milestones, client-visible files, reports, and approval requests.

Business value: improves client transparency, reduces manual status updates, and strengthens iTrack’s value for external project delivery.

## Scope

Included:

* Client dashboard
* Assigned project list
* Project summary
* Basic project health
* Shared milestones
* Shared tasks
* Client-visible comments
* Client-visible files
* Client-safe reports
* Approval requests when Approval Workflow is available

## Out of Scope

* Client billing
* Public guest links
* Client self-registration
* Client project creation
* Full messaging system
* Client access to Kanban/internal Gantt

## User Stories

1. As a Client, I want a dashboard of my projects, so that I can quickly understand progress.
2. As a Client, I want to see shared milestones, so that I know major delivery checkpoints.
3. As a Client, I want to access shared files, so that I can review deliverables.
4. As a Client, I want to view client-safe reports, so that I do not need to request manual updates.
5. As a Project Manager, I want to control what Clients see, so that internal work stays private.

## Acceptance Criteria

* Client sees only assigned projects.
* Client sees only client-visible tasks, comments, files, milestones, and reports.
* Internal data is not returned through client APIs.
* Client dashboard has empty and loading states.
* Client portal links respect backend permissions.
* Project Manager can verify client-visible content.
* Client portal passes visibility regression tests.

## Dependencies

Depends on:

* User Management
* Permission Hardening
* Advanced Reports
* Existing client visibility fields
* Approval Workflow for approval section, optional

Enables:

* Client self-service
* Formal approvals
* Reduced manual reporting
* Improved customer experience

## Technical Notes

* Use dedicated client-safe endpoints or serializers.
* Avoid reusing internal pages with hidden controls only.
* Backend must shape data specifically for Client role.
* Do not expose internal counts through parent sections.
* Consider future support for multiple client organizations.

---

# Epic 10: Approval Workflow

## Goal

Introduce formal approval requests for tasks, milestones, files, and deliverables. This provides a clear decision trail for approvals, rejections, revisions, and client sign-offs.

Business value: supports delivery governance, improves accountability, and reduces approval ambiguity across internal and client-facing work.

## Scope

Included:

* Submit for approval
* Approve
* Reject
* Request revision
* Approval due date
* Approval decision note
* Approval history
* Internal approvals
* Client-facing approvals
* Notifications for approval events
* Approval status in reports and client portal

## Out of Scope

* Legal e-signature compliance
* Digital signatures
* Multi-step enterprise approval chains
* Procurement approvals
* Payment approvals
* Complex conditional approval routing

## User Stories

1. As a Project Manager, I want to submit a deliverable for approval, so that stakeholders can formally accept or reject it.
2. As an Approver, I want to approve or reject with comments, so that the team understands my decision.
3. As a Client, I want to approve client-facing deliverables, so that sign-off is tracked inside the system.
4. As a Project Manager, I want to see pending approvals, so that I can follow up before they delay the project.
5. As a Department Head, I want approval history, so that I can review decision accountability.

## Acceptance Criteria

* Authorized users can create approval requests.
* Approval request has target type, target ID, approver, due date, status, and notes.
* Approver can approve, reject, or request revision.
* Approval decisions are immutable once recorded.
* Approval events create notifications.
* Approval events appear in activity feed.
* Client approvers can only access client-facing approval requests.
* Reports show pending, approved, rejected, and overdue approvals.
* Approval actions are audit logged.

## Dependencies

Depends on:

* User Management
* Permission Hardening
* Activity Feed
* Notifications
* Client Portal v2 for client-facing approval UX
* Advanced Reports for approval reporting

Enables:

* Formal client sign-off
* Delivery governance
* UAT tracking
* Change acceptance workflows

## Technical Notes

* Suggested tables:

  * `approval_requests`
  * `approval_decisions`
* Approval state machine:

  * Draft
  * Pending
  * Approved
  * Rejected
  * Revision Requested
  * Cancelled
* Approval target types:

  * Task
  * Milestone
  * Attachment
  * Deliverable
* Start with single-step approval.
* Avoid blocking task workflow automatically unless configured.

---

# Cross-Epic Dependency Map

| Epic                 | Depends On                                   | Enables                                         |
| -------------------- | -------------------------------------------- | ----------------------------------------------- |
| User Management      | Real authentication                          | Permissions, Workload, Client Portal, Approvals |
| Permission Hardening | User Management                              | Safe reporting, client access, approvals        |
| Activity Feed        | Auth, permissions, task/project events       | Approval history, better collaboration          |
| Project Templates    | Stable project/task model                    | Faster project setup, consistent delivery       |
| Gantt Enhancements   | Task dates, permissions                      | Better schedule planning                        |
| Task Dependencies v2 | Gantt, task model                            | Dependency risk, advanced reports               |
| Advanced Reports     | Permissions, reporting foundation            | Executive visibility, client reports            |
| Workload Planning    | User management, permissions, task estimates | Capacity planning                               |
| Client Portal v2     | Permissions, client visibility, reports      | Client self-service, approvals                  |
| Approval Workflow    | Users, permissions, activity, notifications  | Formal sign-off and delivery governance         |

---

# Recommended P2 Release Grouping

## P2A — Governance and Production Readiness

1. User Management
2. Permission Hardening
3. Activity Feed

Purpose: make the product safe and manageable for real teams.

## P2B — Core Delivery Acceleration

4. Project Templates
5. Gantt Enhancements
6. Task Dependencies v2

Purpose: improve repeatability, planning, and schedule control.

## P2C — Reporting, Capacity, and Client Collaboration

7. Advanced Reports
8. Workload Planning
9. Client Portal v2
10. Approval Workflow

Purpose: expand iTrack into management visibility, resource planning, and client-facing delivery governance.

---

# Sequencing Concerns and Gaps to Validate

1. **Permission Hardening should not be delayed.**
   Many later epics rely on accurate project/user/client access.

2. **Activity Feed and Audit Log must remain separate.**
   Audit logs are security records. Activity Feed is a collaboration timeline.

3. **Task Dependencies v2 may need to ship before full Gantt Enhancements.**
   If dependency lines and schedule risk are important, Epic 6 may need to move ahead of parts of Epic 5.

4. **Workload Planning depends on reliable estimated effort.**
   The team should decide whether estimated hours are required, optional, or template-driven.

5. **Client Portal v2 depends heavily on Permission Hardening.**
   Do not build client portal UX without strong backend data shaping.

6. **Approval Workflow may need a deliverable concept.**
   If approval targets are more than tasks/files/milestones, define a `deliverable` entity before implementation.

7. **Project Templates may influence Workload Planning.**
   Templates should eventually support estimated hours and role placeholders.

8. **Advanced Reports should use a shared reporting service.**
   Avoid metric drift between dashboard, reports, workload, and client portal.

---

# Recommended Next Action

Start P2A technical discovery with these three epics:

1. User Management
2. Permission Hardening
3. Activity Feed

Engineering should produce:

* Data model proposal
* API route proposal
* Frontend page/component proposal
* Test strategy
* Permission matrix
* Migration plan
* Delivery estimate

Only after P2A is technically scoped should the team commit to P2B and P2C timelines.
