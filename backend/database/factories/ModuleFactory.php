<?php
namespace Database\Factories;
use App\Models\Module;
use Illuminate\Database\Eloquent\Factories\Factory;

class ModuleFactory extends Factory {
    protected $model = Module::class;
    public function definition(): array {
        return [
            'name'       => $this->faker->words(2, true),
            'code'       => strtoupper($this->faker->bothify('MOD-##')),
            'sort_order' => 0,
        ];
    }
}
