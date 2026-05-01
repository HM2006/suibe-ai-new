/* ========================================
   小贸 - 停车定位助手
   Canvas校园地图 + 点击记录停车位置
   ======================================== */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Car, Trash2, MapPin, Clock, ChevronRight } from 'lucide-react'

const LAYOUT = {
  buildX_start: 28,
  buildX_end: 72,
  SD: { top: 8, bottom: 24, name: 'SD' },
  gap_CD: { top: 24, bottom: 31, name: 'CD楼间' },
  SC: { top: 31, bottom: 47, name: 'SC' },
  gap_BC: { top: 47, bottom: 54, name: 'BC楼间' },
  SB: { top: 54, bottom: 70, name: 'SB' },
  gap_AB: { top: 70, bottom: 77, name: 'SAB楼间' },
  SA: { top: 77, bottom: 93, name: 'SA(学思楼)' },
}

const STORAGE_KEY = 'parkTrackerData'

function calculateLocationName(x, y) {
  if (y < LAYOUT.SD.top) return 'SD的侧边'
  if (y > LAYOUT.SA.bottom) return 'SA的侧边 (南门侧)'

  let horizontalPos = ''
  if (x < LAYOUT.buildX_start) {
    horizontalPos = '前侧'
  } else if (x > LAYOUT.buildX_end) {
    horizontalPos = '后侧'
  } else {
    const inBuilding =
      (y >= LAYOUT.SD.top && y <= LAYOUT.SD.bottom) ||
      (y >= LAYOUT.SC.top && y <= LAYOUT.SC.bottom) ||
      (y >= LAYOUT.SB.top && y <= LAYOUT.SB.bottom) ||
      (y >= LAYOUT.SA.top && y <= LAYOUT.SA.bottom)
    if (inBuilding) return 'INVALID'
    horizontalPos = x < 50 ? '前侧' : '后侧'
  }

  let verticalPos = ''
  if (y >= LAYOUT.SD.top && y <= LAYOUT.SD.bottom) verticalPos = 'SD楼'
  else if (y > LAYOUT.SD.bottom && y < LAYOUT.gap_CD.bottom) verticalPos = 'CD楼间'
  else if (y >= LAYOUT.SC.top && y <= LAYOUT.SC.bottom) verticalPos = 'SC楼'
  else if (y > LAYOUT.SC.bottom && y < LAYOUT.gap_BC.bottom) verticalPos = 'BC楼间'
  else if (y >= LAYOUT.SB.top && y <= LAYOUT.SB.bottom) verticalPos = 'SB楼'
  else if (y > LAYOUT.SB.bottom && y < LAYOUT.gap_AB.bottom) verticalPos = 'SAB楼间'
  else if (y >= LAYOUT.SA.top && y <= LAYOUT.SA.bottom) verticalPos = 'SA楼'

  if (verticalPos.includes('楼间')) {
    return `${verticalPos}的${horizontalPos}`
  } else {
    return `${verticalPos}${horizontalPos}`
  }
}

function formatParkedTime(isoStr) {
  const parked = new Date(isoStr)
  const now = new Date()
  const parkedDate = new Date(parked.getFullYear(), parked.getMonth(), parked.getDate())
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.floor((nowDate - parkedDate) / (1000 * 60 * 60 * 24))

  const timeStr = `${parked.getHours().toString().padStart(2, '0')}:${parked.getMinutes().toString().padStart(2, '0')}`
  const dateStr = `${parked.getMonth() + 1}月${parked.getDate()}日`

  if (diffDays === 0) {
    return { dateLabel: '今天', timeStr, fullText: `今天 ${timeStr}` }
  } else if (diffDays === 1) {
    return { dateLabel: '昨天', timeStr, fullText: `昨天 ${timeStr}` }
  } else {
    return { dateLabel, timeStr, fullText: `${dateStr} ${timeStr}` }
  }
}

function ParkPage() {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [marker, setMarker] = useState(null)
  const [animating, setAnimating] = useState(false)
  const [parkDuration, setParkDuration] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setMarker(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!marker?.isoTime) return
    const update = () => {
      const ms = Date.now() - new Date(marker.isoTime).getTime()
      if (ms < 0) { setParkDuration(''); return }
      const hrs = Math.floor(ms / 3600000)
      const mins = Math.floor((ms % 3600000) / 60000)
      if (hrs > 0) {
        setParkDuration(`已停放 ${hrs} 小时 ${mins} 分钟`)
      } else {
        setParkDuration(`已停放 ${mins} 分钟`)
      }
    }
    update()
    const timer = setInterval(update, 30000)
    return () => clearInterval(timer)
  }, [marker?.isoTime])

  const drawMap = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height

    ctx.clearRect(0, 0, w, h)

    ctx.fillStyle = '#9CA3AF'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('前', w * 0.14, h * 0.5)
    ctx.fillText('后', w * 0.86, h * 0.5)
    ctx.font = '12px sans-serif'
    ctx.fillText('侧边', w * 0.5, h * 0.04)
    ctx.fillText('南门侧', w * 0.5, h * 0.97)

    const drawBuilding = (block) => {
      const bx = w * (LAYOUT.buildX_start / 100)
      const by = h * (block.top / 100)
      const bw = w * ((LAYOUT.buildX_end - LAYOUT.buildX_start) / 100)
      const bh = h * ((block.bottom - block.top) / 100)

      ctx.fillStyle = '#cbd5e1'
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2)

      ctx.fillStyle = '#4b5563'
      ctx.fillRect(bx, by, bw, bh)

      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText(block.name, bx + bw / 2, by + bh / 2)
    }

    drawBuilding(LAYOUT.SD)
    drawBuilding(LAYOUT.SC)
    drawBuilding(LAYOUT.SB)
    drawBuilding(LAYOUT.SA)

    if (marker) {
      const px = w * (marker.x / 100)
      const py = h * (marker.y / 100)

      ctx.beginPath()
      ctx.arc(px, py + 4, 16, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(220, 38, 38, 0.15)'
      ctx.fill()

      ctx.beginPath()
      ctx.arc(px, py + 4, 8, 0, Math.PI * 2)
      ctx.fillStyle = '#dc2626'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.font = '24px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('📍', px, py - 12)
    }
  }, [marker])

  useEffect(() => {
    const init = () => setTimeout(drawMap, 50)
    init()
    window.addEventListener('resize', init)
    return () => window.removeEventListener('resize', init)
  }, [drawMap])

  const handlePointerDown = (e) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top
    const relX = (clickX / rect.width) * 100
    const relY = (clickY / rect.height) * 100

    const locName = calculateLocationName(relX, relY)
    if (locName === 'INVALID') return

    const now = new Date()
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

    const newMarker = {
      x: relX,
      y: relY,
      text: locName,
      time: timeStr,
      isoTime: now.toISOString(),
    }
    setMarker(newMarker)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newMarker))
    setAnimating(true)
    setTimeout(() => setAnimating(false), 600)
    if (navigator.vibrate) navigator.vibrate(40)
  }

  const clearData = () => {
    if (window.confirm('确定要清除停车记录吗？')) {
      localStorage.removeItem(STORAGE_KEY)
      setMarker(null)
      setParkDuration('')
    }
  }

  const timeInfo = marker?.isoTime ? formatParkedTime(marker.isoTime) : null

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div className="page-header">
        <h1 className="page-title">
          <MapPin size={20} style={{ color: 'var(--primary)', marginRight: '6px', verticalAlign: 'middle' }} />
          停车定位助手
        </h1>
        <p className="page-desc">点击校园地图标记你的爱车位置</p>
      </div>

      <div style={{ padding: '0 20px' }}>
        {marker && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '16px 20px', marginBottom: '16px',
            borderRadius: '14px', background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderLeft: '4px solid var(--primary)',
            animation: animating ? 'parkBounce 0.5s ease' : 'none',
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: 'var(--primary-container)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Car size={22} style={{ color: 'var(--primary)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                {marker.text}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Clock size={12} />
                  {timeInfo ? timeInfo.fullText : marker.time}
                </span>
                {parkDuration && (
                  <span style={{ color: 'var(--primary)', fontWeight: 500 }}>
                    · {parkDuration}
                  </span>
                )}
              </div>
            </div>
            <button onClick={clearData} style={{
              padding: '6px 10px', borderRadius: '8px',
              border: '1px solid var(--card-border)',
              background: 'var(--surface-container-lowest)',
              color: 'var(--text-muted)', fontSize: '12px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.target.style.color = '#dc2626'; e.target.style.borderColor = '#fca5a5' }}
            onMouseLeave={(e) => { e.target.style.color = 'var(--text-muted)'; e.target.style.borderColor = 'var(--card-border)' }}
            >
              <Trash2 size={13} /> 清除
            </button>
          </div>
        )}

        {!marker && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '14px 18px', marginBottom: '16px',
            borderRadius: '14px', background: 'var(--card-bg)',
            border: '1px dashed var(--card-border)', justifyContent: 'center',
          }}>
            <MapPin size={16} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              点击下方地图标记停车位置
            </span>
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 14px', marginBottom: '12px',
          background: 'var(--primary-container)', borderRadius: '10px',
          fontSize: '12px', color: 'var(--primary)', fontWeight: 500,
        }}>
          <ChevronRight size={14} />
          点击地图中的楼栋间空地即可记录位置
        </div>

        <div ref={containerRef} style={{
          position: 'relative', width: '100%',
          aspectRatio: '3 / 4.2', borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 0 0 1px rgba(196, 198, 208, 0.15)',
          background: '#E8F0F2',
        }}>
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }}
            onPointerDown={handlePointerDown}
          />
        </div>

        <div style={{
          display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap', justifyContent: 'center',
        }}>
          {['SD楼', 'SC楼', 'SB楼', 'SA楼'].map(name => (
            <span key={name} style={{
              padding: '4px 12px', borderRadius: '20px',
              background: 'var(--surface-container-lowest)',
              border: '1px solid var(--card-border)',
              fontSize: '11px', color: 'var(--text-muted)',
            }}>
              {name}
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes parkBounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
      `}</style>
    </div>
  )
}

export default ParkPage