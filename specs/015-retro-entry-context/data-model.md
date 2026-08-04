# Phase 1 Data Model: Retro Entry Discussion, Attachments & Decision

Two new tables, one additive column on the existing `retro_entries` table.
No changes to `retro_sessions` or `retro_entry_votes`.

## RetroEntry (existing — extended)

| Field | Type | Notes |
|---|---|---|
| ...existing fields (id, retro_session_id, author_user_id, body, sentiment, is_repeating, owner_user_id, timestamps) | | unchanged |
| **decision** | **text, nullable** | **new** — independent of `body`; set/changed only under the same `$isAuthorOrModerator` gate as `body`/`sentiment`/`is_repeating` |

### Migration: add `decision`

```php
// backend/database/migrations/<timestamp>_add_decision_to_retro_entries_table.php
Schema::table('retro_entries', function (Blueprint $table) {
    // Nullable by default — absence of a decision is a real, distinct
    // state (spec FR-014), not an empty string.
    $table->text('decision')->nullable()->after('is_repeating');
});
```

Reversible via `dropColumn('decision')` in `down()`.

### Model change

`RetroEntry::$fillable` gains `'decision'`.

### Validation rule (in `RetrospectiveController::updateEntry()`)

- `decision` — `sometimes|nullable|string`
- Added to the existing `$isAuthorOrModerator`-gated field set alongside
  `body`, `sentiment`, `is_repeating` (same branch, same reasoning: it
  characterizes the entry's content/conclusion, not a team-wide
  administrative action like `owner_user_id`).

### Resource change

`RetroEntryResource` gains `'decision' => $this->decision` (nullable
passthrough — `null` when unset, a string once recorded).

## RetroEntryComment (new)

| Field | Type | Notes |
|---|---|---|
| id | bigint | |
| retro_entry_id | FK → retro_entries, cascade | |
| author_user_id | FK → users | real user FK (research.md D2), not a display-string field |
| body | text | required, no max enforced beyond DB `text` column (matches `Comment.body`'s own lack of a hard cap beyond its `max:5000` validation rule — this feature uses the same `max:5000` validation rule, see contracts) |
| created_at / updated_at | timestamps | append-only — no edit/delete capability (spec FR-004), `updated_at` exists only because Eloquent adds it by default, never actually changes post-creation |

### Migration

```php
// backend/database/migrations/<timestamp>_create_retro_entry_comments_table.php
Schema::create('retro_entry_comments', function (Blueprint $table) {
    $table->id();
    $table->foreignId('retro_entry_id')->constrained()->cascadeOnDelete();
    $table->foreignId('author_user_id')->constrained('users');
    $table->text('body');
    $table->timestamps();

    $table->index('retro_entry_id');
    $table->index('created_at');
});
```

No `visibility` column (research.md D3).

### Model

```php
class RetroEntryComment extends Model
{
    protected $fillable = ['retro_entry_id', 'author_user_id', 'body'];

    public function entry(): BelongsTo { return $this->belongsTo(RetroEntry::class, 'retro_entry_id'); }
    public function author(): BelongsTo { return $this->belongsTo(User::class, 'author_user_id'); }
}
```

### Resource

```php
// RetroEntryCommentResource
[
    'id' => $this->id,
    'entry_id' => $this->retro_entry_id,
    'author' => $this->author->name,
    'author_id' => $this->author_user_id,
    'body' => $this->body,
    'created_at' => $this->created_at,
]
```

## RetroEntryAttachment (new)

| Field | Type | Notes |
|---|---|---|
| id | bigint | |
| retro_entry_id | FK → retro_entries, cascade | |
| uploaded_by_user_id | FK → users | real user FK (research.md D2) |
| original_name | string | shown in UI |
| stored_name | string | UUID-prefixed safe filename on disk |
| disk | string, default `local` | matches `Attachment.disk` |
| path | string | full relative path — **hidden from API** (`$hidden`, matches `Attachment`) |
| mime_type | string | |
| size_bytes | unsigned bigint | |
| created_at / updated_at | timestamps | |

### Migration

```php
// backend/database/migrations/<timestamp>_create_retro_entry_attachments_table.php
Schema::create('retro_entry_attachments', function (Blueprint $table) {
    $table->id();
    $table->foreignId('retro_entry_id')->constrained()->cascadeOnDelete();
    $table->foreignId('uploaded_by_user_id')->constrained('users');
    $table->string('original_name');
    $table->string('stored_name');
    $table->string('disk')->default('local');
    $table->string('path');
    $table->string('mime_type');
    $table->unsignedBigInteger('size_bytes');
    $table->timestamps();

    $table->index('retro_entry_id');
    $table->index('mime_type');
    $table->index('created_at');
});
```

No `visibility` column (research.md D3).

### Model

```php
class RetroEntryAttachment extends Model
{
    protected $fillable = [
        'retro_entry_id', 'uploaded_by_user_id', 'original_name',
        'stored_name', 'disk', 'path', 'mime_type', 'size_bytes',
    ];
    protected $hidden = ['path'];
    protected $appends = ['human_size'];

    public function entry(): BelongsTo { return $this->belongsTo(RetroEntry::class, 'retro_entry_id'); }
    public function uploader(): BelongsTo { return $this->belongsTo(User::class, 'uploaded_by_user_id'); }

    public function getHumanSizeAttribute(): string { /* identical to Attachment's accessor */ }
}
```

### Resource

```php
// RetroEntryAttachmentResource
[
    'id' => $this->id,
    'entry_id' => $this->retro_entry_id,
    'uploader' => $this->uploader->name,
    'uploader_id' => $this->uploaded_by_user_id,
    'original_name' => $this->original_name,
    'mime_type' => $this->mime_type,
    'size_bytes' => $this->size_bytes,
    'human_size' => $this->human_size,
    'created_at' => $this->created_at,
]
```
`stored_name`/`disk`/`path` never exposed (unlike `AttachmentResource`,
which does expose `stored_name`/`disk` to non-Client roles — not needed
here since there's no Client-visibility branch to support, research.md D3).

## Entities explicitly NOT introduced

- No `visibility`/`client_visible` column on either new table (research.md
  D3) — Retrospectives has no Client-reachable path anywhere.
- No comment `parent_id`/threading — flat list only (spec FR-005).
- No comment edit/delete capability, hence no `edited_at`/soft-delete
  columns (spec FR-004).
- No shared `Mentionable` interface or extracted file-upload service
  (research.md D4, D5) — deliberate small duplication over a
  cross-cutting refactor of existing 010/013 code.
