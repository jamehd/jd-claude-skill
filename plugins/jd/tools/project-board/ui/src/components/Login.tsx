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
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={submit} className="w-80 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h1 className="text-lg font-semibold">GameSync Project Board</h1>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Mật khẩu" autoFocus
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-cyan-500"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="w-full rounded-md bg-cyan-600 py-2 font-medium hover:bg-cyan-500">Đăng nhập</button>
      </form>
    </div>
  )
}
