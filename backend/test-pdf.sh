#!/usr/bin/env bash
# End-to-end test for PDF certificate generation and download.
#
#   1. Start the server:  npm run dev
#   2. In another shell:  bash test-pdf.sh
#
# NOTE: issues a REAL certificate on Sepolia (spends test ETH, takes ~10s).

set -u
BASE="http://localhost:${PORT:-4000}/api"
EMAIL="pdf-$(date +%s)@example.com"
PASSWORD="correct-horse-battery-staple"
ORG_NAME="Riverside Institute of Technology"
BODYFILE=$(mktemp)
OUTDIR=$(mktemp -d)
trap 'rm -f "$BODYFILE"; rm -rf "$OUTDIR"' EXIT

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

echo "== 1. Register =="
call -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"$ORG_NAME\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
check "register" 201 "$STATUS"
TOKEN=$(json '.token')

echo
echo "== 2. Issue a certificate (real Sepolia tx) =="
START=$(date +%s)
call -X POST "$BASE/certificates" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"recipientName":"Ada Lovelace","recipientEmail":"ada@example.com","courseName":"BSc Computer Science"}'
ELAPSED=$(( $(date +%s) - START ))
check "issue" 201 "$STATUS" "(${ELAPSED}s)"
CERT_ID=$(json '.certificate.certificateId')
PDF_GEN=$(json '.pdfGenerated')
VERIFY_URL=$(json '.verificationUrl')
echo "  certificateId:   $CERT_ID"
echo "  pdfGenerated:    $PDF_GEN"
echo "  verificationUrl: $VERIFY_URL"
assert "pdfGenerated is true" "$([ "$PDF_GEN" = "true" ] && echo 0 || echo 1)"

echo
echo "== 3. Download the PDF =="
PDF="$OUTDIR/$CERT_ID.pdf"
HTTP=$(curl -s --max-time 60 -o "$PDF" -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" "$BASE/certificates/$CERT_ID/pdf")
check "GET /api/certificates/:id/pdf" 200 "$HTTP"

CTYPE=$(curl -s --max-time 60 -o /dev/null -D - -H "Authorization: Bearer $TOKEN" \
  "$BASE/certificates/$CERT_ID/pdf" | tr -d '\r' | grep -i '^content-type:' | head -1)
CDISP=$(curl -s --max-time 60 -o /dev/null -D - -H "Authorization: Bearer $TOKEN" \
  "$BASE/certificates/$CERT_ID/pdf" | tr -d '\r' | grep -i '^content-disposition:' | head -1)
echo "  $CTYPE"
echo "  $CDISP"
printf '%s' "$CTYPE" | grep -qi 'application/pdf'; assert "Content-Type is application/pdf" "$?"
printf '%s' "$CDISP" | grep -qi "attachment"; assert "served as attachment" "$?"

SIZE=$(wc -c < "$PDF" | tr -d ' ')
echo "  file size: $SIZE bytes"
assert "file is non-trivial (>3kb)" "$([ "$SIZE" -gt 3000 ] && echo 0 || echo 1)"

MAGIC=$(head -c 5 "$PDF")
assert "starts with %PDF magic bytes" "$([ "$MAGIC" = "%PDF-" ] && echo 0 || echo 1)" "-> $MAGIC"

echo
echo "== 4. Decode the QR out of the downloaded PDF =="
DECODED=$(node decode-pdf-qr.js "$PDF" 2>&1 | tail -1)
echo "  decoded: $DECODED"
EXPECTED="http://localhost:3000/verify/$CERT_ID"
assert "QR decodes to the verification URL" \
  "$([ "$DECODED" = "$EXPECTED" ] && echo 0 || echo 1)" "(expected $EXPECTED)"

echo
echo "== 5. PDF structure and text content =="
PAGEINFO=$(node -e '
const fs=require("fs");const {PDFDocument}=require("pdf-lib");
PDFDocument.load(fs.readFileSync(process.argv[1])).then(d=>{
  const p=d.getPage(0);
  console.log(d.getPageCount()+" page(s), "+p.getWidth().toFixed(0)+"x"+p.getHeight().toFixed(0));
});' "$PDF")
echo "  $PAGEINFO (A4 landscape = 842x595)"
assert "single A4 landscape page" \
  "$(printf '%s' "$PAGEINFO" | grep -q '^1 page(s), 842x595$' && echo 0 || echo 1)"

TEXT=$(node extract-pdf-text.js "$PDF")
echo "  --- extracted text ---"
printf '%s\n' "$TEXT" | sed 's/^/    /'
echo "  ----------------------"

while IFS= read -r want; do
  printf '%s' "$TEXT" | grep -qF "$want"
  assert "text contains: $want" "$?"
done <<LIST
CERTIFICATE
OF COMPLETION
This is to certify that
Ada Lovelace
BSc Computer Science
ISSUE DATE
EXPIRY DATE
No Expiry
$CERT_ID
$ORG_NAME
ISSUING ORGANIZATION
SCAN TO VERIFY
$VERIFY_URL
LIST

echo
echo "== 6. Access control =="
HTTP=$(curl -s --max-time 60 -o /dev/null -w '%{http_code}' "$BASE/certificates/$CERT_ID/pdf")
check "no token" 401 "$HTTP"

HTTP=$(curl -s --max-time 60 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" \
  "$BASE/certificates/CERT-2026-NOPE00/pdf")
check "unknown certificate" 404 "$HTTP"

call -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Rival Org\",\"email\":\"rival-$(date +%s)@example.com\",\"password\":\"$PASSWORD\"}"
OTHER=$(json '.token')
HTTP=$(curl -s --max-time 60 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $OTHER" \
  "$BASE/certificates/$CERT_ID/pdf")
check "another org cannot download it" 404 "$HTTP"

echo
echo "== 7. Regenerates if the cached file is deleted =="
rm -f "storage/pdfs/$CERT_ID.pdf"
assert "cached file removed" "$([ ! -f "storage/pdfs/$CERT_ID.pdf" ] && echo 0 || echo 1)"
HTTP=$(curl -s --max-time 60 -o "$OUTDIR/regen.pdf" -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" "$BASE/certificates/$CERT_ID/pdf")
check "re-download after delete" 200 "$HTTP"
assert "regenerated file is a PDF" "$([ "$(head -c 5 "$OUTDIR/regen.pdf")" = "%PDF-" ] && echo 0 || echo 1)"

# Keep a copy for inspection.
cp "$PDF" "./sample-certificate.pdf"
echo
echo "  saved a copy to backend/sample-certificate.pdf"

echo
echo "================================"
echo "  $pass passed, $fail failed"
echo "================================"
[ "$fail" -eq 0 ]
