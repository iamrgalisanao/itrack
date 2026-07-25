<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;

class PreviewSessionController extends Controller
{
    public function store(Request $request)
    {
        //
    }

    public function destroy(Request $request)
    {
        //
    }

    private function user(Request $request): User
    {
        return $request->user();
    }
}
