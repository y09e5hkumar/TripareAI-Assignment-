# Hotel Offer Orchestrator

Aggregates overlapping hotel offers from two mock suppliers, dedupes hotels by name, selects
the cheapest offer per hotel, and supports filtering by price range. Orchestration is done with
[Temporal](https://temporal.io), and the deduplicated result is cached in Redis, with price-range
filtering implemented using Redis sorted sets.

## Stack

- Node.js + TypeScript + Express
- Temporal.io (workflow + activities)
- Redis (cache + range filtering via sorted sets)
- Docker Compose

## Quick start

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine +
the Compose plugin) running, and these ports free on your machine: `3000`, `6379`, `7233`,
`8080`, `5432`.

```bash
git clone https://github.com/y09e5hkumar/TripareAI-Assignment-.git
cd TripareAI-Assignment-
docker compose up --build
```

That's it — once the containers are up, `http://localhost:3000/api/hotels?city=delhi` is live.
See [Running with Docker Compose](#running-with-docker-compose-recommended) below for what each
service does and how to stop it, or [Running locally without Docker](#running-locally-without-docker)
if you'd rather not use Docker at all.

## Architecture

```
Client
  │  GET /api/hotels?city=delhi[&minPrice=&maxPrice=]
  ▼
Express API ──────────────▶ Temporal Workflow (getHotelsWorkflow)
  │                                │
  │                                ├─▶ Activity: fetchSupplierAHotels(city) ──▶ GET /supplierA/hotels
  │                                └─▶ Activity: fetchSupplierBHotels(city) ──▶ GET /supplierB/hotels
  │                                │        (both run in parallel)
  │                                ▼
  │                         dedupe by name, keep cheaper price
  │                                │
  ▼                                ▼
Redis  ◀────────── cache deduped list (sorted set by price + JSON hash per hotel)
  │
  ▼
Response to client (optionally filtered by minPrice/maxPrice via ZRANGEBYSCORE)
```

### Workflow behavior

1. `getHotelsWorkflow(city)` calls both supplier activities **in parallel**.
2. Each activity calls the corresponding mock supplier endpoint. If a supplier call fails
   (timeout, 5xx, etc.) the activity logs the error and returns an empty list instead of
   failing the workflow, so the other supplier's results still come back.
3. The workflow merges both lists into a map keyed by hotel `name`:
   - If a name exists in both lists, the cheaper priced offer wins.
   - If a name exists in only one list, that offer is kept.
4. The deduplicated, price-sorted list is returned to the API layer.

### Redis caching + filtering strategy

For each city, two structures are written after a workflow run:

- `hotels:<city>:byPrice` — a **sorted set**, member = hotel name, score = price.
- `hotels:<city>:hotel:<name>` — a JSON string of the full hotel object (TTL: 5 minutes).

When a request includes `minPrice`/`maxPrice` **and** the city is already cached, filtering is
done entirely in Redis via `ZRANGEBYSCORE hotels:<city>:byPrice <min> <max>`, followed by an
`MGET` to fetch the matching hotel objects. On a cold cache (first request for a city, or a
filtered request before anything has been cached), the Temporal workflow runs first to populate
the cache, and the same range filter is then applied once in memory for that single response.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/hotels?city=<city>` | Full de-duplicated, best-priced hotel list for a city |
| GET | `/api/hotels?city=<city>&minPrice=<min>&maxPrice=<max>` | Same, filtered by price range (via Redis) |
| GET | `/supplierA/hotels?city=<city>` | Mock Supplier A endpoint |
| GET | `/supplierB/hotels?city=<city>` | Mock Supplier B endpoint |
| GET | `/health` | Reports health of Supplier A, Supplier B, and Redis |

Pass `fail=true` to either supplier mock endpoint to simulate that supplier being down
(returns `503`), e.g. `GET /supplierA/hotels?city=delhi&fail=true`.

Sample cities with seeded overlapping data: `delhi`, `mumbai`, `bangalore`, `pune`, `jaipur`.
Any other city (e.g. `goa`) returns an empty array.

### Sample response

```json
[
  { "name": "Holtin", "price": 5340, "supplier": "Supplier B", "commissionPct": 20 },
  { "name": "Lemon Tree", "price": 3900, "supplier": "Supplier B", "commissionPct": 9 },
  { "name": "Radison", "price": 5900, "supplier": "Supplier A", "commissionPct": 13 }
]
```

## Running with Docker Compose (recommended)

Requires Docker + Docker Compose.

```bash
docker compose up --build
```

This starts: Postgres (Temporal's persistence store), Temporal server, Temporal Web UI
(`http://localhost:8080`), Redis, the API (`http://localhost:3000`), and the Temporal worker.

Once everything is up, hit the API with whichever tool you prefer — these are plain `GET`
requests, so any of the following work:

- **Browser**: paste the URL directly into the address bar, e.g.
  `http://localhost:3000/api/hotels?city=delhi`
- **Postman**: import [`postman/TripareAI-Assignment.postman_collection.json`](postman/TripareAI-Assignment.postman_collection.json)
  and click "Send" on any request (recommended — see [Postman collection](#postman-collection) below)
- **curl**, if you prefer the terminal:
  ```bash
  curl "http://localhost:3000/api/hotels?city=delhi"
  curl "http://localhost:3000/api/hotels?city=delhi&minPrice=4000&maxPrice=6000"
  curl "http://localhost:3000/health"
  ```

To stop everything:

```bash
docker compose down
```

To also wipe Postgres/Redis volumes:

```bash
docker compose down -v
```

## Running locally without Docker

Requires Node.js 18+, a local Redis instance, and a local Temporal dev server
([`temporal server start-dev`](https://docs.temporal.io/cli) via the Temporal CLI, which listens
on `localhost:7233` by default).

```bash
npm install
cp .env.example .env

# Terminal 1 - Temporal dev server
temporal server start-dev

# Terminal 2 - Redis
redis-server

# Terminal 3 - API
npm run dev

# Terminal 4 - Temporal worker
npm run dev:worker
```

## Project structure

```
src/
  activities/        Temporal activities (supplier HTTP calls)
  workflows/          Temporal workflow (parallel fetch + dedupe)
  routes/            Express routes: hotels, mock suppliers, health
  data/              Static seeded supplier data
  shared/            Shared constants (task queue name, TTLs)
  app.ts             Express app wiring
  server.ts          API process entry point
  worker.ts          Temporal worker process entry point
  temporalClient.ts  Lazily-initialized Temporal client
  redisClient.ts     ioredis client
postman/             Postman collection for manual API testing
docker-compose.yml   Temporal + Postgres + Redis + API + Worker
Dockerfile           Multi-stage build for the API/worker image
```

## Postman collection

Import [`postman/TripareAI-Assignment.postman_collection.json`](postman/TripareAI-Assignment.postman_collection.json)
into Postman. It includes:

- Valid city with expected overlaps (`city=delhi`)
- Price-range filter request
- City with no results (`city=goa`)
- Missing `city` parameter (400)
- Simulated supplier-down scenarios for both suppliers (503)
- Raw mock supplier responses
- Health check

## Notes

- Supplier failures are tolerated at the activity level: if one supplier is down, the workflow
  still returns the other supplier's hotels instead of failing the whole request.
- The deduplicated result is cached with a 5-minute TTL (`HOTELS_CACHE_TTL_SECONDS` in
  `src/shared/constants.ts`); after it expires, the next request re-runs the workflow.
