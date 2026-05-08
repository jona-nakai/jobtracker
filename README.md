# Job Tracker

A personal job application tracker built as a React/Vite website with Supabase for auth and database storage.

## Features

- Email/password sign-in
- Sankey dashboard showing application status transitions
- Form to create a new role
- Form to append a new status event
- Editable roles table
- Editable status history table
- CSV export buttons for roles and status history
- Data synced across computers through Supabase

## Stack

- React
- Vite
- Supabase Auth
- Supabase Postgres
- Recharts
- Vercel-compatible static deployment

## Data Model

The app uses two Supabase tables.

`roles` stores role metadata:

```text
role_id, user_id, role_title, company, external_link, source, internal_link,
date_posted, date_applied, work_mode, employment_type, location, referrer,
salary, notes, created_at
```

Required fields:

- `role_title`
- `company`
- `date_applied`

`status_history` stores status events:

```text
event_id, user_id, role_id, status, changed_at, notes, created_at
```

Required fields:

- `role_id`
- `status`
- `changed_at`

The current status shown on the Roles page is derived from the latest `status_history` row for that role. It is not stored in the `roles` table.

## Local Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Fill in:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:5187/
```

## Supabase Setup

1. Create a Supabase project.
2. Open the SQL Editor.
3. Run the SQL in `supabase/schema.sql`.
4. Go to Project Settings, then API.
5. Copy the Project URL into `VITE_SUPABASE_URL`.
6. Copy the anon public key into `VITE_SUPABASE_ANON_KEY`.
7. Go to Authentication, then Providers.
8. Make sure the Email provider is enabled.
9. Keep "Confirm email" enabled if you want new users to verify their email before signing in, or disable it for a private personal app where you want account creation to work immediately.

## Vercel Setup

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Set the framework preset to Vite if Vercel does not detect it automatically.
4. Add these environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

5. Deploy.
6. If email confirmation is enabled, add the deployed Vercel URL to Supabase Auth redirect URLs.

## Commands

```bash
npm run dev
```

Runs the local Vite development server.

```bash
npm run build
```

Builds the site for production.

```bash
npm run preview
```

Previews the production build locally.

## Notes

- `date_posted`, `date_applied`, and `changed_at` default to today's date when creating new records.
- Status updates from the Update Status page append new rows to `status_history`.
- Editing the Status page modifies an existing historical event, which is useful for correcting mistakes.
- Roles and status history can be exported as CSV from their table pages.
- Row-level security is enabled in `supabase/schema.sql`, so each signed-in user only sees their own data.
