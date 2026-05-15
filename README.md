# Job Tracker

A personal job application tracker built as a React/Vite website with Supabase for auth and database storage.

## Features

- Email/password sign-in
- Sankey dashboard showing application status transitions
- Multiple application groups per account, such as Jobs or Internships, plus an `All` view
- Form to create a new role
- Form to append a new status event
- Editable roles table
- Editable status history table
- Delete roles and status events from the UI
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

The app uses three Supabase tables.

`application_groups` stores groups within a user account:

```text
group_id, user_id, name, created_at
```

`roles` stores role metadata:

```text
role_id, user_id, group_id, role_title, company, external_link, source,
internal_link, date_posted, date_applied, work_mode, employment_type,
location, referrer, salary, notes, created_at
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

The current status shown on the Roles page is derived from the latest `status_history` row for that role. It is not stored in the `roles` table. Roles with no status events show `No Status`.

The selected application group controls which roles, statuses, and Sankey data are visible. The `All` option is a combined view of every role in the account, including roles that are not assigned to a group.

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
6. Copy the publishable key into `VITE_SUPABASE_ANON_KEY`.
7. Go to Authentication, then Providers.
8. Make sure the Email provider is enabled.
9. Keep "Confirm email" enabled if you want new users to verify their email before signing in, or disable it for a private personal app where you want account creation to work immediately.

Rerun `supabase/schema.sql` whenever the schema or RLS policies change. Supabase may warn about destructive operations because the script drops and recreates policies; it does not drop the app tables.

## Vercel Setup

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Set the framework preset to Vite if Vercel does not detect it automatically.
4. Use these build settings:

```text
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

5. Add these environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

6. Deploy.
7. If email confirmation is enabled, add the deployed Vercel URL to Supabase Auth redirect URLs.

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

## Browser Extension

The `extension/` folder contains a lightweight Chrome/Firefox extension that collects LinkedIn job postings.

Set it up with:

```bash
cp extension/config.example.js extension/config.js
```

Then fill `extension/config.js` with the same Supabase URL and publishable key used by the website.

See [extension/README.md](extension/README.md) for Chrome and Firefox testing steps.

## Notes

- `date_posted`, `date_applied`, and `changed_at` default to today's date when creating new records.
- New accounts start with a default `Job Search` application group.
- The application group switcher is in the lower-left sidebar.
- The `All` group is not stored in the database; it is a UI view across all groups.
- Groups can be created from the lower-left sidebar with the `+` button.
- Groups can be renamed and deleted from the Groups manager page.
- Deleting a group also deletes every role in that group and those roles' status events.
- Status updates from the Update Status page append new rows to `status_history`.
- Editing the Status page modifies an existing historical event, which is useful for correcting mistakes.
- Deleting a role also deletes its status events through the database foreign key cascade.
- Deleting a status event only deletes that event.
- Roles and status history can be exported as CSV from their table pages.
- Row-level security is enabled in `supabase/schema.sql`, so each signed-in user only sees their own data.
