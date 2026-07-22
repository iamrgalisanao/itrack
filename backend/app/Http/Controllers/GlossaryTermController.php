<?php

namespace App\Http\Controllers;

use App\Models\GlossaryTerm;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;

class GlossaryTermController extends Controller
{
    // ─── Role Helpers ────────────────────────────────────────────────────────
    // Reads role/department from the authenticated Sanctum user (real auth).
    // Null role → fail-safe unauthorized (see HasRole trait).

    private function user(Request $request): User
    {
        return $request->user();
    }

    // ─── GET /api/glossary-terms ────────────────────────────────────────────

    public function index()
    {
        return GlossaryTerm::orderBy('number')->get();
    }

    // ─── POST /api/glossary-terms ────────────────────────────────────────────

    public function store(Request $request)
    {
        $user = $this->user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'glossary_term.create', 'glossary_term');
            return response()->json(['message' => 'Unauthorized: Only Admin can create glossary terms.'], 403);
        }

        $validated = $request->validate([
            'number' => 'nullable|integer',
            'term' => 'required|string|max:255',
            'definition' => 'nullable|string',
        ]);

        $glossaryTerm = GlossaryTerm::create($validated);

        AuditLogger::record(
            $request,
            'glossary_term.created',
            'glossary_term',
            $glossaryTerm->id,
            $glossaryTerm->toArray()
        );

        return $glossaryTerm;
    }

    // ─── GET /api/glossary-terms/{glossaryTerm} ─────────────────────────────

    public function show(GlossaryTerm $glossaryTerm)
    {
        return $glossaryTerm;
    }

    // ─── PATCH /api/glossary-terms/{glossaryTerm} ──────────────────────────

    public function update(Request $request, GlossaryTerm $glossaryTerm)
    {
        $user = $this->user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'glossary_term.update', 'glossary_term', $glossaryTerm->id);
            return response()->json(['message' => 'Unauthorized: Only Admin can update glossary terms.'], 403);
        }

        $validated = $request->validate([
            'number' => 'nullable|integer',
            'term' => 'sometimes|string|max:255',
            'definition' => 'nullable|string',
        ]);

        $glossaryTerm->update($validated);

        AuditLogger::record(
            $request,
            'glossary_term.updated',
            'glossary_term',
            $glossaryTerm->id,
            $glossaryTerm->getChanges()
        );

        return $glossaryTerm;
    }

    // ─── DELETE /api/glossary-terms/{glossaryTerm} ──────────────────────────

    public function destroy(Request $request, GlossaryTerm $glossaryTerm)
    {
        $user = $this->user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'glossary_term.delete', 'glossary_term', $glossaryTerm->id);
            return response()->json(['message' => 'Unauthorized: Only Admin can delete glossary terms.'], 403);
        }

        $glossaryTermId = $glossaryTerm->id;
        $glossaryTerm->delete();

        AuditLogger::record(
            $request,
            'glossary_term.deleted',
            'glossary_term',
            $glossaryTermId,
            ['id' => $glossaryTermId]
        );

        return response()->noContent();
    }
}