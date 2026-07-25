<?php

namespace Tests\Unit;

use App\Models\User;
use App\Support\AccessContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * 007-permission-hardening: the correctness baseline for AccessContext,
 * proven before ResolvePreviewSession (US2) exists to ever set the
 * `preview_target` request attribute. Every read-scoping check in the app
 * calls AccessContext::user() instead of $request->user() directly — this
 * is the seam that later makes preview mode possible without touching
 * those call sites again, so it must resolve to the real user identically
 * to $request->user() when no preview is active (the only reachable state
 * right now).
 */
class AccessContextTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_the_real_authenticated_user_when_no_preview_attribute_is_set(): void
    {
        $user = User::factory()->create(['role' => 'Team Member']);

        $request = Request::create('/api/projects');
        $request->setUserResolver(fn () => $user);

        $this->assertSame($user, AccessContext::user($request));
    }

    public function test_returns_the_preview_target_when_a_preview_target_attribute_is_set(): void
    {
        $admin  = User::factory()->create(['role' => 'Admin']);
        $target = User::factory()->create(['role' => 'Team Member']);

        $request = Request::create('/api/projects');
        $request->setUserResolver(fn () => $admin);
        $request->attributes->set('preview_target', $target);

        $this->assertSame($target, AccessContext::user($request));
    }
}
