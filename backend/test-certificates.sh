#!/usr/bin/env bash
# End-to-end test for certificate issuing.
#
#   1. Start the server:  npm run dev
#   2. In another shell:  bash test-certificates.sh
#
# NOTE: this sends REAL transactions to Sepolia and spends test ETH.
# Issuing waits for on-chain confirmation, so step 3 can take 15-60s.

set -u
BASE="http://localhost:${PORT:-4000}/api"
EMAIL="certs-$(date +%s)@example.com"
PASSWORD="correct-horse-battery-staple"
BODYFILE=$(mktemp)
trap 'rm -f "$BODYFILE"' EXIT

pass=0
fail=0

call() {
  STATUS=$(curl -s --max-time 180 -o "$BODYFILE" -w '%{http_code}' "$@")
  BODY=$(cat "$BODYFILE")
}

check() {
  if [ "$2" = "$3" ]; then
    echo "  PASS  $1 (HTTP $3) ${4:-}"
    pass=$((pass + 1))
  else
    echo "  FAIL  $1 - expected HTTP $2, got $3 ${4:-}"
    fail=$((fail + 1))
  fi
}

assert() { # assert <label> <condition-result:0/1> [extra]
  if [ "$2" = "0" ]; then
    echo "  PASS  $1 ${3:-}"
    pass=$((pass + 1))
  else
    echo "  FAIL  $1 ${3:-}"
    fail=$((fail + 1))
  fi
}

json() { node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8"))'"$1" <<<"$BODY" 2>/dev/null; }

echo "== 1. Register organization =="
call -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Test College\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
check "register" 201 "$STATUS"
TOKEN=$(json '.token')

echo
echo "== 2. Auth is enforced =="
call -X POST "$BASE/certificates" -H 'Content-Type: application/json' \
  -d '{"recipientName":"X","recipientEmail":"x@example.com","courseName":"Y"}'
check "POST without token" 401 "$STATUS" "-> $BODY"

call "$BASE/certificates"
check "GET without token" 401 "$STATUS" "-> $BODY"

call -X POST "$BASE/certificates" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" -d '{}'
check "missing fields rejected" 400 "$STATUS"

echo
echo "== 3. List is empty to start =="
call "$BASE/certificates" -H "Authorization: Bearer $TOKEN"
check "GET /api/certificates" 200 "$STATUS"
COUNT=$(json '.count')
assert "count is 0" "$([ "$COUNT" = "0" ] && echo 0 || echo 1)" "-> count=$COUNT"

echo
echo "== 4. Issue a certificate (real Sepolia tx - may take 15-60s) =="
START=$(date +%s)
call -X POST "$BASE/certificates" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"recipientName":"Ada Lovelace","recipientEmail":"ada@example.com","courseName":"BSc Computer Science"}'
ELAPSED=$(( $(date +%s) - START ))
check "POST /api/certificates" 201 "$STATUS" "(${ELAPSED}s)"

CERT_ID=$(json '.certificate.certificateId')
TX_HASH=$(json '.certificate.txHash')
DATA_HASH=$(json '.certificate.dataHash')
STATUS_FIELD=$(json '.certificate.status')
EXPIRY=$(json '.certificate.expiryDate')
BLOCK=$(json '.blockNumber')

echo "  certificateId: $CERT_ID"
echo "  txHash:        $TX_HASH"
echo "  dataHash:      $DATA_HASH"
echo "  status:        $STATUS_FIELD   expiryDate: $EXPIRY   block: $BLOCK"

echo "$CERT_ID" | grep -Eq '^CERT-[0-9]{4}-[0-9A-F]{6}$'
assert "certificateId matches CERT-YYYY-XXXXXX" "$?"

echo "$TX_HASH" | grep -Eq '^0x[0-9a-fA-F]{64}$'
assert "txHash is 0x + 64 hex chars" "$?"

echo "$DATA_HASH" | grep -Eq '^0x[0-9a-fA-F]{64}$'
assert "dataHash is a bytes32 hash" "$?"

assert "status is Valid" "$([ "$STATUS_FIELD" = "Valid" ] && echo 0 || echo 1)"
assert "expiryDate is null (never expires)" "$([ "$EXPIRY" = "null" ] && echo 0 || echo 1)"

echo
echo "== 5. Issue one WITH an expiry =="
FUTURE=$(node -pe 'new Date(Date.now()+365*24*3600*1000).toISOString()')
call -X POST "$BASE/certificates" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"recipientName\":\"Grace Hopper\",\"recipientEmail\":\"grace@example.com\",\"courseName\":\"MSc Systems\",\"expiryDate\":\"$FUTURE\"}"
check "POST with expiryDate" 201 "$STATUS"
CERT_ID2=$(json '.certificate.certificateId')
echo "  certificateId: $CERT_ID2  expiry: $(json '.certificate.expiryDate')"

call -X POST "$BASE/certificates" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"recipientName":"Past","recipientEmail":"p@example.com","courseName":"Z","expiryDate":"2020-01-01T00:00:00.000Z"}'
check "past expiryDate rejected" 400 "$STATUS" "-> $BODY"

echo
echo "== 6. Both appear in GET /api/certificates =="
call "$BASE/certificates" -H "Authorization: Bearer $TOKEN"
check "GET /api/certificates" 200 "$STATUS"
COUNT=$(json '.count')
assert "count is 2" "$([ "$COUNT" = "2" ] && echo 0 || echo 1)" "-> count=$COUNT"
printf '%s' "$BODY" | grep -q "$CERT_ID"
assert "list contains $CERT_ID" "$?"
printf '%s' "$BODY" | grep -q "$CERT_ID2"
assert "list contains $CERT_ID2" "$?"
printf '%s' "$BODY" | grep -q "passwordHash"
assert "list leaks no passwordHash" "$([ $? -eq 0 ] && echo 1 || echo 0)"

echo
echo "== 7. Another org cannot see them =="
call -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Other Org\",\"email\":\"other-$(date +%s)@example.com\",\"password\":\"$PASSWORD\"}"
OTHER_TOKEN=$(json '.token')
call "$BASE/certificates" -H "Authorization: Bearer $OTHER_TOKEN"
check "other org GET" 200 "$STATUS"
assert "other org sees 0 certificates" "$([ "$(json '.count')" = "0" ] && echo 0 || echo 1)" "-> count=$(json '.count')"

echo
echo "== 8. Verify on-chain (independent of the API) =="
CERT_ID="$CERT_ID" TX_HASH="$TX_HASH" DATA_HASH="$DATA_HASH" node -e '
require("dotenv").config();
const { getContract, toBytes32Id } = require("./src/lib/contract");
(async () => {
  const { provider, contract } = getContract();
  const r = await provider.getTransactionReceipt(process.env.TX_HASH);
  if (!r) { console.log("  FAIL  transaction not found on Sepolia"); process.exit(1); }
  console.log("  PASS  tx found on Sepolia (block " + r.blockNumber + ", status " + r.status + ")");
  console.log("  PASS  tx target is our contract: " + (r.to.toLowerCase() === process.env.CONTRACT_ADDRESS.toLowerCase()));
  const v = await contract.verifyCertificate(toBytes32Id(process.env.CERT_ID));
  console.log("  on-chain dataHash: " + v.dataHash);
  console.log("  on-chain status:   " + v.status + "   expiry: " + v.expiryTimestamp.toString());
  console.log("  PASS  on-chain dataHash matches API: " + (v.dataHash === process.env.DATA_HASH));
  console.log("  explorer: https://sepolia.etherscan.io/tx/" + process.env.TX_HASH);
})().catch(e => { console.log("  FAIL  " + (e.shortMessage || e.message)); process.exit(1); });
'
assert "on-chain verification" "$?"

echo
echo "================================"
echo "  $pass passed, $fail failed"
echo "================================"
[ "$fail" -eq 0 ]
