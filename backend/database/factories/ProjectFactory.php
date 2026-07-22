<?php
namespace Database\Factories;
use App\Models\Project;
use Illuminate\Database\Eloquent\Factories\Factory;

class ProjectFactory extends Factory {
    protected $model = Project::class;
    public function definition(): array {
        return [
            'name'            => $this->faker->words(3, true),
            'department'      => $this->faker->randomElement(['IT', 'Finance', 'Marketing', 'Operations', 'Engineering']),
            'status'          => 'In Progress',
            'project_owner'   => $this->faker->name(),
            'start_date'      => now()->subMonths(2),
            'target_end_date' => now()->addMonths(4),
            'health'          => 'on_track',
        ];
    }
}
