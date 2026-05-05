import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './beijing_air_system.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)