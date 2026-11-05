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
SMOKE_COMMIT="smoke0123456789abcdef"
LOG="$(mktemp)"
APP_PID=""
cleanup() {
  if [ -n "$APP_PID" ]; then kill "$APP_PID" 2>/dev/null || true; wait "$APP_PID" 2>/dev/null || true; fi
  rm -f "$LOG"
}
trap cleanup EXIT

# Cấu hình production hợp lệ nhưng giả: không phải secret thật
# exec: tiến trình chạy nền chính là node, để cleanup kill đúng nó (không để app mồ côi chiếm cổng)
prod_env() {
  exec env NODE_ENV=production PORT="$PORT" \
    JWT_SECRET="smoke-secret-smoke-secret-smoke-secret-0123456789" \
    GOOGLE_CLIENT_ID="smoke-client-id" SEPAY_WEBHOOK_SECRET="smoke-webhook-secret" \
    SEPAY_RECEIVING_ACCOUNT="0000000000" CORS_ORIGINS="https://example.com" \
    RENDER_GIT_COMMIT="$SMOKE_COMMIT" "$@"
}

if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/health"; then
  echo "[smoke] FAIL: cổng $PORT đang có tiến trình khác trả lời (app cũ còn sót?). Tắt nó hoặc đặt SMOKE_PORT khác." >&2; exit 2
fi

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
echo "[smoke] kiểm tra sau deploy (cùng script production dùng)"
TIMEOUT_SECONDS=20 INTERVAL_SECONDS=1 bash scripts/post-deploy-check.sh "http://127.0.0.1:$PORT" "$SMOKE_COMMIT" >/dev/null || { echo "[smoke] FAIL: post-deploy-check với đúng commit" >&2; exit 1; }
if TIMEOUT_SECONDS=2 INTERVAL_SECONDS=1 bash scripts/post-deploy-check.sh "http://127.0.0.1:$PORT" "not-the-deployed-commit" >/dev/null 2>&1; then
  echo "[smoke] FAIL: post-deploy-check phải đỏ khi commit đang chạy khác commit mong đợi" >&2; exit 1
fi

echo "[smoke] log production là JSON, có requestId, không lộ query"
curl -s -o /dev/null -H 'x-request-id: smoke-req-1' "http://127.0.0.1:$PORT/api/size-guides/tops?secret=do-not-log"
sleep 1
node -e "
const lines = require('fs').readFileSync(process.argv[1], 'utf8').split('\n').filter(Boolean);
const bad = lines.filter((line) => { try { JSON.parse(line); return false; } catch { return true; } });
if (bad.length) { console.error('dòng log không phải JSON:', bad[0]); process.exit(1); }
const entry = lines.map((l) => JSON.parse(l)).find((l) => l.message && l.message.event === 'request' && l.message.requestId === 'smoke-req-1');
if (!entry) { console.error('không thấy dòng log request có requestId'); process.exit(1); }
if (entry.message.path !== '/api/size-guides/tops' || JSON.stringify(entry).includes('do-not-log')) { console.error('log lộ query hoặc sai path:', JSON.stringify(entry)); process.exit(1); }
if (lines.some((l) => JSON.parse(l).message === '/health' || (JSON.parse(l).message || {}).path === '/health')) { console.error('probe /health không được ghi log'); process.exit(1); }
" "$LOG" || { echo "[smoke] FAIL: kiểm tra log" >&2; cat "$LOG"; exit 1; }
echo "[smoke] OK: migrate từ trống (có khoá), từ chối cấu hình sai, /health ok + commit, kiểm tra sau deploy, route admin 401, log JSON"
