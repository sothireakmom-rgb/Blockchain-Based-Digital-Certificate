#!/usr/bin/env bash
# End-to-end test for the public verification flow.
#
#   1. Backend:   npm run dev            (port 4000)
#   2. Frontend:  npm run dev            (port 3000, in ../frontend)
#   3. Then:      bash test-verify.sh
#
# Issues a REAL certificate on Sepolia and then REVOKES it, to prove the page
# reports the on-chain status rather than the stored database status.

set -u
API="http://localhost:4000/api"
WEB="http://localhost:3000"
EMAIL="verify-$(date +%s)@example.com"
PASSWORD="correct-horse-battery-staple"
ORG="Northgate Polytechnic"
BODYFILE=$(mktemp)
PAGE=$(mktemp)
trap 'rm -f "$BODYFILE" "$PAGE"' EXIT

pass=0
fail=0

call() {
  STATUS=$(curl -s --max-time 180 -o "$BODYFILE" -w '%{http_code}' "$@")
  BODY=$(cat "$BODYFILE")
}
check() {
  if [ "$2" = "$3" ]; then echo "  PASS  $1 (HTTP $3) ${4:-}"; pass=$((pass+1));
  else echo "  FAIL  $1 - expected HTTP $2, got $3 ${4:-}"; fail=$((fail+1)); fi
}
assert() {
  if [ "$2" = "0" ]; then echo "  PASS  $1 ${3:-}"; pass=$((pass+1));
  else echo "  FAIL  $1 ${3:-}"; fail=$((fail+1)); fi
}
json() { node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8"))'"$1" <<<"$BODY" 2>/dev/null; }
# grep the fetched page, ignoring HTML tags that may split text
inpage() { tr -d '\n' < "$PAGE" | sed 's/<[^>]*>//g' | grep -qF "$1"; }

echo "== 1. Both servers reachable =="
call "$API/health"
check "backend /api/health" 200 "$STATUS" "-> $BODY"
HTTP=$(curl -s --max-time 30 -o "$PAGE" -w '%{http_code}' "$WEB/")
check "frontend homepage" 200 "$HTTP"
inpage "Verify a certificate"; assert "homepage shows heading" "$?"
grep -q 'id="certificateId"' "$PAGE"; assert "homepage has the search input" "$?"

echo
echo "== 2. Issue a certificate (real Sepolia tx) =="
call -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"$ORG\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
check "register" 201 "$STATUS"
TOKEN=$(json '.token')

EXPIRY=$(node -pe 'new Date(Date.now()+365*24*3600*1000).toISOString()')
START=$(date +%s)
call -X POST "$API/certificates" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"recipientName\":\"Grace Hopper\",\"recipientEmail\":\"grace@example.com\",\"courseName\":\"MSc Distributed Systems\",\"expiryDate\":\"$EXPIRY\"}"
check "issue certificate" 201 "$STATUS" "($(( $(date +%s) - START ))s)"
CERT_ID=$(json '.certificate.certificateId')
TX=$(json '.certificate.txHash')
echo "  certificateId: $CERT_ID"
echo "  txHash:        $TX"

echo
echo "== 3. Public API endpoint (no auth) =="
call "$API/certificates/verify/$CERT_ID"
check "GET /api/certificates/verify/:id without a token" 200 "$STATUS"
echo "  status:       $(json '.status')  (source: $(json '.statusSource'))"
echo "  recipient:    $(json '.recipientName')"
echo "  organization: $(json '.organizationName')"
assert "status is Valid" "$([ "$(json '.status')" = "Valid" ] && echo 0 || echo 1)"
assert "status came from the blockchain" \
  "$([ "$(json '.statusSource')" = "blockchain" ] && echo 0 || echo 1)"
assert "on-chain dataHash matches the database" \
  "$([ "$(json '.onChain.dataHashMatches')" = "true" ] && echo 0 || echo 1)"
printf '%s' "$BODY" | grep -q "recipientEmail"
assert "public response does NOT leak recipientEmail" \
  "$([ $? -eq 0 ] && echo 1 || echo 0)"

echo
echo "== 4. Verify page renders the certificate =="
HTTP=$(curl -s --max-time 60 -o "$PAGE" -w '%{http_code}' "$WEB/verify/$CERT_ID")
check "GET /verify/$CERT_ID" 200 "$HTTP"
for want in "Grace Hopper" "MSc Distributed Systems" "$ORG" "$CERT_ID" "Valid" "Sepolia Etherscan"; do
  inpage "$want"; assert "page shows: $want" "$?"
done
grep -q "sepolia.etherscan.io/tx/$TX" "$PAGE"
assert "page links to the correct Etherscan tx" "$?"
inpage "No Expiry"; assert "page does NOT say No Expiry (this cert expires)" \
  "$([ $? -eq 0 ] && echo 1 || echo 0)"

echo
echo "== 5. Not-found state for a fake ID =="
HTTP=$(curl -s --max-time 60 -o "$PAGE" -w '%{http_code}' "$WEB/verify/CERT-2026-FAKE99")
check "GET /verify/CERT-2026-FAKE99 returns a real 404" 404 "$HTTP"
# notFound() delivers the 404 body through the RSC payload, which the client
# renders - so grep the whole response, not just the server-rendered markup.
grep -qF "Certificate not found" "$PAGE"; assert "shows 'Certificate not found'" "$?"
grep -qF "CERT-2026-FAKE99" "$PAGE"; assert "echoes the ID that was searched" "$?"
grep -qF "Treat it as unverified" "$PAGE"; assert "warns the document is unverified" "$?"
grep -qF "Grace Hopper" "$PAGE"; assert "does NOT leak another certificate's data" \
  "$([ $? -eq 0 ] && echo 1 || echo 0)"

call "$API/certificates/verify/CERT-2026-FAKE99"
check "API returns 404 for unknown id" 404 "$STATUS" "-> $BODY"

echo
echo "== 6. Revoke on-chain, then re-check the page =="
echo "  revoking $CERT_ID on Sepolia..."
CERT_ID="$CERT_ID" node -e '
require("dotenv").config();
const { getContract, toBytes32Id } = require("./src/lib/contract");
(async () => {
  const { contract } = getContract();
  const tx = await contract.revokeCertificate(toBytes32Id(process.env.CERT_ID));
  const r = await tx.wait(1);
  console.log("  revoke tx " + r.hash + " (block " + r.blockNumber + ")");
})().catch(e => { console.error("  revoke failed: " + (e.shortMessage || e.message)); process.exit(1); });
'
assert "revocation transaction confirmed" "$?"

# The DB row still says "Valid" - only the chain knows it is revoked.
DBSTATUS=$(node -e '
require("dotenv").config();
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DIRECT_URL });
  await c.connect();
  const r = await c.query("select status from \"Certificate\" where \"certificateId\"=$1", [process.argv[1]]);
  console.log(r.rows[0] ? r.rows[0].status : "MISSING");
  await c.end();
})();' "$CERT_ID" | tail -1)
echo "  database still says: $DBSTATUS"
assert "database row is stale (still Valid)" \
  "$([ "$DBSTATUS" = "Valid" ] && echo 0 || echo 1)"

call "$API/certificates/verify/$CERT_ID"
echo "  API now reports: $(json '.status')"
assert "API reports Revoked from the chain" \
  "$([ "$(json '.status')" = "Revoked" ] && echo 0 || echo 1)"

HTTP=$(curl -s --max-time 60 -o "$PAGE" -w '%{http_code}' "$WEB/verify/$CERT_ID")
check "GET /verify/$CERT_ID after revocation" 200 "$HTTP"
inpage "Revoked"; assert "page shows Revoked" "$?"
inpage "withdrawn by the issuing organization"; assert "page explains revocation" "$?"

echo
echo "================================"
echo "  $pass passed, $fail failed"
echo "================================"
[ "$fail" -eq 0 ]
