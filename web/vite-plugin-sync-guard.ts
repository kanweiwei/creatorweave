/**
 * vite-plugin-sync-guard
 *
 * Pauses Vite file watching during OPFS → disk sync to prevent mid-sync HMR.
 *
 * Usage (client):
 *   POST /__sync_guard  { "action": "pause", "paths": ["src/a.ts", "src/b.ts"] }
 *   → unwatch specified paths
 *   POST /__sync_guard  { "action": "resume", "paths": ["src/a.ts", "src/b.ts"] }
 *   → re-add paths and send full-reload
 *
 * Only active in dev mode (apply: 'serve').
 */

import type { Plugin, ViteDevServer } from 'vite'
import type { FSWatcher } from 'chokidar'

export function syncGuardPlugin(): Plugin {
  let server: ViteDevServer | null = null

  return {
    name: 'sync-guard',
    apply: 'serve',

    configureServer(s) {
      server = s

      server.middlewares.use('/__sync_guard', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        req.on('end', async () => {
          try {
            const { action, paths } = JSON.parse(body)

            if (!server) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Server not initialized' }))
              return
            }

            const watcher: FSWatcher = server.watcher

            if (action === 'pause') {
              // Unwatch the paths that will be written during sync
              if (Array.isArray(paths) && paths.length > 0) {
                await watcher.unwatch(paths)
              }
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } else if (action === 'resume') {
              // Re-add the paths to watcher
              if (Array.isArray(paths) && paths.length > 0) {
                await watcher.add(paths)
              }
              // Send full-reload to ensure consistent state
              server.hot.send({ type: 'full-reload' })
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } else {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Unknown action' }))
            }
          } catch {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Invalid JSON' }))
          }
        })
      })
    },
  }
}
