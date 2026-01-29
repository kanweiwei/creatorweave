/**
 * PluginToast - Toast notification component for plugin API
 * Used when plugins call BFSA.notify.toast()
 */

import { useEffect, useState } from 'react'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastMessage {
  id: string
  message: string
  type: ToastType
}

interface ToastProps {
  toast: ToastMessage
  onClose: (id: string) => void
}

const toastStyles = {
  info: 'bg-info text-white',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  error: 'bg-error text-white',
}

const toastIcons = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌',
}

export function PluginToast({ toast, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    // Auto-dismiss after 3 seconds
    const timer = setTimeout(() => {
      handleClose()
    }, 3000)

    return () => clearTimeout(timer)
  }, [toast.id])

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(() => onClose(toast.id), 300) // Wait for exit animation
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg ${toastStyles[toast.type]} ${isExiting ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100'} transition-all duration-300`}
    >
      <span className="text-lg">{toastIcons[toast.type]}</span>
      <span className="flex-1 text-sm font-medium">{toast.message}</span>
      <button onClick={handleClose} className="text-white/70 transition-colors hover:text-white">
        ✕
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: ToastMessage[]
  onClose: (id: string) => void
}

export function PluginToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[var(--z-fixed)] flex flex-col gap-2">
      {toasts.map((toast) => (
        <PluginToast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  )
}
