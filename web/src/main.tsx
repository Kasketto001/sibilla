import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './theme'
import './index.css'
import App from './App.tsx'
import { AccessGate } from './Access.tsx'
import { SharedApp } from './SharedApp.tsx'

// "?app=<token>" is a public link to one mini webapp: it opens just that app, with no account.
const shared = new URLSearchParams(location.search).get('app')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      {shared ? <SharedApp token={shared} /> : <AccessGate><App /></AccessGate>}
    </ThemeProvider>
  </StrictMode>,
)
