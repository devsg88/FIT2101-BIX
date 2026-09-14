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
