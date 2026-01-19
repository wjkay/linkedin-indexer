# LinkedIn Content Indexer

A standalone service that indexes LinkedIn articles and posts by topic and region. Other sites can pull content via REST API.

## Features

- Scheduled content fetching via Google search + Playwright
- SQLite storage with full-text indexing
- REST API for content retrieval
- Rate limiting (50 requests/day default)
- Docker deployment ready

## Quick Start

### Development

```bash
npm install
npm run dev
```

### Docker

```bash
docker-compose up -d
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/content` | Get content with filters |
| `GET /api/content/:id` | Get single content item |
| `GET /api/topics` | List all topics and regions |
| `GET /api/authors` | List all authors |
| `GET /api/authors/:id/content` | Get content by author |
| `GET /api/status` | Indexer status and recent fetches |
| `POST /api/fetch` | Trigger manual fetch cycle |

### Query Parameters for `/api/content`

| Parameter | Description |
|-----------|-------------|
| `topic` | Filter by topic (e.g., `rma-resource-management`) |
| `region` | Filter by region (`nz`, `au`, `us`, `global`) |
| `subregion` | Filter by subregion (e.g., `wellington`) |
| `type` | Content type (`article`, `post`, `all`) |
| `limit` | Max results (default: 20) |
| `offset` | Pagination offset |
| `since` | ISO date string for filtering |
| `authorId` | Filter by author |

### Example Usage

```bash
# Get NZ resource management articles
curl "http://localhost:3100/api/content?topic=rma-resource-management&region=nz&limit=10"

# Get Wellington-specific content
curl "http://localhost:3100/api/content?region=nz&subregion=wellington"
```

## Configuration

### Topics (`config/topics.json`)

Defines regions, subregions, and topics to index.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server port |
| `DATABASE_PATH` | `./data/linkedin.db` | SQLite database path |
| `FETCH_INTERVAL_HOURS` | `6` | Hours between fetch cycles |
| `MAX_REQUESTS_PER_DAY` | `50` | Rate limit |
| `HEADLESS` | `true` | Run browser headless |

## Consumer Integration

```javascript
// Example: Fetch content for Derive website
const response = await fetch(
  'https://your-indexer.example.com/api/content?' +
  'topic=rma-resource-management,freshwater-management&' +
  'region=nz&' +
  'subregion=wellington&' +
  'limit=6'
);
const { data } = await response.json();
```

## License

MIT
