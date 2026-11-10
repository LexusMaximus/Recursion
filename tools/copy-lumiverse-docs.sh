#!/usr/bin/env bash
# Usage: bash tools/copy-lumiverse-docs.sh "/path/to/Lumiverse/developer-docs/docs"
# Copies selected Lumiverse developer docs UNCHANGED into docs/lumiverse/.
set -u
SRC="${1:-}"
[ -d "$SRC" ] || { echo "Usage: $0 <path to developer-docs/docs>"; exit 1; }
DST="docs/lumiverse"
missing=0; copied=0

CORE=(
  index.md lifecycle.md
  getting-started/manifest.md getting-started/permissions.md getting-started/quick-start.md
  getting-started/runtime.md getting-started/typescript-setup.md getting-started/capabilities.md
  backend-api/index.md backend-api/interceptors.md backend-api/generation.md
  backend-api/decisions.md backend-api/storage.md backend-api/chats.md
  backend-api/characters.md backend-api/personas.md backend-api/world-books.md
  backend-api/council.md backend-api/commands.md backend-api/logging.md
  examples/index.md examples/minimal-backend.md examples/prompt-interceptor.md examples/full-stack.md
)
LATER=(
  rest-api.md
  getting-started/bundled-server.md
  backend-api/chat-mutation.md backend-api/events.md backend-api/event-tracking.md
  backend-api/tokens.md backend-api/secure-enclave.md backend-api/cors-proxy.md
  backend-api/ephemeral-storage.md backend-api/runtime-state.md backend-api/variables.md
  backend-api/frontend-communication.md backend-api/context-handlers.md
  backend-api/message-content-processor.md backend-api/macro-interceptor.md
  backend-api/world-info-interceptor.md backend-api/presets.md
  backend-api/modal.md backend-api/toast.md backend-api/theme.md
  frontend-api/index.md frontend-api/ui-placement.md frontend-api/shared-components.md
  frontend-api/dom-helper.md frontend-api/backend-communication.md frontend-api/events.md
  frontend-api/ui-scaling.md frontend-api/theme-authoring.md frontend-api/ui-events-helper.md
  frontend-api/message-tags.md frontend-api/message-preview.md
)

copy_list() {
  local dest="$1"; shift
  local f
  for f in "$@"; do
    if [ -f "$SRC/$f" ]; then
      mkdir -p "$DST/$dest/$(dirname "$f")"
      cp "$SRC/$f" "$DST/$dest/$f"
      copied=$((copied+1))
    else
      echo "MISSING: $f"
      missing=$((missing+1))
    fi
  done
}

mkdir -p "$DST"
copy_list ref "${CORE[@]}"
copy_list ref-later "${LATER[@]}"
printf 'Copied from: %s\nDate: %s\n' "$SRC" "$(date +%F)" > "$DST/COPIED.txt"
echo "$copied copied, $missing missing"
