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

/* ========== 数据 ========== */
import roomData from '../../public/empty-rooms-data.json'

const BUILDINGS = Object.keys(roomData.b)
const DATES = Object.keys(roomData.s).sort()

/* ========== 表格总览 ========== */
function getEmpty(date, period, building) {
  const dd = roomData.s[date]
  if (!dd || !dd[building]) return []
  const br = roomData.b[building]
  const occ = dd[building]
  return Object.keys(br)
    .filter(id => !occ[id] || isFree(occ[id], period))
    .map(id => ({ id, seats: br[id][0], name: br[id][1], building }))
}

function OverviewTab() {
  const [date, setDate] = useState('')
  const [period, setPeriod] = useState(1)

  useEffect(() => {
    if (DATES.length === 0) return
    const today = getToday()
    setDate(DATES.includes(today) ? today : DATES[0])
  }, [])

  const stats = useMemo(() => {
    if (!date) return null
    const dd = roomData.s[date]
    if (!dd) return null
    const result = {}
    BUILDINGS.forEach(bn => {
      const br = roomData.b[bn]
      const empty = getEmpty(date, period, bn)
      const all = Object.keys(br).length
      result[bn] = { empty, all, pct: all ? Math.round(empty.length / all * 100) : 0 }
    })
    return result
  }, [date, period])

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
        <input type="date" value={date} onChange={e => setDate(e.target.value)} min={DATES[0]} max={DATES[DATES.length - 1]}
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
        {BUILDINGS.map(bn => {
          const s = stats.result[bn]
          return (
            <div key={bn} style={{
              flex: '1 1 130px', padding: '12px', borderRadius: '10px', textAlign: 'center',
              background: 'linear-gradient(135deg, rgba(79,70,229,0.08), rgba(124,58,237,0.06))',
            }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--primary)' }}>
                {s.empty}<span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>/{s.all}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {bn} · 空闲率{s.pct}%
              </div>
            </div>
          )
        })}
      </div>

      {/* 教室表格 */}
      <div style={{
        background: 'var(--card-bg)', borderRadius: '14px', overflow: 'hidden',
        border: '1px solid var(--card-border)',
      }}>
        <div style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--card-border)' }}>
          📋 {date}（{getWeekday(date)}）{PERIODS[period]}（{PERIOD_TIMES[period]}）空教室情况
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
              {BUILDINGS.map(bn => {
                const br = roomData.b[bn]
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

/* ========== AI 对话 ========== */
function AiTab() {
  const chatRef = useRef(null)
  const [started, setStarted] = useState(false)
  const [messages, setMessages] = useState([])
  const [step, setStep] = useState(0) // 0=未开始, 1=选日期, 2=选节次, 3=选容量, 4=结果
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedPeriods, setSelectedPeriods] = useState([])
  const [minSeats, setMinSeats] = useState(0)

  const addMsg = (role, html) => {
    setMessages(prev => [...prev, { role, html }])
    setTimeout(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, 50)
  }

  const start = () => {
    setStarted(true); setStep(1); setSelectedDate(null); setSelectedPeriods([]); setMinSeats(0)
    setMessages([])
    setTimeout(() => {
      addMsg('ai', '你好！我是空教室查询助手 😊<br/>让我来帮你找到合适的空教室吧！')
      setTimeout(askDate, 400)
    }, 250)
  }

  const askDate = () => {
    setStep(1)
    const today = getToday()
    const futureDates = DATES.filter(d => d >= today).slice(0, 8)
    const opts = futureDates.map(d =>
      `<button class="opt" onclick="window.__sd('${d}')">${d}（${getWeekday(d)}）</button>`
    ).join('')
    addMsg('ai', `📅 <strong>第一步：选择日期</strong><br/>你需要查询哪一天的空教室？<div class="opts">${opts}</div>`)
  }

  const selectDate = (d) => {
    setSelectedDate(d)
    addMsg('user', `${d}（${getWeekday(d)}）`)
    setTimeout(askPeriods, 350)
  }

  const askPeriods = () => {
    setStep(2)
    const pcs = Array.from({ length: 14 }, (_, i) => i + 1)
      .map(p => `<label class="pc" onclick="window.__tp(${p}, this)">${PERIODS[p]}</label>`).join('')
    addMsg('ai', `⏰ <strong>第二步：选择时间段</strong><br/>你需要哪个时间段空闲的教室？（可多选）<div class="pcs">${pcs}</div><div style="margin-top:8px"><button class="opt" onclick="window.__cp()">✅ 确认选择</button></div>`)
  }

  const togglePeriod = (p, el) => {
    setSelectedPeriods(prev => {
      const next = prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p].sort()
      return next
    })
  }

  const confirmPeriods = () => {
    if (selectedPeriods.length === 0) { addMsg('ai', '请至少选择一个节次哦～'); return }
    const pstr = selectedPeriods.sort((a, b) => a - b).map(p => PERIODS[p]).join('、')
    addMsg('user', pstr)
    setTimeout(askSeats, 350)
  }

  const askSeats = () => {
    setStep(3)
    const seatOpts = [
      { l: '不限座位数', v: 0 }, { l: '30人以上', v: 30 }, { l: '50人以上', v: 50 },
      { l: '80人以上', v: 80 }, { l: '100人以上', v: 100 }, { l: '150人以上', v: 150 },
    ]
    const opts = seatOpts.map(x =>
      `<button class="opt" onclick="window.__ss(${x.v})">${x.l}</button>`
    ).join('')
    addMsg('ai', `👥 <strong>第三步：座位数要求</strong><br/>对教室的座位数有要求吗？<div class="opts">${opts}</div>`)
  }

  const selectSeats = (v) => {
    setMinSeats(v)
    addMsg('user', v > 0 ? `至少${v}人` : '不限座位数')
    setTimeout(doSearch, 500)
  }

  const doSearch = () => {
    setStep(4)
    const date = selectedDate
    const periods = selectedPeriods.slice().sort((a, b) => a - b)
    const pstr = periods.map(p => PERIODS[p]).join('、')

    // 查找完全匹配
    const res = []
    BUILDINGS.forEach(bn => {
      const br = roomData.b[bn]
      Object.keys(br).forEach(id => {
        let ok = true
        periods.forEach(p => {
          const dd = roomData.s[date]
          if (dd && dd[bn] && dd[bn][id] && !isFree(dd[bn][id], p)) ok = false
        })
        if (ok && br[id][0] >= minSeats) res.push({ id, name: br[id][1], seats: br[id][0], building: bn })
      })
    })
    res.sort((a, b) => a.seats - b.seats)

    let h = `🔍 <strong>查询结果</strong><br/><br/>📅 日期：${date}（${getWeekday(date)}）<br/>⏰ 时间：${pstr}<br/>👥 座位要求：${minSeats > 0 ? '至少' + minSeats + '人' : '不限'}<br/><br/>`

    if (res.length) {
      h += `✅ 找到 <strong>${res.length}</strong> 间符合条件的空教室：<br/><br/><div class="rg">`
      res.forEach(r => {
        h += `<div class="rc"><div class="ri">${r.building} · ${r.name}</div><div class="rd"><span class="sb">💺 ${r.seats}座</span></div></div>`
      })
      h += '</div>'
    } else {
      h += '❌ 很抱歉，没有找到完全符合条件的教室。<br/><br/>'
      // 推荐接近的
      const alt = []
      // 策略1: 不限座位数
      if (minSeats > 0) {
        BUILDINGS.forEach(bn => {
          const br = roomData.b[bn]
          Object.keys(br).forEach(id => {
            let ok = true
            periods.forEach(p => {
              const dd = roomData.s[date]
              if (dd && dd[bn] && dd[bn][id] && !isFree(dd[bn][id], p)) ok = false
            })
            if (ok) alt.push({ id, name: br[id][1], seats: br[id][0], building: bn, reason: `座位数${br[id][0]}座（要求${minSeats}+）`, fp: periods.length })
          })
        })
      }
      // 策略2: 部分节次空闲
      if (alt.length === 0) {
        BUILDINGS.forEach(bn => {
          const br = roomData.b[bn]
          Object.keys(br).forEach(id => {
            const dd = roomData.s[date]
            const mask = (dd && dd[bn] && dd[bn][id]) || 0
            const fp = periods.filter(p => isFree(mask, p))
            if (fp.length) alt.push({ id, name: br[id][1], seats: br[id][0], building: bn, reason: `仅${fp.map(p => PERIODS[p]).join('、')}空闲`, fp })
          })
        })
      }
      alt.sort((a, b) => (b.fp ? b.fp.length : 0) - (a.fp ? a.fp.length : 0) || b.seats - a.seats)

      if (alt.length) {
        h += '💡 为你推荐以下最接近的教室：<br/><br/><div class="rg">'
        alt.slice(0, 12).forEach(r => {
          h += `<div class="rc alt"><div class="ri">${r.building} · ${r.name} <span class="ab">接近匹配</span></div><div class="rd"><span class="sb">💺 ${r.seats}座</span> · ${r.reason}</div></div>`
        })
        h += '</div>'
      } else {
        h += '😔 该日期所有教室在所选时间段均已被占用。建议更换日期或时间段。'
      }
    }
    h += '<br/><div class="opts"><button class="opt" onclick="window.__restart()">🔄 重新查询</button></div>'
    addMsg('ai', h)
  }

  // 注册全局回调（因为 AI 消息中的 onclick 需要调用）
  useEffect(() => {
    window.__sd = selectDate
    window.__tp = togglePeriod
    window.__cp = confirmPeriods
    window.__ss = selectSeats
    window.__restart = start
    return () => {
      delete window.__sd; delete window.__tp; delete window.__cp; delete window.__ss; delete window.__restart
    }
  })

  return (
    <div>
      <div style={{
        minHeight: '380px', maxHeight: '560px', overflowY: 'auto', padding: '16px',
        background: 'var(--bg)', borderRadius: '14px', marginBottom: '12px',
        border: '1px solid var(--card-border)',
      }} ref={chatRef}>
        {!started ? (
          <div style={{ textAlign: 'center', padding: '50px 20px' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🤖</div>
            <h2 style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--text-primary)' }}>智能空教室助手</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '13px' }}>告诉我你的需求，我来帮你找到最合适的空教室</p>
            <button onClick={start} style={{
              padding: '12px 36px', borderRadius: '25px', border: 'none',
              background: 'var(--primary)', color: '#fff', fontSize: '15px', cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(79,70,229,0.3)',
            }}>开始对话</button>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} style={{
              marginBottom: '14px', display: 'flex', gap: '10px',
              flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
              animation: 'fadeIn 0.3s ease',
            }}>
              <div style={{
                width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px',
                background: m.role === 'ai' ? 'linear-gradient(135deg, #667eea, #764ba2)' : '#1890ff',
                color: '#fff',
              }}>
                {m.role === 'ai' ? '🤖' : '👤'}
              </div>
              <div style={{
                maxWidth: '80%', padding: '10px 14px', borderRadius: '12px',
                fontSize: '13px', lineHeight: '1.6',
                background: m.role === 'ai' ? 'var(--card-bg)' : 'var(--primary)',
                color: m.role === 'ai' ? 'var(--text-primary)' : '#fff',
                border: m.role === 'ai' ? '1px solid var(--card-border)' : 'none',
                borderTopLeftRadius: m.role === 'ai' ? '4px' : '12px',
                borderTopRightRadius: m.role === 'user' ? '4px' : '12px',
              }} dangerouslySetInnerHTML={{ __html: m.html }} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* ========== 主页面 ========== */
function EmptyRoomsPage() {
  const [mode, setMode] = useState('overview')

  return (
    <div className="notes-container">
      {/* 内联样式：AI对话组件需要的样式 */}
      <style>{`
        .opts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .opt { padding: 7px 14px; border: 1.5px solid var(--primary); border-radius: 20px; background: #fff; color: var(--primary); cursor: pointer; font-size: 12px; transition: 0.2s; }
        .opt:hover { background: var(--primary); color: #fff; }
        .pcs { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
        .pc { display: flex; align-items: center; gap: 3px; padding: 5px 10px; border: 1.5px solid var(--card-border); border-radius: 16px; cursor: pointer; font-size: 12px; transition: 0.2s; color: var(--text-secondary); background: var(--card-bg); }
        .pc:hover { border-color: var(--primary); }
        .pc.sel { background: var(--primary); color: #fff; border-color: var(--primary); }
        .rg { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-top: 10px; }
        .rc { border: 1px solid var(--card-border); border-radius: 10px; padding: 12px; transition: 0.2s; background: var(--card-bg); }
        .rc:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .rc .ri { font-weight: 600; font-size: 14px; margin-bottom: 4px; color: var(--text-primary); }
        .rc .rd { font-size: 11px; color: var(--text-muted); }
        .sb { display: inline-block; background: #EEF2FF; color: #4F46E5; padding: 2px 7px; border-radius: 8px; font-size: 11px; }
        .rc.alt { border-color: #F59E0B; background: #FFFBEB; }
        .rc.alt .ab { display: inline-block; background: #F59E0B; color: #fff; padding: 1px 5px; border-radius: 6px; font-size: 10px; margin-left: 4px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="page-header">
        <h1 className="page-title">空教室查询</h1>
        <p className="page-desc">2025-2026学年第二学期 · {DATES.length}天数据</p>
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
        ? <OverviewTab />
        : <AiTab />
      }

      <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '11px' }}>
        数据来源：上海对外经贸大学教务系统 · 仅供学习参考
      </div>
    </div>
  )
}

export default EmptyRoomsPage
