/* ========================================
   小贸 - MOOC助手页面
   展示网课课程列表 + 平台链接 + 倒计时
   ======================================== */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ExternalLink, Clock, AlertTriangle, Loader, RefreshCw } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { API } from '../config/api'

const MOOC_DEADLINE = new Date('2026-06-21T23:59:59+08:00')

/* 平台颜色映射 */
const platformColors = {
  '雨课堂': { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' },
  '学习通（超星尔雅）': { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' },
  '智慧树': { bg: '#D1FAE5', color: '#059669', border: '#6EE7B7' },
}

function getPlatformStyle(name) {
  return platformColors[name] || { bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' }
}

function getCountdown() {
  const now = new Date()
  const diff = MOOC_DEADLINE - now
  if (diff <= 0) return { text: '已截止', days: 0, urgent: false }
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const urgent = days <= 14
  return { text: `${days}天${hours}小时`, days, urgent }
}

function MoocPage() {
  const navigate = useNavigate()
  const { user, token } = useUser()
  const [moocCourses, setMoocCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(getCountdown())

  /* 倒计时定时器 */
  useEffect(() => {
    const timer = setInterval(() => setCountdown(getCountdown()), 60000)
    return () => clearInterval(timer)
  }, [])

  /* 加载MOOC数据 */
  const loadMooc = useCallback(async () => {
    if (!user?.id || !token) { setLoading(false); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API.edu}/mooc?userId=${user.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setMoocCourses(data.data || [])
      } else {
        setError(data.message || '加载失败')
      }
    } catch (err) {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [user?.id, token])

  useEffect(() => { loadMooc() }, [loadMooc])

  if (!user) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <BookOpen size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
        <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>
          登录后查看MOOC课程
        </p>
        <button onClick={() => navigate('/user')} style={{
          padding: '10px 24px', borderRadius: '20px', border: 'none',
          background: 'var(--primary)', color: '#fff', fontSize: '14px', cursor: 'pointer',
        }}>前往登录</button>
      </div>
    )
  }

  return (
    <div className="notes-container">
      <div className="page-header">
        <h1 className="page-title">MOOC助手</h1>
        <p className="page-desc">网课学习进度管理</p>
      </div>

      {/* 倒计时卡片 */}
      <div style={{
        padding: '16px 18px', borderRadius: '14px', marginBottom: '20px',
        background: countdown.urgent
          ? 'linear-gradient(135deg, #FEF2F2, #FEE2E2)'
          : 'linear-gradient(135deg, #EEF2FF, #E0E7FF)',
        border: `1px solid ${countdown.urgent ? '#FECACA' : '#C7D2FE'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Clock size={16} style={{ color: countdown.urgent ? '#DC2626' : '#4F46E5' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: countdown.urgent ? '#DC2626' : '#4F46E5' }}>
            本学期MOOC截止时间
          </span>
        </div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: countdown.urgent ? '#991B1B' : '#3730A3', marginBottom: '4px' }}>
          2026年6月21日 23:59
        </div>
        <div style={{ fontSize: '13px', color: countdown.urgent ? '#B91C1C' : '#6366F1' }}>
          {countdown.days <= 0 ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={14} /> MOOC学习已截止
            </span>
          ) : (
            <>距离截止还有 <strong>{countdown.text}</strong>，请尽快学习！</>
          )}
        </div>
      </div>

      {/* 加载状态 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <Loader size={20} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#DC2626', fontSize: '14px', marginBottom: '12px' }}>{error}</p>
          <button onClick={loadMooc} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--card-border)',
            background: 'var(--card-bg)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px',
          }}>
            <RefreshCw size={14} /> 重试
          </button>
        </div>
      ) : moocCourses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          <BookOpen size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>
            暂无MOOC课程
          </p>
          <p style={{ fontSize: '13px', marginBottom: '16px' }}>
            {user.eduConnected
              ? '本学期没有需要学习的网课课程'
              : '请先连接教务系统以获取MOOC课程信息'}
          </p>
          {!user.eduConnected && (
            <button onClick={() => navigate('/campus/schedule')} style={{
              padding: '10px 24px', borderRadius: '20px', border: 'none',
              background: 'var(--primary)', color: '#fff', fontSize: '14px', cursor: 'pointer',
            }}>前往连接教务系统</button>
          )}
        </div>
      ) : (
        <>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            本学期有 <strong style={{ color: 'var(--text-primary)' }}>{moocCourses.length}</strong> 门MOOC课程需要学习
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {moocCourses.map((course, idx) => {
              const style = getPlatformStyle(course.platform)
              return (
                <div key={idx} style={{
                  padding: '16px 18px', borderRadius: '14px',
                  background: style.bg, border: `1px solid ${style.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                        {course.name}
                      </div>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '3px 10px', borderRadius: '12px',
                        background: 'rgba(255,255,255,0.7)', fontSize: '12px',
                        color: style.color, fontWeight: 500,
                      }}>
                        <BookOpen size={12} /> {course.platform}
                      </div>
                    </div>
                    {course.platformUrl && (
                      <a href={course.platformUrl} target="_blank" rel="noopener noreferrer" style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '8px 14px', borderRadius: '10px', textDecoration: 'none',
                        background: style.color, color: '#fff', fontSize: '12px', fontWeight: 600,
                        flexShrink: 0,
                      }}>
                        进入学习 <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  {course.remarkUrl && (
                    <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      📌 学习通知：
                      <a href={course.remarkUrl} target="_blank" rel="noopener noreferrer"
                        style={{ color: style.color, textDecoration: 'underline', marginLeft: '4px' }}>
                        查看详情
                      </a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default MoocPage
