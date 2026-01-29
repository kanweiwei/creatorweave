/**
 * Plugin Upload Component - Neo-Brutal Tech Design
 *
 * Cyberpunk-styled upload zone with tech decorations
 */

import { useState, useRef, useCallback } from 'react'

interface PluginUploadProps {
  onUpload: (file: File) => Promise<void>
  accept?: string
}

export function PluginUpload({ onUpload, accept = '.wasm' }: PluginUploadProps) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      await validateAndUpload(file)
    }
  }, [])

  const handleChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await validateAndUpload(file)
    }
  }, [])

  const validateAndUpload = async (file: File) => {
    setError(null)
    setProgress(0)

    // Validate file extension
    if (!file.name.endsWith('.wasm')) {
      setError('ERROR: ONLY .WASM FILES ACCEPTED')
      return
    }

    // Validate WASM format
    try {
      const bytes = await file.arrayBuffer()
      const view = new Uint8Array(bytes)

      // Check WASM magic number: 00 61 73 6D 01 00 00 00
      const magic = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]
      const isValidMagic = magic.every((byte, i) => view[i] === byte)

      if (!isValidMagic) {
        setError('ERROR: INVALID WASM MAGIC NUMBER')
        return
      }

      // Upload
      setUploading(true)
      setProgress(50)

      await onUpload(file)

      setProgress(100)
      setTimeout(() => {
        setProgress(0)
        setUploading(false)
      }, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'UPLOAD_FAILED')
      setUploading(false)
      setProgress(0)
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="npu-container">
      <div className="npu-label-line">
        <span className="npu-label">MODULE_IMPORT</span>
        <span className="npu-label-decoration">///</span>
      </div>

      <div
        className={`npu-zone ${dragging ? 'npu-zone--dragging' : ''} ${uploading ? 'npu-zone--uploading' : ''} ${error ? 'npu-zone--error' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!uploading ? handleClick : undefined}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          style={{ display: 'none' }}
        />

        {/* Corner Decorations */}
        <div className="npu-corner npu-corner--tl"></div>
        <div className="npu-corner npu-corner--tr"></div>
        <div className="npu-corner npu-corner--bl"></div>
        <div className="npu-corner npu-corner--br"></div>

        {/* Scan Line Effect */}
        <div className="npu-scanline"></div>

        {/* Content */}
        <div className="npu-content">
          {uploading ? (
            <>
              <div className="npu-spinner">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle
                    cx="24"
                    cy="24"
                    r="18"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="npu-spinner-track"
                  />
                  <path
                    d="M24 6 A18 18 0 0 1 42 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="npu-spinner-path"
                  />
                </svg>
              </div>
              <div className="npu-status">UPLOADING_MODULE...</div>
              {progress > 0 && (
                <div className="npu-progress-bar">
                  <div className="npu-progress-fill" style={{ width: `${progress}%` }}></div>
                </div>
              )}
              <div className="npu-progress-text">{progress}%</div>
            </>
          ) : error ? (
            <>
              <div className="npu-error-icon">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 48 48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="24 4 4 20 18 20 18 44 30 44 30 20 44 20 24 4" />
                  <line x1="24" y1="28" x2="24" y2="36" />
                  <line x1="24" y1="38" x2="24.01" y2="38" />
                </svg>
              </div>
              <div className="npu-error-text">{error}</div>
            </>
          ) : (
            <>
              <div className="npu-icon">
                <svg
                  width="56"
                  height="56"
                  viewBox="0 0 56 56"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="8" y="8" width="40" height="40" rx="2" />
                  <path d="M28 20 L28 36" />
                  <path d="M20 28 L36 28" />
                  <circle cx="28" cy="28" r="14" className="npu-icon-pulse" />
                </svg>
              </div>
              <div className="npu-title">DROP_WASM_MODULE_HERE</div>
              <div className="npu-subtitle">OR CLICK TO BROWSE FILE SYSTEM</div>
              <div className="npu-hint">ACCEPTS .WASM BINARY FILES ONLY</div>
            </>
          )}
        </div>
      </div>

      {/* Bottom decoration line */}
      <div className="npu-bottom-line">
        <span className="npu-bottom-text">WASM_BINARY_FORMAT / WebAssembly 1.0</span>
      </div>
    </div>
  )
}
