// @ts-nocheck - Worker file with dynamic imports cannot be fully typed
/**
 * Pyodide Worker - Runs Python code in a separate thread using Pyodide
 *
 * Features:
 * - Lazy loads Pyodide from local bundle on first use
 * - Mounts native directories using mountNativeFS
 * - Automatic package loading via loadPackagesFromImports
 * - Captures stdout/stderr for print output
 * - Handles matplotlib image output
 * - Supports file input/output from /mnt
 */

//=============================================================================
// Constants
//=============================================================================

/** Default execution timeout in milliseconds */
const DEFAULT_TIMEOUT = 30000

//=============================================================================
// Type Definitions
//=============================================================================

/**
 * @typedef {Object} FileRef
 * @property {string} name
 * @property {ArrayBuffer} content
 */

/**
 * @typedef {Object} ImageOutput
 * @property {string} filename
 * @property {string} data - base64
 */

/**
 * @typedef {Object} ExecuteResult
 * @property {boolean} success
 * @property {unknown} [result]
 * @property {string} [stdout]
 * @property {string} [stderr]
 * @property {ImageOutput[]} [images]
 * @property {number} executionTime
 * @property {string} [error]
 */

//=============================================================================
// Worker State
//=============================================================================

/** @type {any} */
let pyodide = null

/** @type {Promise<any>} */
let pyodideReadyPromise = null

/** @type {any} NativeFS handle for syncing changes back */
let nativefs = null

/** @type {FileSystemDirectoryHandle | null} Current mounted directory handle */
let currentDirHandle = null

// Stdout/stderr capture
/** @type {string[]} */
let stdoutBuffer = []
/** @type {string[]} */
let stderrBuffer = []

//=============================================================================
// Message Handler
//=============================================================================

/**
 * Initialize Pyodide dynamically (works with classic workers)
 */
async function initPyodide() {
  if (pyodideReadyPromise) return pyodideReadyPromise

  pyodideReadyPromise = (async () => {
    // Dynamic import for classic worker compatibility
    const { loadPyodide } = await import('pyodide')

    // Use CDN in development, local files in production
    const isDev = import.meta.env?.DEV ?? false
    const indexURL = isDev ? 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/' : '/assets/pyodide'

    const instance = await loadPyodide({
      indexURL,
    })

    // Set up stdout/stderr capture
    instance.setStdout({
      batched: (text) => {
        stdoutBuffer.push(text)
      }
    })
    instance.setStderr({
      batched: (text) => {
        stderrBuffer.push(text)
      }
    })

    return instance
  })()

  return pyodideReadyPromise
}

/**
 * Convert ArrayBuffer to base64 efficiently (without spread operator)
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Send response message to main thread
 * @param {string} id
 * @param {boolean} success
 * @param {object} result
 */
function sendResponse(id, success, result) {
  self.postMessage({ id, success, result })
}

/**
 * Send error response to main thread
 * @param {string} id
 * @param {string} errorMessage
 */
function sendError(id, errorMessage) {
  console.error('[Pyodide Worker] Operation failed:', errorMessage)
  sendResponse(id, false, { success: false, error: errorMessage })
}

/**
 * Check if two directory handles refer to the same directory
 * @param {FileSystemDirectoryHandle} handle1
 * @param {FileSystemDirectoryHandle} handle2
 * @returns {boolean}
 */
function isSameHandle(handle1, handle2) {
  if (!handle1 || !handle2) return false
  // For same object reference
  if (handle1 === handle2) return true
  // For different references to same directory, compare by name
  // Note: In browsers, the same directory requested multiple times may return
  // different object references, so we need to compare by a stable identifier
  return handle1.name === handle2.name
}

/**
 * Mount directory handle to /mnt using mountNativeFS
 * @param {FileSystemDirectoryHandle} dirHandle
 */
async function ensureMounted(dirHandle) {
  // Validate pyodide is initialized
  if (!pyodide) {
    throw new Error('Pyodide not initialized. Call initPyodide() first.')
  }

  // Reuse existing mount if same directory (using stable comparison)
  if (isSameHandle(currentDirHandle, dirHandle) && nativefs) {
    console.log('[Pyodide Worker] Reusing existing mount for', dirHandle.name)
    return
  }

  console.log('[Pyodide Worker] ensureMounted called for', dirHandle.name, 'current:', currentDirHandle?.name)

  // Step 1: Sync and clean up existing nativefs handle
  if (nativefs) {
    try {
      // Sync from memory to filesystem (writes changes back to browser storage)
      await nativefs.syncfs()
      console.log('[Pyodide Worker] Synced existing nativefs before unmount')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn('[Pyodide Worker] Sync failed during cleanup:', msg)
    }
    nativefs = null
  }
  currentDirHandle = null

  // Step 2: Force unmount /mnt if it's a mount point
  // IMPORTANT: We need to completely remove /mnt before calling mountNativeFS again
  // because ensureMountPathExists checks isMountpoint() and throws if already mounted
  try {
    const mntPath = pyodide.FS.analyzePath('/mnt')
    console.log('[Pyodide Worker] /mnt analyzePath before cleanup:', {
      exists: mntPath.exists,
      mountPoint: mntPath.mountPoint
    })

    // Keep trying to unmount until it's no longer a mount point
    let attempts = 0
    const maxAttempts = 3
    while (mntPath.mountPoint && attempts < maxAttempts) {
      attempts++
      console.log(`[Pyodide Worker] /mnt is a mount point (attempt ${attempts}), unmounting...`)

      pyodide.FS.unmount('/mnt')
      console.log('[Pyodide Worker] Unmounted /mnt')

      // Re-check after unmount
      const recheck = pyodide.FS.analyzePath('/mnt')
      if (!recheck.mountPoint) {
        console.log('[Pyodide Worker] /mnt is no longer a mount point')
        break
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn('[Pyodide Worker] Unmount failed:', msg)
  }

  // Step 3: Remove /mnt directory completely if it exists
  // This is critical because mountNativeFS calls mkdirTree which will fail
  // if the directory exists and is detected as a mount point
  try {
    const mntPath = pyodide.FS.analyzePath('/mnt')
    if (mntPath.exists) {
      if (mntPath.mountPoint) {
        // Still a mount point - this shouldn't happen but let's handle it
        console.warn('[Pyodide Worker] /mnt is still a mount point after unmount, forcing unmount again')
        try {
          pyodide.FS.unmount('/mnt')
        } catch (e) {
          console.warn('[Pyodide Worker] Force unmount failed:', e)
        }
      }

      // Remove the directory if it still exists
      const finalCheck = pyodide.FS.analyzePath('/mnt')
      if (finalCheck.exists && !finalCheck.mountPoint) {
        console.log('[Pyodide Worker] Removing /mnt directory...')
        pyodide.FS.rmdir('/mnt')
        console.log('[Pyodide Worker] Removed /mnt directory')
      } else if (finalCheck.mountPoint) {
        // Last resort: try to unmount one more time
        console.warn('[Pyodide Worker] /mnt still reports as mount point, final unmount attempt')
        try {
          pyodide.FS.unmount('/mnt')
          // Try to remove after final unmount
          const afterFinal = pyodide.FS.analyzePath('/mnt')
          if (afterFinal.exists && !afterFinal.mountPoint) {
            pyodide.FS.rmdir('/mnt')
            console.log('[Pyodide Worker] Final cleanup successful')
          }
        } catch (e) {
          console.error('[Pyodide Worker] Final cleanup failed:', e)
        }
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn('[Pyodide Worker] Directory removal failed:', msg)
  }

  // Step 4: Mount using mountNativeFS
  console.log('[Pyodide Worker] Mounting new directory handle to /mnt...')
  try {
    nativefs = await pyodide.mountNativeFS('/mnt', dirHandle)
    currentDirHandle = dirHandle
    console.log(`[Pyodide Worker] Directory "${dirHandle.name}" mounted at /mnt`)
  } catch (mountError) {
    console.error('[Pyodide Worker] Mount failed:', mountError)
    // If mount fails, check the state and provide better error info
    const finalState = pyodide.FS.analyzePath('/mnt')
    console.error('[Pyodide Worker] Final /mnt state:', {
      exists: finalState.exists,
      mountPoint: finalState.mountPoint
    })
    throw mountError
  }
}

/**
 * Capture and clear stdout/stderr buffers
 * @returns {{ stdout?: string, stderr?: string }}
 */
function captureOutput() {
  const stdout = stdoutBuffer.join('\n')
  const stderr = stderrBuffer.join('\n')
  stdoutBuffer = []
  stderrBuffer = []
  return {
    stdout: stdout || undefined,
    stderr: stderr || undefined,
  }
}

self.onmessage = async (/** @type {MessageEvent<any>} */ e) => {
  const { id, type } = e.data

  // Handle 'mount' type - mount a directory to /mnt
  if (type === 'mount') {
    try {
      if (!pyodide) {
        pyodide = await initPyodide()
      }
      await ensureMounted(e.data.dirHandle)
      sendResponse(id, true, { success: true })
    } catch (error) {
      sendError(id, error instanceof Error ? error.message : String(error))
    }
    return
  }

  // Handle 'sync' type - sync changes back to native filesystem
  if (type === 'sync') {
    try {
      if (nativefs) {
        await nativefs.syncfs()
        console.log('[Pyodide Worker] Filesystem synced successfully')
        sendResponse(id, true, { success: true })
      } else {
        sendError(id, 'No mounted filesystem to sync')
      }
    } catch (error) {
      sendError(id, error instanceof Error ? error.message : String(error))
    }
    return
  }

  // Handle 'unmount' type - cleanup filesystem
  if (type === 'unmount') {
    try {
      nativefs = null
      currentDirHandle = null
      console.log('[Pyodide Worker] Filesystem unmounted')
      sendResponse(id, true, { success: true })
    } catch (error) {
      sendError(id, error instanceof Error ? error.message : String(error))
    }
    return
  }

  // Handle 'execute' type - run Python code
  const { code, files = [], timeout = DEFAULT_TIMEOUT, mountDir, syncFs } = e.data

  const startTime = performance.now()
  /** @type {number | undefined} */
  let timeoutId = undefined

  try {
    // Initialize Pyodide on first use
    if (!pyodide) {
      pyodide = await initPyodide()
    }

    // Handle mountDir if provided (mountNativeFS)
    if (mountDir) {
      await ensureMounted(mountDir)
    } else {
      // Ensure /mnt directory exists for regular file injection
      if (!pyodide.FS.analyzePath('/mnt').exists) {
        pyodide.FS.mkdir('/mnt')
      }

      // Inject files into /mnt
      if (files.length > 0) {
        for (const file of files) {
          const filePath = `/mnt/${file.name}`
          const data = new Uint8Array(file.content)
          pyodide.FS.writeFile(filePath, data)
        }
      }
    }

    // Load matplotlib first (it's imported in the wrapper code)
    await pyodide.loadPackage('matplotlib')

    // Auto-load packages based on imports in the user code
    await pyodide.loadPackagesFromImports(code)

    // Execute code with timeout (properly cleanup timeout)
    const executePromise = pyodide.runPythonAsync(code)
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Execution timeout after ${timeout}ms`)), timeout)
    })
    const result = await Promise.race([executePromise, timeoutPromise])

    const executionTime = performance.now() - startTime

    // Check if result is an error
    if (result && typeof result === 'object' && 'error' in result) {
      throw new Error(`${result.error}\n\n${result.traceback}`)
    }

    // Sync changes back to native filesystem if requested
    if (syncFs && nativefs) {
      await nativefs.syncfs()
      console.log('[Pyodide Worker] Synced changes back to native filesystem')
    }

    // Collect matplotlib images
    const images = await collectMatplotlibImages(pyodide)

    // Get captured output and clear buffers
    const output = captureOutput()

    sendResponse(id, true, {
      success: true,
      result,
      images: images.length > 0 ? images : undefined,
      executionTime,
      ...output,
    })
  } catch (error) {
    const executionTime = performance.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Capture output before clearing (for error context)
    const output = captureOutput()

    sendResponse(id, true, {
      success: false,
      executionTime,
      error: errorMessage,
      ...output,
    })
  } finally {
    // Always cleanup timeout
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

//=============================================================================
// Image Collection
//=============================================================================

/**
 * Collect matplotlib images from /mnt and in-memory figures
 * @param {any} pyodide
 * @returns {Promise<ImageOutput[]>}
 */
async function collectMatplotlibImages(pyodide) {
  try {
    // Check /mnt for saved images
    const checkMntCode = `
import os
image_paths = []
if os.path.exists('/mnt'):
    for file in os.listdir('/mnt'):
        if file.endswith('.png') or file.endswith('.jpg') or file.endswith('.jpeg'):
            image_paths.append(f'/mnt/{file}')
image_paths
`

    /** @type {any} */
    const imagePaths = await pyodide.runPythonAsync(checkMntCode)

    /** @type {ImageOutput[]} */
    const images = []

    // Read saved image files from /mnt
    for (const imagePath of imagePaths) {
      if (String(imagePath).startsWith('/mnt/')) {
        const fileName = String(imagePath).split('/').pop()
        try {
          const data = pyodide.FS.readFile(imagePath)
          const base64 = arrayBufferToBase64(data)
          images.push({
            filename: fileName,
            data: base64,
          })
        } catch (error) {
          console.warn(`[Pyodide Worker] Failed to read image ${imagePath}:`, error)
        }
      }
    }

    // Try to collect in-memory matplotlib figures
    try {
      const figureCode = `
import io
import base64
import matplotlib.pyplot as plt

figure_data = []
if len(plt.get_fignums()) > 0:
    for i, fig_num in enumerate(plt.get_fignums()):
        fig = plt.figure(fig_num)
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight')
        buf.seek(0)
        img_data = base64.b64encode(buf.read()).decode('utf-8')
        figure_data.append({'index': i, 'data': img_data})
    plt.close('all')
figure_data
`
      /** @type {any} */
      const figureData = await pyodide.runPythonAsync(figureCode)

      for (const fig of figureData) {
        images.push({
          filename: `figure_${fig.index}.png`,
          data: fig.data,
        })
      }
    } catch {
      // matplotlib not loaded or no figures
    }

    return images
  } catch (error) {
    console.warn('[Pyodide Worker] Failed to collect matplotlib images:', error)
    return []
  }
}
