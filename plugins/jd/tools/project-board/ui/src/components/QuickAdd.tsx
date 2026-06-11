import { useState } from 'react'
import { api } from '../api.js'
import type { ComponentStatus } from '../types.js'

export function QuickAdd({ components, onClose }: { components: ComponentStatus[]; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'task' | 'bug'>('task')
  const [component, setComponent] = useState(components[0]?.component ?? 'infra')
  const [error, setError] = useState('')

  const valid = title.trim() && description.trim()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    try {
      await api.createTask({ type, title: title.trim(), component, body: description.trim() })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định')
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-[rgba(8,13,20,.7)]" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-[28rem] space-y-3 rounded-xl border border-border-strong bg-surface p-5">
        <h2 className="font-semibold text-text-primary">Thêm mục mới</h2>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề"
          className="w-full rounded-md border border-border bg-sunken px-3 py-2 text-text-primary outline-none transition-colors duration-150 focus:border-accent" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5}
          placeholder="Mô tả chi tiết (AI dựa vào đây để làm — bắt buộc)"
          className="w-full resize-none rounded-md border border-border bg-sunken px-3 py-2 text-[14px] leading-[1.65] text-text-primary outline-none transition-colors duration-150 focus:border-accent" />
        <div className="flex gap-2">
          <select value={type} onChange={(e) => setType(e.target.value as 'task' | 'bug')}
            className="flex-1 rounded-md border border-border bg-sunken px-2 py-2 text-text-primary">
            <option value="task">Task</option>
            <option value="bug">Bug</option>
          </select>
          <select value={component} onChange={(e) => setComponent(e.target.value)}
            className="flex-1 rounded-md border border-border bg-sunken px-2 py-2 text-text-primary">
            {components.map((c) => <option key={c.component}>{c.component}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={!valid}
          className="w-full rounded-md bg-gradient-to-r from-accent-strong to-accent-deep py-2 font-medium text-[#e6fbff] shadow-[0_0_18px_rgba(67,217,232,.18)] transition-colors duration-150 hover:brightness-110 disabled:opacity-50">Tạo</button>
      </form>
    </div>
  )
}
