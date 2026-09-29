#!/usr/bin/env bash
#
# Локальный запуск всей системы на эмуляторах Firebase.
#
#   ./scripts/dev.sh emulators   — эмуляторы Auth и Firestore
#   ./scripts/dev.sh seed        — демо-данные
#   ./scripts/dev.sh api         — бэкенд
#   ./scripts/dev.sh web         — панель руководителей
#
# Эмуляторы запускаются первыми и должны работать в отдельном окне:
# сид и бэкенд без них не поднимутся.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Admin SDK подключается к эмуляторам, когда заданы эти переменные.
export FIRESTORE_EMULATOR_HOST="${FIRESTORE_EMULATOR_HOST:-localhost:8080}"
export FIREBASE_AUTH_EMULATOR_HOST="${FIREBASE_AUTH_EMULATOR_HOST:-localhost:9099}"
export FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-corpsol-local}"

# Homebrew ставит openjdk без симлинка в системный путь.
if [ -d /opt/homebrew/opt/openjdk/bin ]; then
  export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
fi

require_java() {
  if ! command -v java >/dev/null 2>&1; then
    echo "Java не найдена — эмулятор Firestore без неё не запустится." >&2
    echo "Установите: brew install openjdk" >&2
    exit 1
  fi
}

case "${1:-}" in
  emulators)
    require_java
    echo "Эмуляторы: Auth :9099, Firestore :8080, интерфейс :4000"
    exec firebase emulators:start --only auth,firestore --project "$FIREBASE_PROJECT_ID"
    ;;

  seed)
    echo "Заполняем демо-данными…"
    exec npm run seed -w @corpsol/api
    ;;

  api)
    echo "Бэкенд: http://localhost:3001/api"
    exec npm run start:dev -w @corpsol/api
    ;;

  web)
    # Панель ходит в эмулятор Auth из браузера, поэтому адрес нужен ей явно.
    export NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
    export NEXT_PUBLIC_FIREBASE_PROJECT_ID="$FIREBASE_PROJECT_ID"
    export NEXT_PUBLIC_FIREBASE_API_KEY="demo-key"
    export NEXT_PUBLIC_API_URL="http://localhost:3001/api"

    echo "Панель: http://localhost:3000"
    exec npm run dev -w @corpsol/web
    ;;

  *)
    echo "Использование: $0 {emulators|seed|api|web}" >&2
    exit 1
    ;;
esac
