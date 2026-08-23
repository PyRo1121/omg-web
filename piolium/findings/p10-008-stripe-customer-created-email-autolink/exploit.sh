#!/usr/bin/env bash
# Exploit driver for p10-008: signed customer.created with attacker-chosen victim email
# cross-account auto-link + invoice projection. Requires the wrangler dev server from
# setup.sh running on $BASE (default http://127.0.0.1:8799).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$DIR/poc.py" "${1:-http://127.0.0.1:8799}"
