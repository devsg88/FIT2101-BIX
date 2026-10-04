# MA_Wednesday3pm_Team3

FIT2101 S2 2026 group repository.

## Getting Started

1. Clone this repository.
2. Install the frontend and backend dependencies.
3. Configure the local PostgreSQL database.
4. Start the backend and frontend.
5. Use one of the seeded demo accounts below to log in.

## Running the Application

### 1. Install dependencies

Frontend:

```bash
cd client
npm install
```

Backend:

```bash
cd ../server
npm install
```

Then return to the repository root:

```bash
cd ..
```

### 2. Configure the backend

Copy:

```text
server/.env.example
```

to:

```text
server/.env
```

Update `DATABASE_URL` with your local PostgreSQL username, password and database name.

Example:

```env
PORT=4000
DATABASE_URL=postgresql://<username>:<password>@localhost:5432/bix
JWT_SECRET=<your-local-secret>
```

Do not commit `server/.env`.

### 3. Initialise the database

From the repository root, run:

```bash
psql "postgresql://<username>:<password>@localhost:5432/<database>" -f server/db/schema.sql
psql "postgresql://<username>:<password>@localhost:5432/<database>" -f server/db/seed.sql
```

Run `schema.sql` first, followed by `seed.sql`.

Then apply the task/sub-task migrations. `schema.sql` does not include US-04a's,
and a database set up before US-11 also lacks US-11's task effort columns and
`pbi_collaborators` table; the project board needs both. They are safe to run
more than once, so run both on a fresh database and on any existing database
that has not had them yet:

```bash
psql "postgresql://<username>:<password>@localhost:5432/<database>" -v ON_ERROR_STOP=1 -f server/db/migrations/001_task_subtask_assignee_and_status.sql
psql "postgresql://<username>:<password>@localhost:5432/<database>" -v ON_ERROR_STOP=1 -f server/db/migrations/001_us11_task_actual_effort.sql
```

**Project responsibility (US-04d).** A fresh database set up with the current
`schema.sql` (from US-04d onwards) already gets `projects.responsible_admin_id`,
so migration 003 is not needed for that column on a fresh setup.

A database set up before US-04d, where `projects` has no
`responsible_admin_id` column, must run migration 003. Then re-run `seed.sql`
if you need the standard demo ownership:

```bash
psql "postgresql://<username>:<password>@localhost:5432/<database>" -v ON_ERROR_STOP=1 -f server/db/migrations/003_us04d_project_responsible_admin.sql
psql "postgresql://<username>:<password>@localhost:5432/<database>" -v ON_ERROR_STOP=1 -f server/db/seed.sql
```

Migration 003 adds the column, its foreign key and its index, but assigns no
responsible Admin. When `seed.sql` is re-run, its `INSERT`s skip seeded rows
that already exist, and its US-04d `UPDATE` assigns the seeded Admin to BIX
Platform (project 1) only when `responsible_admin_id` is `NULL`. Mobile App
(project 2) intentionally remains unowned.

More database information is available in:

```text
server/db/README.md
```

### 4. Start the backend

Open a terminal:

```bash
cd server
npm run dev
```

The backend runs on:

```text
http://localhost:4000
```

### 5. Start the frontend

Open a second terminal:

```bash
cd client
npm run dev
```

The frontend normally runs on:

```text
http://localhost:5173
```

## Demo Accounts

### Administrator

```text
Email: admin@bix.app
Password: password123
```

### Developer

```text
Email: developer@bix.app
Password: password123
```

These accounts are included in `server/db/seed.sql`.

## Testing

Frontend tests:

```bash
cd client
npm test -- --run
```

Frontend production build:

```bash
npm run build
```

Backend tests:

```bash
cd ../server
npm test -- --run
```

## Repository Structure

```text
client/       Frontend application
server/       Backend application
server/db/    PostgreSQL schema and seed scripts
```

## Notes

Keep project work, documentation, setup instructions and relevant artefacts in this repository.
Do not share this repository outside the group and the teaching team.
