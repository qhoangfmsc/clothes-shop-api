#!/usr/bin/env bash
# Smoke boot production (docs/specs/common/0015): migrate từ DB trống → chạy bản build ở NODE_ENV=production → GET /health.
# Chỉ chạy trên DB có tên kết thúc _test hoặc _smoke (schema bị xoá và dựng lại). Dùng kết nối của .env.test nếu không đặt POSTGRES_*.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.test ]; then set -a; . ./.env.test; set +a; fi
export POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}" POSTGRES_PORT="${POSTGRES_PORT:-55432}"
export POSTGRES_USERNAME="${POSTGRES_USERNAME:-test}" POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-test}"
export POSTGRES_DATABASE="${POSTGRES_DATABASE:-clothes_shop_test}"

case "$POSTGRES_DATABASE" in
  *_test | *_smoke) ;;
  *) echo "smoke-prod: từ chối chạy trên DB '$POSTGRES_DATABASE' (phải kết thúc _test hoặc _smoke)" >&2; exit 2 ;;
esac

PORT="${SMOKE_PORT:-7999}"
LOG="$(mktemp)"
APP_PID=""
cleanup() {
  if [ -n "$APP_PID" ]; then kill "$APP_PID" 2>/dev/null || true; wait "$APP_PID" 2>/dev/null || true; fi
  rm -f "$LOG"
}
trap cleanup EXIT

# Cấu hình production hợp lệ nhưng giả: không phải secret thật
prod_env() {
  env NODE_ENV=production PORT="$PORT" \
    JWT_SECRET="smoke-secret-smoke-secret-smoke-secret-0123456789" \
    GOOGLE_CLIENT_ID="smoke-client-id" SEPAY_WEBHOOK_SECRET="smoke-webhook-secret" \
    SEPAY_RECEIVING_ACCOUNT="0000000000" CORS_ORIGINS="https://example.com" "$@"
}

if [ "${SKIP_BUILD:-0}" != "1" ]; then echo "[smoke] build"; yarn -s build; fi

echo "[smoke] reset schema trên $POSTGRES_DATABASE"
node -e "
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: process.env.POSTGRES_HOST, port: +process.env.POSTGRES_PORT, user: process.env.POSTGRES_USERNAME, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DATABASE });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
"

echo "[smoke] migration từ DB trống"
yarn -s migration:run >"$LOG" 2>&1 || { cat "$LOG"; echo "[smoke] FAIL: migration" >&2; exit 1; }

echo "[smoke] cấu hình production thiếu JWT_SECRET phải bị từ chối khởi động"
prod_env JWT_SECRET="" node dist/src/main.js >"$LOG" 2>&1 &
BAD_PID=$!
for _ in $(seq 1 30); do kill -0 "$BAD_PID" 2>/dev/null || break; sleep 1; done
if kill -0 "$BAD_PID" 2>/dev/null; then
  kill "$BAD_PID" 2>/dev/null || true
  echo "[smoke] FAIL: app vẫn chạy với JWT_SECRET rỗng" >&2; exit 1
fi
grep -q "JWT_SECRET" "$LOG" || { echo "[smoke] FAIL: không thấy thông báo lỗi về JWT_SECRET" >&2; cat "$LOG"; exit 1; }

echo "[smoke] chạy bản build ở production"
prod_env node dist/src/main.js >"$LOG" 2>&1 &
APP_PID=$!
for _ in $(seq 1 60); do
  if body="$(curl -fsS "http://127.0.0.1:$PORT/health" 2>/dev/null)"; then break; fi
  kill -0 "$APP_PID" 2>/dev/null || { echo "[smoke] FAIL: app thoát sớm" >&2; cat "$LOG"; exit 1; }
  sleep 1
done
echo "${body:-}" | grep -q '"status":"ok"' || { echo "[smoke] FAIL: /health không ok: ${body:-<rỗng>}" >&2; cat "$LOG"; exit 1; }
echo "${body}" | grep -q '"db":"connected"' || { echo "[smoke] FAIL: DB không kết nối: $body" >&2; exit 1; }
code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/admin/orders")"
[ "$code" = "401" ] || { echo "[smoke] FAIL: route admin không đăng nhập phải 401, nhận $code" >&2; exit 1; }
echo "[smoke] OK: migrate từ trống, từ chối cấu hình sai, /health ok, route admin 401"
