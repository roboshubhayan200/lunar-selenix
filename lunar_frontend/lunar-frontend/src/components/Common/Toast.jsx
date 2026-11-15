/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const ToastCtx = createContext(null)

/**
 * Toasts for user-facing errors. Accepts an ApiError (uses .message and the
 * short .detail line) — tracebacks never reach here because api/client.js
 * drops them.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const push = useCallback((toast) => {
    const id = ++idRef.current
    const item = { id, tone: 'error', duration: 7000, ...toast }
    setToasts((t) => {
      // collapse duplicates (e.g. repeated offline errors)
      const rest = t.filter((x) => !(x.title === item.title && x.message === item.message))
      return [...rest.slice(-3), item]
    })
    if (item.duration) setTimeout(() => dismiss(id), item.duration)
    return id
  }, [dismiss])

  const error = useCallback((err, title = 'Something went wrong') => {
    if (err?.cancelled) return null
    const status = err?.status
    const heading = status === 0 ? 'Backend unreachable' : status === 400 ? 'Invalid request' : title
    return push({ tone: 'error', title: heading, message: err?.message || String(err), detail: err?.detail && err.detail !== err.message ? err.detail : null })
  }, [push])

  const value = useMemo(() => ({ push, error, dismiss }), [push, error, dismiss])

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
              className={`glass-strong pointer-events-auto flex items-start gap-3 border p-3.5 ${t.tone === 'error' ? 'border-danger/50' : 'border-accent/40'}`}
              role="alert"
            >
              <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${t.tone === 'error' ? 'bg-danger/20 text-danger' : 'bg-accent/20 text-accent'}`}>{t.tone === 'error' ? '!' : 'i'}</span>
              <div className="min-w-0 flex-1">
                <div className={`font-display text-sm font-semibold ${t.tone === 'error' ? 'text-danger' : 'text-accent'}`}>{t.title}</div>
                <div className="mt-0.5 text-xs leading-snug text-ink-dim">{t.message}</div>
                {t.detail && <div className="mt-1 truncate font-mono text-[10px] text-ink-muted" title={t.detail}>{t.detail}</div>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} className="text-ink-muted transition hover:text-ink" aria-label="Dismiss">✕</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
