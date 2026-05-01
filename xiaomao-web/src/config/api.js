/* ========================================
   小贸 - 统一 API 配置
   Web端使用相对路径（通过Vite代理转发）
   原生App使用绝对路径（直连远程服务器）
   ======================================== */

/* API 基础路径
   Web端：空字符串，配合 Vite proxy 使用相对路径 /api/...
   原生App：完整域名，直连远程服务器
   通过 Vite 构建时注入环境变量区分 */
const API_BASE_URL = import.meta.env.VITE_API_BASE || ''

export const API_BASE = `${API_BASE_URL}/api`

/* 各模块 API 路径 */
export const API = {
  user: `${API_BASE}/user`,
  chat: `${API_BASE}/chat`,
  campus: `${API_BASE}/campus`,
  edu: `${API_BASE}/edu`,
  notes: `${API_BASE}/notes`,
  admin: `${API_BASE}/admin`,
}
