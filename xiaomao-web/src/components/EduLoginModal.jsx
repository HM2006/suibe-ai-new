/* ========================================
   小贸 - 教务系统登录弹窗组件（手动确认版）

   修改内容：
   1. 移除自动轮询登录状态检测
   2. 添加"我已登录"手动确认按钮
   3. 用户扫码后需手动点击确认，避免误判
   ======================================== */
import { useState, useEffect, useRef } from 'react'
import { X, QrCode, RefreshCw, CheckCircle, AlertCircle, Loader, LogIn } from 'lucide-react'

const API_BASE = '/api/edu'

/* 请求超时时间（毫秒） */
const QR_FETCH_TIMEOUT = 60000

function EduLoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [qrImage, setQrImage] = useState('')
  /* 状态：loading | waiting | confirming | success | error */
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [loadingText, setLoadingText] = useState('正在启动浏览器...')
  const [confirming, setConfirming] = useState(false)
  const abortControllerRef = useRef(null)

  /* 获取登录二维码 */
  const fetchQRCode = async () => {
    setStatus('loading')
    setError('')
    setQrImage('')
    setLoadingText('正在启动浏览器...')

    /* 取消之前的请求 */
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    /* 模拟进度文字更新 */
    const loadingSteps = [
      '正在启动浏览器...',
      '正在打开教务系统...',
      '正在跳转到认证平台...',
      '正在加载二维码...',
    ]
    let stepIndex = 0
    const stepTimer = setInterval(() => {
      stepIndex++
      if (stepIndex < loadingSteps.length) {
        setLoadingText(loadingSteps[stepIndex])
      }
    }, 4000)

    try {
      /* 设置请求超时 */
      const timeoutId = setTimeout(() => controller.abort(), QR_FETCH_TIMEOUT)

      const res = await fetch(`${API_BASE}/login/qr`, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      clearInterval(stepTimer)

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || `服务器错误 (${res.status})`)
      }

      const data = await res.json()

      /* 修复：正确解析嵌套的响应结构 */
      const qrCodeImage = data.data?.qrCodeImage || data.qrCodeImage || data.data?.qrImage

      if (data.success && qrCodeImage) {
        setQrImage(qrCodeImage)
        setStatus('waiting')
      } else {
        setStatus('error')
        const errMsg = data.message || data.error?.message || '获取二维码失败'
        setError(errMsg)
      }
    } catch (err) {
      clearInterval(stepTimer)
      console.error('获取二维码失败:', err)

      if (err.name === 'AbortError') {
        setStatus('error')
        setError('请求超时，请检查网络连接后重试')
      } else {
        setStatus('error')
        setError(err.message || '网络错误，请检查后端服务是否启动')
      }
    }
  }

  /* 手动确认登录：用户点击"我已登录"后检查登录状态 */
  const handleConfirmLogin = async () => {
    setConfirming(true)
    try {
      const res = await fetch(`${API_BASE}/login/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 5000 }),
      })
      const data = await res.json()

      const loggedIn = data.data?.loggedIn === true

      if (loggedIn) {
        setStatus('success')
        setTimeout(() => {
          if (onLoginSuccess) onLoginSuccess()
        }, 1000)
      } else {
        setStatus('error')
        setError('尚未检测到登录成功，请确认是否已完成扫码登录')
        /* 3秒后恢复到等待状态，让用户可以重试 */
        setTimeout(() => {
          if (qrImage) {
            setStatus('waiting')
          }
        }, 3000)
      }
    } catch (err) {
      console.error('检查登录状态失败:', err)
      setStatus('error')
      setError('检查登录状态失败，请重试')
      setTimeout(() => {
        if (qrImage) {
          setStatus('waiting')
        }
      }, 3000)
    } finally {
      setConfirming(false)
    }
  }

  /* 弹窗打开时获取二维码（不再自动轮询） */
  useEffect(() => {
    if (isOpen) {
      fetchQRCode()
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [isOpen])

  const handleClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setStatus('loading')
    setError('')
    setQrImage('')
    setConfirming(false)
    if (onClose) onClose()
  }

  const handleRefresh = () => {
    fetchQRCode()
  }

  if (!isOpen) return null

  return (
    <div className="edu-login-overlay" onClick={handleClose}>
      <div className="edu-login-modal" onClick={(e) => e.stopPropagation()}>
        {/* 关闭按钮 */}
        <button
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onClick={handleClose}
          onMouseEnter={(e) => {
            e.target.style.background = 'var(--bg-secondary)'
            e.target.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'none'
            e.target.style.color = 'var(--text-muted)'
          }}
        >
          <X size={18} />
        </button>

        {/* 标题 */}
        <div className="edu-login-title">教务系统登录</div>
        <div className="edu-login-desc">扫码登录以同步您的教务数据</div>

        {/* 加载状态 */}
        {status === 'loading' && (
          <div className="edu-login-qr-container" style={{ flexDirection: 'column', gap: '16px' }}>
            <Loader
              size={32}
              style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }}
            />
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {loadingText}
            </div>
          </div>
        )}

        {/* 等待扫码 */}
        {status === 'waiting' && qrImage && (
          <>
            <div className="edu-login-qr-container">
              <img src={`data:image/png;base64,${qrImage}`} alt="登录二维码" />
            </div>
            <div className="edu-login-hint">
              <QrCode size={14} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
              请使用微信扫描二维码登录
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px' }}>
              扫码完成后，请点击下方按钮确认
            </div>
          </>
        )}

        {/* 登录成功 */}
        {status === 'success' && (
          <div className="edu-login-status success">
            <CheckCircle size={48} />
            <div style={{ fontSize: '16px', fontWeight: 600 }}>登录成功</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>正在同步数据...</div>
          </div>
        )}

        {/* 错误状态 */}
        {status === 'error' && (
          <div className="edu-login-status" style={{ color: '#DC2626' }}>
            <AlertCircle size={48} />
            <div style={{ fontSize: '14px', fontWeight: 500, maxWidth: '280px', textAlign: 'center', lineHeight: '1.5' }}>
              {error}
            </div>
          </div>
        )}

        {/* 按钮区域 */}
        {status !== 'success' && (
          <div className="edu-login-actions">
            {status === 'waiting' && (
              <>
                <button
                  className="edu-login-btn primary"
                  onClick={handleConfirmLogin}
                  disabled={confirming}
                  style={{
                    opacity: confirming ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <LogIn size={14} />
                  {confirming ? '验证中...' : '我已登录'}
                </button>
                <button className="edu-login-btn" onClick={handleRefresh}>
                  <RefreshCw size={14} />
                  刷新二维码
                </button>
              </>
            )}
            {status === 'error' && (
              <button className="edu-login-btn primary" onClick={handleRefresh}>
                <RefreshCw size={14} />
                重试
              </button>
            )}
            <button className="edu-login-btn" onClick={handleClose}>
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default EduLoginModal
