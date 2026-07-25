<?php

use App\Models\Activity;
use App\Models\Attachment;
use App\Models\Comment;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\Project;
use App\Models\SubActivity;
use App\Support\AccessContext;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Make first-party SPA requests stateful so Sanctum session cookies
        // authenticate them (required for the cookie-based SPA auth flow).
        $middleware->statefulApi();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        // 007-permission-hardening: non-enumeration for project-scoped
        // resources (FR-005/FR-011). A Team Member/Client's request for a
        // project-scoped resource ID that doesn't exist at all must
        // produce the SAME response as one that exists but is
        // inaccessible — never Laravel's default 404, which would let a
        // request distinguish "doesn't exist" from "exists but isn't
        // mine." Scoped to these seven model classes only, and only for
        // Team Member/Client — Admin/PM/Department Head keep the normal
        // 404 (FR-004, research.md's non-enumeration decision).
        //
        // Laravel's own exception handler converts ModelNotFoundException
        // to NotFoundHttpException (wrapping the original as
        // getPrevious()) BEFORE any custom render() callback runs —
        // registering against ModelNotFoundException directly never fires
        // for a route-model-binding failure. This is why the rule below
        // targets NotFoundHttpException and unwraps it instead.
        $exceptions->render(function (\Symfony\Component\HttpKernel\Exception\NotFoundHttpException $e, Request $request) {
            if (!$request->is('api/*') || !$request->user()) {
                return null; // fall through to default handling
            }

            $previous = $e->getPrevious();
            if (!$previous instanceof ModelNotFoundException) {
                return null; // a genuinely unmatched route, not a binding failure
            }

            $projectScopedModels = [
                Project::class,
                Module::class,
                Activity::class,
                SubActivity::class,
                DetailedActivity::class,
                Comment::class,
                Attachment::class,
            ];

            $model = $previous->getModel();
            if (!in_array($model, $projectScopedModels, true)) {
                return null;
            }

            $effectiveUser = AccessContext::user($request);
            if (!$effectiveUser->isTeamMember() && !$effectiveUser->isClient()) {
                return null; // Admin/PM/Department Head keep the normal 404 (FR-004)
            }

            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        });
    })->create();
