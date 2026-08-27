# Historical finding evidence

Each finding keeps one canonical proof script at the finding root. When an audit
capture previously copied that script into `evidence/` or `confirm-evidence/`,
the duplicate is replaced by `manifest.json` (or root
`script-manifest.json`). Each manifest records:

- the removed copy's filename;
- the canonical relative path; and
- the canonical script's SHA-256 at capture time.

Captured logs and reports remain unchanged. Run `npm run check:audit-evidence`
to verify canonical paths and hashes, prove removed copies have not returned,
and reject new byte-identical script fan-out.
