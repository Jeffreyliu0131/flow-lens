import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
import './styles/app.css'
import { App } from './app/App'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element is missing')
}

createRoot(rootElement).render(
  <StrictMode>
    <Theme
      appearance="dark"
      accentColor="orange"
      grayColor="sage"
      radius="small"
      scaling="90%"
      panelBackground="solid"
    >
      <App />
    </Theme>
  </StrictMode>,
)
