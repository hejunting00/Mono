import { createApp } from 'vue'
import App from './App.vue'
import './styles/app.css'
import './themes/github-light.css'
import './themes/night.css'
import './styles/editor.css'

window.addEventListener('unhandledrejection', (e) => {
  document.title = 'REJ: ' + String((e.reason as Error)?.stack || e.reason).slice(0, 150)
})

// dev convenience: F5 reloads the desktop webview (no native menu bar anymore)
if (import.meta.env.DEV) {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F5') location.reload()
  })
}

createApp(App).mount('#app')
