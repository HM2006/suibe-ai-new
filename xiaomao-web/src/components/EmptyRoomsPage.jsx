/* ========================================
   小贸 - 空教室查询页面
   表格视图 + AI对话式查询
   ======================================== */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DoorOpen, Search, Loader, RefreshCw, MessageSquare,
  ChevronRight, Calendar, Clock, Users, Building2, X, Send
} from 'lucide-react'
import { useUser } from '../contexts/UserContext'

const API_BASE = '/api/empty-rooms'
const BUILDINGS = ['教学楼A楼', '教学楼B楼', '教学楼C楼', '教学楼D楼', '图文信息楼', '古北综合楼']
const SLOT_LABELS = ['第1节', '第2节', '第3节', '第4节', '第5节', '午休', '第6节', '第7节', '第8节', '第9节', '第10节', '暮休', '第11节', '第12节', '第13节', '第14节']

function formatDate(date) {
  const d = new Date(date)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function getWeekday(date) {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return days[new Date(date).getDay()]
}

function getToday() {
  const d = new Date()
  return d.toISOString().split('T')[0]
}

/* ========== AI对话组件 ========== */
function AiChat({ onResult }) {
  const [step, setStep] = useState(0) // 0=选日期, 1=选节次, 2=选容量, 3=结果
  const [selectedDate, setSelectedDate] = useState(getToday())
  const [selectedSlots, setSelectedSlots] = useState([])
  const [minCapacity, setMinCapacity] = useState(0)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const dates = []
  for (let i = 0; i < 14; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    if (d.getDay() !== 0 && d.getDay() !== 6) { // 跳过周末
      dates.push(d.toISOString().split('T')[0])
    }
  }

  const toggleSlot = (s) => {
    setSelectedSlots(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s].sort())
  }

  const handleSearch = async () => {
    if (selectedSlots.length === 0) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        date: selectedDate,
        slots: selectedSlots.join(','),
        ...(minCapacity > 0 ? { minCapacity: String(minCapacity) } : {}),
      })
      const res = await fetch(`${API_BASE}/query?${params}`)
      const data = await res.json()
      setResult(data)
      if (data.success && onResult) onResult(data.data)
    } catch (e) {
      setResult({ success: false, message: '查询失败' })
    }
    setLoading(false)
  }

  const reset = () => {
    setStep(0); setSelectedDate(getToday()); setSelectedSlots([])
    setMinCapacity(0); setResult(null)
  }

  return (
    <div style={{ padding: '16px' }}>
      {/* 对话气泡 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        {/* AI消息 */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
          }}>🤖</div>
          <div style={{
            maxWidth: '85%', padding: '12px 16px', borderRadius: '4px 16px 16px 16px',
            background: '#F3F4F6', color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6',
          }}>
            {step === 0 && '你好！我可以帮你找空教室 🎓 请先选择你想查询的日期：'}
            {step === 1 && `好的，${formatDate(selectedDate)}（${getWeekday(selectedDate)}）。请选择你需要的时间段（可多选）：`}
            {step === 2 && `收到！还需要什么条件吗？对教室人数有要求吗？（不需要可直接查询）`}
            {step === 3 && result && !result.success && <span style={{ color: '#DC2626' }}>{result.message}</span>}
          </div>
        </div>

        {/* 用户选择区域 */}
        {step === 0 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
            <div style={{
              maxWidth: '85%', padding: '12px 16px', borderRadius: '16px 4px 16px 16px',
              background: 'var(--primary)', color: '#fff', fontSize: '14px',
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {dates.map(d => (
                  <button key={d} onClick={() => { setSelectedDate(d); setStep(1) }}
                    style={{
                      padding: '8px 14px', borderRadius: '10px', border: 'none',
                      background: selectedDate === d ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)',
                      color: '#fff', fontSize: '13px', cursor: 'pointer',
                      fontWeight: selectedDate === d ? 600 : 400,
                    }}>
                    {formatDate(d)} {getWeekday(d)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
            <div style={{
              maxWidth: '85%', padding: '12px 16px', borderRadius: '16px 4px 16px 16px',
              background: 'var(--primary)', color: '#fff', fontSize: '14px',
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                {[1,2,3,4,5,6,7,8,9,10,11,12,13,14].map(s => (
                  <button key={s} onClick={() => toggleSlot(s)}
                    style={{
                      padding: '6px 12px', borderRadius: '8px', border: 'none',
                      background: selectedSlots.includes(s) ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)',
                      color: '#fff', fontSize: '13px', cursor: 'pointer',
                      fontWeight: selectedSlots.includes(s) ? 600 : 400,
                    }}>
                    第{s}节
                  </button>
                ))}
              </div>
              {selectedSlots.length > 0 && (
                <button onClick={() => setStep(2)} style={{
                  padding: '8px 20px', borderRadius: '10px', border: 'none',
                  background: 'rgba(255,255,255,0.9)', color: 'var(--primary)',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}>
                  下一步 <ChevronRight size={14} style={{ verticalAlign: 'middle' }} />
                </button>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
            <div style={{
              maxWidth: '85%', padding: '12px 16px', borderRadius: '16px 4px 16px 16px',
              background: 'var(--primary)', color: '#fff', fontSize: '14px',
            }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                <input type="number" value={minCapacity || ''} onChange={e => setMinCapacity(parseInt(e.target.value) || 0)}
                  placeholder="不限" min="0" style={{
                    width: '80px', padding: '8px 12px', borderRadius: '8px', border: 'none',
                    fontSize: '14px', outline: 'none', textAlign: 'center',
                  }} />
                <span style={{ fontSize: '13px', opacity: 0.8 }}>人以上（留空则不限）</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleSearch} disabled={loading}
                  style={{
                    padding: '8px 20px', borderRadius: '10px', border: 'none',
                    background: loading ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.9)',
                    color: 'var(--primary)', fontSize: '13px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}>
                  {loading ? <Loader size={14} /> : <Search size={14} />} 查询
                </button>
                <button onClick={() => setMinCapacity(0)}
                  style={{
                    padding: '8px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.3)',
                    background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer',
                  }}>
                  不限人数
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 结果 */}
        {step >= 2 && result && result.success && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
            }}>🤖</div>
            <div style={{
              maxWidth: '85%', padding: '12px 16px', borderRadius: '4px 16px 16px 16px',
              background: '#F3F4F6', color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6',
            }}>
              {result.data.length > 0 ? (
                <>
                  <div style={{ fontWeight: 600, marginBottom: '8px' }}>
                    找到 <span style={{ color: '#059669' }}>{result.data.length}</span> 间符合条件的空教室：
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {result.data.slice(0, 20).map((r, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', background: '#fff', borderRadius: '8px', fontSize: '13px',
                      }}>
                        <span style={{ fontWeight: 600 }}>{r.room_name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                          {r.building} · {r.capacity}座
                        </span>
                      </div>
                    ))}
                    {result.data.length > 20 && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '4px' }}>
                        还有 {result.data.length - 20} 间...
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 600, marginBottom: '8px', color: '#DC2626' }}>
                    😅 没有找到完全符合条件的教室
                  </div>
                  {result.nearby && result.nearby.length > 0 && (
                    <>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        这些教室接近你的要求：
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {result.nearby.slice(0, 5).map((r, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 12px', background: '#fff', borderRadius: '8px', fontSize: '13px',
                          }}>
                            <span style={{ fontWeight: 600 }}>{r.room_name}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                              {r.building} · {r.capacity}座
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
              <button onClick={reset} style={{
                marginTop: '12px', padding: '6px 14px', borderRadius: '8px', border: 'none',
                background: 'var(--primary)', color: '#fff', fontSize: '12px', cursor: 'pointer',
              }}>
                重新查询
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ========== 快速查询表格视图 ========== */
function QuickView({ initialDate, onSwitchToAi }) {
  const [date, setDate] = useState(initialDate || getToday())
  const [slot, setSlot] = useState(null)
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchRooms = useCallback(async (d, s) => {
    if (!d || !s) return
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ date: d, slots: String(s) })
      const res = await fetch(`${API_BASE}/query?${params}`)
      const data = await res.json()
      if (data.success) {
        setRooms(data.data || [])
      } else {
        setError(data.message || '查询失败')
      }
    } catch { setError('网络错误') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (slot) fetchRooms(date, slot)
  }, [date, slot, fetchRooms])

  // 按楼宇分组
  const grouped = {}
  rooms.forEach(r => {
    if (!grouped[r.building]) grouped[r.building] = []
    grouped[r.building].push(r)
  })

  return (
    <div>
      {/* 日期选择 */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <Calendar size={14} /> 选择日期
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} min={getToday()} max="2026-06-30"
          style={{
            padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--card-border)',
            background: 'var(--bg)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
          }} />
      </div>

      {/* 节次选择 */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <Clock size={14} /> 选择节次
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {[1,2,3,4,5,6,7,8,9,10,11,12,13,14].map(s => (
            <button key={s} onClick={() => setSlot(s)}
              style={{
                padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--card-border)',
                background: slot === s ? 'var(--primary)' : 'var(--card-bg)',
                color: slot === s ? '#fff' : 'var(--text-secondary)',
                fontSize: '13px', cursor: 'pointer',
              }}>
              第{s}节
            </button>
          ))}
        </div>
      </div>

      {/* 结果 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Loader size={20} style={{ animation: 'spin 1s linear infinite', display: 'inline-block', color: 'var(--text-muted)' }} />
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#DC2626', fontSize: '14px' }}>{error}</div>
      ) : slot && rooms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '14px' }}>
          暂无数据，可能该日期尚未抓取
        </div>
      ) : slot ? (
        <div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            {formatDate(date)}（{getWeekday(date)}）第{slot}节，共 <strong style={{ color: 'var(--text-primary)' }}>{rooms.length}</strong> 间空教室
          </div>
          {Object.entries(grouped).map(([building, list]) => (
            <div key={building} style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Building2 size={14} /> {building} ({list.length}间)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {list.map((r, i) => (
                  <div key={i} style={{
                    padding: '8px 14px', borderRadius: '10px',
                    background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                    fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <span style={{ fontWeight: 600 }}>{r.room_name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{r.capacity}座</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '14px' }}>
          请选择日期和节次查看空教室
        </div>
      )}
    </div>
  )
}

/* ========== 主页面 ========== */
function EmptyRoomsPage() {
  const navigate = useNavigate()
  const { user, token } = useUser()
  const [mode, setMode] = useState('quick') // 'quick' | 'ai'
  const [status, setStatus] = useState(null)
  const [fetching, setFetching] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/status`)
      const data = await res.json()
      if (data.success) setStatus(data.data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const handleFetch = async () => {
    setFetching(true)
    try {
      const res = await fetch(`${API_BASE}/fetch`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setStatus(data.data)
      }
    } catch { /* ignore */ }
    setFetching(false)
  }

  return (
    <div className="notes-container">
      <div className="page-header">
        <h1 className="page-title">空教室查询</h1>
        <p className="page-desc">快速找到空闲教室</p>
      </div>

      {/* 数据状态 */}
      {status && (
        <div style={{
          padding: '12px 16px', borderRadius: '12px', marginBottom: '16px',
          background: status.lastFetch
            ? 'linear-gradient(135deg, #D1FAE5, #A7F3D0)'
            : 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
          border: `1px solid ${status.lastFetch ? '#6EE7B7' : '#FDE68A'}`,
          fontSize: '13px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: status.lastFetch ? '#065F46' : '#92400E' }}>
              {status.lastFetch
                ? `已抓取 ${status.dateRange || '部分数据'}（${status.totalRecords || 0}条记录）`
                : '暂无数据，请先抓取'}
            </span>
            <button onClick={handleFetch} disabled={fetching}
              style={{
                padding: '4px 12px', borderRadius: '8px', border: 'none',
                background: status.lastFetch ? '#059669' : '#D97706',
                color: '#fff', fontSize: '12px', cursor: fetching ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
              {fetching ? <Loader size={12} /> : <RefreshCw size={12} />}
              {status.lastFetch ? '更新' : '抓取'}
            </button>
          </div>
        </div>
      )}

      {/* 模式切换 */}
      <div style={{
        display: 'flex', gap: '0', marginBottom: '20px', borderRadius: '12px', overflow: 'hidden',
        border: '1px solid var(--card-border)',
      }}>
        <button onClick={() => setMode('quick')}
          style={{
            flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
            background: mode === 'quick' ? 'var(--primary)' : 'var(--card-bg)',
            color: mode === 'quick' ? '#fff' : 'var(--text-secondary)',
            fontSize: '14px', fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
          <Search size={16} /> 快速查询
        </button>
        <button onClick={() => setMode('ai')}
          style={{
            flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
            background: mode === 'ai' ? 'var(--primary)' : 'var(--card-bg)',
            color: mode === 'ai' ? '#fff' : 'var(--text-secondary)',
            fontSize: '14px', fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
          <MessageSquare size={16} /> AI助手
        </button>
      </div>

      {/* 内容区 */}
      {mode === 'quick' ? <QuickView /> : <AiChat />}
    </div>
  )
}

export default EmptyRoomsPage
