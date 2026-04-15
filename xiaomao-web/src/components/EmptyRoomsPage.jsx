/* ========================================
   小贸 - 空教室查询页面
   纯前端，数据来自 /empty-rooms-data.json
   表格总览 + AI对话式查询
   ======================================== */
import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  DoorOpen, Search, Loader, ChevronRight, Calendar, Clock, Users, Building2, X, MessageSquare
} from 'lucide-react'

/* ========== 节次配置 ========== */
const PERIODS = {}
for (let i = 1; i <= 14; i++) PERIODS[i] = `第${i}节`
const PERIOD_TIMES = {
  1: '08:00-08:45', 2: '08:55-09:40', 3: '10:00-10:45', 4: '10:55-11:40',
  5: '11:50-12:35', 6: '13:00-13:45', 7: '13:55-14:40', 8: '14:50-15:35',
  9: '15:45-16:30', 10: '16:40-17:25', 11: '18:00-18:45', 12: '18:55-19:40',
  13: '19:50-20:35', 14: '20:45-21:30',
}

function getWeekday(d) {
  return '周' + ['日', '一', '二', '三', '四', '五', '六'][new Date(d).getDay()]
}
function getToday() { return new Date().toISOString().split('T')[0] }

function isFree(mask, p) { return !(mask & (1 << p)) }

/* ========== 数据 Hook ========== */
function useRoomData() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/empty-rooms-data.json')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const buildings = useMemo(() => data ? Object.keys(data.b) : [], [data])
  const dates = useMemo(() => data ? Object.keys(data.s).sort() : [], [data])

  const getEmpty = useMemo(() => (date, period, building) => {
    if (!data) return []
    const dd = data.s[date]
    if (!dd || !dd[building]) return []
    const br = data.b[building]
    const occ = dd[building]
    return Object.keys(br)
      .filter(id => !occ[id] || isFree(occ[id], period))
      .map(id => ({ id, seats: br[id][0], name: br[id][1], building }))
  }, [data])

  return { data, loading, buildings, dates, getEmpty }
}

/* ========== 表格总览 ========== */
function OverviewTab({ data, buildings, dates, getEmpty }) {
  const [date, setDate] = useState('')
  const [period, setPeriod] = useState(null)
  const [showFreeOnly, setShowFreeOnly] = useState(false)

  // 根据当前时间计算当前节次
  const getCurrentPeriod = () => {
    const now = new Date()
    const mins = now.getHours() * 60 + now.getMinutes()
    const starts = [495,540,595,640,685,780,825,880,925,970,1080,1125,1180,1225]
    for (let i = starts.length - 1; i >= 0; i--) {
      if (mins >= starts[i]) return i + 1
    }
    return 1
  }

  // 初始化日期和节次
  useEffect(() => {
    if (dates.length === 0) return
    const today = getToday()
    setDate(dates.includes(today) ? today : dates[0])
    setPeriod(getCurrentPeriod())
  }, [dates])

  const stats = useMemo(() => {
    if (!date || !data) return null
    const dd = data.s[date]
    if (!dd) return null
    const result = {}
    let totalEmpty = 0, totalRooms = 0
    buildings.forEach(bn => {
      const br = data.b[bn]
      const empty = getEmpty(date, period, bn)
      const all = Object.keys(br).length
      totalEmpty += empty.length
      totalRooms += all
      result[bn] = { empty, all, pct: all ? Math.round(empty.length / all * 100) : 0 }
    })
    return { result, totalEmpty, totalRooms }
  }, [date, period, data, buildings, getEmpty])

  if (!date || !stats) {
    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>该日期无数据</div>
  }

  return (
    <div>
      {/* 日期选择 */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <Calendar size={14} /> 选择日期
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} min={dates[0]} max={dates[dates.length - 1]}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--card-border)',
            background: 'var(--bg)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
          }} />
      </div>

      {/* 节次选择 */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <Clock size={14} /> 选择节次
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {Object.entries(PERIODS).map(([k, label]) => (
            <button key={k} onClick={() => setPeriod(Number(k))}
              style={{
                padding: '6px 12px', borderRadius: '20px', border: '2px solid',
                borderColor: period === Number(k) ? 'var(--primary)' : 'var(--card-border)',
                background: period === Number(k) ? 'var(--primary)' : 'var(--card-bg)',
                color: period === Number(k) ? '#fff' : 'var(--text-secondary)',
                fontSize: '12px', cursor: 'pointer', fontWeight: period === Number(k) ? 600 : 400,
                display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: '1.3',
              }}>
              <span>{label}</span>
              <span style={{ fontSize: '10px', opacity: period === Number(k) ? 0.8 : 0.6 }}>{PERIOD_TIMES[k]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {buildings.map(bn => {
          const s = stats.result[bn]
          return (
            <div key={bn} style={{
              flex: '1 1 130px', padding: '12px', borderRadius: '10px', textAlign: 'center',
              background: 'linear-gradient(135deg, rgba(79,70,229,0.08), rgba(124,58,237,0.06))',
            }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--primary)' }}>
                {s.empty.length}<span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>/{s.all}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {bn} · 空闲率{s.pct}%
              </div>
            </div>
          )
        })}
      </div>

      {/* 点阵图 */}
      <div style={{
        background: 'var(--card-bg)', borderRadius: '14px', overflow: 'hidden',
        border: '1px solid var(--card-border)', marginBottom: '16px',
      }}>
        <div style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>📊 教室占用点阵图</span>
          <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#10B981', display: 'inline-block' }} /> 空闲</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#EF4444', display: 'inline-block' }} /> 占用</span>
          </span>
        </div>
        <div style={{ padding: '16px', overflowX: 'auto' }}>
          {buildings.map(bn => {
            const br = data.b[bn]
            const dd = data.s[date]
            const roomIds = Object.keys(br)
            return (
              <div key={bn} style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>{bn}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {roomIds.map(id => {
                    const mask = (dd && dd[bn] && dd[bn][id]) || 0
                    const free = isFree(mask, period)
                    return (
                      <div key={id} title={`${br[id][1]}（${br[id][0]}座）- ${free ? '空闲' : '占用'}`}
                        style={{
                          width: '14px', height: '14px', borderRadius: '3px',
                          background: free ? '#10B981' : '#EF4444',
                          opacity: free ? 0.85 : 0.7,
                          transition: 'transform 0.15s, box-shadow 0.15s',
                          cursor: 'default',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.6)'; e.currentTarget.style.boxShadow = free ? '0 0 6px rgba(16,185,129,0.5)' : '0 0 6px rgba(239,68,68,0.5)'; e.currentTarget.style.zIndex = '10'; e.currentTarget.style.position = 'relative'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.zIndex = ''; e.currentTarget.style.position = ''; }}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 教室表格 */}
      <div style={{
        background: 'var(--card-bg)', borderRadius: '14px', overflow: 'hidden',
        border: '1px solid var(--card-border)',
      }}>
        <div style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--card-border)' }}>
          📋 {date}（{getWeekday(date)}）{PERIODS[period]}（{PERIOD_TIMES[period]}）空教室情况
          <button onClick={() => setShowFreeOnly(!showFreeOnly)}
            style={{
              marginLeft: 'auto', padding: '4px 12px', borderRadius: '16px', border: '1.5px solid',
              borderColor: showFreeOnly ? '#059669' : 'var(--card-border)',
              background: showFreeOnly ? '#D1FAE5' : 'transparent',
              color: showFreeOnly ? '#059669' : 'var(--text-muted)',
              fontSize: '12px', cursor: 'pointer', fontWeight: 500,
            }}>
            {showFreeOnly ? '✅ 只看空闲' : '显示全部'}
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                {['教学楼', '教室', '座位数', '状态'].map(h => (
                  <th key={h} style={{
                    padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)',
                    borderBottom: '2px solid var(--card-border)', whiteSpace: 'nowrap', fontSize: '12px',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buildings.map(bn => {
                const br = data.b[bn]
                const emptySet = new Set(getEmpty(date, period, bn).map(r => r.id))
                const emptyCount = emptySet.size
                const allCount = Object.keys(br).length
                return (
                  <React.Fragment key={bn}>
                    <tr style={{ background: 'rgba(79,70,229,0.06)' }}>
                      <td colSpan={4} style={{ padding: '8px 10px', fontWeight: 600, fontSize: '13px', color: 'var(--primary)' }}>
                        {bn}
                        <span style={{ display: 'inline-block', background: '#D1FAE5', color: '#059669', padding: '1px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: 500, marginLeft: '6px' }}>
                          {emptyCount}间空闲
                        </span>
                        <span style={{ display: 'inline-block', background: '#F3F4F6', color: '#666', padding: '1px 7px', borderRadius: '10px', fontSize: '11px', marginLeft: '4px' }}>
                          共{allCount}间
                        </span>
                      </td>
                    </tr>
                    {Object.keys(br).map(id => {
                      const free = emptySet.has(id)
                      if (showFreeOnly && !free) return null
                      return (
                        <tr key={id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td></td>
                          <td style={{ padding: '7px 10px', fontWeight: 500 }}>{br[id][1]}</td>
                          <td style={{ padding: '7px 10px' }}>{br[id][0]}座</td>
                          <td style={{ padding: '7px 10px', color: free ? '#059669' : '#DC2626', fontWeight: 500 }}>
                            {free ? '空闲' : '占用'}
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ========== 智能查找（表单式） ========== */
function AiTab({ data, buildings, dates }) {
  const today = getToday()
  const futureDates = dates.filter(d => d >= today).slice(0, 8)
  const [selectedDate, setSelectedDate] = useState(futureDates[0] || dates[0] || '')
  const [selectedPeriods, setSelectedPeriods] = useState([])
  const [minSeats, setMinSeats] = useState(0)
  const [showResult, setShowResult] = useState(false)

  const togglePeriod = (p) => {
    setSelectedPeriods(prev => prev.includes(p) ? prev.filter(x => x !== p).sort((a, b) => a - b) : [...prev, p].sort((a, b) => a - b))
  }

  const seatOptions = [
    { label: '不限座位数', value: 0 }, { label: '30人以上', value: 30 }, { label: '50人以上', value: 50 },
    { label: '80人以上', value: 80 }, { label: '100人以上', value: 100 }, { label: '150人以上', value: 150 },
  ]

  const searchResults = (() => {
    if (!showResult || !selectedDate || selectedPeriods.length === 0) return null
    const periods = selectedPeriods.slice().sort((a, b) => a - b)
    const exact = []
    buildings.forEach(bn => {
      const br = data.b[bn]
      Object.keys(br).forEach(id => {
        let ok = true
        periods.forEach(p => { const dd = data.s[selectedDate]; if (dd && dd[bn] && dd[bn][id] && !isFree(dd[bn][id], p)) ok = false })
        if (ok && br[id][0] >= minSeats) exact.push({ id, name: br[id][1], seats: br[id][0], building: bn })
      })
    })
    exact.sort((a, b) => a.seats - b.seats)
    let alt = []
    if (exact.length === 0) {
      if (minSeats > 0) {
        buildings.forEach(bn => {
          const br = data.b[bn]
          Object.keys(br).forEach(id => {
            let ok = true
            periods.forEach(p => { const dd = data.s[selectedDate]; if (dd && dd[bn] && dd[bn][id] && !isFree(dd[bn][id], p)) ok = false })
            if (ok) alt.push({ id, name: br[id][1], seats: br[id][0], building: bn, reason: `座位数${br[id][0]}座（要求${minSeats}+）`, fp: periods.length })
          })
        })
      }
      if (alt.length === 0) {
        buildings.forEach(bn => {
          const br = data.b[bn]
          Object.keys(br).forEach(id => {
            const dd = data.s[selectedDate]; const mask = (dd && dd[bn] && dd[bn][id]) || 0
            const fp = periods.filter(p => isFree(mask, p))
            if (fp.length) alt.push({ id, name: br[id][1], seats: br[id][0], building: bn, reason: `仅${fp.map(p => PERIODS[p]).join('、')}空闲`, fp: fp.length })
          })
        })
      }
      alt.sort((a, b) => b.fp - a.fp || b.seats - a.seats)
    }
    return { exact, alt, periods }
  })()

  const cardStyle = { background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--card-border)', padding: '16px', marginBottom: '12px' }
  const labelStyle = { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }
  const btnStyle = (active) => ({
    padding: '7px 14px', borderRadius: '20px', border: '1.5px solid',
    borderColor: active ? 'var(--primary)' : 'var(--card-border)',
    background: active ? 'var(--primary)' : 'var(--card-bg)',
    color: active ? '#fff' : 'var(--text-secondary)',
    cursor: 'pointer', fontSize: '12px', fontWeight: active ? 600 : 400,
  })

  return (
    <div>
      {/* 日期选择 */}
      <div style={cardStyle}>
        <div style={labelStyle}><Calendar size={14} /> 选择日期</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {futureDates.map(d => (
            <button key={d} onClick={() => { setSelectedDate(d); setShowResult(false) }}
              style={btnStyle(selectedDate === d)}>
              {d}（{getWeekday(d)}）
            </button>
          ))}
        </div>
      </div>

      {/* 节次选择 */}
      <div style={cardStyle}>
        <div style={labelStyle}><Clock size={14} /> 选择时间段（可多选）</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {Array.from({ length: 14 }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => { togglePeriod(p); setShowResult(false) }}
              style={btnStyle(selectedPeriods.includes(p))}>
              {PERIODS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* 座位数 */}
      <div style={cardStyle}>
        <div style={labelStyle}><Users size={14} /> 座位数要求</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {seatOptions.map(opt => (
            <button key={opt.value} onClick={() => { setMinSeats(opt.value); setShowResult(false) }}
              style={btnStyle(minSeats === opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 查询按钮 */}
      <button onClick={() => setShowResult(true)} disabled={selectedPeriods.length === 0}
        style={{
          width: '100%', padding: '12px', borderRadius: '12px', border: 'none',
          background: selectedPeriods.length === 0 ? 'var(--card-border)' : 'var(--primary)',
          color: selectedPeriods.length === 0 ? 'var(--text-muted)' : '#fff',
          fontSize: '15px', fontWeight: 600, cursor: selectedPeriods.length === 0 ? 'not-allowed' : 'pointer',
          boxShadow: selectedPeriods.length === 0 ? 'none' : '0 4px 15px rgba(79,70,229,0.3)',
          marginBottom: '16px',
        }}>
        🔍 查找空教室
      </button>

      {/* 结果 */}
      {showResult && searchResults && (
        <div style={cardStyle}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            📋 查询结果：{selectedDate}（{getWeekday(selectedDate)}）{searchResults.periods.map(p => PERIODS[p]).join('、')}
            {minSeats > 0 && ` · 至少${minSeats}人`}
          </div>
          {searchResults.exact.length > 0 ? (
            <>
              <div style={{ fontSize: '12px', color: '#059669', marginBottom: '10px' }}>
                ✅ 找到 <strong>{searchResults.exact.length}</strong> 间符合条件的空教室
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {searchResults.exact.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--card-border)' }}>
                    <span style={{ fontWeight: 500, fontSize: '14px', color: 'var(--text-primary)' }}>{r.building} · {r.name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: '#EEF2FF', padding: '2px 8px', borderRadius: '8px', color: '#4F46E5' }}>💺 {r.seats}座</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '10px' }}>❌ 没有完全符合条件的教室</div>
              {searchResults.alt.length > 0 && (
                <>
                  <div style={{ fontSize: '12px', color: '#D97706', marginBottom: '8px' }}>💡 推荐接近的教室：</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {searchResults.alt.slice(0, 12).map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '10px', background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                        <span style={{ fontWeight: 500, fontSize: '14px', color: 'var(--text-primary)' }}>{r.building} · {r.name}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>💺 {r.seats}座 · {r.reason}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ========== 主页面 ========== */
function EmptyRoomsPage() {
  const { data, loading, buildings, dates, getEmpty } = useRoomData()
  const [mode, setMode] = useState('overview')

  if (loading) {
    return (
      <div className="notes-container">
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <Loader size={24} style={{ animation: 'spin 1s linear infinite', display: 'inline-block', color: 'var(--text-muted)' }} />
          <p style={{ color: 'var(--text-muted)', marginTop: '12px', fontSize: '14px' }}>加载空教室数据...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="notes-container">
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '14px' }}>数据加载失败，请刷新重试</p>
        </div>
      </div>
    )
  }

  return (
    <div className="notes-container">
      {/* 内联样式：AI对话组件需要的样式 */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="page-header">
        <h1 className="page-title">空教室查询</h1>
        <p className="page-desc">2025-2026学年第二学期 · {dates.length}天数据</p>
      </div>

      {/* 模式切换 */}
      <div style={{
        display: 'flex', gap: '0', marginBottom: '20px', borderRadius: '12px', overflow: 'hidden',
        border: '1px solid var(--card-border)',
      }}>
        <button onClick={() => setMode('overview')}
          style={{
            flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
            background: mode === 'overview' ? 'var(--primary)' : 'var(--card-bg)',
            color: mode === 'overview' ? '#fff' : 'var(--text-secondary)',
            fontSize: '14px', fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
          <DoorOpen size={16} /> 空教室总览
        </button>
        <button onClick={() => setMode('ai')}
          style={{
            flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
            background: mode === 'ai' ? 'var(--primary)' : 'var(--card-bg)',
            color: mode === 'ai' ? '#fff' : 'var(--text-secondary)',
            fontSize: '14px', fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
          <MessageSquare size={16} /> 智能查找
        </button>
      </div>

      {mode === 'overview'
        ? <OverviewTab data={data} buildings={buildings} dates={dates} getEmpty={getEmpty} />
        : <AiTab data={data} buildings={buildings} dates={dates} />
      }

      <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '11px' }}>
        数据来源：上海对外经贸大学教务系统 · 仅供学习参考
      </div>
    </div>
  )
}

export default EmptyRoomsPage
