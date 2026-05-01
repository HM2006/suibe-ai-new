/* ========================================
   小贸 - 教务系统登录弹窗组件（自动轮询版）

   逻辑：
   1. 获取二维码并显示
   2. 自动轮询后端检测扫码状态
   3. 检测到登录成功后自动关闭弹窗并同步数据
   ======================================== */
import { useState, useEffect, useRef, useCallback } from 'react'
import { X, QrCode, RefreshCw, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { API } from '../config/api'

/* 请求超时时间（毫秒） */
const QR_FETCH_TIMEOUT = 60000
/* 轮询间隔（毫秒）— 5秒，避免频繁请求触发防火墙 */
const POLL_INTERVAL = 5000
/* 最大轮询次数（约 3.3 分钟） */
const MAX_POLL_COUNT = 40

function EduLoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [qrImage, setQrImage] = useState('')
  /* 状态：loading | waiting | polling | success | error | expired */
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [loadingText, setLoadingText] = useState('正在启动浏览器...')
  const [pollCount, setPollCount] = useState(0)
  const abortControllerRef = useRef(null)
  const pollTimerRef = useRef(null)
  const pollCountRef = useRef(0)

  /* 清理轮询定时器 */
  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  /* 获取登录二维码 */
  const fetchQRCode = useCallback(async () => {
    setStatus('loading')
    setError('')
    setQrImage('')
    setLoadingText('正在启动浏览器...')
    setPollCount(0)
    pollCountRef.current = 0
    clearPollTimer()

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
      const timeoutId = setTimeout(() => controller.abort(), QR_FETCH_TIMEOUT)

      const res = await fetch(`${API.edu}/login/qr`, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      clearInterval(stepTimer)

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
  }, [clearPollTimer])

  /* 轮询检测登录状态 */
  const startPolling = useCallback(() => {
    clearPollTimer()
    pollCountRef.current = 0

    pollTimerRef.current = setInterval(async () => {
      pollCountRef.current++
      setPollCount(pollCountRef.current)

      if (pollCountRef.current > MAX_POLL_COUNT) {
        clearPollTimer()
        setStatus('expired')
        setError('二维码已过期，请刷新重试')
        return
      }

      try {
        const res = await fetch(`${API.edu}/login/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeout: 5000 }),
        })
        const data = await res.json()
        const loggedIn = data.data?.loggedIn === true

        if (loggedIn) {
          clearPollTimer()
          setStatus('success')
          /* 自动触发登录成功回调 */
          setTimeout(() => {
            if (onLoginSuccess) onLoginSuccess()
          }, 800)
        }
      } catch (err) {
        console.warn('轮询登录状态失败:', err)
      }
    }, POLL_INTERVAL)
  }, [clearPollTimer, onLoginSuccess])

  /* 弹窗打开时获取二维码，获取成功后自动开始轮询 */
  useEffect(() => {
    if (isOpen) {
      fetchQRCode()
    }

    return () => {
      clearPollTimer()
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [isOpen, fetchQRCode, clearPollTimer])

  /* 当状态变为 waiting 时，开始轮询 */
  useEffect(() => {
    if (status === 'waiting') {
      startPolling()
    }
  }, [status, startPolling])

  const handleClose = () => {
    clearPollTimer()
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setStatus('loading')
    setError('')
    setQrImage('')
    setPollCount(0)
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

        {/* 等待扫码（自动轮询中） */}
        {status === 'waiting' && qrImage && (
          <>
            <div className="edu-login-qr-container">
              <img src={`data:image/png;base64,${qrImage}`} alt="登录二维码" />
            </div>
            <div className="edu-login-hint">
              <QrCode size={14} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
              请使用手机微信扫描二维码登录
            </div>
            {/Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent) && (
              <button
                className="edu-login-wechat-btn"
                onClick={() => {
                  const wechatUrl = 'weixin://'
                  const appStoreUrl = 'https://apps.apple.com/app/wechat/id414478124'
                  const link = document.createElement('a')
                  link.href = wechatUrl
                  link.click()
                  setTimeout(() => {
                    if (!document.hidden) {
                      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
                      if (isIOS) window.open(appStoreUrl, '_blank')
                    }
                  }, 2000)
                }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05a6.329 6.329 0 0 1-.248-1.753c0-3.694 3.381-6.69 7.555-6.69.258 0 .507.023.76.042C16.648 4.634 13.022 2.188 8.691 2.188zm-2.35 4.477a1.06 1.06 0 1 1 0 2.12 1.06 1.06 0 0 1 0-2.12zm4.7 0a1.06 1.06 0 1 1 0 2.12 1.06 1.06 0 0 1 0-2.12zM16.885 9.477c-3.694 0-6.69 2.71-6.69 6.055 0 3.344 2.996 6.055 6.69 6.055.726 0 1.424-.108 2.082-.306a.714.714 0 0 1 .59.08l1.394.816a.267.267 0 0 0 .136.044c.131 0 .238-.108.238-.242 0-.06-.023-.117-.039-.174l-.285-1.082a.484.484 0 0 1 .175-.545c1.508-1.103 2.46-2.728 2.46-4.546-.09-3.345-3.086-6.055-6.78-6.055h.049zm-2.35 3.688a.876.876 0 1 1 0 1.752.876.876 0 0 1 0-1.752zm4.7 0a.876.876 0 1 1 0 1.752.876.876 0 0 1 0-1.752z"/>
                </svg>
                打开微信扫码
              </button>
            )}
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px' }}>
              扫码后将自动检测登录状态...
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

        {/* 错误/过期状态 */}
        {(status === 'error' || status === 'expired') && (
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
