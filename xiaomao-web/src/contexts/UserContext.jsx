/* ========================================
   小贸 - 用户上下文（整合版）
   API路径从统一配置导入，兼容Web和原生App
   ======================================== */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { API } from '../config/api'

const UserContext = createContext(null)

/* Token存储键名 */
const TOKEN_KEY = 'xiaomao_token'

/**
 * 用户上下文Provider
 * 包裹整个应用，提供用户状态管理
 */
export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  /* 获取用户信息 */
  const fetchProfile = useCallback(async (currentToken) => {
    try {
      const res = await fetch(`${API.user}/profile`, {
        headers: {
          'Authorization': `Bearer ${currentToken}`,
        },
      })
      if (!res.ok) {
        /* token无效，清除登录状态 */
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setUser(null)
        return null
      }
      const data = await res.json()
      if (data.success && data.data) {
        /* profile 接口返回 { user: {...}, scheduleCache, gradesCache } */
        /* setUser 只需要 user 部分，但额外保存 edu_connected 和缓存状态 */
        const profileUser = data.data.user || data.data
        const enrichedUser = {
          ...profileUser,
          eduConnected: profileUser.edu_connected || profileUser.eduConnected || 0,
        }
        setUser(enrichedUser)
        return data.data
      }
      return null
    } catch (err) {
      console.error('获取用户信息失败:', err)
      return null
    }
  }, [])

  /* 应用启动时从localStorage读取token，自动恢复登录状态 */
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY)
    if (savedToken) {
      setToken(savedToken)
      fetchProfile(savedToken).finally(() => {
        setIsLoading(false)
      })
    } else {
      setIsLoading(false)
    }
  }, [fetchProfile])

  /* 登录 */
  const login = useCallback(async (username, password) => {
    const res = await fetch(`${API.user}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.message || '登录失败')
    }
    const newToken = data.data?.token || data.token
    if (newToken) {
      localStorage.setItem(TOKEN_KEY, newToken)
      setToken(newToken)
      /* 登录成功后获取用户信息 */
      const profile = await fetchProfile(newToken)
      return profile
    }
    return data.data
  }, [fetchProfile])

  /* 注册 */
  const register = useCallback(async (username, password, nickname) => {
    const res = await fetch(`${API.user}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, nickname }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.message || '注册失败')
    }
    return data.data
  }, [])

  /* 登出 */
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  /* 刷新用户信息 */
  const refreshProfile = useCallback(async () => {
    if (!token) return null
    return fetchProfile(token)
  }, [token, fetchProfile])

  const value = {
    user,
    token,
    login,
    register,
    logout,
    isLoading,
    refreshProfile,
  }

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  )
}

/**
 * 使用用户上下文的Hook
 * @returns {Object} 用户上下文值
 */
export function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser 必须在 UserProvider 内部使用')
  }
  return context
}
