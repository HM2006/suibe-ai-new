/* ========================================
   小贸 - 用户页面
   登录/注册表单 + 用户信息展示 + 教务系统登录入口
   ======================================== */
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import { User, LogIn, LogOut, Settings, ChevronRight, Shield, Calendar, BarChart3, KeyRound, ArrowLeft, Link2, Unplug, Loader, CheckCircle, Camera } from 'lucide-react'
import EduLoginModal from './EduLoginModal'

/* API基础路径 */
const API_BASE = '/api/user'
const EDU_API_BASE = '/api/edu'

/**
 * 登录表单组件
 */
function LoginForm({ onSwitchToRegister }) {
  const { login } = useUser()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password.trim()) {
      setError('请填写用户名和密码')
      return
    }
    setLoading(true)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err.message || '登录失败，请检查用户名和密码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="user-form" onSubmit={handleSubmit}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, textAlign: 'center', marginBottom: '4px', color: 'var(--text-primary)' }}>
        登录
      </h2>
      <p style={{ fontSize: '13px', textAlign: 'center', color: 'var(--text-muted)', marginBottom: '8px' }}>
        登录以同步你的校园数据
      </p>

      {error && (
        <div style={{
          padding: '10px 14px',
          background: '#FEF2F2',
          color: '#991B1B',
          borderRadius: '8px',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      <input
        type="text"
        placeholder="用户名"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
      />
      <input
        type="password"
        placeholder="密码"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
      />
      <button type="submit" disabled={loading}>
        {loading ? '登录中...' : '登录'}
      </button>
      <div className="switch-link">
        没有账号？<a onClick={onSwitchToRegister}>注册</a>
      </div>
    </form>
  )
}

/**
 * 注册表单组件
 */
function RegisterForm({ onSwitchToLogin }) {
  const { register, login } = useUser()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password.trim()) {
      setError('请填写用户名和密码')
      return
    }
    if (password.length < 6) {
      setError('密码长度至少6位')
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      await register(username.trim(), password, nickname.trim() || undefined)
      /* 注册成功后自动登录 */
      await login(username.trim(), password)
    } catch (err) {
      setError(err.message || '注册失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="user-form" onSubmit={handleSubmit}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, textAlign: 'center', marginBottom: '4px', color: 'var(--text-primary)' }}>
        注册
      </h2>
      <p style={{ fontSize: '13px', textAlign: 'center', color: 'var(--text-muted)', marginBottom: '8px' }}>
        创建账号以使用更多功能
      </p>

      {error && (
        <div style={{
          padding: '10px 14px',
          background: '#FEF2F2',
          color: '#991B1B',
          borderRadius: '8px',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      <input
        type="text"
        placeholder="用户名"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
      />
      <input
        type="password"
        placeholder="密码（至少6位）"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
      />
      <input
        type="password"
        placeholder="确认密码"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        autoComplete="new-password"
      />
      <input
        type="text"
        placeholder="昵称（可选）"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
      />
      <button type="submit" disabled={loading}>
        {loading ? '注册中...' : '注册'}
      </button>
      <div className="switch-link">
        已有账号？<a onClick={onSwitchToLogin}>登录</a>
      </div>
    </form>
  )
}

/**
 * 修改密码组件
 */
function ChangePasswordForm({ onBack }) {
  const { token } = useUser()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!oldPassword || !newPassword) {
      setError('请填写旧密码和新密码')
      return
    }
    if (newPassword.length < 6) {
      setError('新密码长度至少6位')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.message || '修改密码失败')
      }
      setSuccess('密码修改成功')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.message || '修改密码失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          fontSize: '13px',
          cursor: 'pointer',
          marginBottom: '16px',
          padding: '4px 0',
        }}
      >
        <ArrowLeft size={16} />
        返回
      </button>
      <form className="user-form" onSubmit={handleSubmit}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, textAlign: 'center', marginBottom: '16px', color: 'var(--text-primary)' }}>
          修改密码
        </h2>

        {error && (
          <div style={{
            padding: '10px 14px',
            background: '#FEF2F2',
            color: '#991B1B',
            borderRadius: '8px',
            fontSize: '13px',
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            padding: '10px 14px',
            background: '#F0FDF4',
            color: '#065F46',
            borderRadius: '8px',
            fontSize: '13px',
          }}>
            {success}
          </div>
        )}

        <input
          type="password"
          placeholder="旧密码"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          autoComplete="current-password"
        />
        <input
          type="password"
          placeholder="新密码（至少6位）"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder="确认新密码"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
        <button type="submit" disabled={loading}>
          {loading ? '修改中...' : '确认修改'}
        </button>
      </form>
    </div>
  )
}

/**
 * 用户信息页面（登录后显示）
 * 包含教务系统登录入口
 */
function UserProfile() {
  const { user, token, logout, refreshProfile } = useUser()
  const navigate = useNavigate()
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showEduLoginModal, setShowEduLoginModal] = useState(false)
  const [eduSyncing, setEduSyncing] = useState(false)
  const [eduSyncStatus, setEduSyncStatus] = useState('') // 'success' | 'error' | ''
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)

  /* 预设头像列表 */
  const avatarOptions = ['😎', '🐱', '🐶', '🦊', '🐼', '🐨', '🦁', '🐯', '🐸', '🤖', '👽', '🎃', '🌟', '🎯', '🎨', '📚', '🔥', '❄️', '🌸', '🍀']

  /* 更新头像 */
  const handleAvatarChange = async (emoji) => {
    try {
      const res = await fetch(`${API_BASE}/avatar`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ avatar: emoji }),
      })
      const data = await res.json()
      if (data.success) {
        await refreshProfile()
        setShowAvatarPicker(false)
      }
    } catch (err) {
      console.warn('[UserPage] 更新头像失败:', err)
    }
  }

  /* 教务系统登录成功后自动获取课表和成绩 */
  const handleEduLoginSuccess = useCallback(async () => {
    setShowEduLoginModal(false)
    setEduSyncing(true)
    setEduSyncStatus('')
    let scheduleOk = false
    let gradesOk = false

    try {
      /* 获取课表数据 */
      try {
        const scheduleUrl = `${EDU_API_BASE}/schedule?userId=${user.id}`
        const scheduleRes = await fetch(scheduleUrl)
        if (scheduleRes.ok) {
          const scheduleData = await scheduleRes.json()
          if (scheduleData.success) {
            scheduleOk = true
            console.log('[UserPage] 课表数据同步成功')
          }
        }
      } catch (err) {
        console.warn('[UserPage] 课表同步失败:', err)
      }

      /* 获取成绩数据 */
      try {
        const gradesUrl = `${EDU_API_BASE}/grades?userId=${user.id}`
        const gradesRes = await fetch(gradesUrl)
        if (gradesRes.ok) {
          const gradesData = await gradesRes.json()
          if (gradesData.success) {
            gradesOk = true
            console.log('[UserPage] 成绩数据同步成功')
          }
        }
      } catch (err) {
        console.warn('[UserPage] 成绩同步失败:', err)
      }

      /* 刷新用户信息（更新 edu_connected 状态） */
      if (scheduleOk || gradesOk) {
        await refreshProfile()
        setEduSyncStatus('success')
      } else {
        setEduSyncStatus('error')
      }
    } catch (err) {
      console.error('[UserPage] 教务数据同步失败:', err)
      setEduSyncStatus('error')
    } finally {
      setEduSyncing(false)
      /* 3秒后清除状态提示 */
      setTimeout(() => setEduSyncStatus(''), 3000)
    }
  }, [user?.id, refreshProfile])

  /* 断开教务系统连接 */
  const handleEduDisconnect = useCallback(async () => {
    try {
      await fetch(`${EDU_API_BASE}/logout?userId=${user.id}`, { method: 'POST' })
    } catch (err) {
      console.warn('[UserPage] 断开教务系统失败:', err)
    }
    await refreshProfile()
  }, [refreshProfile, user?.id])

  /* 退出登录 */
  const handleLogout = () => {
    logout()
    navigate('/chat')
  }

  /* 如果正在修改密码，显示修改密码表单 */
  if (showChangePassword) {
    return (
      <div className="user-page">
        <ChangePasswordForm onBack={() => setShowChangePassword(false)} />
      </div>
    )
  }

  const displayName = user.nickname || user.username
  const initial = displayName[0].toUpperCase()
  const avatarDisplay = user.avatar || initial

  return (
    <div className="user-page">
      {/* 用户信息卡片 */}
      <div className="user-info-card">
        <div
          className="user-avatar"
          style={{ cursor: 'pointer', position: 'relative', fontSize: user.avatar ? '32px' : undefined }}
          onClick={() => setShowAvatarPicker(true)}
          title="点击更换头像"
        >
          {avatarDisplay}
          <div style={{
            position: 'absolute',
            bottom: '-2px',
            right: '-2px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: 'var(--primary)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--card-bg)',
          }}>
            <Camera size={10} />
          </div>
        </div>

        {/* 头像选择器 */}
        {showAvatarPicker && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }} onClick={() => setShowAvatarPicker(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--card-bg)',
                borderRadius: '16px',
                padding: '20px',
                maxWidth: '320px',
                width: '90%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              }}
            >
              <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', textAlign: 'center' }}>
                选择头像
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '8px',
              }}>
                {avatarOptions.map((emoji) => (
                  <div
                    key={emoji}
                    onClick={() => handleAvatarChange(emoji)}
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      cursor: 'pointer',
                      background: user.avatar === emoji ? '#EEF2FF' : 'var(--bg-secondary)',
                      border: user.avatar === emoji ? '2px solid var(--primary)' : '2px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    {emoji}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {displayName}
        </div>
        {user.nickname && (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
            @{user.username}
          </div>
        )}
        {/* 角色标签 */}
        {user.role && (
          <span className={`admin-badge ${user.role}`} style={{ marginTop: '8px' }}>
            {user.role === 'admin' ? '管理员' : '普通用户'}
          </span>
        )}
      </div>

      {/* 菜单列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
        {/* 教务系统连接 - 核心功能 */}
        <div className="user-menu-item" style={{ cursor: 'pointer' }} onClick={() => {
          if (user.eduConnected) return
          setShowEduLoginModal(true)
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Calendar size={18} style={{ color: 'var(--text-secondary)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>教务系统</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {eduSyncing ? '正在同步课表和成绩数据...' :
                 eduSyncStatus === 'success' ? '课表和成绩数据已同步' :
                 eduSyncStatus === 'error' ? '同步失败，请重试' :
                 user.eduConnected ? '已连接 · 课表和成绩数据已同步' : '未连接 · 点击登录教务系统'}
              </div>
            </div>
            {eduSyncing && <Loader size={16} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />}
            {eduSyncStatus === 'success' && <CheckCircle size={16} style={{ color: '#059669' }} />}
            {user.eduConnected && !eduSyncing && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleEduDisconnect()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #FECACA',
                  background: '#FEF2F2',
                  color: '#DC2626',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <Unplug size={12} />
                断开
              </button>
            )}
            {!user.eduConnected && !eduSyncing && (
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--primary)',
                  background: 'var(--primary)',
                  color: '#fff',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <Link2 size={12} />
                连接
              </button>
            )}
          </div>
        </div>

        {/* 修改密码 */}
        <div className="user-menu-item" onClick={() => setShowChangePassword(true)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <KeyRound size={18} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: '14px', fontWeight: 500 }}>修改密码</span>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
        </div>

        {/* 管理后台（仅管理员可见） */}
        {user.role === 'admin' && (
          <div className="user-menu-item" onClick={() => navigate('/admin')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Shield size={18} style={{ color: 'var(--text-secondary)' }} />
              <span style={{ fontSize: '14px', fontWeight: 500 }}>管理后台</span>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
          </div>
        )}

        {/* 退出登录 */}
        <div
          className="user-menu-item"
          onClick={handleLogout}
          style={{ marginTop: '8px', borderColor: '#FECACA' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <LogOut size={18} style={{ color: '#DC2626' }} />
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#DC2626' }}>退出登录</span>
          </div>
        </div>
      </div>

      {/* 教务系统登录弹窗 */}
      <EduLoginModal
        isOpen={showEduLoginModal}
        onClose={() => setShowEduLoginModal(false)}
        onLoginSuccess={handleEduLoginSuccess}
      />
    </div>
  )
}

/**
 * 用户页面主组件
 * 根据登录状态显示不同内容
 */
function UserPage() {
  const { user, isLoading } = useUser()
  const [showRegister, setShowRegister] = useState(false)

  /* 加载中 */
  if (isLoading) {
    return (
      <div className="user-page" style={{ textAlign: 'center', paddingTop: '60px' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>加载中...</div>
      </div>
    )
  }

  /* 已登录：显示用户信息 */
  if (user) {
    return <UserProfile />
  }

  /* 未登录：显示登录/注册表单 */
  return (
    <div className="user-page">
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px',
        }}>
          <User size={28} style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>
      {showRegister ? (
        <RegisterForm onSwitchToLogin={() => setShowRegister(false)} />
      ) : (
        <LoginForm onSwitchToRegister={() => setShowRegister(true)} />
      )}
      {/* 管理员入口 - 跳转登录页并标记管理员模式 */}
      <div
        onClick={() => {
          sessionStorage.setItem('admin_login', '1')
          setShowRegister(false)
        }}
        style={{
          textAlign: 'center',
          marginTop: '32px',
          fontSize: '12px',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          opacity: 0.6,
        }}
      >
        管理员入口
      </div>
    </div>
  )
}

export default UserPage
