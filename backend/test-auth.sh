#!/usr/bin/env bash
# Manual smoke test for the auth endpoints.
#
#   1. Start the server:  npm run dev
#   2. In another shell:  bash test-auth.sh
#
# Uses a unique email each run, so it can be re-run without cleanup.

set -u
BASE="http://localhost:${PORT:-4000}/api"
EMAIL="org-$(date +%s)@example.com"
PASSWORD="correct-horse-battery-staple"
BODYFILE=$(mktemp)
trap 'rm -f "$BODYFILE"' EXIT

pass=0
fail=0

# call <curl args...> -> sets $STATUS and $BODY in the current shell.
# (Assigning from $(...) keeps the globals; running the whole helper in a
# subshell would not.)
call() {
  STATUS=$(curl -s -o "$BODYFILE" -w '%{http_code}' "$@")
  BODY=$(cat "$BODYFILE")
}

# check <label> <expected> <actual> [extra]
check() {
  if [ "$2" = "$3" ]; then
    echo "  PASS  $1 (HTTP $3) ${4:-}"
    pass=$((pass + 1))
  else
    echo "  FAIL  $1 - expected HTTP $2, got $3 ${4:-}"
    fail=$((fail + 1))
  fi
}

json() { node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8"))'"$1" <<<"$BODY" 2>/dev/null; }

echo "== 1. Health =="
call "$BASE/health"
check "GET /api/health" 200 "$STATUS" "-> $BODY"

echo
echo "== 2. Register =="
call -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Acme University\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
check "POST /api/auth/register" 201 "$STATUS"
TOKEN=$(json '.token')
echo "  token: ${TOKEN:0:32}..."
echo "  org:   $(json '.organization' | tr -d '\n')"
case "$BODY" in
  *passwordHash*) echo "  FAIL  response leaked passwordHash"; fail=$((fail + 1)) ;;
  *)              echo "  PASS  response contains no passwordHash"; pass=$((pass + 1)) ;;
esac

echo
echo "== 3. Register validation =="
call -X POST "$BASE/auth/register" -H 'Content-Type: application/json' -d '{}'
check "missing fields rejected" 400 "$STATUS" "-> $BODY"

call -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Dup\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
check "duplicate email rejected" 409 "$STATUS" "-> $BODY"

call -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d '{"name":"Shorty","email":"shorty@example.com","password":"abc"}'
check "short password rejected" 400 "$STATUS"

echo
echo "== 4. Login =="
call -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
check "correct credentials" 200 "$STATUS"
LOGIN_TOKEN=$(json '.token')

call -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrong-password\"}"
check "wrong password" 401 "$STATUS" "-> $BODY"

call -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"whatever12"}'
check "unknown email" 401 "$STATUS" "-> $BODY"

echo
echo "== 5. Protected route =="
call "$BASE/auth/me" -H "Authorization: Bearer $LOGIN_TOKEN"
check "valid token" 200 "$STATUS" "-> $BODY"

call "$BASE/auth/me"
check "no header" 401 "$STATUS" "-> $BODY"

call "$BASE/auth/me" -H "Authorization: Bearer not.a.real.token"
check "garbage token" 401 "$STATUS" "-> $BODY"

call "$BASE/auth/me" -H "Authorization: $LOGIN_TOKEN"
check "missing Bearer prefix" 401 "$STATUS" "-> $BODY"

echo
echo "================================"
echo "  $pass passed, $fail failed"
echo "================================"
[ "$fail" -eq 0 ]
