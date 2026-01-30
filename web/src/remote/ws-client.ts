/**
 * WebSocket Client - connects to the relay server with reconnection and heartbeat.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Heartbeat ping/pong to detect stale connections
 * - Event-based message dispatching
 * - Graceful close and cleanup
 */

import type { WireMessage, RemoteMessage } from './remote-protocol'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface WSClientCallbacks {
  onStateChange?: (state: ConnectionState) => void
  onMessage?: (message: RemoteMessage) => void
  onError?: (error: string) => void
}

/** Reconnection configuration */
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000
const RECONNECT_MAX_ATTEMPTS = 10
const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 10_000

export class WSClient {
  private ws: WebSocket | null = null
  private url: string
  private callbacks: WSClientCallbacks
  private state: ConnectionState = 'disconnected'
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null
  private intentionallyClosed = false

  constructor(url: string, callbacks: WSClientCallbacks) {
    this.url = url
    this.callbacks = callbacks
  }

  /** Get current connection state */
  getState(): ConnectionState {
    return this.state
  }

  /** Connect to the relay server */
  connect(): void {
    if (this.ws && (this.state === 'connected' || this.state === 'connecting')) {
      return
    }

    this.intentionallyClosed = false
    this.setState('connecting')

    try {
      this.ws = new WebSocket(this.url)
      this.ws.onopen = this.handleOpen.bind(this)
      this.ws.onclose = this.handleClose.bind(this)
      this.ws.onerror = this.handleError.bind(this)
      this.ws.onmessage = this.handleMessage.bind(this)
    } catch (e) {
      this.callbacks.onError?.(`Connection failed: ${e instanceof Error ? e.message : String(e)}`)
      this.scheduleReconnect()
    }
  }

  /** Send a message through the WebSocket */
  send(message: WireMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false
    }

    try {
      this.ws.send(JSON.stringify(message))
      return true
    } catch {
      return false
    }
  }

  /** Gracefully close the connection */
  close(): void {
    this.intentionallyClosed = true
    this.cleanup()
    this.setState('disconnected')
  }

  /** Update the server URL (for reconnection to a different server) */
  setUrl(url: string): void {
    this.url = url
  }

  // ---- Private ----

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state
      this.callbacks.onStateChange?.(state)
    }
  }

  private handleOpen(): void {
    this.reconnectAttempt = 0
    this.setState('connected')
    this.startHeartbeat()
  }

  private handleClose(): void {
    this.stopHeartbeat()

    if (this.intentionallyClosed) {
      this.setState('disconnected')
    } else {
      this.scheduleReconnect()
    }
  }

  private handleError(): void {
    this.callbacks.onError?.('WebSocket error')
  }

  private handleMessage(event: MessageEvent): void {
    // Reset heartbeat timeout on any received message
    this.clearHeartbeatTimeout()

    try {
      const data = JSON.parse(event.data as string)

      // Handle pong internally
      if (data.type === 'pong') {
        return
      }

      this.callbacks.onMessage?.(data as RemoteMessage)
    } catch {
      this.callbacks.onError?.('Failed to parse message')
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionallyClosed) return
    if (this.reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      this.callbacks.onError?.('Max reconnection attempts reached')
      this.setState('disconnected')
      return
    }

    this.setState('reconnecting')

    // Exponential backoff with jitter
    const baseDelay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_MS
    )
    const jitter = Math.random() * baseDelay * 0.3
    const delay = baseDelay + jitter

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++
      this.connect()
    }, delay)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', timestamp: Date.now() })

        // Set timeout for pong response
        this.heartbeatTimeout = setTimeout(() => {
          // No pong received — connection is stale
          this.ws?.close()
        }, HEARTBEAT_TIMEOUT_MS)
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.clearHeartbeatTimeout()
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  private cleanup(): void {
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.onmessage = null
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close()
      }
      this.ws = null
    }
  }
}
