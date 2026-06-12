import { useEffect } from 'react'
import { DiffView } from './DiffView.js'

export function DiffModal({ id, diff, onClose }: { id: string; diff: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(8,13,20,.7)] p-6"
      onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div onClick={(e) => e.stopPropagation()}
        className="flex h-[90vh] w-[90vw] max-w-[1400px] flex-col rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h3 className="font-mono text-xs text-text-secondary">Diff · {id}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>
        <div className="min-h-0 flex-1 p-4"><DiffView diff={diff} wide /></div>
      </div>
    </div>
  )
}
