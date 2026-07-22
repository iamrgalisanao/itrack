<?php
namespace Database\Factories;
use App\Models\DetailedActivity;
use Illuminate\Database\Eloquent\Factories\Factory;

class DetailedActivityFactory extends Factory {
    protected $model = DetailedActivity::class;
    public function definition(): array {
        return [
            'name'            => $this->faker->words(4, true),
            'status'          => 'not_started',
            'progress'        => 0,
            'sort_order'      => 0,
            'client_visible'  => false,
            'duration_months' => 0,
            'duration_days'   => 1,
        ];
    }
}
