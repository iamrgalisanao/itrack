<?php
namespace Database\Factories;
use App\Models\Activity;
use Illuminate\Database\Eloquent\Factories\Factory;

class ActivityFactory extends Factory {
    protected $model = Activity::class;
    public function definition(): array {
        return [
            'name'       => $this->faker->words(3, true),
            'sort_order' => 0,
        ];
    }
}
