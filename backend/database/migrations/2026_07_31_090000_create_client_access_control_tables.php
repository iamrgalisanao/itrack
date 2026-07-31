<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_organizations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('trusted_domain_policy')->default('manual_approval');
            $table->string('status')->default('active');
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->foreignId('client_organization_id')
                ->nullable()
                ->after('department')
                ->constrained('client_organizations')
                ->nullOnDelete();
        });

        Schema::create('client_domains', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_organization_id')->constrained()->cascadeOnDelete();
            $table->string('domain')->unique();
            $table->string('status')->default('verified');
            $table->timestamp('verified_at')->nullable();
            $table->foreignId('verified_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('project_memberships', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role')->default('client_viewer');
            $table->string('state')->default('pending');
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('suspended_at')->nullable();
            $table->timestamp('removed_at')->nullable();
            $table->timestamps();

            $table->unique(['client_organization_id', 'project_id', 'user_id'], 'project_membership_identity_unique');
            $table->index(['user_id', 'project_id', 'state'], 'project_membership_access_index');
            $table->index(['client_organization_id', 'state'], 'project_membership_review_index');
        });

        Schema::create('project_invitations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('email');
            $table->string('email_domain');
            $table->string('role')->default('client_viewer');
            $table->string('state')->default('pending');
            $table->string('token_hash');
            $table->foreignId('invited_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('accepted_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('expires_at');
            $table->timestamps();

            $table->index(['email', 'project_id', 'state']);
            $table->index(['client_organization_id', 'project_id']);
            $table->unique('token_hash');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_invitations');
        Schema::dropIfExists('project_memberships');
        Schema::dropIfExists('client_domains');

        Schema::table('projects', function (Blueprint $table) {
            $table->dropConstrainedForeignId('client_organization_id');
        });

        Schema::dropIfExists('client_organizations');
    }
};
