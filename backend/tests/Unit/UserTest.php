<?php

namespace Tests\Unit;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pure logic test for User::wouldLeaveNoEnabledAdmins() (006), in isolation
 * from the controller/HTTP layer — same rationale as 004/005's Unit tests
 * for pure business logic. Extends Tests\TestCase (not bare
 * PHPUnit\Framework\TestCase) so Eloquent's boolean casts on a User
 * instance work (Model::getConnection() needs a booted app), matching
 * 004's SupportOpsStalenessTest precedent.
 *
 * The method under test is called on the target user (`$target->wouldLeaveNoEnabledAdmins($changes)`)
 * and takes no acting-user parameter at all — so it structurally cannot
 * special-case "am I editing myself" vs. "am I editing someone else." That's
 * the real proof this feature's last-Admin invariant isn't self-keyed; the
 * Feature tests in UserManagementTest.php exercise the same guarantee
 * end-to-end, but this file proves it at the level where it's actually
 * enforced. The "false" (non-applicable) cases below use an unsaved
 * instance and need no persisted data; the count-sensitive cases (is the
 * target the *sole* enabled Admin?) genuinely require a real database
 * query, so this file uses RefreshDatabase for those — unlike 004/005's
 * pure-computation services, this guard's whole purpose is counting real
 * rows, not just transforming inputs.
 */
class UserTest extends TestCase
{
    use RefreshDatabase;

    private function unsavedUser(array $attributes): User
    {
        $user = new User();
        foreach ($attributes as $key => $value) {
            $user->{$key} = $value;
        }

        return $user;
    }

    public function test_false_when_target_is_not_currently_an_enabled_admin(): void
    {
        $target = $this->unsavedUser(['role' => 'Team Member', 'is_active' => true]);

        $this->assertFalse($target->wouldLeaveNoEnabledAdmins(['role' => 'Admin']));
    }

    public function test_false_when_target_is_already_a_disabled_admin(): void
    {
        $target = $this->unsavedUser(['role' => 'Admin', 'is_active' => false]);

        $this->assertFalse($target->wouldLeaveNoEnabledAdmins(['is_active' => false]));
    }

    public function test_false_when_proposed_change_does_not_remove_admin_or_active_status(): void
    {
        $target = $this->unsavedUser(['role' => 'Admin', 'is_active' => true]);

        // Changing name/department doesn't touch role or is_active.
        $this->assertFalse($target->wouldLeaveNoEnabledAdmins(['department' => 'Finance']));
    }

    public function test_true_when_target_is_the_sole_enabled_admin_and_change_would_disable_them(): void
    {
        $target = User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        $this->assertTrue($target->wouldLeaveNoEnabledAdmins(['is_active' => false]));
    }

    public function test_true_when_target_is_the_sole_enabled_admin_and_change_would_demote_them(): void
    {
        $target = User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        $this->assertTrue($target->wouldLeaveNoEnabledAdmins(['role' => 'Project Manager']));
    }

    public function test_false_when_a_second_enabled_admin_exists(): void
    {
        $target = User::factory()->create(['role' => 'Admin', 'is_active' => true]);
        User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        $this->assertFalse($target->wouldLeaveNoEnabledAdmins(['is_active' => false]));
    }
}
