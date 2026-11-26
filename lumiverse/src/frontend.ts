// Step 7: minimal drawer tab — enable toggle, connection picker with a
// "use default" option, and a status readout from backend messages.
// Docs: frontend module contract (frontend-api/index.md:3-28); drawer tab
// (ui-placement.md:9-74, free — permissions.md:16); switch/select components
// (shared-components.md:36-39, 380-407; free — frontend-api/index.md:45);
// messaging (backend-communication.md:3-21, free — permissions.md:21).
// The connection list and settings persistence live behind the backend
// (connections is backend-only: generation.md:753; no frontend API in docs).
// The frontend renders ONLY the backend's state reply — never a local flip.

import type { SpindleFrontendContext } from 'lumiverse-spindle-types'

type ConnectionOption = {
  id: string
  name: string
  provider: string
  model: string
  is_default: boolean
}

type StateMessage = {
  type: 'state'
  enabled: boolean
  connectionId: string
  connections: ConnectionOption[]
}

// Backend readout: status label, stage name, ms, counts ONLY (manager rule 6).
type RunStatusMessage = {
  type: 'run_status'
  status: string
  stage?: string
  ms?: number
  blocks?: number
  promptMessages?: number
}

type BackendMessage = StateMessage | RunStatusMessage | { type: 'error' }

export function setup(ctx: SpindleFrontendContext) {
  const tab = ctx.ui.registerDrawerTab({
    id: 'recursion',
    title: 'Recursion',
    shortName: 'Recursion',
    headerTitle: 'Recursion',
    description: 'Recursion pre-generation settings: enable toggle and connection picker',
    keywords: ['recursion', 'guidance', 'cards', 'connection'],
  })

  const root = tab.root
  root.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:12px'

  const stateLine = document.createElement('div')
  stateLine.textContent = 'Loading...'
  root.appendChild(stateLine)

  const enabledRow = document.createElement('div')
  enabledRow.style.cssText = 'display:flex;align-items:center;gap:8px'
  const enabledLabel = document.createElement('div')
  enabledLabel.textContent = 'Enabled'
  const enabledSlot = document.createElement('div')
  enabledRow.appendChild(enabledLabel)
  enabledRow.appendChild(enabledSlot)
  root.appendChild(enabledRow)

  const connLabel = document.createElement('div')
  connLabel.textContent = 'Connection'
  const connSlot = document.createElement('div')
  root.appendChild(connLabel)
  root.appendChild(connSlot)

  const readout = document.createElement('div')
  readout.style.cssText =
    'color:var(--lumiverse-text-muted,inherit);font-size:12px;white-space:pre-wrap'
  root.appendChild(readout)

  // Toggle/picker changes are SENT to the backend; the UI only updates from
  // the backend's state reply (manager rule 7) — no local flip.
  const toggle = ctx.components.mountSwitch(enabledSlot, {
    checked: false,
    onChange: (on) => ctx.sendToBackend({ type: 'set_enabled', value: on }),
  })

  const picker = ctx.components.mountSelect(connSlot, {
    value: '',
    placeholder: 'Use default',
    emptyMessage: 'No connection profiles available',
    onChange: (value) => ctx.sendToBackend({ type: 'set_connection', value }),
    options: [],
  })

  const requestState = () => ctx.sendToBackend({ type: 'get_state' })
  requestState()
  const unsubActivate = tab.onActivate(requestState)

  const formatStatus = (message: RunStatusMessage): string => {
    const parts = [`last run: ${message.status}`]
    if (typeof message.stage === 'string' && message.stage) parts.push(`stage=${message.stage}`)
    if (typeof message.ms === 'number') parts.push(`ms=${message.ms}`)
    if (typeof message.blocks === 'number') parts.push(`blocks=${message.blocks}`)
    if (typeof message.promptMessages === 'number') {
      parts.push(`promptMessages=${message.promptMessages}`)
    }
    return parts.join(' ')
  }

  const unsubBackend = ctx.onBackendMessage((payload) => {
    const message = payload as BackendMessage
    if (!message || typeof message !== 'object') return
    switch (message.type) {
      case 'state': {
        const connections = Array.isArray(message.connections) ? message.connections : []
        const savedId = typeof message.connectionId === 'string' ? message.connectionId : ''
        toggle.update({ checked: message.enabled === true })
        picker.update({
          options: [
            { value: '', label: 'Use default' },
            ...connections.map((connection) => ({
              value: connection.id,
              label: connection.name || connection.id,
              sublabel: [connection.provider, connection.model].filter(Boolean).join(' / '),
            })),
          ],
          value: savedId,
        })
        if (message.enabled !== true) {
          stateLine.textContent = 'Disabled'
        } else {
          const chosen = connections.find((connection) => connection.id === savedId)
          stateLine.textContent = `Enabled - connection: ${
            savedId ? chosen?.name ?? savedId : 'use default'
          }`
        }
        return
      }
      case 'run_status':
        readout.textContent = formatStatus(message)
        return
      case 'error':
        readout.textContent = 'last action failed - see server log'
        return
      default:
        return
    }
  })

  // Cleanup (ui-placement.md:47; shared-components.md:41-45 pattern): destroy
  // mounted components and the tab; unsubscribe listeners.
  return () => {
    unsubBackend()
    unsubActivate()
    toggle.destroy()
    picker.destroy()
    tab.destroy()
  }
}
