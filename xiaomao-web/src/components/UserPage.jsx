/* ========================================
   小贸 - 用户页面
   登录/注册表单 + 用户信息展示 + 教务系统登录入口
   ======================================== */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import { User, LogIn, LogOut, Settings, ChevronRight, Shield, Calendar, BarChart3, KeyRound, ArrowLeft, Link2, Unplug, Loader, CheckCircle, Camera, RefreshCw, Pencil, X } from 'lucide-react'
import EduLoginModal from './EduLoginModal'
import { API } from '../config/api'

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
      const res = await fetch(`${API.user}/change-password`, {
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

  /* 昵称编辑相关状态 */
  const [editingNickname, setEditingNickname] = useState(false)
  const [nicknameInput, setNicknameInput] = useState('')

  /* 图片上传相关状态 */
  const [previewImage, setPreviewImage] = useState(null)
  const [zoom, setZoom] = useState(1)
  const panRef = useRef({ x: 0, y: 0 })
  const [panState, setPanState] = useState({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const previewCanvasRef = useRef(null)
  const previewImgRef = useRef(null)

  /* 预设头像列表 */
  const AVATAR_EMOJIS = ['😀','😎','🤓','🥳','😴','🤖','👻','🐱','🐶','🦊','🐼','🐨','🦁','🐯','🦄','🌸','⭐','🔥','💎','🎵']

  /* 当 user 变化时同步 nicknameInput */
  useEffect(() => {
    if (user) setNicknameInput(user.nickname || '')
  }, [user])

  /* 保存昵称 */
  const handleSaveNickname = async () => {
    if (!nicknameInput.trim()) return
    try {
      const res = await fetch(`${API.user}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ nickname: nicknameInput.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          refreshProfile()
          setEditingNickname(false)
        }
      }
    } catch (err) {
      console.error('修改昵称失败:', err)
    }
  }

  /* 选择 emoji 头像 */
  const handleSelectEmoji = async (emoji) => {
    try {
      const res = await fetch(`${API.user}/avatar`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ avatar: emoji }),
      })
      if (res.ok) {
        await refreshProfile()
        setShowAvatarPicker(false)
      }
    } catch (err) {
      console.warn('[UserPage] 设置头像失败:', err)
    }
  }

  /* 选择图片文件 */
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      alert('图片大小不能超过 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      setPreviewImage(ev.target.result)
      setZoom(1)
      panRef.current = { x: 0, y: 0 }
      setPanState({ x: 0, y: 0 })
      setShowAvatarPicker(false)
    }
    reader.readAsDataURL(file)
  }

  /* 图片加载完成后自动适配 */
  const handleImageLoad = () => {
    if (previewImgRef.current && previewCanvasRef.current) {
      const img = previewImgRef.current
      const canvas = previewCanvasRef.current
      const cropSize = Math.min(canvas.clientWidth, canvas.clientHeight)
      // 计算让图片正好覆盖裁剪框的缩放比例
      const scale = Math.max(cropSize / img.naturalWidth, cropSize / img.naturalHeight)
      setZoom(scale)
      panRef.current = { x: 0, y: 0 }
      setPanState({ x: 0, y: 0 })
    }
  }

  /* 拖拽相关 */
  const handleDragStart = (e) => {
    isDraggingRef.current = true
    const pos = e.touches ? e.touches[0] : e
    dragStartRef.current = { x: pos.clientX - panRef.current.x, y: pos.clientY - panRef.current.y }
    const onMove = (ev) => {
      if (!isDraggingRef.current) return
      ev.preventDefault()
      const p = ev.touches ? ev.touches[0] : ev
      const newPan = { x: p.clientX - dragStartRef.current.x, y: p.clientY - dragStartRef.current.y }
      panRef.current = newPan
      setPanState(newPan)
    }
    const onUp = () => {
      isDraggingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove, { passive: false })
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
  }

  /* 确认图片头像 */
  const handleConfirmImage = async () => {
    if (!previewImage || !previewCanvasRef.current) return
    try {
      const canvas = document.createElement('canvas')
      const size = 200
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')

      const img = previewImgRef.current
      const canvasEl = previewCanvasRef.current
      const canvasW = canvasEl.clientWidth
      const canvasH = canvasEl.clientHeight

      const imgW = img.naturalWidth * zoom
      const imgH = img.naturalHeight * zoom
      const imgX = (canvasW - imgW) / 2 + panRef.current.x
      const imgY = (canvasH - imgH) / 2 + panRef.current.y

      const cropSize = Math.min(canvasW, canvasH)
      const cropX = (canvasW - cropSize) / 2
      const cropY = (canvasH - cropSize) / 2

      ctx.drawImage(img,
        (cropX - imgX) / zoom, (cropY - imgY) / zoom, cropSize / zoom, cropSize / zoom,
        0, 0, size, size
      )

      const base64 = canvas.toDataURL('image/jpeg', 0.85)

      const res = await fetch(`${API.user}/avatar/upload`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ avatar: base64 }),
      })
      if (res.ok) {
        await refreshProfile()
        setPreviewImage(null)
      }
    } catch (err) {
      console.error('上传头像失败:', err)
      alert('上传失败，请重试')
    }
  }

  /* 教务系统登录成功后自动获取课表、成绩和培养方案完成情况 */
  const handleEduLoginSuccess = useCallback(async () => {
    setShowEduLoginModal(false)
    setEduSyncing(true)
    setEduSyncStatus('')
    let syncOk = false

    try {
      /* 使用 sync 端点一次性获取课表、成绩和培养方案完成情况 */
      try {
        const res = await fetch(`${API.edu}/sync?userId=${user.id}`)
        if (res.ok) {
          const data = await res.json()
          if (data.success) {
            syncOk = true
            console.log('[UserPage] 同步完成，培养方案保存:', data.data?.programSaved)
          }
        }
      } catch (err) {
        console.warn('[UserPage] 数据同步失败:', err)
      }

      /* 获取完毕，关闭教务会话 */
      try {
        await fetch(`${API.edu}/logout?userId=${user.id}`, { method: 'POST' })
      } catch (err) { /* ignore */ }

      if (syncOk) {
        /* 先刷新 profile（更新 eduConnected），再显示成功状态 */
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
      /* 成功时不自动清除状态，让 eduConnected 接管显示；失败时3秒后清除 */
      if (!syncOk) {
        setTimeout(() => setEduSyncStatus(''), 3000)
      }
    }
  }, [user?.id, refreshProfile])

  /* 断开教务系统连接 */
  const handleEduDisconnect = useCallback(async () => {
    try {
      await fetch(`${API.edu}/logout?userId=${user.id}`, { method: 'POST' })
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

  /* 判断头像类型：emoji 还是图片 */
  const isEmojiAvatar = user.avatar && !user.avatar.startsWith('/') && !user.avatar.startsWith('http') && !user.avatar.startsWith('data:')

  return (
    <div className="user-page">
      {/* 用户信息卡片 */}
      <div className="user-info-card">
        {/* 头像区域 */}
        <div className="user-avatar-section">
          <div className="user-avatar-large" onClick={() => setShowAvatarPicker(true)}>
            {isEmojiAvatar ? (
              <span className="user-avatar-emoji">{user.avatar}</span>
            ) : user.avatar ? (
              <img src={user.avatar} alt="头像" className="user-avatar-img" />
            ) : (
              <span className="user-avatar-initial">{initial}</span>
            )}
            <div className="user-avatar-edit-badge">
              <Camera size={12} />
            </div>
          </div>
        </div>

        {/* 昵称显示和编辑 */}
        <div className="user-nickname-row">
          <span className="user-display-name">{displayName}</span>
          <button className="user-edit-nickname-btn" onClick={() => setEditingNickname(true)}>
            <Pencil size={14} />
          </button>
        </div>

        {/* 昵称编辑表单 */}
        {editingNickname && (
          <div className="user-nickname-edit">
            <input
              type="text"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder="输入新昵称"
              maxLength={30}
              className="user-nickname-input"
              autoFocus
            />
            <div className="user-nickname-actions">
              <button className="user-nickname-cancel" onClick={() => { setEditingNickname(false); setNicknameInput(user.nickname || '') }}>取消</button>
              <button className="user-nickname-save" onClick={handleSaveNickname}>保存</button>
            </div>
          </div>
        )}

        {/* 真实姓名和专业年级（从教务系统同步） */}
        {(user.edu_name || user.edu_major_grade) ? (
          <div className="user-real-info">
            {user.edu_name && <span className="user-real-name">{user.edu_name}</span>}
            {user.edu_major_grade && <span className="user-major-grade">{user.edu_major_grade}</span>}
          </div>
        ) : (
          <div className="user-real-info">
            <span className="user-major-grade" style={{ opacity: 0.6, fontSize: '11px' }}>
              {user.eduConnected ? '暂无教务数据' : '未连接教务系统，暂无身份信息'}
            </span>
          </div>
        )}

        {/* 用户名显示 */}
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

      {/* 头像选择器弹窗 */}
      {showAvatarPicker && (
        <div className="avatar-picker-overlay" onClick={() => setShowAvatarPicker(false)}>
          <div className="avatar-picker-modal" onClick={e => e.stopPropagation()}>
            <div className="avatar-picker-header">
              <span>选择头像</span>
              <button onClick={() => setShowAvatarPicker(false)}><X size={20} /></button>
            </div>

            {/* 上传图片按钮 */}
            <div className="avatar-upload-section">
              <label className="avatar-upload-btn">
                <Camera size={20} />
                <span>上传图片</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleImageSelect}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {/* Emoji 选择 */}
            <div className="avatar-emoji-label">或选择表情</div>
            <div className="avatar-emoji-grid">
              {AVATAR_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  className={`avatar-emoji-item ${user.avatar === emoji ? 'active' : ''}`}
                  onClick={() => handleSelectEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 图片预览和裁剪弹窗 */}
      {previewImage && (
        <div className="image-preview-overlay">
          <div className="image-preview-modal">
            <div className="image-preview-header">
              <span>预览头像</span>
              <button onClick={() => setPreviewImage(null)}><X size={20} /></button>
            </div>
            <div className="image-preview-canvas-wrapper">
              <div className="image-preview-canvas" ref={previewCanvasRef}>
                <img
                  src={previewImage}
                  alt="预览"
                  ref={previewImgRef}
                  onLoad={handleImageLoad}
                  style={{
                    position: 'absolute',
                    transform: `translate(${panState.x}px, ${panState.y}px) scale(${zoom})`,
                    transformOrigin: 'center center',
                    cursor: isDraggingRef.current ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    maxWidth: 'none',
                  }}
                  onMouseDown={handleDragStart}
                  onTouchStart={handleDragStart}
                />
              </div>
            </div>
            <div className="image-preview-controls">
              <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}>缩小</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(3, z + 0.2))}>放大</button>
            </div>
            <button className="image-preview-confirm" onClick={handleConfirmImage}>
              完成并应用
            </button>
          </div>
        </div>
      )}

      {/* 菜单列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
        {/* 教务系统连接 - 核心功能 */}
        <div className="user-menu-item" style={{ cursor: 'pointer' }} onClick={() => {
          setShowEduLoginModal(true)
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Calendar size={18} style={{ color: 'var(--text-secondary)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>教务系统</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {eduSyncing ? '正在同步课表、成绩和培养方案数据...' :
                 eduSyncStatus === 'success' ? '数据已同步到本地缓存' :
                 eduSyncStatus === 'error' ? '同步失败，请重试' :
                 user.eduConnected ? '数据已同步 · 点击可重新获取最新数据' : '未连接 · 点击登录教务系统获取数据'}
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
                <RefreshCw size={12} />
                重新获取
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
      {/* 管理员入口 - 跳转管理后台（未登录会显示登录引导） */}
      <div
        onClick={() => navigate('/admin')}
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
