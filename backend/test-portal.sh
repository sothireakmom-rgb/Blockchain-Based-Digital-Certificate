#!/usr/bin/env bash
# End-to-end test of the organization portal, driven through a cookie jar the
# way a browser would drive it.
#
#   1. Backend:   npm run dev                (port 4000)
#   2. Frontend:  npm run build && npm start (port 3000)
#   3. Then:      bash test-portal.sh
#
# Issues a REAL certificate on Sepolia via the UI's own endpoint.

set -u
WEB="http://localhost:3000"
API="http://localhost:4000/api"
EMAIL="portal-$(date +%s)@example.com"
PASSWORD="correct-horse-battery-staple"
ORG="Ashcombe Institute"
JAR=$(mktemp)
OUT=$(mktemp)
HDRS=$(mktemp)
trap 'rm -f "$JAR" "$OUT" "$HDRS"' EXIT

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
# visible text only: drop scripts, then tags
vis() { node -e '
const fs=require("fs");let h=fs.readFileSync(process.argv[1],"utf8");
h=h.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"");
process.stdout.write(h.replace(/<[^>]+>/g," ").replace(/\s+/g," "));' "$OUT"; }
inpage() { vis | grep -qF "$1"; }

echo "== 1. Dashboard is protected before signing in =="
CODE=$(curl -s -o "$OUT" -D "$HDRS" -w '%{http_code}' -c "$JAR" "$WEB/dashboard")
check "GET /dashboard while signed out" 307 "$CODE"
grep -qi '^location:.*\/login' "$HDRS"; assert "redirects to /login" "$?"

echo
echo "== 2. Register through the portal =="
CODE=$(curl -s -o "$OUT" -D "$HDRS" -w '%{http_code}' -c "$JAR" \
  -X POST "$WEB/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"$ORG\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
check "POST /api/auth/register" 200 "$CODE"
assert "returns the organization" "$([ "$(json '.organization.name')" = "$ORG" ] && echo 0 || echo 1)"

grep -qi 'set-cookie:.*cert_session' "$HDRS"; assert "sets the cert_session cookie" "$?"
grep -qi 'set-cookie:.*httponly' "$HDRS"; assert "cookie is HttpOnly" "$?"
grep -qi 'set-cookie:.*samesite=lax' "$HDRS"; assert "cookie is SameSite=Lax" "$?"
printf '%s' "$(json '.')" | grep -qi '"token"'
assert "JWT is NOT returned in the response body" "$([ $? -eq 0 ] && echo 1 || echo 0)"

echo
echo "== 3. Dashboard loads when signed in =="
CODE=$(curl -s -o "$OUT" -w '%{http_code}' -b "$JAR" "$WEB/dashboard")
check "GET /dashboard" 200 "$CODE"
inpage "$ORG"; assert "nav shows the organization name" "$?"
inpage "Issue New Certificate"; assert "shows 'Issue New Certificate'" "$?"
inpage "Nothing here yet"; assert "shows the empty state" "$?"
inpage "Log out"; assert "nav has a log out button" "$?"

echo
echo "== 4. Issue a certificate through the portal (real Sepolia tx) =="
START=$(date +%s)
CODE=$(curl -s -o "$OUT" -w '%{http_code}' -b "$JAR" --max-time 180 \
  -X POST "$WEB/api/certificates" -H 'Content-Type: application/json' \
  -d '{"recipientName":"Ada Lovelace","recipientEmail":"ada@example.com","courseName":"BSc Computer Science","expiryDate":null}')
ELAPSED=$(( $(date +%s) - START ))
check "POST /api/certificates via the portal" 201 "$CODE" "(${ELAPSED}s)"
CERT_ID=$(json '.certificate.certificateId')
TX=$(json '.certificate.txHash')
echo "  certificateId: $CERT_ID"
echo "  txHash:        $TX"
assert "issuing took >3s (a real chain round-trip, not a mock)" \
  "$([ "$ELAPSED" -gt 3 ] && echo 0 || echo 1)" "(${ELAPSED}s)"

echo
echo "== 5. The transaction really is on Sepolia =="
CERT_ID="$CERT_ID" TX="$TX" node -e '
require("dotenv").config();
const { getContract, toBytes32Id } = require("./src/lib/contract");
(async () => {
  const { provider, contract } = getContract();
  const r = await provider.getTransactionReceipt(process.env.TX);
  if (!r) { console.log("  FAIL  transaction not found on Sepolia"); process.exit(1); }
  const net = await provider.getNetwork();
  console.log("  chainId " + net.chainId + ", block " + r.blockNumber + ", status " + r.status);
  const onContract = r.to.toLowerCase() === process.env.CONTRACT_ADDRESS.toLowerCase();
  const v = await contract.verifyCertificate(toBytes32Id(process.env.CERT_ID));
  console.log("  on-chain status: " + v.status);
  if (!onContract || v.status !== "Valid") process.exit(1);
})().catch(e => { console.log("  FAIL  " + (e.shortMessage || e.message)); process.exit(1); });
'
assert "tx confirmed on-chain and contract reports Valid" "$?"

echo
echo "== 6. It appears in the dashboard table =="
CODE=$(curl -s -o "$OUT" -w '%{http_code}' -b "$JAR" "$WEB/dashboard")
check "GET /dashboard" 200 "$CODE"
for want in "Ada Lovelace" "BSc Computer Science" "$CERT_ID" "Valid" "Download PDF" "View Verification Page" "no expiry"; do
  inpage "$want"; assert "table shows: $want" "$?"
done
inpage "Nothing here yet"; assert "empty state is gone" "$([ $? -eq 0 ] && echo 1 || echo 0)"

echo
echo "== 7. Download the PDF through the portal =="
CODE=$(curl -s -o "$OUT" -D "$HDRS" -w '%{http_code}' -b "$JAR" \
  "$WEB/api/certificates/$CERT_ID/pdf")
check "GET /api/certificates/:id/pdf" 200 "$CODE"
grep -qi 'content-type:.*application/pdf' "$HDRS"; assert "Content-Type is application/pdf" "$?"
grep -qi "content-disposition:.*$CERT_ID.pdf" "$HDRS"; assert "downloads as $CERT_ID.pdf" "$?"
assert "body starts with %PDF" "$([ "$(head -c 5 "$OUT")" = "%PDF-" ] && echo 0 || echo 1)"
SIZE=$(wc -c < "$OUT" | tr -d ' ')
echo "  pdf size: $SIZE bytes"
assert "pdf is non-trivial" "$([ "$SIZE" -gt 3000 ] && echo 0 || echo 1)"
cp "$OUT" ./portal-certificate.pdf
DECODED=$(node decode-pdf-qr.js ./portal-certificate.pdf 2>&1 | tail -1)
echo "  QR decodes to: $DECODED"
assert "QR points at this certificate's verify page" \
  "$([ "$DECODED" = "http://localhost:3000/verify/$CERT_ID" ] && echo 0 || echo 1)"

echo
echo "== 8. Public verify page works for it =="
CODE=$(curl -s -o "$OUT" -w '%{http_code}' "$WEB/verify/$CERT_ID")
check "GET /verify/$CERT_ID (no cookie)" 200 "$CODE"
inpage "Ada Lovelace"; assert "verify page shows the recipient" "$?"

echo
echo "== 9. Log out =="
CODE=$(curl -s -o "$OUT" -D "$HDRS" -w '%{http_code}' -b "$JAR" -c "$JAR" \
  -X POST "$WEB/api/auth/logout")
check "POST /api/auth/logout" 200 "$CODE"
grep -qi 'set-cookie:.*cert_session=;' "$HDRS"; assert "clears the session cookie" "$?"

CODE=$(curl -s -o "$OUT" -D "$HDRS" -w '%{http_code}' -b "$JAR" "$WEB/dashboard")
check "GET /dashboard after logout" 307 "$CODE"
grep -qi '^location:.*\/login' "$HDRS"; assert "redirected back to /login" "$?"

CODE=$(curl -s -o "$OUT" -w '%{http_code}' -b "$JAR" "$WEB/api/certificates/$CERT_ID/pdf")
check "PDF download after logout" 401 "$CODE"

CODE=$(curl -s -o "$OUT" -w '%{http_code}' -b "$JAR" \
  -X POST "$WEB/api/certificates" -H 'Content-Type: application/json' \
  -d '{"recipientName":"X","recipientEmail":"x@example.com","courseName":"Y"}')
check "issuing after logout" 401 "$CODE"

echo
echo "== 10. Log back in =="
CODE=$(curl -s -o "$OUT" -w '%{http_code}' -c "$JAR" \
  -X POST "$WEB/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
check "POST /api/auth/login" 200 "$CODE"
CODE=$(curl -s -o "$OUT" -w '%{http_code}' -b "$JAR" "$WEB/dashboard")
check "GET /dashboard again" 200 "$CODE"
inpage "$CERT_ID"; assert "certificate still listed" "$?"

CODE=$(curl -s -o "$OUT" -w '%{http_code}' -c "$JAR" \
  -X POST "$WEB/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrong-password\"}")
check "login with a wrong password" 401 "$CODE"

echo
echo "================================"
echo "  $pass passed, $fail failed"
echo "================================"
[ "$fail" -eq 0 ]
