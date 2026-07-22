<?php
namespace Database\Factories;
use App\Models\SubActivity;
use Illuminate\Database\Eloquent\Factories\Factory;

class SubActivityFactory extends Factory {
    protected $model = SubActivity::class;
    public function definition(): array {
        return [
            'name'       => $this->faker->words(3, true),
            'sort_order' => 0,
        ];
    }
}
