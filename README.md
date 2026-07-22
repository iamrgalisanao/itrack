# iTrack - Project Management Application

A full-stack project management web application built with Laravel 13, React 19, and Tailwind CSS 4.

## Features

- **Dashboard** - Overview of project statistics, progress indicators, and recent activities
- **Work Program** - Hierarchical view of project modules, activities, sub-activities, and detailed tasks with inline editing
- **Glossary** - Project-specific terminology management with categories
- **Team** - Team member directory with roles and contact information

## Tech Stack

### Backend
- Laravel 13.8
- PHP 8.4
- MySQL 8.4
- REST API with Laravel API Resources

### Frontend
- React 19.2.6
- Vite 8.0.12
- Tailwind CSS v4
- Shadcn/UI (Radix UI primitives)
- React Router v7
- Lucide React icons
- Axios for API calls

## Project Structure

```
itrack/
├── backend/                 # Laravel API
│   ├── app/
│   │   ├── Http/Controllers/
│   │   └── Models/
│   ├── database/
│   │   ├── migrations/
│   │   └── seeders/
│   └── routes/api.php
├── frontend/               # React SPA
│   ├── src/
│   │   ├── components/ui/  # Shadcn-style UI components
│   │   ├── pages/          # Page components
│   │   ├── lib/            # Utilities and API client
│   │   └── App.jsx         # Router setup
│   └── package.json
└── docs/                   # Source Excel file
```

## Setup Instructions

### Prerequisites

- PHP 8.4+ with Composer
- Node.js 18+ with npm
- MySQL 8.0+

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   composer install
   ```

3. Create the database:
   ```bash
   mysql -u root -e "CREATE DATABASE IF NOT EXISTS itrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   ```

4. Configure environment:
   - Copy `.env.example` to `.env` if needed
   - Update database credentials if different:
     ```
     DB_HOST=127.0.0.1
     DB_PORT=3306
     DB_DATABASE=itrack
     DB_USERNAME=root
     DB_PASSWORD=
     ```

5. Run migrations and seed the database:
   ```bash
   php artisan migrate
   php artisan db:seed
   ```

6. Start the development server:
   ```bash
   php artisan serve
   ```
   The API will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/dashboard | Dashboard statistics |
| GET/POST | /api/projects | Projects CRUD |
| GET/POST | /api/modules | Modules CRUD |
| GET/POST | /api/activities | Activities CRUD |
| GET/POST | /api/sub-activities | Sub-activities CRUD |
| GET/POST | /api/detailed-activities | Detailed activities CRUD |
| GET/POST | /api/team-members | Team members CRUD |
| GET/POST | /api/glossary-terms | Glossary terms CRUD |

## Data Model

- **Projects** → has many Modules
- **Modules** → has many Activities
- **Activities** → has many SubActivities
- **SubActivities** → has many DetailedActivities
- **TeamMembers** → project stakeholders
- **GlossaryTerms** → project terminology

## Development Notes

- The database is seeded from the Excel file in `docs/`
- CORS is configured to allow requests from `http://localhost:5173`
- API responses use Laravel API Resources for consistent JSON structure