#!/usr/bin/env bash
# End-to-end test for certificate revocation through the dashboard.
#
#   1. Backend:   npm run dev                (port 4000)
#   2. Frontend:  npm run build && npm start (port 3000)
#   3. Then:      bash test-revoke.sh
#
# Issues and then REVOKES a real certificate on Sepolia (two transactions).

set -u
WEB="http://localhost:3000"
EMAIL="revoke-$(date +%s)@example.com"
PASSWORD="correct-horse-battery-staple"
ORG="Ashcombe Institute"
JAR=$(mktemp)
OUT=$(mktemp)
trap 'rm -f "$JAR" "$OUT"' EXIT

pass=0
fail=0
check() {
  if [ "$2" = "$3" ]; then echo "  PASS  $1 (HTTP $3) ${4:-}"; pass=$((pass+1));
  else echo "  FAIL  $1 - expected HTTP $2, got $3 ${4:-}"; fail=$((fail+1)); fi
}
assert() {
  if [ "$2" = "0" ]; then echo "  PASS  $1 ${3:-}"; pass=$((pass+1));
  else echo "  FAIL  $1 ${3:-}"; fail=$((fail+1)); fi
}
json() { node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8"))'"$1" < "$OUT" 2>/dev/null; }
vis() { node -e '
const fs=require("fs");let h=fs.readFileSync(process.argv[1],"utf8");
h=h.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"");
process.stdout.write(h.replace(/<[^>]+>/g," ").replace(/\s+/g," "));' "$OUT"; }
inpage() { vis | grep -qF "$1"; }

echo "== 1. Set up: register and issue =="
CODE=$(curl -s -o "$OUT" -w '%{http_code}' -c "$JAR" -X POST "$WEB/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"$ORG\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
check "register" 200 "$CODE"

START=$(date +%s)
CODE=$(curl -s -o "$OUT" -w '%{http_code}' -b "$JAR" --max-time 180 \
  -X POST "$WEB/api/certificates" -H 'Content-Type: application/json' \
  -d '{"recipientName":"Ada Lovelace","recipientEmail":"ada@example.com","courseName":"BSc Computer Science","expiryDate":null}')
check "issue certificate" 201 "$CODE" "($(( $(date +%s) - START ))s)"
CERT_ID=$(json '.certificate.certificateId')
echo "  certificateId: $CERT_ID"

echo
echo "== 2. Dashboard offers a Revoke button =="
CODE=$(curl -s -o "$OUT" -w '%{http_code}' -b "$JAR" "$WEB/dashboard")
check "GET /dashboard" 200 "$CODE"
inpage "Revoke"; assert "row shows a Revoke button" "$?"
inpage "Valid"; assert "status is Valid before revoking" "$?"

echo
echo "== 3. Auth and ownership are enforced =="
CODE=$(curl -s -o "$OUT" -w '%{http_code}' -X POST "$WEB/api/certificates/$CERT_ID/revoke")
check "revoke with no session" 401 "$CODE"

OTHERJAR=$(mktemp)
curl -s -o /dev/null -c "$OTHERJAR" -X POST "$WEB/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Rival Org\",\"email\":\"rival-$(date +%s)@example.com\",\"password\":\"$PASSWORD\"}"
CODE=$(curl -s -o "$OUT" -w '%{http_code}' -b "$OTHERJAR" --max-time 180 \
  -X POST "$WEB/api/certificates/$CERT_ID/revoke")
check "another org cannot revoke it" 404 "$CODE" "-> $(cat "$OUT")"
rm -f "$OTHERJAR"

echo
echo "== 4. Revoke it (real Sepolia tx) =="
START=$(date +%s)
CODE=$(curl -s -o "$OUT" -w '%{http_code}' -b "$JAR" --max-time 180 \
  -X POST "$WEB/api/certificates/$CERT_ID/revoke")
ELAPSED=$(( $(date +%s) - START ))
check "POST /api/certificates/:id/revoke" 200 "$CODE" "(${ELAPSED}s)"
echo "  status:       $(json '.certificate.status')"
echo "  revokeTxHash: $(json '.revokeTxHash')"
echo "  block:        $(json '.blockNumber')"
assert "returns status Revoked" "$([ "$(json '.certificate.status')" = "Revoked" ] && echo 0 || echo 1)"
assert "took >3s (a real chain round-trip)" "$([ "$ELAPSED" -gt 3 ] && echo 0 || echo 1)" "(${ELAPSED}s)"
printf '%s' "$(json '.revokeTxHash')" | grep -Eq '^0x[0-9a-f]{64}$'
assert "revokeTxHash looks like a real tx hash" "$?"

echo
echo "== 5. Dashboard reflects it =="
CODE=$(curl -s -o "$OUT" -w '%{http_code}' -b "$JAR" "$WEB/dashboard")
check "GET /dashboard" 200 "$CODE"
inpage "Revoked"; assert "row now shows Revoked" "$?"
COUNT=$(vis | grep -o "Revoke\b" | wc -l | tr -d ' ')
echo "  standalone 'Revoke' occurrences in page text: $COUNT"
assert "Revoke button is gone for the revoked row" \
  "$([ "$COUNT" = "0" ] && echo 0 || echo 1)"

echo
echo "== 6. Public verify page shows Revoked (live from chain) =="
CODE=$(curl -s -o "$OUT" -w '%{http_code}' "$WEB/verify/$CERT_ID")
check "GET /verify/$CERT_ID" 200 "$CODE"
inpage "Revoked"; assert "verify page shows Revoked" "$?"
inpage "withdrawn by the issuing organization"; assert "explains the revocation" "$?"

CODE=$(curl -s -o "$OUT" -w '%{http_code}' "http://localhost:4000/api/certificates/verify/$CERT_ID")
check "public API" 200 "$CODE"
assert "API status is Revoked" "$([ "$(json '.status')" = "Revoked" ] && echo 0 || echo 1)"
assert "status came from the blockchain" \
  "$([ "$(json '.statusSource')" = "blockchain" ] && echo 0 || echo 1)"
assert "on-chain revoked flag is true" \
  "$([ "$(json '.onChain.revoked')" = "true" ] && echo 0 || echo 1)"

echo
echo "== 7. Revoking again gives a clear error, not a broken state =="
START=$(date +%s)
CODE=$(curl -s -o "$OUT" -w '%{http_code}' -b "$JAR" --max-time 180 \
  -X POST "$WEB/api/certificates/$CERT_ID/revoke")
ELAPSED=$(( $(date +%s) - START ))
check "second revoke" 409 "$CODE" "(${ELAPSED}s)"
echo "  body: $(cat "$OUT")"
assert "error message is clear" \
  "$(printf '%s' "$(json '.error')" | grep -qi 'already been revoked' && echo 0 || echo 1)"
assert "rejected fast, without sending a tx" \
  "$([ "$ELAPSED" -lt 5 ] && echo 0 || echo 1)" "(${ELAPSED}s)"

CODE=$(curl -s -o "$OUT" -w '%{http_code}' -b "$JAR" "$WEB/dashboard")
check "dashboard still healthy after the failed retry" 200 "$CODE"
inpage "Revoked"; assert "row still shows Revoked" "$?"

echo
echo "== 8. Confirm directly on-chain =="
CERT_ID="$CERT_ID" node -e '
require("dotenv").config();
const { getContract, toBytes32Id } = require("./src/lib/contract");
(async () => {
  const { contract } = getContract();
  const v = await contract.verifyCertificate(toBytes32Id(process.env.CERT_ID));
  console.log("  contract status: " + v.status + "  revoked: " + v.revoked);
  const ok = await contract.isValid(toBytes32Id(process.env.CERT_ID));
  console.log("  isValid(): " + ok);
  if (v.status !== "Revoked" || v.revoked !== true || ok !== false) process.exit(1);
})().catch(e => { console.log("  FAIL " + (e.shortMessage || e.message)); process.exit(1); });
'
assert "contract reports Revoked / isValid false" "$?"

echo
echo "== 9. Confirmation dialog copy is shipped to the browser =="
CHUNKS=$(grep -rl "This cannot be undone" ../frontend/.next/static 2>/dev/null | head -1)
assert "confirm text is in the client bundle" \
  "$([ -n "$CHUNKS" ] && echo 0 || echo 1)" "${CHUNKS:+($(basename "$CHUNKS"))}"

echo
echo "================================"
echo "  $pass passed, $fail failed"
echo "================================"
[ "$fail" -eq 0 ]
