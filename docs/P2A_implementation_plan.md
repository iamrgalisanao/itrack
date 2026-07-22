# iTrack P2A Implementation Plan

**Epics:** User Management, Permission Hardening, Activity Feed
**Version:** 1.0
**Status:** Draft for Engineering Review
**Priority:** P2A — High Priority / Near-Term
**Context:** Follows real authentication deployment using Sanctum SPA cookies

---

## 1. Implementation Strategy

P2A should be delivered in this order:

1. **User Management**
   Establishes real user administration after Sanctum authentication. This gives Admins the ability to create, update, disable, and manage users without developer intervention.

2. **Permission Hardening**
   Builds on real users by tightening project, client, department, and role-based access. This protects internal data before broader client and team rollout.

3. **Activity Feed**
   Builds on authenticated users and permission rules to show safe, human-readable project and task activity. It improves visibility without exposing internal actions to unauthorized roles.

The dependency logic is simple:

```text
Real Auth → User Management → Permission Hardening → Activity Feed
```

Activity Feed should not be built before Permission Hardening because activity visibility must respect the same access rules as projects, tasks, comments, files, and reports.

---

# Epic 1: User Management

## Goal

Allow Admins to manage real iTrack users directly from the application. This removes dependency on seeded users or backend/manual database changes and creates the identity foundation for permissions, workload planning, client portal access, approvals, and future admin workflows.

---

## User Stories

### Story 1: Admin can view users

As an Admin, I want to view all users, so that I can manage access across the organization.

### Story 2: Admin can create users

As an Admin, I want to create a new user with role and department, so that new team members and clients can access iTrack.

### Story 3: Admin can edit user details

As an Admin, I want to update a user’s name, email, role, department, and status, so that access remains accurate as responsibilities change.

### Story 4: Admin can disable/reactivate users

As an Admin, I want to disable or reactivate users, so that inactive employees or clients cannot access the system.

### Story 5: Admin can reset user password

As an Admin, I want to reset a user’s password or trigger a password setup flow, so that users can recover access securely.

---

## Acceptance Criteria

1. Only Admin users can access User Management.
2. Admin can view a paginated user list.
3. Admin can search users by name or email.
4. Admin can filter users by role, department, and status.
5. Admin can create a user with name, email, role, department, and status.
6. Email must be unique.
7. Role must be one of the five system roles:

   * Admin
   * Project Manager
   * Department Head
   * Team Member
   * Client
8. Admin can update user role and department.
9. Admin can disable and reactivate users.
10. Disabled users cannot access protected API routes.
11. Disabled users are logged out or rejected on the next authenticated request.
12. Admin can trigger password reset or set a temporary password, depending on implementation decision.
13. User create, update, disable, reactivate, and password reset actions are audit logged.
14. API responses never expose password, remember token, or session-related sensitive fields.
15. Non-Admin users receive `403` when calling User Management APIs.

---

## Backend Tasks

### 1. Add user status support

Add a user status field to support disabling accounts.

Recommended values:

```text
active
disabled
```

Behavior:

* Only `active` users can access protected routes.
* `disabled` users receive `403` or `401` depending on middleware design.
* Prefer `403` if the session exists but the account is disabled.

### 2. Create UserManagementController

Add an Admin-only controller for user operations.

Responsibilities:

* List users
* Create user
* Show user
* Update user
* Disable user
* Reactivate user
* Reset password or set temporary password

### 3. Add Admin-only authorization guard

Use existing `User::isAdmin()` / `HasRole` trait.

Example logic:

```php
if (! $request->user()->isAdmin()) {
    abort(403);
}
```

### 4. Add user response resource

Create a curated user serializer/resource.

Returned fields:

```json
{
  "id": 1,
  "name": "Project Manager",
  "email": "pm@itrack.test",
  "role": "Project Manager",
  "department": "IT",
  "status": "active",
  "created_at": "2026-06-26T00:00:00Z",
  "updated_at": "2026-06-26T00:00:00Z"
}
```

Do not return:

```text
password
remember_token
email_verified_at unless needed
```

### 5. Add audit logging

Log the following:

```text
user.created
user.updated
user.disabled
user.reactivated
user.password_reset
```

Metadata should include changed fields but must not include plaintext passwords.

### 6. Add disabled-user middleware or auth check

Options:

* Add middleware: `EnsureUserIsActive`
* Or check in existing authenticated API middleware stack

Recommended: middleware after `auth:sanctum`.

---

## Frontend Tasks

### 1. Add Admin User Management page

Route:

```text
/admin/users
```

Or include as a tab inside existing Admin page.

Main UI sections:

* User table
* Search bar
* Role filter
* Department filter
* Status filter
* Create User button

### 2. Add Create/Edit User modal

Fields:

* Name
* Email
* Role
* Department
* Status

For password handling, choose one:

* Temporary password field
* Generate temporary password
* Send password setup link later

For near-term P2A, simplest option:

```text
Admin sets temporary password
User changes password later — optional future story
```

### 3. Add Disable/Reactivate action

UI behavior:

* Show confirmation modal before disabling.
* Show badge: Active / Disabled.
* Disable destructive actions while request is loading.

### 4. Add reset password action

UI behavior:

* Confirmation modal
* Temporary password generated or entered
* Success notification

### 5. Add error/loading/empty states

Required states:

* Loading users
* No users found
* Failed to load users
* Create failed
* Update failed
* Permission denied

---

## Database Migrations

### Modify `users` table

Add:

```text
status string default 'active' indexed
last_login_at timestamp nullable
disabled_at timestamp nullable
disabled_by_user_id unsignedBigInteger nullable
```

Recommended indexes:

```text
role
department
status
email unique
```

`last_login_at` is optional but useful.

---

## API Routes

### User Management routes

```http
GET /api/admin/users
```

Query params:

```text
search
role
department
status
page
per_page
```

Response:

```json
{
  "data": [
    {
      "id": 1,
      "name": "Admin",
      "email": "admin@itrack.test",
      "role": "Admin",
      "department": "IT",
      "status": "active"
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 25,
    "total": 5
  }
}
```

```http
POST /api/admin/users
```

Request:

```json
{
  "name": "New User",
  "email": "new.user@itrack.test",
  "role": "Team Member",
  "department": "IT",
  "password": "temporary-password",
  "status": "active"
}
```

```http
GET /api/admin/users/{user}
```

```http
PATCH /api/admin/users/{user}
```

Request:

```json
{
  "name": "Updated User",
  "role": "Project Manager",
  "department": "IT",
  "status": "active"
}
```

```http
POST /api/admin/users/{user}/disable
```

```http
POST /api/admin/users/{user}/reactivate
```

```http
POST /api/admin/users/{user}/reset-password
```

Request:

```json
{
  "password": "new-temporary-password"
}
```

---

## Test Cases

### Backend Feature Tests

1. Admin can list users.
2. Non-Admin cannot list users.
3. Admin can create user with valid data.
4. Duplicate email returns validation error.
5. Invalid role returns validation error.
6. Admin can update user role and department.
7. Admin can disable user.
8. Disabled user cannot access protected route.
9. Admin can reactivate user.
10. Admin can reset password.
11. User actions create audit logs.
12. API response excludes sensitive fields.

### Frontend / E2E Tests

1. Admin sees User Management nav/page.
2. Non-Admin does not see User Management page.
3. Admin can create user from UI.
4. Admin can edit role/department.
5. Admin can disable/reactivate user.
6. Disabled user receives blocked access behavior.
7. Form validation errors display clearly.

---

## Risks

| Risk                                     | Impact         | Mitigation                                                            |
| ---------------------------------------- | -------------- | --------------------------------------------------------------------- |
| Admin accidentally grants wrong role     | Security issue | Add confirmation and clear role descriptions                          |
| Disabled users retain sessions           | Access risk    | Check status on every authenticated request                           |
| Temporary passwords are mishandled       | Security risk  | Do not show passwords after creation; audit without storing plaintext |
| User Management overlaps with future SSO | Rework risk    | Keep simple local auth for P2A                                        |

---

# Epic 2: Permission Hardening

## Goal

Strengthen authorization by introducing project-level access, client-specific project assignment, department-based visibility, and consistent permission behavior across all major modules.

This epic ensures that as real users are onboarded, they only see and modify what they are allowed to access.

---

## User Stories

### Story 1: Admin assigns users to projects

As an Admin, I want to assign users to projects, so that access is controlled by project participation.

### Story 2: Admin assigns clients to projects

As an Admin, I want to assign Client users to specific projects, so that clients only see their own project data.

### Story 3: Project Manager manages team access to owned projects

As a Project Manager, I want to manage access to projects I own, so that my delivery team can collaborate without Admin intervention.

### Story 4: Department Head access is department-scoped

As a Department Head, I want to see only projects under my department or granted departments, so that visibility matches my responsibility.

### Story 5: Users receive clear access-denied feedback

As a user, I want a clear permission message when I cannot access something, so that I know the system is protecting restricted data.

---

## Acceptance Criteria

1. Backend enforces project-level access on project, task, Gantt, Schedule, Kanban, reports, comments, and attachments.
2. Client users can only see assigned projects.
3. Client users can only see client-visible tasks, comments, files, milestones, and reports.
4. Team Members can only access projects where they are assigned, unless the final rule allows broader internal access.
5. Department Heads can only access projects in their department and granted departments.
6. Admin can grant or revoke project access.
7. Project Managers can manage access for projects they own, if approved.
8. Access scope is applied before filters.
9. Direct API calls cannot bypass permission rules.
10. CSV/export routes enforce the same permissions as UI routes.
11. Permission changes are audit logged.
12. Unauthorized requests return `403` with consistent error shape.
13. Frontend displays a clear 403 page or message.

---

## Backend Tasks

### 1. Define final permission matrix

Engineering and product must confirm:

| Role            | Project Read              | Project Write  | Task Write     | Access Management   |
| --------------- | ------------------------- | -------------- | -------------- | ------------------- |
| Admin           | All                       | All            | All            | All                 |
| Project Manager | Assigned/owned            | Assigned/owned | Assigned/owned | Owned projects only |
| Team Member     | Assigned projects         | Limited        | Limited        | No                  |
| Department Head | Department/granted        | No             | No             | No                  |
| Client          | Assigned + client-visible | No             | No             | No                  |

Assumption for P2A:

```text
Team Members only see projects they are assigned to.
```

This should be validated because V1 may currently allow broader internal reads.

### 2. Add shared access service

Create a centralized service or scopes:

```text
ProjectAccessService
Project::accessibleTo(User $user)
DetailedActivity::accessibleTo(User $user)
```

Responsibilities:

* Determine project visibility
* Determine task visibility
* Apply department grants
* Apply client project access
* Apply team member project access

### 3. Add project access management

Support assigning users to projects.

Access roles may be simple in P2A:

```text
viewer
contributor
manager
client
```

Or use existing system role plus project assignment.

Recommended P2A minimum:

```text
project_id
user_id
access_level
```

### 4. Harden controllers

Affected areas:

* ProjectController
* DetailedActivityController
* ModuleController
* ActivityController
* SubActivityController
* CommentController
* AttachmentController
* ReportController
* NotificationController, where task links are involved
* Gantt/Schedule/Kanban endpoints
* CSV/export endpoints

Each controller should use the shared access layer.

### 5. Add consistent 403 response

Standard response:

```json
{
  "message": "You do not have permission to access this resource."
}
```

### 6. Add audit logging

Log:

```text
project_access.granted
project_access.revoked
project_access.updated
permission.denied_high_risk
```

Only log high-risk denied actions to avoid noise.

---

## Frontend Tasks

### 1. Add Project Access Management UI

Location options:

* Project settings page
* Admin project access tab
* Project detail settings modal

P2A recommended:

```text
Project Settings → Access
```

UI capabilities:

* List assigned users
* Add user to project
* Set access level
* Remove user
* Show role and department

### 2. Add client project assignment UI

Admin can assign Client users to projects.

Display:

* Client user
* Assigned projects
* Access status

### 3. Improve 403 handling

Add:

* 403 page
* Inline access-denied state for modals
* Toast for forbidden actions

Message:

```text
You do not have permission to access this page or resource.
```

### 4. Update navigation gating

Navigation should reflect real permissions:

* Hide Admin pages from non-Admins
* Hide Kanban from Clients
* Hide unauthorized project links
* Avoid showing counts that include inaccessible records

### 5. Update project/task lists

Ensure frontend only displays data returned by the backend.

Do not rely on frontend filtering for security.

---

## Database Migrations

### New table: `project_user_access`

```text
id
project_id foreign key
user_id foreign key
access_level string default 'viewer'
granted_by_user_id nullable
created_at
updated_at
```

Recommended unique constraint:

```text
unique(project_id, user_id)
```

Recommended indexes:

```text
project_id
user_id
access_level
```

### Optional update to `department_grants`

If not already real-user aware, add:

```text
granted_by_user_id
grantee_user_id nullable
```

For P2A, grants can remain department-based if already implemented, but real-user fields should be ready.

---

## API Routes

### Project access routes

```http
GET /api/projects/{project}/access
```

Response:

```json
{
  "data": [
    {
      "id": 1,
      "user": {
        "id": 10,
        "name": "Team Member",
        "email": "team@itrack.test",
        "role": "Team Member",
        "department": "IT"
      },
      "access_level": "contributor"
    }
  ]
}
```

```http
POST /api/projects/{project}/access
```

Request:

```json
{
  "user_id": 10,
  "access_level": "contributor"
}
```

```http
PATCH /api/projects/{project}/access/{access}
```

Request:

```json
{
  "access_level": "manager"
}
```

```http
DELETE /api/projects/{project}/access/{access}
```

### Access check route, optional

Useful for frontend debugging but not required:

```http
GET /api/projects/{project}/permissions
```

Response:

```json
{
  "can_view": true,
  "can_edit": false,
  "can_manage_access": false
}
```

---

## Test Cases

### Backend Feature Tests

1. Admin can grant project access.
2. Admin can revoke project access.
3. Project Manager can manage access only for owned projects, if enabled.
4. Team Member cannot manage access.
5. Client cannot manage access.
6. Client sees only assigned projects.
7. Client sees only client-visible task data.
8. Team Member sees only assigned projects.
9. Department Head sees own department projects.
10. Department Head sees granted department projects.
11. Filters cannot bypass access scope.
12. CSV export respects access scope.
13. Direct API call to unauthorized project returns `403`.
14. Permission changes create audit logs.

### Frontend / E2E Tests

1. Admin can open project access settings.
2. Admin can add user to project.
3. Admin can remove user from project.
4. User loses access after removal.
5. Client cannot see unassigned project.
6. Client cannot see internal task details.
7. 403 screen displays on direct unauthorized route.
8. Navigation hides restricted items.

---

## Risks

| Risk                                           | Impact           | Mitigation                                                           |
| ---------------------------------------------- | ---------------- | -------------------------------------------------------------------- |
| Access logic duplicated                        | Security bugs    | Centralize access services/scopes                                    |
| Existing V1 tests assume broad internal access | Test failures    | Confirm Team Member access rule before implementation                |
| Client counts leak hidden data                 | Data exposure    | Shape backend response for Client role                               |
| Project access adds query complexity           | Performance risk | Add indexes and eager-load carefully                                 |
| PM access management may be controversial      | Scope risk       | Make PM access management optional or Admin-only for first increment |

---

# Epic 3: Activity Feed

## Goal

Create a human-readable activity timeline that shows important project and task changes. This improves visibility for Project Managers, Team Members, Department Heads, and Clients while keeping internal-only activity hidden from external users.

Activity Feed is not the same as Audit Log. Audit Log is for security and compliance. Activity Feed is for collaboration and project awareness.

---

## User Stories

### Story 1: Project activity feed

As a Project Manager, I want to see recent activity on a project, so that I know what changed without checking every task.

### Story 2: Task activity feed

As a Team Member, I want to see task history, so that I understand context before updating my work.

### Story 3: Client-safe activity feed

As a Client, I want to see client-visible project updates, so that I can track progress without seeing internal activity.

### Story 4: Filter activity feed

As a Project Manager, I want to filter activity by type, so that I can focus on status changes, files, comments, or approvals.

### Story 5: Recent activity widget

As a Department Head, I want a recent activity view across accessible projects, so that I can monitor delivery movement.

---

## Acceptance Criteria

1. Activity events are created for key project and task actions.
2. Activity Feed displays actor, action, entity, timestamp, and description.
3. Project activity feed shows project-level and task-level events for that project.
4. Task activity feed shows only events related to that task.
5. Recent activity view shows newest events across accessible projects.
6. Client users only see client-visible activity.
7. Internal comments, internal attachments, internal-only tasks, and internal reports do not appear in Client feeds.
8. Feed supports pagination.
9. Feed supports filtering by event type.
10. Activity events are immutable.
11. Activity Feed respects the same permission rules as Permission Hardening.
12. Empty, loading, and error states are implemented.

---

## Backend Tasks

### 1. Create ActivityEvent model and table

Store collaboration-friendly events.

Suggested event types:

```text
project.created
project.updated
project.health_updated
task.created
task.updated
task.status_changed
task.assigned
task.due_date_changed
task.client_visibility_changed
comment.created
attachment.created
attachment.deleted
approval.requested
approval.approved
approval.rejected
```

Approval events can be added later when Approval Workflow ships.

### 2. Create ActivityLogger service

Similar to AuditLogger, but intended for user-facing feed.

Responsibilities:

* Record event type
* Record actor user
* Record project/task references
* Store visibility
* Store readable description
* Store metadata

### 3. Add event logging to existing workflows

Add logging to:

* Project create/update/health update
* Task create/update/status change/assignment/due date change/client visibility change
* Comment created
* Attachment uploaded/deleted
* Project access granted/revoked, if useful for internal activity

### 4. Add ActivityFeedController

Endpoints:

* Project feed
* Task feed
* Global/recent feed

All endpoints must apply access checks before returning events.

### 5. Add client visibility enforcement

Activity visibility options:

```text
internal
client_visible
```

Rules:

* Internal events visible only to internal roles.
* Client-visible events visible to Clients if they have project access.
* Events linked to client-visible tasks may be client-visible depending on source action.
* Internal comments/files never generate client-visible activity.

---

## Frontend Tasks

### 1. Add Project Activity Feed panel

Location options:

* Project detail page
* Reports page sidebar
* Dashboard recent activity card

P2A recommended:

```text
Project Detail / Work Program → Activity tab
```

### 2. Add Task Activity tab

Task modal tabs can become:

```text
Details | Comments | Files | Activity
```

This should lazy-load on tab open.

### 3. Add Recent Activity widget

Dashboard or Work Program sidebar:

* Shows latest 10 events
* Click event opens related project/task
* Honors permissions

### 4. Add filters

Filter by event type:

* Status changes
* Comments
* Files
* Assignments
* Health updates
* Client sharing

### 5. Add role-aware empty states

Examples:

Internal:

```text
No activity yet. Updates to this project will appear here.
```

Client:

```text
No client-visible activity yet.
```

---

## Database Migrations

### New table: `activity_events`

```text
id
event_type string
visibility string default 'internal'
project_id unsignedBigInteger nullable
detailed_activity_id unsignedBigInteger nullable
actor_user_id unsignedBigInteger nullable
actor_name string nullable
actor_role string nullable
description text
metadata json nullable
created_at
```

No `updated_at`, because events are immutable.

Recommended indexes:

```text
project_id
detailed_activity_id
actor_user_id
event_type
visibility
created_at
```

---

## API Routes

### Activity feed routes

```http
GET /api/activity
```

Query params:

```text
project_id
event_type
date_from
date_to
page
per_page
```

Returns recent activity across accessible projects.

```http
GET /api/projects/{project}/activity
```

Returns activity for one accessible project.

```http
GET /api/detailed-activities/{task}/activity
```

Returns activity for one accessible task.

Response:

```json
{
  "data": [
    {
      "id": 1,
      "event_type": "task.status_changed",
      "visibility": "internal",
      "actor": {
        "id": 3,
        "name": "Project Manager",
        "role": "Project Manager"
      },
      "description": "Project Manager changed task status from In Progress to Blocked.",
      "project_id": 1,
      "detailed_activity_id": 25,
      "created_at": "2026-06-26T00:00:00Z",
      "metadata": {
        "old_status": "In Progress",
        "new_status": "Blocked"
      }
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 20,
    "total": 50
  }
}
```

---

## Test Cases

### Backend Feature Tests

1. Task status change creates activity event.
2. Comment creation creates activity event.
3. Attachment upload creates activity event.
4. Project health update creates activity event.
5. Client-visible task update can create client-visible event where appropriate.
6. Internal comment does not create client-visible event.
7. Client cannot see internal activity event.
8. Client can see client-visible activity for assigned project.
9. Department Head sees only department-scoped activity.
10. Activity feed is paginated.
11. Activity feed filters by event type.
12. Unauthorized project activity returns `403`.
13. Activity events are immutable.

### Frontend / E2E Tests

1. Project Manager sees project activity feed.
2. Team Member sees task activity tab.
3. Client sees only client-visible activity.
4. Activity filter changes displayed event list.
5. Clicking activity opens related task or project.
6. Empty state appears when no activity exists.
7. Error state appears when activity loading fails.

---

## Risks

| Risk                                          | Impact            | Mitigation                                |
| --------------------------------------------- | ----------------- | ----------------------------------------- |
| Activity feed duplicates audit logs           | Product confusion | Separate naming and use cases clearly     |
| Feed becomes noisy                            | Low adoption      | Log high-value events first; add filters  |
| Internal events leak to Clients               | Data exposure     | Enforce visibility server-side            |
| Event logging scattered across controllers    | Maintenance risk  | Use ActivityLogger service                |
| Activity Feed depends on Permission Hardening | Sequencing risk   | Build only after access service is stable |

---

# Cross-Epic Delivery Sequence

## Recommended Implementation Order

### Step 1: User Management backend foundation

Build:

* User status migration
* UserManagementController
* Admin-only routes
* User resource
* Disabled-user middleware
* Audit logging for user actions

Why first:

* Permission Hardening needs real users.
* Project access assignment needs users.
* Activity Feed needs actor user identity.

---

### Step 2: User Management frontend

Build:

* Admin user list
* Create/edit user modal
* Disable/reactivate actions
* Password reset action
* Loading/error/empty states

Why second:

* Gives stakeholders a visible Admin capability.
* Enables real testing with different user roles.

---

### Step 3: Permission data model

Build:

* `project_user_access` migration
* Project access model
* Access service/scope
* Department/client/team access rules

Why third:

* Establishes the central access model before touching all controllers.

---

### Step 4: Harden backend controllers

Apply access service to:

* Projects
* Tasks
* Work Program hierarchy
* Kanban
* Schedule
* Gantt
* Comments
* Attachments
* Reports
* Exports

Why fourth:

* Prevents partial access hardening where some routes remain unsafe.

---

### Step 5: Permission frontend UX

Build:

* Project Access settings
* 403 page
* Permission-denied states
* Navigation gating
* Client-safe task/project displays

Why fifth:

* Backend should be the source of truth before UI polishing.

---

### Step 6: Activity Feed data model and logger

Build:

* `activity_events` migration
* ActivityEvent model
* ActivityLogger service
* Event logging for core project/task/comment/file actions

Why sixth:

* Activity events should be created only after access rules are reliable.

---

### Step 7: Activity Feed APIs

Build:

* Global activity endpoint
* Project activity endpoint
* Task activity endpoint
* Access and visibility filtering

---

### Step 8: Activity Feed frontend

Build:

* Project Activity tab
* Task Activity tab
* Recent Activity widget
* Filters
* Loading/empty/error states

---

## Suggested Sprint Breakdown

## Sprint 1: User Management Foundation

Scope:

* User status
* User CRUD APIs
* Admin user list
* Create/edit user
* Disable/reactivate user
* Audit logs for user changes

Exit criteria:

* Admin can fully manage users.
* Non-Admins cannot access user management.
* Disabled users cannot access the app.

---

## Sprint 2: Permission Hardening Backend

Scope:

* Project access table
* Access service/scopes
* Controller hardening
* Access tests
* Export/report access checks

Exit criteria:

* Project/task/report/file access is backend-enforced.
* Direct unauthorized API calls return `403`.
* Client and Department Head scoping remain safe.

---

## Sprint 3: Permission UX + Activity Feed Foundation

Scope:

* Project access UI
* 403 page
* Navigation gating updates
* Activity events table
* ActivityLogger service
* Core event logging

Exit criteria:

* Admin can manage project access.
* Users see clear access-denied states.
* Core actions generate activity events.

---

## Sprint 4: Activity Feed UI

Scope:

* Activity APIs
* Project Activity feed
* Task Activity feed
* Recent Activity widget
* Client-safe visibility rules
* Activity feed tests

Exit criteria:

* Internal users see relevant activity.
* Clients only see client-visible activity.
* Feed supports pagination and filtering.

---

# Assumptions Requiring Validation

1. **Team Member access rule:** Should Team Members see only assigned projects, or all internal projects?
   Recommended P2A default: assigned projects only.

2. **Project Manager access management:** Should Project Managers manage user access for owned projects, or should access management remain Admin-only in P2A?
   Recommended P2A default: Admin-only first, PM access management later.

3. **Password reset method:** Should Admin set a temporary password, or should the system send a setup email?
   Recommended P2A default: temporary password now, email setup later.

4. **Activity visibility:** Should task status changes on client-visible tasks appear in Client Activity Feed automatically?
   Recommended P2A default: only show if task is client-visible and event is not internal-sensitive.

5. **Project access migration:** Should existing users be automatically granted access to all existing projects during migration?
   Recommended P2A default: Admin and Project Manager keep broad access; Team Members and Clients require explicit access.

6. **Activity Feed location:** Should Activity Feed first appear on Project Detail, Dashboard, or Task Modal?
   Recommended P2A default: Task Modal Activity tab + Project Activity tab first.

---

# Final Recommendation

Proceed with P2A in four implementation sprints:

1. **Sprint 1:** User Management Foundation
2. **Sprint 2:** Permission Hardening Backend
3. **Sprint 3:** Permission UX + Activity Feed Foundation
4. **Sprint 4:** Activity Feed UI

This sequence minimizes security risk, keeps dependencies clean, and gives stakeholders usable product increments after each sprint.
