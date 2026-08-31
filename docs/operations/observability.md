# Production observability policy

This repository treats Wrangler configuration as the source of truth for Cloudflare Workers observability. Deployments must not rely on dashboard-only logging settings.

## Coverage

The following deployed applications enable persistent Workers Logs and traces:

- `site/wrangler.toml` — SolidStart site served through Workers Static Assets (`omg-site`)
- `workers/api/wrangler.toml` — licensing and telemetry API (`omg-saas`)

`workers/router/wrangler.toml` and `workers/releases/wrangler.toml` carry observability blocks too, but those Workers are kept in the repository only and are deliberately not deployed.

Local Worker tests use `workers/api/wrangler.test.toml` and intentionally omit production observability and Workers AI bindings.

## Sampling

Production configuration for both deployed Workers persists:

- Logs and invocation logs at `head_sampling_rate = 1`.
- Traces at `head_sampling_rate = 0.01`.

Logs remain unsampled so operational failures and security events are not silently discarded. Traces are sampled because a trace can contain several spans and Cloudflare tracing becomes billable on October 1, 2026. Review traffic and observability-event volume monthly. Change sampling in version control, validate it with the installed Wrangler version, and deploy through the normal release process.

## Event format and privacy

Worker application logs use Effect's JSON logger. Each event contains a stable `event` field and may contain a bounded error description. Do not log:

- Access tokens, session cookies, authorization headers, license keys, OTPs, Stripe secrets, or webhook signatures.
- Raw request or response bodies.
- Email addresses, names, IP addresses, machine identifiers, or other customer data unless an approved incident procedure requires it.
- D1 records or provider payloads.

Browser failures are sent through Sentry only when the server-owned `SENTRY_DSN` configuration is present. Browser code must not receive Worker credentials.

## Alerting

Workers Logs free-tier retention is roughly 3 days, so log-only monitoring detects nothing outside a 72-hour human attention window. The following minimum alert surface is required and is NOT yet provisioned (tracked as an open production-hardening step in [`cloudflare-environment-readiness.md`](./cloudflare-environment-readiness.md)):

1. A Cloudflare Notification (Webhooks/Email destination) on Workers **exception count > 0** and on elevated 5xx response rate for `omg-site` and `omg-saas`.
2. A daily scheduled probe that asserts (a) both cron invocations succeeded and (b) zero rows in `stripe_events` with `status != 'processed'`, alerting through the same destination. A silent billing inbox is otherwise undetectable until a customer complains.
3. Include the site's `*.workers.dev` fallback hostname in any domain-scoped alert review, or disable that hostname so it cannot serve traffic outside monitored domains.

Configure notifications in the Cloudflare dashboard under Notifications > Alert Policies; keep thresholds in this document once chosen.

## Operational queries

Use Cloudflare Workers Logs to monitor:

1. Uncaught exceptions and invocations with 5xx responses.
2. Repeated authentication, rate-limit, Stripe, email, and provider failures.
3. Scheduled-handler failures and missing successful aggregation events.
4. Elevated D1, R2, service-binding, or external-fetch latency in traces.

Correlate by Cloudflare invocation metadata and trace identifiers. Do not introduce customer identifiers solely for log correlation.

## Release validation

Before deploying an observability change:

1. Run repository checks and Worker tests.
2. Run `wrangler types --check` for Workers with generated bindings.
3. Run `wrangler deploy --dry-run` for each standalone Worker.
4. Build the current Solid rollback origin and the Svelte application, then run the Svelte-owned production client bundle budget.
5. After an approved deployment, confirm invocation logs, one structured application event, and sampled traces in the Cloudflare dashboard.

Never mutate production bindings or sampling settings during an audit-only task.

## Primary references

- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Workers traces](https://developers.cloudflare.com/workers/observability/traces/)
- [Wrangler observability configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#observability)
