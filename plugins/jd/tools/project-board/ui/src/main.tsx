import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ConsolePage } from './components/ConsolePage.js'
import './index.css'

const consoleMatch = location.pathname.match(/^\/console\/([A-Za-z0-9_-]+)$/)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {consoleMatch ? <ConsolePage jobId={consoleMatch[1]} /> : <App />}
  </StrictMode>,
)
