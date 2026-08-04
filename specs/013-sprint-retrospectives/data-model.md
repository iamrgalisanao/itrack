# Phase 1 Data Model: Sprint Retrospectives

Three new tables, all additive. None of Work Program's existing tables (`projects`, `modules`, `activities`, `sub_activities`, `detailed_activities`) are touched, per FR-011. Migration shape follows the existing `project_ownerships` convention (`foreignId()->constrained()->cascadeOnDelete()`, a `unique()` compound index where duplicates must be prevented).

## `retro_sessions`

```php
Schema::create('retro_sessions', function (Blueprint $table) {
    $table->id();
    $table->foreignId('project_id')->constrained()->cascadeOnDelete();
    $table->string('label');                                   // free text, e.g. "Sprint 3"
    $table->foreignId('created_by_user_id')->constrained('users');
    $table->timestamps();
});
```

No status/lifecycle column — see `research.md` Decision 2. A session is a plain record scoped to one project.

## `retro_entries`

```php
Schema::create('retro_entries', function (Blueprint $table) {
    $table->id();
    $table->foreignId('retro_session_id')->constrained()->cascadeOnDelete();
    $table->foreignId('author_user_id')->constrained('users');
    $table->text('body');
    $table->string('sentiment');                                // 'keep' | 'improve' | 'discuss' — see research.md Decision 3
    $table->foreignId('owner_user_id')->nullable()->constrained('users')->nullOnDelete();
    $table->timestamps();
});
```

`sentiment` validated in `RetrospectiveController` against `RetroEntry::SENTIMENTS = ['keep', 'improve', 'discuss']` — the same PHP-constant-not-lookup-table pattern `ProjectMembership::ROLE_*` already uses. `owner_user_id` is nullable (FR-006's assign/reassign/clear); `nullOnDelete()` so a deleted user account doesn't take an entry's history down with it.

## `retro_entry_votes`

```php
Schema::create('retro_entry_votes', function (Blueprint $table) {
    $table->id();
    $table->foreignId('retro_entry_id')->constrained()->cascadeOnDelete();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->timestamps();

    $table->unique(['retro_entry_id', 'user_id']);
});
```

The unique constraint is what makes voting toggleable and one-per-user enforceable at the database level, not just in application code — see `research.md` Decision 1.

## Model relationships

```php
// RetroSession
public function project(): BelongsTo { return $this->belongsTo(Project::class); }
public function entries(): HasMany { return $this->hasMany(RetroEntry::class); }

// RetroEntry
public function session(): BelongsTo { return $this->belongsTo(RetroSession::class, 'retro_session_id'); }
public function author(): BelongsTo { return $this->belongsTo(User::class, 'author_user_id'); }
public function owner(): BelongsTo { return $this->belongsTo(User::class, 'owner_user_id'); }
public function votes(): HasMany { return $this->hasMany(RetroEntryVote::class); }

// RetroEntryVote
public function entry(): BelongsTo { return $this->belongsTo(RetroEntry::class, 'retro_entry_id'); }
public function user(): BelongsTo { return $this->belongsTo(User::class); }
```

## `RetroSessionResource` / `RetroEntryResource` shapes

```php
// RetroSessionResource
[
    'id' => $this->id,
    'project_id' => $this->project_id,
    'label' => $this->label,
    'created_by' => $this->createdBy->name,
    'created_at' => $this->created_at,
    'entry_count' => $this->entries()->count(),          // for the session list (US5), avoids a second round trip
]

// RetroEntryResource
[
    'id' => $this->id,
    'session_id' => $this->retro_session_id,
    'author' => $this->author->name,
    'author_id' => $this->author_user_id,                 // FR-007: frontend uses this to show edit/delete only to the author
    'body' => $this->body,
    'sentiment' => $this->sentiment,
    'vote_count' => $this->votes()->count(),
    'voted_by_me' => $this->votes()->where('user_id', $request->user()->id)->exists(),  // FR-005's toggle state
    'owner' => $this->owner?->name,
    'owner_id' => $this->owner_user_id,
    'created_at' => $this->created_at,
]
```
