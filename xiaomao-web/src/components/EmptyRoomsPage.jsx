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
  1: '08:15-08:55', 2: '09:00-09:40', 3: '09:55-10:35', 4: '10:40-11:20',
  5: '11:25-12:05', 6: '13:00-13:40', 7: '13:45-14:25', 8: '14:40-15:20',
  9: '15:25-16:05', 10: '16:10-16:50', 11: '18:00-18:40', 12: '18:45-19:25',
  13: '19:40-20:20', 14: '20:25-21:05',
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
    const starts = [495,540,595,640,685,780,825,880,925,970,1080,1125,1180,1225] // 每节开始分钟数
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
                            {free ? '✅ 空闲' : '🔴 占用'}
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

/* ========== AI 对话（纯 React） ========== */
function AiTab({ data, buildings, dates }) {
  const chatRef = useRef(null)
  const [step, setStep] = useState(0)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedPeriods, setSelectedPeriods] = useState([])
  const [minSeats, setMinSeats] = useState(0)

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [step, selectedDate, selectedPeriods, minSeats])

  const start = () => { setStep(1); setSelectedDate(null); setSelectedPeriods([]); setMinSeats(0) }

  const Msg = ({ role, children }) => (
    <div style={{ marginBottom: '14px', display: 'flex', gap: '10px', flexDirection: role === 'user' ? 'row-reverse' : 'row', animation: 'fadeIn 0.3s ease' }}>
      <div style={{ width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', background: role === 'ai' ? 'linear-gradient(135deg, #667eea, #764ba2)' : '#1890ff', color: '#fff' }}>
        {role === 'ai' ? '🤖' : '👤'}
      </div>
      <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: '12px', fontSize: '13px', lineHeight: '1.6', background: role === 'ai' ? 'var(--card-bg)' : 'var(--primary)', color: role === 'ai' ? 'var(--text-primary)' : '#fff', border: role === 'ai' ? '1px solid var(--card-border)' : 'none', borderTopLeftRadius: role === 'ai' ? '4px' : '12px', borderTopRightRadius: role === 'user' ? '4px' : '12px' }}>
        {children}
      </div>
    </div>
  )

  const togglePeriod = (p) => {
    setSelectedPeriods(prev => prev.includes(p) ? prev.filter(x => x !== p).sort((a, b) => a - b) : [...prev, p].sort((a, b) => a - b))
  }

  const seatOptions = [
    { label: '不限座位数', value: 0 }, { label: '30人以上', value: 30 }, { label: '50人以上', value: 50 },
    { label: '80人以上', value: 80 }, { label: '100人以上', value: 100 }, { label: '150人以上', value: 150 },
  ]

  // 查询逻辑
  const searchResults = (() => {
    if (step < 4 || !selectedDate || selectedPeriods.length === 0) return null
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

  const today = getToday()
  const futureDates = dates.filter(d => d >= today).slice(0, 8)

  return (
    <div>
      <div ref={chatRef} style={{ minHeight: '380px', maxHeight: '560px', overflowY: 'auto', padding: '16px', background: 'var(--bg)', borderRadius: '14px', marginBottom: '12px', border: '1px solid var(--card-border)' }}>

        {step === 0 && (
          <div style={{ textAlign: 'center', padding: '50px 20px' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🤖</div>
            <h2 style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--text-primary)' }}>智能空教室助手</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '13px' }}>告诉我你的需求，我来帮你找到最合适的空教室</p>
            <button onClick={start} style={{ padding: '12px 36px', borderRadius: '25px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '15px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(79,70,229,0.3)' }}>开始对话</button>
          </div>
        )}

        {step >= 1 && (
          <Msg role="ai">你好！我是空教室查询助手 😊<br />让我来帮你找到合适的空教室吧！</Msg>
        )}

        {step === 1 && (
          <>
            <Msg role="ai">
              📅 <strong>第一步：选择日期</strong><br />你需要查询哪一天的空教室？
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {futureDates.map(d => (
                  <button key={d} onClick={() => { setSelectedDate(d); setStep(2) }}
                    style={{ padding: '7px 14px', borderRadius: '20px', border: '1.5px solid var(--primary)', background: '#fff', color: 'var(--primary)', cursor: 'pointer', fontSize: '12px' }}>
                    {d}（{getWeekday(d)}）
                  </button>
                ))}
              </div>
            </Msg>
          </>
        )}

        {step >= 2 && selectedDate && (
          <Msg role="user">{selectedDate}（{getWeekday(selectedDate)}）</Msg>
        )}

        {step === 2 && (
          <Msg role="ai">
            ⏰ <strong>第二步：选择时间段</strong><br />你需要哪个时间段空闲的教室？（可多选）
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
              {Array.from({ length: 14 }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => togglePeriod(p)}
                  style={{ padding: '5px 10px', borderRadius: '16px', border: '1.5px solid', borderColor: selectedPeriods.includes(p) ? 'var(--primary)' : 'var(--card-border)', background: selectedPeriods.includes(p) ? 'var(--primary)' : 'var(--card-bg)', color: selectedPeriods.includes(p) ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}>
                  {PERIODS[p]}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '8px' }}>
              <button onClick={() => { if (selectedPeriods.length === 0) return; setStep(3) }}
                style={{ padding: '7px 14px', borderRadius: '20px', border: '1.5px solid var(--primary)', background: '#fff', color: 'var(--primary)', cursor: 'pointer', fontSize: '12px' }}>
                ✅ 确认选择
              </button>
            </div>
          </Msg>
        )}

        {step >= 3 && selectedPeriods.length > 0 && (
          <Msg role="user">{selectedPeriods.sort((a, b) => a - b).map(p => PERIODS[p]).join('、')}</Msg>
        )}

        {step === 3 && (
          <Msg role="ai">
            👥 <strong>第三步：座位数要求</strong><br />对教室的座位数有要求吗？
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {seatOptions.map(opt => (
                <button key={opt.value} onClick={() => { setMinSeats(opt.value); setStep(4) }}
                  style={{ padding: '7px 14px', borderRadius: '20px', border: '1.5px solid var(--primary)', background: '#fff', color: 'var(--primary)', cursor: 'pointer', fontSize: '12px' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </Msg>
        )}

        {step >= 4 && (
          <Msg role="user">{minSeats > 0 ? `至少${minSeats}人` : '不限座位数'}</Msg>
        )}

        {step >= 4 && searchResults && (
          <Msg role="ai">
            <div>
              🔍 <strong>查询结果</strong><br /><br />
              📅 日期：{selectedDate}（{getWeekday(selectedDate)}）<br />
              ⏰ 时间：{searchResults.periods.map(p => PERIODS[p]).join('、')}<br />
              👥 座位要求：{minSeats > 0 ? `至少${minSeats}人` : '不限'}<br /><br />
              {searchResults.exact.length > 0 ? (
                <>
                  ✅ 找到 <strong>{searchResults.exact.length}</strong> 间符合条件的空教室：<br /><br />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', marginTop: '10px' }}>
                    {searchResults.exact.map(r => (
                      <div key={r.id} style={{ border: '1px solid var(--card-border)', borderRadius: '10px', padding: '12px', background: 'var(--card-bg)' }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', color: 'var(--text-primary)' }}>{r.building} · {r.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}><span style={{ display: 'inline-block', background: '#EEF2FF', color: '#4F46E5', padding: '2px 7px', borderRadius: '8px', fontSize: '11px' }}>💺 {r.seats}座</span></div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  ❌ 很抱歉，没有找到完全符合条件的教室。<br /><br />
                  {searchResults.alt.length > 0 ? (
                    <>
                      💡 为你推荐以下最接近的教室：<br /><br />
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', marginTop: '10px' }}>
                        {searchResults.alt.slice(0, 12).map(r => (
                          <div key={r.id} style={{ border: '1px solid #F59E0B', borderRadius: '10px', padding: '12px', background: '#FFFBEB' }}>
                            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', color: 'var(--text-primary)' }}>
                              {r.building} · {r.name}
                              <span style={{ display: 'inline-block', background: '#F59E0B', color: '#fff', padding: '1px 5px', borderRadius: '6px', fontSize: '10px', marginLeft: '4px' }}>接近匹配</span>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              <span style={{ display: 'inline-block', background: '#EEF2FF', color: '#4F46E5', padding: '2px 7px', borderRadius: '8px', fontSize: '11px' }}>💺 {r.seats}座</span> · {r.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    '😔 该日期所有教室在所选时间段均已被占用。建议更换日期或时间段。'
                  )}
                </>
              )}
              <div style={{ marginTop: '12px' }}>
                <button onClick={start} style={{ padding: '7px 14px', borderRadius: '20px', border: '1.5px solid var(--primary)', background: '#fff', color: 'var(--primary)', cursor: 'pointer', fontSize: '12px' }}>🔄 重新查询</button>
              </div>
            </div>
          </Msg>
        )}
      </div>
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
