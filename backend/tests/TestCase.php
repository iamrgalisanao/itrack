<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Default headers applied to every HTTP request made by the test suite.
     *
     * Sanctum's `EnsureFrontendRequestsAreStateful` middleware requires the
     * `Referer` and `Origin` headers to match a stateful domain (e.g.
     * `http://localhost:5173`). Adding them here ensures all tests authenticate
     * correctly without needing to call `withStatefulHeaders()` in each test.
     */
    protected $defaultHeaders = [
        'Referer' => 'http://localhost:5173',
        'Origin'  => 'http://localhost:5173',
    ];

    /**
     * Disable Sanctum's stateful request middleware for the test environment.
     *
     * The middleware `EnsureFrontendRequestsAreStateful` forces cookie‑based
     * authentication to only work when the request originates from a stateful
     * domain (matching the `Referer`/`Origin` headers). In the test suite the
     * request is generated internally and the middleware interferes with the
     * `actingAs(..., 'sanctum')` authentication, resulting in 401 responses.
     *
     * By disabling the middleware we allow the Sanctum guard to authenticate
     * the user directly via the session without needing the stateful header
     * checks.
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Start the session so that $request->session() is available.
        if (method_exists($this->app, 'make')) {
            $this->app->make('session')->start();
        }

        // Ensure the default headers are applied to every request.
        $this->withHeaders($this->defaultHeaders);

        // Disable the stateful middleware for all tests.
        $this->withoutMiddleware(\Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class);
    }
}
