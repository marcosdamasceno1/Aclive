import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Identifica no console qual build está servido (diagnóstico de cache/deploy)
console.info(`Growth Expert — build ${__BUILD_ID__}`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
