import { useState } from 'react'
import { api } from '../api.js'
import type { ComponentStatus } from '../types.js'

export function QuickAdd({ components, onClose }: { components: ComponentStatus[]; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'task' | 'bug'>('task')
  const [component, setComponent] = useState(components[0]?.component ?? 'infra')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.createTask({ type, title, component })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định')
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-[rgba(8,13,20,.7)]" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-96 space-y-3 rounded-[10px] border border-border bg-surface p-5">
        <h2 className="font-semibold text-text-primary">Thêm mục mới</h2>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề"
          className="w-full rounded-lg border border-border bg-sunken px-3 py-2 text-text-primary outline-none transition-colors duration-150 focus:border-accent" />
        <div className="flex gap-2">
          <select value={type} onChange={(e) => setType(e.target.value as 'task' | 'bug')}
            className="flex-1 rounded-lg border border-border bg-sunken px-2 py-2 text-text-primary">
            <option value="task">Task</option>
            <option value="bug">Bug</option>
          </select>
          <select value={component} onChange={(e) => setComponent(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-sunken px-2 py-2 text-text-primary">
            {components.map((c) => <option key={c.component}>{c.component}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="w-full rounded-lg bg-gradient-to-r from-accent-strong to-accent-deep py-2 font-medium text-[#e6fbff] shadow-[0_0_18px_rgba(67,217,232,.18)] transition-colors duration-150 hover:brightness-110">Tạo</button>
      </form>
    </div>
  )
}
