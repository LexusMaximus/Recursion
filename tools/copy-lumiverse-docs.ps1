# Usage: powershell -File tools/copy-lumiverse-docs.ps1 -Src "C:\path\to\Lumiverse\developer-docs\docs"
param([Parameter(Mandatory=$true)][string]$Src)
if (-not (Test-Path $Src -PathType Container)) { Write-Host "Source folder not found: $Src"; exit 1 }
$Dst = "docs/lumiverse"
$script:missing = 0; $script:copied = 0

$Core = @(
  "index.md","lifecycle.md",
  "getting-started/manifest.md","getting-started/permissions.md","getting-started/quick-start.md",
  "getting-started/runtime.md","getting-started/typescript-setup.md","getting-started/capabilities.md",
  "backend-api/index.md","backend-api/interceptors.md","backend-api/generation.md",
  "backend-api/decisions.md","backend-api/storage.md","backend-api/chats.md",
  "backend-api/characters.md","backend-api/personas.md","backend-api/world-books.md",
  "backend-api/council.md","backend-api/commands.md","backend-api/logging.md",
  "examples/index.md","examples/minimal-backend.md","examples/prompt-interceptor.md","examples/full-stack.md"
)
$Later = @(
  "rest-api.md",
  "getting-started/bundled-server.md",
  "backend-api/chat-mutation.md","backend-api/events.md","backend-api/event-tracking.md",
  "backend-api/tokens.md","backend-api/secure-enclave.md","backend-api/cors-proxy.md",
  "backend-api/ephemeral-storage.md","backend-api/runtime-state.md","backend-api/variables.md",
  "backend-api/frontend-communication.md","backend-api/context-handlers.md",
  "backend-api/message-content-processor.md","backend-api/macro-interceptor.md",
  "backend-api/world-info-interceptor.md","backend-api/presets.md",
  "backend-api/modal.md","backend-api/toast.md","backend-api/theme.md",
  "frontend-api/index.md","frontend-api/ui-placement.md","frontend-api/shared-components.md",
  "frontend-api/dom-helper.md","frontend-api/backend-communication.md","frontend-api/events.md",
  "frontend-api/ui-scaling.md","frontend-api/theme-authoring.md","frontend-api/ui-events-helper.md",
  "frontend-api/message-tags.md","frontend-api/message-preview.md"
)

function Copy-List([string]$Dest, [string[]]$Files) {
  foreach ($f in $Files) {
    $from = Join-Path $Src $f
    if (Test-Path $from -PathType Leaf) {
      $to = Join-Path (Join-Path $Dst $Dest) $f
      New-Item -ItemType Directory -Force -Path (Split-Path $to) | Out-Null
      Copy-Item $from $to
      $script:copied++
    } else {
      Write-Host "MISSING: $f"
      $script:missing++
    }
  }
}

New-Item -ItemType Directory -Force -Path $Dst | Out-Null
Copy-List "ref" $Core
Copy-List "ref-later" $Later
Set-Content -Path (Join-Path $Dst "COPIED.txt") -Value @("Copied from: $Src", "Date: $(Get-Date -Format yyyy-MM-dd)")
Write-Host "$($script:copied) copied, $($script:missing) missing"
