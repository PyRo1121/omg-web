# Documentation analytics operations

The licensing Worker owns documentation analytics ingestion, aggregation, dashboard queries, and retention. Wrangler configuration and the canonical D1 migrations are the deployment authorities.

## Runtime behavior

- `POST /api/docs/analytics` accepts Schema-validated batches of at most 50 events.
- The shared API rate limiter permits 100 requests per minute for each source IP.
- Accepted events and session updates are written through one D1 batch.
- Daily aggregates are refreshed through `ExecutionContext.waitUntil` after ingestion.
- `GET /api/docs/analytics/dashboard` requires an authenticated admin session.
- The `0 2 * * *` scheduled handler deletes raw events older than seven days and sessions older than 30 days. Aggregate tables are retained.

The source contracts in `src/contracts/http-bodies.ts`, handler behavior in `src/handlers/docs-analytics.ts`, and route registry are authoritative. Do not maintain a second payload schema in this document.

## Local verification

From `site/workers`:

```bash
npm ci
npm test
npx wrangler d1 migrations apply omg-licensing-test --local --config wrangler.test.toml
npx wrangler dev --test-scheduled --config wrangler.test.toml
```

Trigger the local scheduled handler from another terminal:

```bash
curl "http://localhost:8787/__scheduled?cron=0+2+*+*+*"
```

Local tests intentionally use `wrangler.test.toml`. That configuration has local-only D1 and R2 bindings and omits Workers AI because Workers AI has no local simulator.

## Production preparation

Do not apply migrations or deploy during an audit. Before an approved release:

1. Inventory remote migration history without mutating it:

   ```bash
   npx wrangler d1 migrations list omg-licensing --remote
   ```

2. Compare the remote history and schema with `migrations/` and `migrations.sha256`.
3. Run repository checks, Worker tests, generated-type checks, and a dry run:

   ```bash
   npm run check:migrations
   npm test
   npx wrangler types worker-configuration.d.ts --include-runtime=false --check
   npx wrangler deploy --dry-run
   ```

4. Confirm required secrets and bindings through an approved, non-printing inventory process.
5. Apply only pending immutable migrations after the remote baseline has been verified.
6. Deploy through the normal release process.

Never run ad hoc `DELETE`, `INSERT`, schema creation, or baseline adoption commands against production D1.

## Post-deployment validation

After an approved deployment:

1. Submit a non-sensitive analytics event from the documentation staging environment.
2. Confirm a successful ingestion response and the expected D1 row through a read-only query.
3. Confirm the admin dashboard requires authorization and returns decoded aggregate data.
4. Confirm invocation logs and structured application events in Workers Logs.
5. Confirm sampled traces include D1 operations for ingestion and dashboard requests.
6. Verify the next scheduled invocation completes successfully.

Use current logs with:

```bash
npx wrangler tail --format=json
```

Do not log raw payloads, session identifiers, user agents, IP addresses, or customer identifiers while troubleshooting. Follow `docs/operations/observability.md`.

## Failure triage

### Ingestion rejects a request

- Check the HTTP status before inspecting storage.
- Confirm the request body matches the installed Schema contract and contains no more than 50 events.
- Check rate-limit events and structured Worker errors.
- Confirm the request reached `api.pyro1121.com` and was not rejected by routing or CORS policy.

### Aggregates are stale

- Check structured logs for `Docs analytics background aggregation failed`.
- Verify raw events exist with a read-only D1 query.
- Confirm the scheduled trigger in `wrangler.toml` is present in the deployed version.
- Inspect traces for D1 failures or latency before considering any repair.

### Scheduled cleanup fails

- Check the scheduled invocation and its trace.
- Confirm the canonical tables exist in the remote schema.
- Reproduce against local D1 before preparing a corrective migration.
- Never repair production by editing an adopted migration or running undocumented destructive SQL.
