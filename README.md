# MA_Wednesday3pm_Team3

FIT2101 S2 2026 group repository.

## Team

Team name: Devengers

| Name | Role |
|---|---|
| Devtej Singh Gill | Developer |
| Yichi Zhang | Developer |
| Pang Chee Hian | Proxy Product Owner / Developer |
| Barathan | Developer |
| Abdullah Saab | Scrum Master |
| Ayodhia Massie | Developer |

## Getting Started

1. Clone this repository.
2. Create a branch for your work.
3. Commit regularly with clear messages.
4. Open a merge request when your work is ready for review.

## Repository Structure

- `client/`: React + Vite frontend (BIX web app).
- `server/`: Node.js + Express backend API.
- `server/db/`: PostgreSQL schema and seed scripts.

## Running the Application

### Prerequisites

- Node.js and npm (Node 20+ recommended).
- A local PostgreSQL server.

### 1. Set up the database

Create a local database (the default name expected is `bix`), then load the
schema and sample data:

```bash
psql "postgresql://<user>@localhost:5432/bix" -f server/db/schema.sql
psql "postgresql://<user>@localhost:5432/bix" -f server/db/seed.sql
```

See `server/db/README.md` for full details on the schema and scripts.

### 2. Configure environment variables

Copy each example env file and fill in your own values:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

`server/.env` needs `PORT`, `DATABASE_URL` (pointing at the database from
step 1) and `JWT_SECRET`. `client/.env` needs `VITE_API_BASE_URL`, which
should point at the running server (default `http://localhost:4000/api`).

### 3. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 4. Run the server and client

In one terminal, start the backend API (default port `4000`):

```bash
cd server
npm run dev
```

In a second terminal, start the frontend dev server (default port `5173`,
proxies `/api` requests to the backend):

```bash
cd client
npm run dev
```

Then open `http://localhost:5173` in your browser.

### Running tests

Both `client` and `server` use Vitest:

```bash
cd server && npm test
cd client && npm test
```

## Notes

Keep your project work, documentation, setup instructions, and relevant artefacts in this repository.
Do not share this repository outside your group and the teaching team.
