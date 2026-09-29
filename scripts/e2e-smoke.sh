#!/usr/bin/env bash
#
# Сквозная проверка основного сценария на запущенных эмуляторах и бэкенде:
# вход → привязка телефона → токен терминала → QR → отметка прихода.
#
# Требует: ./scripts/dev.sh emulators, seed и api уже запущены.
set -euo pipefail

API="${API:-http://localhost:3001/api}"
AUTH="http://localhost:9099/identitytoolkit.googleapis.com/v1"
PASSWORD="CorpSol2026!"

# Координаты демо-офиса из сида.
OFFICE_LAT=43.238949
OFFICE_LNG=76.889709

step() { printf '\n▸ %s\n' "$1"; }
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }

sign_in() {
  curl -sf -X POST "$AUTH/accounts:signInWithPassword?key=demo-key" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\",\"returnSecureToken\":true}" \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).idToken))'
}

json_field() {
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const v=JSON.parse(d)$1;console.log(typeof v==='string'?v:JSON.stringify(v))})"
}

step 'Вход администратора'
ADMIN_TOKEN=$(sign_in admin@corpsol.kz) || fail 'администратор не вошёл'
curl -sf -X POST "$API/auth/session" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{}' >/dev/null || fail 'сессия администратора'
echo '  ок'

step 'Выпуск токена терминала'
TERMINAL_TOKEN=$(curl -sf -X POST "$API/attendance/terminal/demo-terminal/access-token" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{}' \
  | json_field '.token') || fail 'токен терминала'
echo "  токен выпущен (${#TERMINAL_TOKEN} символов)"

step 'Экран терминала получает QR'
QR=$(curl -sf "$API/attendance/terminal/demo-terminal/code?token=$TERMINAL_TOKEN" \
  | json_field '.payload') || fail 'QR терминала'
echo "  $QR"

step 'Вход менеджера с телефона'
MOP_TOKEN=$(sign_in mop1@corpsol.kz) || fail 'менеджер не вошёл'
DEVICE=(-H 'x-device-id: e2e-phone-1' -H 'x-device-platform: ios')
curl -sf -X POST "$API/auth/session" -H "Authorization: Bearer $MOP_TOKEN" "${DEVICE[@]}" \
  -H 'Content-Type: application/json' \
  -d '{"device":{"deviceId":"e2e-phone-1","platform":"ios","model":"iPhone"}}' >/dev/null \
  || fail 'сессия менеджера'
echo '  телефон привязан'

step 'Отметка прихода'
BODY=$(node -e "console.log(JSON.stringify({qr:process.argv[1],lat:$OFFICE_LAT,lng:$OFFICE_LNG,accuracyMeters:15,capturedAt:new Date().toISOString()}))" "$QR")
curl -s -X POST "$API/attendance/check-in" -H "Authorization: Bearer $MOP_TOKEN" "${DEVICE[@]}" \
  -H 'Content-Type: application/json' -d "$BODY"
echo

step 'Второй телефон на тот же аккаунт'
curl -s -o /dev/null -w '  HTTP %{http_code}\n' "$API/auth/me" \
  -H "Authorization: Bearer $MOP_TOKEN" -H 'x-device-id: e2e-phone-2' -H 'x-device-platform: android'

step 'Отметка из-за пределов офиса'
FAR=$(node -e "console.log(JSON.stringify({qr:process.argv[1],lat:43.30,lng:76.95,accuracyMeters:15,capturedAt:new Date().toISOString()}))" "$QR")
MOP2_TOKEN=$(sign_in mop2@corpsol.kz)
curl -sf -X POST "$API/auth/session" -H "Authorization: Bearer $MOP2_TOKEN" \
  -H 'x-device-id: e2e-phone-3' -H 'x-device-platform: ios' -H 'Content-Type: application/json' \
  -d '{"device":{"deviceId":"e2e-phone-3","platform":"ios"}}' >/dev/null
curl -s -X POST "$API/attendance/check-in" -H "Authorization: Bearer $MOP2_TOKEN" \
  -H 'x-device-id: e2e-phone-3' -H 'x-device-platform: ios' \
  -H 'Content-Type: application/json' -d "$FAR"
echo
