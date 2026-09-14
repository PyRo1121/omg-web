# Authentication and docs ingestion boundaries

## Telemetry and privacy export migration

PR #101 intentionally changes the privacy export format marker from `2.0` to `3.0`. Existing top-level data fields remain, with `usage`, `usage_daily`, `analytics_events`, `install_stats`, `customer_notes`, and `excluded` added. Consumers that enforce the old format marker or a closed schema must accept format `3.0` before processing new exports. This version describes the JSON export contract, not a database schema migration.

The new categories are scoped to the authenticated customer's records. Support notes omit staff author identities; one-time authentication codes and Worker credential hashes are not exported. The response describes those exclusions and retained records explicitly. Export limits remain part of the contract: up to 1,000 usage rows, 366 daily aggregates, 200 analytics events, and 500 support notes. These bounded results must not be described as an unlimited archive.

Telemetry request bodies use the endpoint-specific byte limits even when Content-Length is missing or inaccurate. Package arrays retain at most 100 entries of 1,000 characters each. Metadata retains at most 32 entries, keys of 64 characters, string values of 512 characters, and 4,096 serialized UTF-8 bytes. Oversized metadata is truncated; oversized request bodies are rejected.

A role change received through the authenticated site-session bridge revokes existing Worker sessions before issuing the replacement login session. Other devices using those sessions must sign in again. The focused telemetry, privacy, and site-session suite covers these transitions; broader CI checks the integrated site and API.

## Existing authorization and ingestion behavior

Worker session and OTP authorization compares parsed Julian-day timestamps, so ISO strings and legacy SQLite timestamps obey the same expiration instant. Malformed expiration values fail authorization closed. OTP cleanup also removes malformed expiration rows. Site-session issuance retains ISO timestamps; Better Auth's numeric `auth_session` timestamps are a separate storage contract.

The account OTP limiter runs before matching or consuming any code. A depleted account bucket therefore temporarily delays legitimate login as well as guesses; successful codes do not bypass it. Atomic claim and replay prevention remain in place. All routes marked `admin-session` receive the admin limiter before database authorization, regardless of URL prefix; existing `/api/admin/` protection remains.

Anonymous docs ingestion writes only the bounded event/session batch. It does not refresh whole-day aggregates, including for empty batches. The five-minute scheduled job rebuilds today and yesterday in UTC, replacing each day's aggregate rows in a transaction. Dashboard freshness is therefore normally up to five minutes, subject to scheduled execution delays. Client timestamps are not trusted for event storage: delayed batches enter their server receipt date. Yesterday is refreshed for writes crossing midnight. Retention cleanup keeps its existing daily schedule. Failed refreshes are reported through structured logs and Sentry when configured.

`site/static/install.sh` is copied byte-for-byte from OMG's canonical `install.sh`. `npm run check:installer` verifies the reviewed snapshot digest and runs isolated release/provenance/source-mode fixtures in Bash. During synchronization, additionally run `node tools/check-installer-sync.mjs /path/to/omg/install.sh` for direct cross-repository equality. The digest gate does not discover future upstream changes: updating the canonical installer requires copying and reviewing the website copy and its digest together.
