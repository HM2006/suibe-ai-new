/* ========================================
   小贸 - 停车定位助手
   Canvas校园地图 + 点击记录停车位置
   ======================================== */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Car, Trash2, Pencil, Check } from 'lucide-react'

// 地图区块比例布局 (0-100 相对坐标)
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

function ParkPage() {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [marker, setMarker] = useState(null)
  const [animating, setAnimating] = useState(false)
  const [editing, setEditing] = useState(false)

  // 加载缓存
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setMarker(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  // 绘制地图
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

    // 背景
    ctx.clearRect(0, 0, w, h)

    // 方向提示
    ctx.fillStyle = '#9CA3AF'
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('前', w * 0.14, h * 0.5)
    ctx.fillText('后', w * 0.86, h * 0.5)
    ctx.font = '13px sans-serif'
    ctx.fillText('侧边', w * 0.5, h * 0.04)
    ctx.fillText('南门侧', w * 0.5, h * 0.97)

    // 绘制楼栋
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
      ctx.font = 'bold 15px sans-serif'
      ctx.fillText(block.name, bx + bw / 2, by + bh / 2)
    }

    drawBuilding(LAYOUT.SD)
    drawBuilding(LAYOUT.SC)
    drawBuilding(LAYOUT.SB)
    drawBuilding(LAYOUT.SA)

    // 停车标记
    if (marker) {
      const px = w * (marker.x / 100)
      const py = h * (marker.y / 100)
      ctx.font = '26px sans-serif'
      ctx.fillText('📍', px, py - 10)
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#dc2626'
      ctx.fill()
    }
  }, [marker])

  // 初始化 + resize
  useEffect(() => {
    const init = () => setTimeout(drawMap, 50)
    init()
    window.addEventListener('resize', init)
    return () => window.removeEventListener('resize', init)
  }, [drawMap])

  // 点击事件
  const handlePointerDown = (e) => {
    e.preventDefault()
    if (!editing) return
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

    const newMarker = { x: relX, y: relY, text: locName, time: timeStr }
    setMarker(newMarker)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newMarker))
    setEditing(false)
    setAnimating(true)
    setTimeout(() => setAnimating(false), 600)
    if (navigator.vibrate) navigator.vibrate(40)
  }

  // 清除记录
  const clearData = () => {
    if (window.confirm('确定要清除停车记录吗？')) {
      localStorage.removeItem(STORAGE_KEY)
      setMarker(null)
    }
  }

  return (
    <div className="notes-container">
      <div className="page-header">
        <h1 className="page-title">停车定位助手</h1>
        <p className="page-desc">点击地图记录停车位置</p>
      </div>

      <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '12px' }}>
        在下方地图中点击停车位置（点击边缘或楼间距即可自动识别）
      </p>

      {/* 地图容器 */}
      <div ref={containerRef} style={{
        position: 'relative',
        width: '100%',
        maxWidth: '400px',
        aspectRatio: '3 / 4.2',
        margin: '0 auto',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        background: '#E8F0F2',
      }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%', cursor: editing ? 'crosshair' : 'default', touchAction: 'none', opacity: editing ? 1 : 0.85 }}
          onPointerDown={handlePointerDown}
        />
        {!editing && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.3)', borderRadius: '12px',
            pointerEvents: 'none',
          }}>
            <span style={{ fontSize: '13px', color: '#666', background: 'rgba(255,255,255,0.8)', padding: '6px 14px', borderRadius: '8px' }}>
              点击下方「编辑位置」修改
            </span>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
        {!editing ? (
          <button onClick={() => setEditing(true)} style={{
            padding: '8px 20px', borderRadius: '10px', border: 'none',
            background: 'var(--primary)', color: '#fff', fontSize: '13px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500,
            boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
          }}>
            <Pencil size={14} /> 编辑位置
          </button>
        ) : (
          <button onClick={() => setEditing(false)} style={{
            padding: '8px 20px', borderRadius: '10px', border: 'none',
            background: '#059669', color: '#fff', fontSize: '13px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500,
          }}>
            <Check size={14} /> 完成
          </button>
        )}
      </div>

      {/* 结果展示 */}
      <div style={{
        marginTop: '16px',
        padding: '16px 20px',
        borderRadius: '14px',
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderLeft: '4px solid var(--primary)',
      }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>您的车辆当前停放在：</div>
        <div style={{
          fontSize: '20px', fontWeight: 700, color: 'var(--primary)', minHeight: '2rem',
          animation: animating ? 'bounce 0.6s ease' : 'none',
        }}>
          {marker ? marker.text : '尚未记录停车位置'}
        </div>
        {marker && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
            记录时间: 今天 {marker.time}
          </div>
        )}
        {marker && (
          <button onClick={clearData} style={{
            marginTop: '12px', padding: '6px 14px', borderRadius: '8px', border: '1px solid #fca5a5',
            background: '#fef2f2', color: '#dc2626', fontSize: '12px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <Trash2 size={13} /> 清除记录
          </button>
        )}
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}

export default ParkPage
