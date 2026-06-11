import { useState } from 'react'
import { api } from '../api.js'

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.login(password)
      onSuccess()
    } catch {
      setError('Sai mật khẩu')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[rgba(8,13,20,.7)]">
      <form onSubmit={submit} className="w-80 space-y-4 rounded-[10px] border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold text-text-primary">GameSync Project Board</h1>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Mật khẩu" autoFocus
          className="w-full rounded-lg border border-border bg-sunken px-3 py-2 text-text-primary outline-none transition-colors duration-150 focus:border-accent"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="w-full rounded-lg bg-gradient-to-r from-accent-strong to-accent-deep py-2 font-medium text-[#e6fbff] shadow-[0_0_18px_rgba(67,217,232,.18)] transition-colors duration-150 hover:brightness-110">Đăng nhập</button>
      </form>
    </div>
  )
}
