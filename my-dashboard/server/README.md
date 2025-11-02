# my-dashboard Server

Simple Express mock API for the dashboard — returns price series, metrics, sentiment, and investments.

## Run locally

Open PowerShell and run:

cd "c:\Users\raybo\Documents\hackatons\PolyFinance\datathon-team-37\my-dashboard\server"
npm install
npm run dev

The server listens on http://localhost:4000 by default.

## Endpoints

- GET /api/health -> { status: 'ok', time }
- GET /api/price?symbol=AMC -> { symbol, series: [{date, price}, ...] }
- GET /api/metrics -> metrics object
- GET /api/sentiment -> sentiment object
- GET /api/investments -> array of investments

## Notes

- CORS is enabled so the frontend (Vite dev server) can call these endpoints directly.
- This is mock data for development. Replace with real data sources or database as needed.
