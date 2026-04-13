/* ========================================
   小贸 - 教务系统登录弹窗组件（自动轮询版）

   流程：
   1. 打开弹窗 → 自动获取二维码
   2. 显示二维码 → 自动轮询登录状态（每2秒）
   3. 检测到登录成功 → 自动关闭弹窗并回调 onLoginSuccess
   4. 二维码失效 → 提示用户刷新
   ======================================== */
import { useState, useEffect, useRef, useCallback } from 'react'
import { X, QrCode, RefreshCw, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { API } from '../config/api'

/* 请求超时时间（毫秒） */
const QR_FETCH_TIMEOUT = 60000
/* 轮询间隔（毫秒） */
const POLL_INTERVAL = 2000
/* 轮询最大时长（毫秒） */
const POLL_MAX_DURATION = 120000

function EduLoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [qrImage, setQrImage] = useState('')
  /* 状态：loading | waiting | polling_success | success | error | expired */
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [loadingText, setLoadingText] = useState('正在获取二维码...')
  const abortControllerRef = useRef(null)
  const pollTimerRef = useRef(null)
  const pollStartRef = useRef(null)

  /* 停止轮询 */
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    pollStartRef.current = null
  }, [])

  /* 获取登录二维码 */
  const fetchQRCode = useCallback(async () => {
    setStatus('loading')
    setError('')
    setQrImage('')
    setLoadingText('正在获取二维码...')
    stopPolling()

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const timeoutId = setTimeout(() => controller.abort(), QR_FETCH_TIMEOUT)

      const res = await fetch(`${API.edu}/login/qr`, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || `服务器错误 (${res.status})`)
      }

      const data = await res.json()
      const qrCodeImage = data.data?.qrCodeImage || data.qrCodeImage || data.data?.qrImage

      if (data.success && qrCodeImage) {
        setQrImage(qrCodeImage)
        setStatus('waiting')
      } else {
        setStatus('error')
        setError(data.message || data.error?.message || '获取二维码失败')
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('error')
        setError('请求超时，请检查网络连接后重试')
      } else {
        setStatus('error')
        setError(err.message || '网络错误，请检查后端服务是否启动')
      }
    }
  }, [stopPolling])

  /* 开始轮询登录状态 */
  const startPolling = useCallback(() => {
    stopPolling()
    pollStartRef.current = Date.now()

    pollTimerRef.current = setInterval(async () => {
      /* 超时检查 */
      if (Date.now() - pollStartRef.current > POLL_MAX_DURATION) {
        stopPolling()
        setStatus('expired')
        return
      }

      try {
        const res = await fetch(`${API.edu}/login/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeout: 3000 }),
        })
        const data = await res.json()
        const loggedIn = data.data?.loggedIn === true

        if (loggedIn) {
          stopPolling()
          setStatus('success')
          /* 自动关闭弹窗并通知父组件 */
          setTimeout(() => {
            if (onLoginSuccess) onLoginSuccess()
          }, 800)
        }
      } catch (err) {
        /* 轮询请求失败，静默忽略，继续下一次轮询 */
        console.warn('[EduLogin] 轮询请求失败:', err.message)
      }
    }, POLL_INTERVAL)
  }, [stopPolling, onLoginSuccess])

  /* 弹窗打开时获取二维码，获取成功后自动开始轮询 */
  useEffect(() => {
    if (isOpen) {
      fetchQRCode()
    }
    return () => {
      stopPolling()
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [isOpen, fetchQRCode, stopPolling])

  /* 当状态变为 waiting 时开始轮询 */
  useEffect(() => {
    if (status === 'waiting') {
      startPolling()
    }
    return () => stopPolling()
  }, [status, startPolling, stopPolling])

  const handleClose = () => {
    stopPolling()
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setStatus('loading')
    setError('')
    setQrImage('')
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

        {/* 等待扫码 + 自动轮询中 */}
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
              扫码确认后将自动跳转，请稍候...
            </div>
          </>
        )}

        {/* 二维码已失效 */}
        {status === 'expired' && (
          <div className="edu-login-status" style={{ color: '#D97706' }}>
            <AlertCircle size={48} />
            <div style={{ fontSize: '14px', fontWeight: 500, textAlign: 'center', lineHeight: '1.5' }}>
              二维码已过期
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              请点击下方按钮刷新
            </div>
          </div>
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
            {(status === 'waiting' || status === 'expired') && (
              <button className="edu-login-btn primary" onClick={handleRefresh}>
                <RefreshCw size={14} />
                刷新二维码
              </button>
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
