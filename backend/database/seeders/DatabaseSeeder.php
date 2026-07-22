<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Project;
use App\Models\Module;
use App\Models\Activity;
use App\Models\SubActivity;
use App\Models\DetailedActivity;
use App\Models\TeamMember;
use App\Models\GlossaryTerm;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use PhpOffice\PhpSpreadsheet\IOFactory;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        // Backfill the original scaffold user with a valid role.
        User::firstOrCreate(
            ['email' => 'test@example.com'],
            [
                'name' => 'Test User',
                'role' => User::ROLE_TEAM_MEMBER,
                'department' => 'IT',
                'password' => \Illuminate\Support\Facades\Hash::make('password'),
            ],
        );

        // Seed five persona accounts for manual testing.
        // Password for all: "password"
        $personas = [
            ['name' => 'Admin',            'email' => 'admin@itrack.test',    'role' => User::ROLE_ADMIN,            'department' => 'IT'],
            ['name' => 'Project Manager',  'email' => 'pm@itrack.test',       'role' => User::ROLE_PROJECT_MANAGER,  'department' => 'IT'],
            ['name' => 'Department Head',  'email' => 'depthead@itrack.test',  'role' => User::ROLE_DEPARTMENT_HEAD,  'department' => 'Finance'],
            ['name' => 'Team Member',      'email' => 'team@itrack.test',      'role' => User::ROLE_TEAM_MEMBER,      'department' => 'IT'],
            ['name' => 'Client',           'email' => 'client@itrack.test',    'role' => User::ROLE_CLIENT,           'department' => null],
        ];

        foreach ($personas as $persona) {
            User::firstOrCreate(
                ['email' => $persona['email']],
                array_merge($persona, ['password' => \Illuminate\Support\Facades\Hash::make('password')]),
            );
        }

        $excelPath = database_path('../docs/CORP x PITX. POS Work Program. 2025 03 21 (1).xlsx');

        if (!file_exists($excelPath)) {
            $this->command->error("Excel file not found at: {$excelPath}");
            $this->command->info('Looking in alternative paths...');
            $altPath = base_path('../docs/CORP x PITX. POS Work Program. 2025 03 21 (1).xlsx');
            if (file_exists($altPath)) {
                $excelPath = $altPath;
            } else {
                $this->command->error('Excel file not found. Please copy the Excel file to backend/docs/ directory.');
                return;
            }
        }

        $spreadsheet = IOFactory::load($excelPath);

        $this->seedWorkProgram($spreadsheet);
        $this->seedTeam($spreadsheet);
        $this->seedGlossary($spreadsheet);
    }

    private function seedWorkProgram($spreadsheet): void
    {
        $ws = $spreadsheet->getSheetByName('Work Program_final');
        if (!$ws) {
            $this->command->error('Work Program_final sheet not found.');
            return;
        }

        // Create the project
        $project = Project::create([
            'name' => 'PITX POS Tenant Sales Management Systems',
            'location' => '1 Kennedy Rd. Brgy. Tambo, Parañaque City',
            'updated_date' => '2025-03-21',
            'project_owner' => 'Project Manager Lead',
            'department' => 'IT',
            'status' => 'in_progress',
            'start_date' => '2025-01-01',
            'target_end_date' => '2025-12-31',
        ]);

        $currentModule = null;
        $currentActivity = null;
        $currentSubActivity = null;
        $moduleSort = 0;
        $activitySort = 0;
        $subActivitySort = 0;
        $detailedSort = 0;

        $maxRow = $ws->getHighestRow();

        // Data starts at row 9 (row 8 is the header row)
        for ($row = 9; $row <= $maxRow; $row++) {
            $colA = $ws->getCell("A{$row}")->getValue(); // Level indicator (L2) or 'NO'
            $colD = $ws->getCell("D{$row}")->getValue(); // Module name
            $colE = $ws->getCell("E{$row}")->getValue(); // Activity name
            $colF = $ws->getCell("F{$row}")->getValue(); // Sub-activity name
            $colG = $ws->getCell("G{$row}")->getValue(); // Detailed activity name
            $colH = $ws->getCell("H{$row}")->getValue(); // Notes
            $colI = $ws->getCell("I{$row}")->getValue(); // Type (A/SA)
            $colJ = $ws->getCell("J{$row}")->getValue(); // Description
            $colK = $ws->getCell("K{$row}")->getValue(); // Output
            $colL = $ws->getCell("L{$row}")->getValue(); // Responsible
            $colM = $ws->getCell("M{$row}")->getValue(); // Support
            $colO = $ws->getCell("O{$row}")->getValue(); // Duration months
            $colP = $ws->getCell("P{$row}")->getValue(); // Duration days
            $colQ = $ws->getCell("Q{$row}")->getValue(); // Plan start date
            $colR = $ws->getCell("R{$row}")->getValue(); // Plan end date

            // Skip completely empty rows
            if (empty($colD) && empty($colE) && empty($colF) && empty($colG)) {
                continue;
            }

            // Module row: Column D has value, no level indicator in Column A
            if (!empty($colD) && empty($colA)) {
                $currentModule = $project->modules()->create([
                    'name' => $this->cleanString($colD),
                    'description' => $this->cleanString($colJ),
                    'output' => $this->cleanString($colK),
                    'responsible' => $this->cleanString($colL),
                    'support' => $this->cleanString($colM),
                    'duration_months' => $this->parseInt($colO),
                    'duration_days' => $this->parseInt($colP),
                    'plan_start_date' => $this->parseDate($colQ),
                    'plan_end_date' => $this->parseDate($colR),
                    'sort_order' => $moduleSort++,
                ]);
                $currentActivity = null;
                $currentSubActivity = null;
                $activitySort = 0;
                $subActivitySort = 0;
                $detailedSort = 0;
                continue;
            }

            // Activity row (L2): Column A = 'L2', Column E has value
            if (!empty($colA) && trim(strtoupper((string)$colA)) === 'L2' && !empty($colE)) {
                if (!$currentModule) continue;
                $currentActivity = $currentModule->activities()->create([
                    'code' => $this->cleanString($colA),
                    'name' => $this->cleanString($colE),
                    'type' => $this->cleanString($colI),
                    'description' => $this->cleanString($colJ),
                    'output' => $this->cleanString($colK),
                    'responsible' => $this->cleanString($colL),
                    'support' => $this->cleanString($colM),
                    'duration_months' => $this->parseInt($colO),
                    'duration_days' => $this->parseInt($colP),
                    'plan_start_date' => $this->parseDate($colQ),
                    'plan_end_date' => $this->parseDate($colR),
                    'sort_order' => $activitySort++,
                ]);
                $currentSubActivity = null;
                $subActivitySort = 0;
                $detailedSort = 0;
                continue;
            }

            // Sub-Activity row: Column F has value, Column G is empty
            if (!empty($colF) && empty($colG)) {
                if (!$currentActivity) continue;
                $currentSubActivity = $currentActivity->subActivities()->create([
                    'name' => $this->cleanString($colF),
                    'type' => $this->cleanString($colI),
                    'description' => $this->cleanString($colJ),
                    'output' => $this->cleanString($colK),
                    'responsible' => $this->cleanString($colL),
                    'support' => $this->cleanString($colM),
                    'duration_months' => $this->parseInt($colO),
                    'duration_days' => $this->parseInt($colP),
                    'plan_start_date' => $this->parseDate($colQ),
                    'plan_end_date' => $this->parseDate($colR),
                    'sort_order' => $subActivitySort++,
                ]);
                $detailedSort = 0;
                continue;
            }

            // Detailed Activity row: Column G has value
            if (!empty($colG)) {
                if (!$currentSubActivity) continue;
                $currentSubActivity->detailedActivities()->create([
                    'name' => $this->cleanString($colG),
                    'type' => $this->cleanString($colI),
                    'description' => $this->cleanString($colJ),
                    'notes' => $this->cleanString($colH),
                    'output' => $this->cleanString($colK),
                    'responsible' => $this->cleanString($colL),
                    'support' => $this->cleanString($colM),
                    'duration_months' => $this->parseInt($colO),
                    'duration_days' => $this->parseInt($colP),
                    'plan_start_date' => $this->parseDate($colQ),
                    'plan_end_date' => $this->parseDate($colR),
                    'sort_order' => $detailedSort++,
                ]);
                continue;
            }
        }

        $this->command->info("Seeded: {$moduleSort} modules, project ID {$project->id}");
    }

    private function seedTeam($spreadsheet): void
    {
        $ws = $spreadsheet->getSheetByName('TEAM');
        if (!$ws) {
            $this->command->error('TEAM sheet not found.');
            return;
        }

        $maxRow = $ws->getHighestRow();
        $currentSide = 'Vendor';

        for ($row = 2; $row <= $maxRow; $row++) {
            // Columns B, C, D (2, 3, 4)
            $colB = $ws->getCell("B{$row}")->getValue(); // Role or section header
            $colC = $ws->getCell("C{$row}")->getValue(); // Description
            $colD = $ws->getCell("D{$row}")->getValue(); // Abbreviation

            // Detect section headers
            if (!empty($colB) && empty($colC) && empty($colD)) {
                if (stripos((string)$colB, 'Vendor') !== false || stripos((string)$colB, 'Developer') !== false) {
                    $currentSide = 'Vendor';
                } elseif (stripos((string)$colB, 'Client') !== false) {
                    $currentSide = 'Client';
                }
                continue;
            }

            // Skip header rows
            if (!empty($colB) && (stripos((string)$colB, 'Roles') !== false || stripos((string)$colB, 'Role') !== false)) {
                continue;
            }

            if (empty($colB)) continue;

            TeamMember::create([
                'side' => $currentSide,
                'role' => $this->cleanString($colB),
                'description' => $this->cleanString($colC),
                'abbreviation' => $this->cleanString($colD),
            ]);
        }

        $this->command->info('Seeded team members.');
    }

    private function seedGlossary($spreadsheet): void
    {
        $ws = $spreadsheet->getSheetByName('Glossary of Terms');
        if (!$ws) {
            $this->command->error('Glossary of Terms sheet not found.');
            return;
        }

        $maxRow = $ws->getHighestRow();
        for ($row = 4; $row <= $maxRow; $row++) {
            // Columns B, C, D (2, 3, 4)
            $colB = $ws->getCell("B{$row}")->getValue(); // Number
            $colC = $ws->getCell("C{$row}")->getValue(); // Term
            $colD = $ws->getCell("D{$row}")->getValue(); // Definition

            // Skip section headers (like 'RASCI MATRIX')
            if (!empty($colB) && empty($colC) && empty($colD)) {
                continue;
            }

            // Skip header rows
            if (!empty($colB) && (stripos((string)$colB, 'No') !== false)) {
                continue;
            }

            if (empty($colC)) continue;

            GlossaryTerm::create([
                'number' => $this->parseInt($colB),
                'term' => $this->cleanString($colC),
                'definition' => $this->cleanString($colD),
            ]);
        }

        $this->command->info('Seeded glossary terms.');
    }

    private function cleanString($value): ?string
    {
        if ($value === null) return null;
        $cleaned = trim((string) $value);
        return $cleaned === '' ? null : $cleaned;
    }

    private function parseInt($value): int
    {
        if ($value === null) return 0;
        return (int) floatval($value);
    }

    private function parseDate($value): ?string
    {
        if ($value === null) return null;

        // PhpSpreadsheet may return a DateTime object or a numeric serial
        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        if (is_numeric($value)) {
            // Excel serial date - convert using PhpSpreadsheet
            try {
                $date = \PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject($value);
                return $date->format('Y-m-d');
            } catch (\Exception $e) {
                return null;
            }
        }

        if (is_string($value)) {
            $cleaned = trim($value);
            if ($cleaned === '') return null;
            try {
                $ts = strtotime($cleaned);
                return $ts ? date('Y-m-d', $ts) : null;
            } catch (\Exception $e) {
                return null;
            }
        }

        return null;
    }
}
