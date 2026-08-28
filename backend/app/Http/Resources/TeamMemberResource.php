<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The internal staff directory, as a curated shape rather than a raw model.
 *
 * `TeamMemberController` returned `TeamMember::all()` and `$teamMember` with no
 * role check, so every authenticated caller -- Clients included -- received the
 * whole directory: each person's internal `role`, their free-text `description`,
 * and which `side` of the engagement they sit on.
 *
 * That is the disclosure PR #26 closed one level down. #26 stopped `responsible`
 * and `support` -- one staff name per planning row -- reaching Clients. This
 * endpoint was serving the directory those names come from.
 */
class TeamMemberResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'side' => $this->side,
            'role' => $this->role,
            'description' => $this->description,
            'abbreviation' => $this->abbreviation,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
