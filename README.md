# Newavely

Newavely is a church community management web app for small group operations, member records, attendance, and role-based access.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Supabase Auth, Postgres, and Row Level Security
- Vercel Git Integration for preview and production deployments

## App Structure

```txt
src/
  app/
    page.tsx              Dashboard overview
    members/page.tsx      Member list, details, and member creation
    groups/page.tsx       Small group overview
    attendance/page.tsx   Attendance check workflow
    permissions/page.tsx  Role and permission matrix
    auth/callback/        Supabase OAuth callback route
    actions.ts            Server actions for mutations
  components/
    dashboard.tsx         Page-level UI sections
    app-page-gate.tsx     Shared setup/auth/error page gate
  lib/
    app-page-data.ts      Shared authenticated app data loader
    rbac.ts               App role/permission definitions
    supabase/             Supabase browser/server clients and queries
    types.ts              Shared app types
db/
  schema.sql              Base schema, indexes, RLS functions, and policies
  002_app_data_policies.sql Additional app data policies
test/
  supabase-queries.test.mjs Regression tests for Supabase relationship embeds
```

## Local Development

Install dependencies:

```bash
npm install
```

Create a local environment file with:

```txt
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

Start the dev server:

```bash
npm run dev
```

Run checks before opening a PR:

```bash
npm test
npm run typecheck
npm run build
```

## Database

Run SQL in Supabase SQL Editor in this order:

1. `db/schema.sql`
2. `db/002_app_data_policies.sql`

Main tables:

- `groups`: small groups, leaders, and target group size
- `members`: member profiles, auth mapping, role, status, group, and custom fields
- `attendance_events`: attendance event dates, such as Sunday worship
- `attendance_records`: per-member attendance status for each event
- `member_custom_field_definitions`: configurable member metadata definitions

Important relationships:

- `members.group_id -> groups.id`
- `groups.leader_member_id -> members.id`
- `attendance_records.member_id -> members.id`
- `attendance_records.checked_by_member_id -> members.id`

Because there are multiple relationships between some tables, Supabase queries must use explicit relationship names. Keep the regression tests in `test/supabase-queries.test.mjs` updated if query strings change.

## Auth And Roles

Google login is handled through Supabase Auth.

App roles live in `src/lib/rbac.ts`:

- `admin`: full management permissions
- `leader`: member and attendance management
- `staff`: read-focused operational access
- `member`: basic access

Server-side access is enforced by Supabase RLS policies and app-level checks in server actions.

## Deployment

Vercel is connected to the GitHub repository.

- Pull requests create Vercel Preview deployments.
- Merges into `main` create Production deployments.
- Production domain: `newavely.com`

Required Vercel environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

See `DEPLOYMENT.md` for setup details.

## Collaboration Workflow

All feature work must go through a feature branch and PR.

Recommended branch naming:

```txt
feature/short-description
fix/short-description
chore/short-description
```

Standard workflow:

```bash
git checkout main
git pull
git checkout -b feature/my-change
```

After changes:

```bash
npm test
npm run typecheck
npm run build
git add .
git commit -m "Describe the change"
git push -u origin feature/my-change
```

Then open a PR into `main`.

Before merging to `main`:

- Vercel Preview must pass.
- Tests and typecheck must pass.
- At least one other developer must approve the PR.
- Do not push directly to `main`.

## GitHub Repository Rules

Protect `main` in GitHub repository settings:

1. Go to GitHub repository `Settings`.
2. Open `Rules` or `Branches`.
3. Add a ruleset or branch protection rule for `main`.
4. Enable `Require a pull request before merging`.
5. Set `Required approvals` to `1`.
6. Enable `Dismiss stale pull request approvals when new commits are pushed`.
7. Enable `Require status checks to pass before merging`.
8. Select the Vercel check as a required status check after it appears on a PR.
9. Disable direct pushes to `main`.

Keep the repository owner/admin permission limited to the project owner. Invite other developers with `Write` access for normal contribution, or `Maintain` only if they need to manage issues, PRs, and repo settings without owning the repo.
