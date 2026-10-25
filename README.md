# Engine Quality Inspection and Workforce Management

A web-based manufacturing execution system (MES) for engine assembly inspection, station assignments, and supervisor workforce operations.

## Features

- Sequential engine inspection across the configured assembly stations.
- Engine registration, barcode tracking, inspection queues, and history cards.
- Engine-card selection to load the corresponding Master Card for operators, supervisors, and inspectors.
- Pass/fail test results, with remarks required for failed checks.
- Quality inspection checkpoints throughout the station workflow.
- Supervisor dashboard for daily worker and station assignments.
- Temporary worker creation and account management.
- Operator break requests for 5, 10, 15, 20, or 30 minutes, or 1 or 2 hours.
- Supervisor approval by assigning an existing operator or creating a temporary cover.
- Responsive interface for desktop, tablet, and mobile screens.

## Requirements

- Node.js 18 or newer
- npm

## Getting started

Install dependencies:

```sh
npm install
```

Start the Vite development server:

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The development server serves the frontend. To use the included HTTP API and local engine-file storage, run the standalone server instead:

```sh
node server.cjs
```

The standalone server also listens on port 3000 by default. Set the `PORT` environment variable to choose a different port.

## Login accounts

The default demo PIN is `1234`.

| Role | Login |
| --- | --- |
| Supervisor | `supervisor` |
| Quality inspector | `inspector` |
| Day-shift operator | `operatord-1`, `operatord-2`, etc. |
| Afternoon-shift operator | `operatora-1`, `operatora-2`, etc. |
| Night-shift operator | `operatorn-1`, `operatorn-2`, etc. |

Supervisors can add temporary workers with their own login IDs and PINs. Change demo credentials and add proper authentication before using the application in a production environment.

## Break request workflow

1. An operator selects a break duration and sends a request.
2. The supervisor reviews it on the workforce dashboard.
3. The supervisor assigns an active operator as cover or creates and assigns a temporary worker.
4. The cover is assigned to the requesting operator's station for the break.
5. The operator's station operations and inspection controls are locked during the approved break.
6. The operator can end their own break early, or the supervisor can end it; the cover operator's previous daily assignment is then restored.

## Data and storage

- Engine inspection data entered in the browser is stored in that browser's `localStorage`.
- Workforce profiles, daily assignments, and break requests are also stored in `localStorage`. These records are browser-specific and are not shared between different devices or browsers.
- The standalone Node server exposes engine and station API routes. When available, it can use MongoDB; otherwise, engine API data is stored in `data/engines.json`.
- Keep real production and personal data out of source control. The checked-in `data/engines.json` is a starter data file; back it up appropriately before using the local-file backend for real records.

## Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server on port 3000. |
| `npm run build` | Create the production frontend in `dist/`. |
| `npm run preview` | Preview the production frontend locally. |
| `npm run lint` | Run the TypeScript compiler without emitting files. |
| `node server.cjs` | Start the standalone HTTP server and engine API. |

## API routes

The standalone server provides:

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/stations` | Return the configured station list. |
| `GET` | `/api/engines` | List engine records. |
| `POST` | `/api/engines/init` | Initialize an engine record. |
| `GET` | `/api/engines/:barcode` | Retrieve an engine record. |
| `POST` | `/api/engines/:barcode/section/:sectionId` | Submit a station inspection section. |

## Project files

```text
.
├── app.js             # Browser application logic
├── index.html         # Application markup
├── styles.css         # Application styles
├── server.cjs         # Standalone HTTP server and engine API
├── server.js          # Node entry point for the server
├── data/
│   └── engines.json   # Local-file engine storage
├── src/               # TypeScript/React source files
├── package.json       # Dependencies and scripts
└── vite.config.ts     # Vite configuration
```

## Security notes

- The default PINs are for demonstration only and are not secure credentials.
- Authentication and workforce data are currently client-side; this is not a production access-control system.
- Do not expose the standalone server publicly without implementing authentication, authorization, input validation, and appropriate data protection.
- Never commit `.env` files, credentials, or real production data.
