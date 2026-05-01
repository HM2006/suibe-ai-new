/* ========================================
   小贸 - 管理后台页面
   重新设计：统计概览 + 用户管理 + 系统信息
   仅admin角色可访问
   ======================================== */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import {
  Shield, Users, BarChart3, ArrowLeft, RefreshCw,
  Calendar, BookOpen, Activity, Clock, UserPlus,
  Trash2, Eye, Server, Database, Cpu,
  MessageSquare, ThumbsUp, ThumbsDown
} from 'lucide-react'
import { API } from '../config/api'

/**
 * 格式化日期时间
 */
function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

/**
 * 统计卡片组件
 */
function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--card-border)',
      borderRadius: '16px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
        <div style={{
          width: '32px', height: '32px', borderRadius: '10px',
          background: `${color}15`, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

/**
 * 用户统计面板
 */
function UserStatsPanel({ userId, username, onBack }) {
  const { token } = useUser()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`${API.admin}/users/${userId}/stats`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        const data = await res.json()
        if (data.success && data.data) {
          setStats(data.data)
        } else {
          setError(data.message || '获取统计失败')
        }
      } catch {
        setError('网络错误，请稍后重试')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [userId, token])

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          background: 'none', border: 'none',
          color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer',
          marginBottom: '16px', padding: '4px 0',
        }}
      >
        <ArrowLeft size={16} /> 返回用户列表
      </button>

      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
        {username} 的数据统计
      </h3>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
          <div style={{ marginTop: '8px', fontSize: '13px' }}>加载中...</div>
        </div>
      )}

      {error && (
        <div style={{
          padding: '12px 16px', background: '#FEF2F2', color: '#991B1B',
          borderRadius: '8px', fontSize: '13px',
        }}>{error}</div>
      )}

      {stats && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* 课表缓存 */}
          <div style={{
            padding: '16px', background: 'var(--card-bg)',
            border: '1px solid var(--card-border)', borderRadius: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Calendar size={16} style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: '14px', fontWeight: 600 }}>课表缓存</span>
            </div>
            {stats.scheduleCache ? (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>状态：✅ 已缓存</div>
                <div>更新时间：{formatDateTime(stats.scheduleCache.updated_at)}</div>
                {stats.scheduleCache.data && Array.isArray(stats.scheduleCache.data) && (
                  <div>课程数量：{stats.scheduleCache.data.length} 门</div>
                )}
                {stats.scheduleCache.data && typeof stats.scheduleCache.data === 'object' && !Array.isArray(stats.scheduleCache.data) && stats.scheduleCache.data.schedule && (
                  <div>课程数量：{stats.scheduleCache.data.schedule.length} 门</div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>❌ 未缓存课表数据</div>
            )}
          </div>

          {/* 成绩缓存 */}
          <div style={{
            padding: '16px', background: 'var(--card-bg)',
            border: '1px solid var(--card-border)', borderRadius: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <BookOpen size={16} style={{ color: '#10B981' }} />
              <span style={{ fontSize: '14px', fontWeight: 600 }}>成绩缓存</span>
            </div>
            {stats.gradesCache ? (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>状态：✅ 已缓存</div>
                <div>更新时间：{formatDateTime(stats.gradesCache.updated_at)}</div>
                {stats.gradesCache.gpa && <div>GPA：{stats.gradesCache.gpa}</div>}
                {stats.gradesCache.total_credits && <div>总学分：{stats.gradesCache.total_credits}</div>}
                {stats.gradesCache.data && (() => {
                  const grades = Array.isArray(stats.gradesCache.data) ? stats.gradesCache.data : (stats.gradesCache.data.grades || [])
                  return <div>成绩记录：{grades.length} 条</div>
                })()}
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>❌ 未缓存成绩数据</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 对话记录面板
 */
function ChatRecordsPanel() {
  const { token } = useUser()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [filterUserId, setFilterUserId] = useState('')
  const pageSize = 15

  const fetchRecords = async (p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: p, pageSize })
      if (filterUserId) params.append('userId', filterUserId)
      const res = await fetch(`${API.admin}/chat-records?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && data.data) {
        setRecords(data.data.records || [])
        setTotal(data.data.total || 0)
      }
    } catch {
      console.error('获取对话记录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRecords(1) }, [filterUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(total / pageSize)

  const handlePageChange = (newPage) => {
    setPage(newPage)
    fetchRecords(newPage)
  }

  const handleDeleteRecord = async (recordId) => {
    if (!confirm('确定删除这条对话记录？')) return
    try {
      const res = await fetch(`${API.admin}/chat-records/${recordId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        fetchRecords(page)
      }
    } catch {
      alert('删除失败')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="按用户ID筛选..."
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--card-border)',
            background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '13px',
            width: '160px', outline: 'none',
          }}
        />
        <button
          onClick={() => { setPage(1); fetchRecords(1) }}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '8px 12px', borderRadius: '8px',
            border: '1px solid var(--card-border)', background: 'var(--card-bg)',
            color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer',
          }}
        >
          <RefreshCw size={12} /> 刷新
        </button>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>共 {total} 条记录</span>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
          <div style={{ marginTop: '8px', fontSize: '13px' }}>加载中...</div>
        </div>
      )}

      {!loading && records.length === 0 && (
        <div className="chat-record-empty">暂无对话记录</div>
      )}

      {!loading && records.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {records.map(record => (
            <div key={record.id} className="chat-record-card">
              <div className="chat-record-header">
                <div className="chat-record-user">
                  <div className="chat-record-user-avatar">
                    {(record.nickname || record.username || '?')[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="chat-record-user-name">{record.nickname || record.username || '匿名用户'}</div>
                    <div className="chat-record-user-id">用户ID: {record.user_id || '-'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {record.reaction && (
                    <span className={`chat-record-reaction ${record.reaction}`}>
                      {record.reaction === 'like' ? <><ThumbsUp size={11} /> 赞</> : <><ThumbsDown size={11} /> 踩</>}
                    </span>
                  )}
                  <span className="chat-record-time">{formatDateTime(record.created_at)}</span>
                </div>
              </div>
              <div className="chat-record-body">
                <div className="chat-record-msg user">
                  {record.user_message?.length > 200 ? record.user_message.slice(0, 200) + '...' : record.user_message}
                </div>
                <div className="chat-record-msg assistant">
                  {record.ai_answer?.length > 300 ? record.ai_answer.slice(0, 300) + '...' : record.ai_answer}
                </div>
              </div>
              <div className="chat-record-footer">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {record.reaction === 'like' && (
                    <span style={{ fontSize: '11px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <ThumbsUp size={11} /> 用户点赞
                    </span>
                  )}
                  {record.reaction === 'dislike' && (
                    <span style={{ fontSize: '11px', color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <ThumbsDown size={11} /> 用户踩
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteRecord(record.id)}
                  style={{
                    background: 'none', border: 'none', color: '#EF4444',
                    fontSize: '11px', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}
                >
                  <Trash2 size={12} /> 删除
                </button>
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="chat-record-pagination">
              <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1}>上一页</button>
              <span>{page} / {totalPages}</span>
              <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}>下一页</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * 管理后台主页面
 */
function AdminPage() {
  const { user, token } = useUser()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedUsername, setSelectedUsername] = useState('')
  const [activeTab, setActiveTab] = useState('overview')

  /* 未登录 → 引导登录 */
  if (!user) {
    return (
      <div style={{
        maxWidth: '400px', margin: '0 auto', padding: '60px 20px', textAlign: 'center',
      }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%',
          background: '#EEF2FF', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 20px',
        }}>
          <Shield size={32} style={{ color: 'var(--primary)' }} />
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>管理后台</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.6 }}>
          请先使用管理员账号登录
        </p>
        <button
          onClick={() => navigate('/user')}
          style={{
            width: '100%', padding: '12px', borderRadius: '12px',
            border: 'none', background: 'var(--primary)', color: '#fff',
            fontSize: '15px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          前往登录
        </button>
      </div>
    )
  }

  /* 非管理员 → 无权提示 */
  if (user.role !== 'admin') {
    return (
      <div style={{
        maxWidth: '400px', margin: '0 auto', padding: '60px 20px', textAlign: 'center',
      }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%',
          background: '#FEF2F2', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 20px',
        }}>
          <Shield size={32} style={{ color: '#EF4444' }} />
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>无权访问</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px' }}>
          管理后台仅限管理员账号访问
        </p>
        <button
          onClick={() => navigate('/chat')}
          style={{
            padding: '10px 24px', borderRadius: '10px',
            border: '1px solid var(--card-border)', background: 'var(--card-bg)',
            color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer',
          }}
        >
          返回首页
        </button>
      </div>
    )
  }

  /* 获取用户列表 */
  const fetchUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API.admin}/users`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && data.data) {
        setUsers(Array.isArray(data.data) ? data.data : data.data.users || [])
      } else {
        setError(data.message || '获取用户列表失败')
      }
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  /* 删除用户 */
  const deleteUser = async (userId, username) => {
    if (!confirm(`确定要删除用户 "${username}" 吗？此操作不可恢复。`)) return
    try {
      const res = await fetch(`${API.admin}/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        fetchUsers()
      } else {
        alert(data.message || '删除失败')
      }
    } catch {
      alert('网络错误')
    }
  }

  useEffect(() => { fetchUsers() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* 统计数据 */
  const totalUsers = users.length
  const adminUsers = users.filter(u => u.role === 'admin').length
  const connectedUsers = users.filter(u => u.eduConnected).length
  const todayUsers = users.filter(u => {
    if (!u.lastLoginAt) return false
    const today = new Date().toDateString()
    return new Date(u.lastLoginAt).toDateString() === today
  }).length

  /* 用户详情视图 */
  if (selectedUserId) {
    return (
      <div style={{ padding: '20px' }}>
        <UserStatsPanel
          userId={selectedUserId}
          username={selectedUsername}
          onBack={() => { setSelectedUserId(null); setSelectedUsername('') }}
        />
      </div>
    )
  }

  /* Tab 栏 */
  const tabs = [
    { key: 'overview', label: '概览', icon: BarChart3 },
    { key: 'users', label: '用户管理', icon: Users },
    { key: 'chatrecords', label: '对话记录', icon: MessageSquare },
  ]

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 页面标题 */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>管理后台</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>系统管理与数据监控</p>
      </div>

      {/* Tab 切换 */}
      <div style={{
        display: 'flex', gap: '4px', background: 'var(--bg-secondary)',
        borderRadius: '12px', padding: '4px',
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
              background: activeTab === tab.key ? 'var(--card-bg)' : 'transparent',
              color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: '13px', fontWeight: activeTab === tab.key ? 600 : 400,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '6px',
              boxShadow: activeTab === tab.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* 概览 Tab */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <StatCard icon={Users} label="总用户数" value={totalUsers} color="#6366F1" sub={`管理员 ${adminUsers} 人`} />
            <StatCard icon={UserPlus} label="今日活跃" value={todayUsers} color="#10B981" sub="今日登录用户" />
            <StatCard icon={Activity} label="教务已连接" value={connectedUsers} color="#F59E0B" sub={`占比 ${totalUsers > 0 ? Math.round(connectedUsers / totalUsers * 100) : 0}%`} />
            <StatCard icon={Clock} label="系统运行" value="正常" color="#3B82F6" sub="所有服务正常" />
          </div>

          {/* 最近注册用户 */}
          <div style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderRadius: '16px', padding: '16px',
          }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>最近注册用户</div>
            {users.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>暂无用户</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[...users]
                  .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0))
                  .slice(0, 5)
                  .map(u => (
                    <div key={u.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: '10px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%',
                          background: '#EEF2FF', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: '14px', fontWeight: 600,
                          color: 'var(--primary)',
                        }}>
                          {(u.nickname || u.username || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 500 }}>{u.nickname || u.username}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {formatDateTime(u.createdAt || u.created_at)}
                          </div>
                        </div>
                      </div>
                      <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '6px',
                        background: u.role === 'admin' ? '#EEF2FF' : '#F3F4F6',
                        color: u.role === 'admin' ? '#6366F1' : '#6B7280',
                      }}>
                        {u.role === 'admin' ? '管理员' : '用户'}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 用户管理 Tab */}
      {activeTab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* 操作栏 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              共 {totalUsers} 位用户
            </span>
            <button
              onClick={fetchUsers}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '6px 12px', borderRadius: '8px',
                border: '1px solid var(--card-border)', background: 'var(--card-bg)',
                color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} /> 刷新
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div style={{
              padding: '12px 16px', background: '#FEF2F2', color: '#991B1B',
              borderRadius: '8px', fontSize: '13px',
            }}>{error}</div>
          )}

          {/* 加载中 */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
              <div style={{ marginTop: '8px', fontSize: '13px' }}>加载中...</div>
            </div>
          )}

          {/* 用户卡片列表 */}
          {!loading && !error && users.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '14px' }}>
              暂无用户数据
            </div>
          )}

          {!loading && !error && users.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {users.map(u => (
                <div key={u.id} style={{
                  background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                  borderRadius: '14px', padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: '12px',
                }}>
                  {/* 头像 */}
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                    background: u.avatar ? 'transparent' : '#EEF2FF',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: u.avatar ? '20px' : '16px', fontWeight: 600,
                    color: 'var(--primary)', overflow: 'hidden',
                  }}>
                    {u.avatar || (u.nickname || u.username || '?')[0].toUpperCase()}
                  </div>

                  {/* 用户信息 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.nickname || u.username}
                      </span>
                      <span style={{
                        fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                        background: u.role === 'admin' ? '#EEF2FF' : '#F3F4F6',
                        color: u.role === 'admin' ? '#6366F1' : '#9CA3AF',
                        fontWeight: 500,
                      }}>
                        {u.role === 'admin' ? '管理员' : '用户'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      @{u.username}
                      {u.eduConnected && (
                        <span style={{ color: '#10B981', marginLeft: '8px' }}>● 教务已连接</span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      注册：{formatDateTime(u.createdAt || u.created_at)}
                      {u.lastLoginAt && ` · 最近登录：${formatDateTime(u.lastLoginAt)}`}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button
                      onClick={() => { setSelectedUserId(u.id); setSelectedUsername(u.nickname || u.username) }}
                      style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        border: '1px solid var(--card-border)', background: 'var(--bg-secondary)',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      title="查看统计"
                    >
                      <Eye size={14} />
                    </button>
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => deleteUser(u.id, u.username)}
                        style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          border: '1px solid #FECACA', background: '#FEF2F2',
                          color: '#EF4444', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        title="删除用户"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 对话记录 Tab */}
      {activeTab === 'chatrecords' && (
        <ChatRecordsPanel />
      )}
    </div>
  )
}

export default AdminPage
