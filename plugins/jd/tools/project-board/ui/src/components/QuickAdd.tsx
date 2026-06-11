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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-96 space-y-3 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <h2 className="font-semibold">Thêm mục mới</h2>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề"
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-cyan-500" />
        <div className="flex gap-2">
          <select value={type} onChange={(e) => setType(e.target.value as 'task' | 'bug')}
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2">
            <option value="task">Task</option>
            <option value="bug">Bug</option>
          </select>
          <select value={component} onChange={(e) => setComponent(e.target.value)}
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2">
            {components.map((c) => <option key={c.component}>{c.component}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="w-full rounded-md bg-cyan-600 py-2 font-medium hover:bg-cyan-500">Tạo</button>
      </form>
    </div>
  )
}
