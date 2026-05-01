/* ========================================
   小贸 - 校园AI助手 入口文件
   自动检测运行环境，切换路由模式
   - Web端：BrowserRouter（支持Vite代理）
   - 原生App：HashRouter（Capacitor兼容）
   ======================================== */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import './index.css'
import 'katex/dist/katex.min.css'
import App from './App.jsx'

/* 检测是否运行在 Capacitor 原生环境 */
let isNative = false
try {
  const { Capacitor } = await import('@capacitor/core')
  isNative = Capacitor.isNativePlatform()
} catch {
  /* Web 环境下 Capacitor 模块不可用，忽略 */
}

/* 原生平台特定初始化 */
if (isNative) {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Light })
    await StatusBar.setBackgroundColor({ color: '#3525cd' })
  } catch {
    /* 状态栏设置失败不影响运行 */
  }
}

/* 根据环境选择路由模式 */
const Router = isNative ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
)
