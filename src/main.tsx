import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Identifica no console qual build está servido (diagnóstico de cache/deploy)
console.info(`Growth Expert — build ${__BUILD_ID__}`)

const root = createRoot(document.getElementById('root')!)

// A página pública de formulário (/f/agencia/formulario) carrega SÓ o
// formulário — sem o sistema inteiro — para abrir rápido vindo do anúncio.
if (window.location.pathname.startsWith('/f/')) {
  import('./pages/PublicForm').then(({ PublicForm }) => {
    root.render(<StrictMode><PublicForm /></StrictMode>)
  })
} else {
  import('./App.tsx').then(({ default: App }) => {
    root.render(<StrictMode><App /></StrictMode>)
  })
}
