#!/usr/bin/env bash
# Kiểm tra sau deploy (docs/specs/common/0018): chờ bản mới lên, rồi kiểm sống.
# Dùng: scripts/post-deploy-check.sh <base-url> [commit-mong-đợi]
# Biến: TIMEOUT_SECONDS (mặc định 900), INTERVAL_SECONDS (mặc định 15). Không có commit mong đợi thì chỉ kiểm sống.
set -euo pipefail

BASE="${1:?Dùng: post-deploy-check.sh <base-url> [commit]}"
BASE="${BASE%/}"
EXPECTED="${2:-${EXPECTED_COMMIT:-}}"
TIMEOUT="${TIMEOUT_SECONDS:-900}"
INTERVAL="${INTERVAL_SECONDS:-15}"

field() { node -e "try{const v=JSON.parse(process.argv[1])[process.argv[2]];console.log(v==null?'':v)}catch{console.log('')}" "$1" "$2"; }
matches() { [ -z "$EXPECTED" ] || { [ -n "$1" ] && { [[ "$EXPECTED" == "$1"* ]] || [[ "$1" == "$EXPECTED"* ]]; }; }; }

deadline=$(( $(date +%s) + TIMEOUT ))
body=""
while :; do
  if body="$(curl -fsS --max-time 10 "$BASE/health" 2>/dev/null)"; then
    commit="$(field "$body" commit)"
    if matches "$commit"; then break; fi
    echo "[post-deploy] đang chờ bản mới: đang chạy commit '${commit:-không rõ}', mong đợi '$EXPECTED'"
  else
    echo "[post-deploy] /health chưa trả lời"
  fi
  [ "$(date +%s)" -lt "$deadline" ] || { echo "[post-deploy] FAIL: quá ${TIMEOUT}s mà bản mong đợi chưa lên hoặc /health chưa sống" >&2; exit 1; }
  sleep "$INTERVAL"
done

[ "$(field "$body" status)" = "ok" ] || { echo "[post-deploy] FAIL: /health status != ok: $body" >&2; exit 1; }
[ "$(field "$body" db)" = "connected" ] || { echo "[post-deploy] FAIL: DB không kết nối: $body" >&2; exit 1; }

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/api/products?limit=1")"
[ "$code" = "200" ] || { echo "[post-deploy] FAIL: GET /api/products?limit=1 trả $code (mong đợi 200)" >&2; exit 1; }

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/api/admin/orders")"
[ "$code" = "401" ] || { echo "[post-deploy] FAIL: route admin không đăng nhập phải 401, nhận $code" >&2; exit 1; }

echo "[post-deploy] OK: $BASE chạy commit '${commit:-không rõ}', DB kết nối, route công khai 200, route admin 401"
