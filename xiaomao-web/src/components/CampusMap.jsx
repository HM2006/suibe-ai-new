/* ========================================
   小贸 - 校园导航页面
   专业 2D 俯视平面图 (上北下南) + 真实POI数据
   ======================================== */
import { useState, useMemo } from 'react'
import {
  Search,
  MapPin,
  Building,
  BookOpen,
  Utensils,
  Dumbbell,
  Trees,
  ShoppingBag,
  Camera,
  GraduationCap
} from 'lucide-react'

/* 提取真实校园POI数据，坐标映射到 800x600 的专业平面画布 */
const poiData = [
  { id: 1, name: '图文信息大楼', category: '办公/教学', address: '校园中心广场', description: '校园标志性建筑，行政与图文信息中心。', icon: Building, color: '#4F46E5', x: 400, y: 300 },
  { id: 2, name: '图书馆', category: '学习', address: '思源湖畔', description: '藏书丰富，提供安静的学习自习空间。', icon: BookOpen, color: '#7C3AED', x: 320, y: 380 },
  { id: 3, name: '学思楼', category: '教学楼', address: '校园东区', description: '主要教学楼区，各类公共课程在此进行。', icon: BookOpen, color: '#4F46E5', x: 580, y: 360 },
  { id: 4, name: '博识楼', category: '教学楼', address: '图文大楼北侧', description: '教学研讨区域。', icon: Building, color: '#4F46E5', x: 450, y: 220 },
  { id: 5, name: '博雅楼', category: '教学楼', address: '博识楼东侧', description: '专业课程教学楼。', icon: Building, color: '#4F46E5', x: 520, y: 200 },
  { id: 6, name: '博萃楼', category: '教学楼', address: '博雅楼北侧', description: '专业课程教学楼。', icon: Building, color: '#4F46E5', x: 480, y: 150 },
  { id: 7, name: '行知楼', category: '办公/教学', address: '校园北区', description: '行政办公与部分教学活动区域。', icon: Building, color: '#0891B2', x: 380, y: 140 },
  { id: 8, name: '校史馆', category: '文化', address: '行知楼旁', description: '记录学校发展历程，传承上经贸大精神。', icon: Camera, color: '#D97706', x: 320, y: 110 },
  { id: 9, name: '乐群楼', category: '办公/活动', address: '校园西北区', description: '师生活动及部分办公区域。', icon: Building, color: '#0891B2', x: 280, y: 180 },
  { id: 10, name: '德政楼', category: '办公', address: '图文大楼西侧', description: '行政与教务办公楼。', icon: Building, color: '#0891B2', x: 260, y: 300 },
  { id: 11, name: '溯源楼', category: '办公/教学', address: '校园西侧', description: '教研与办公区域。', icon: Building, color: '#0891B2', x: 150, y: 320 },
  { id: 12, name: '思源餐厅', category: '餐饮', address: '校园西北角', description: '提供多样化的师生餐饮服务。', icon: Utensils, color: '#DC2626', x: 220, y: 140 },
  { id: 13, name: '教育超市', category: '服务', address: '思源餐厅旁', description: '提供各类生活日用品、零食饮料等。', icon: ShoppingBag, color: '#059669', x: 180, y: 170 },
  { id: 14, name: '学生餐厅', category: '餐饮', address: '校园最西北侧', description: '大型学生食堂，提供三餐。', icon: Utensils, color: '#DC2626', x: 100, y: 120 },
  { id: 15, name: '体育馆', category: '运动', address: '校园东北区', description: '室内篮球场、羽毛球场等综合体育场馆。', icon: Dumbbell, color: '#D97706', x: 620, y: 150 },
  { id: 16, name: '体育场/操场', category: '运动', address: '校园东北角', description: '标准田径场及足球场。', icon: Dumbbell, color: '#059669', x: 700, y: 220 },
  { id: 17, name: '思源湖', category: '景观', address: '校园西南侧', description: '校园核心景观湖，风景优美。', icon: Trees, color: '#0284C7', x: 200, y: 450 },
  { id: 18, name: '正大门', category: '交通', address: '文翔路主干道', description: '学校南侧主入口。', icon: MapPin, color: '#1E293B', x: 400, y: 560 }
]

function CampusMap() {
  const [searchText, setSearchText] = useState('')
  const [selectedPoi, setSelectedPoi] = useState(null)

  const filteredPois = useMemo(() => {
    if (!searchText.trim()) return poiData
    const keyword = searchText.trim().toLowerCase()
    return poiData.filter(
      (poi) =>
        poi.name.toLowerCase().includes(keyword) ||
        poi.category.toLowerCase().includes(keyword) ||
        poi.address.toLowerCase().includes(keyword)
    )
  }, [searchText])

  const handlePoiClick = (poi) => {
    setSelectedPoi(selectedPoi?.id === poi.id ? null : poi)
  }

  return (
    <div className="map-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 'calc(100vh - var(--header-height) - 100px)', backgroundColor: '#F8FAFC' }}>

      {/* 头部信息 */}
      <div className="page-header" style={{ padding: '16px 20px', backgroundColor: '#fff', borderBottom: '1px solid #E2E8F0' }}>
        <h1 className="page-title" style={{ margin: 0, fontSize: '20px', color: '#0F172A' }}>校园导航</h1>
        <p className="page-desc" style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748B' }}>
          SUIBE 松江校区 · 2D平面全景图 (上北下南)
        </p>
      </div>

      {/* 搜索框 */}
      <div className="map-search" style={{ padding: '12px 20px', backgroundColor: '#fff' }}>
        <div style={{ position: 'relative', display: 'flex' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input
            type="text"
            placeholder="搜索建筑、食堂、地标名称..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px 10px 38px',
              borderRadius: '8px', border: '1px solid #E2E8F0',
              outline: 'none', fontSize: '14px', backgroundColor: '#F1F5F9'
            }}
          />
        </div>
      </div>

      {/* SVG 专业平面地图区 */}
      <div className="map-canvas" style={{ flex: 1, overflow: 'hidden', position: 'relative', backgroundColor: '#F1F5F9' }}>
        <svg
          viewBox="0 0 800 600"
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          {/* 地图底色/绿地 */}
          <rect width="800" height="600" fill="#EAEFD8" />

          {/* 水系 (思源湖 & 景观河) */}
          <path d="M 0 350 Q 80 350 150 420 Q 250 520 150 600 L 0 600 Z" fill="#BAE6FD" />
          <path d="M 120 450 Q 220 400 300 480 Q 280 580 180 600 Z" fill="#BAE6FD" />
          <path d="M 0 100 Q 50 120 80 80 L 0 0 Z" fill="#BAE6FD" />

          {/* ----- 校园道路网 ----- */}
          <g stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none">
            {/* 外部主干道: 文翔路 */}
            <line x1="0" y1="560" x2="800" y2="560" strokeWidth="24" stroke="#CBD5E1" />
            <line x1="0" y1="560" x2="800" y2="560" strokeWidth="2" stroke="#FFFFFF" strokeDasharray="10,10" />

            {/* 内部主干道 */}
            <path d="M 400 560 L 400 400 L 400 250 L 400 100" />
            <path d="M 150 250 L 650 250" />
            <path d="M 250 150 L 250 400 L 400 400" />
            <path d="M 550 150 L 550 450 L 400 450" />
            <path d="M 400 150 L 650 150" />
            <path d="M 100 180 L 250 180" />
          </g>

          {/* ----- 道路文字标签 ----- */}
          <g fill="#94A3B8" fontSize="14" fontWeight="600" letterSpacing="6">
            <text x="400" y="585" textAnchor="middle">文翔路</text>
            <text x="280" y="245" textAnchor="middle">博学路</text>
            <text x="240" y="280" textAnchor="middle" transform="rotate(-90 240 280)">思源路</text>
            <text x="565" y="300" textAnchor="middle" transform="rotate(90 565 300)">学思路</text>
          </g>

          {/* ----- 绿化点缀 ----- */}
          <rect x="650" y="100" width="120" height="240" rx="60" fill="#BBF7D0" />
          <circle cx="400" cy="380" r="40" fill="#D1FAE5" />

          {/* ----- 建筑物轮廓 (Footprints) ----- */}
          {/* 教学/办公区域 (蓝灰色调) */}
          <g fill="#DBEAFE" stroke="#60A5FA" strokeWidth="2">
            {/* 图文信息大楼 (标志性弧形巨构) */}
            <path d="M 330 280 L 470 280 L 470 330 Q 400 350 330 330 Z" />
            {/* 图书馆 (圆形) */}
            <circle cx="320" cy="380" r="28" />
            {/* 学思楼 (E字形建筑) */}
            <path d="M 540 320 L 600 320 L 600 400 L 540 400 L 540 380 L 580 380 L 580 370 L 540 370 L 540 350 L 580 350 L 580 340 L 540 340 Z" />
            {/* 博字头楼群 */}
            <rect x="430" y="200" width="40" height="30" rx="4" />
            <rect x="500" y="180" width="40" height="30" rx="4" />
            <rect x="460" y="130" width="40" height="30" rx="4" />
            {/* 办公楼群 */}
            <rect x="350" y="120" width="60" height="25" rx="2" />
            <rect x="250" y="160" width="50" height="30" rx="2" />
            <rect x="230" y="280" width="40" height="40" rx="4" />
            <rect x="130" y="300" width="40" height="30" rx="2" />
          </g>

          {/* 生活/餐饮区域 (暖橘色调) */}
          <g fill="#FFEDD5" stroke="#FDBA74" strokeWidth="2">
            <rect x="190" y="120" width="50" height="40" rx="4" />
            <rect x="80" y="100" width="50" height="40" rx="4" />
            <circle cx="180" cy="170" r="10" />
          </g>

          {/* 体育设施 (绿色调) */}
          <g fill="#DCFCE7" stroke="#4ADE80" strokeWidth="2">
            <rect x="590" y="130" width="50" height="50" rx="4" />
            <rect x="660" y="110" width="100" height="220" rx="50" fill="none" strokeWidth="4" />
            <rect x="670" y="120" width="80" height="200" rx="40" fill="#86EFAC" stroke="none" />
          </g>

          {/* ----- POI 交互标记点 ----- */}
          {filteredPois.map((poi) => (
            <g
              key={poi.id}
              transform={`translate(${poi.x}, ${poi.y})`}
              onClick={() => handlePoiClick(poi)}
              style={{ cursor: 'pointer' }}
            >
              {/* 选中时的波纹光晕 */}
              {selectedPoi?.id === poi.id && (
                <>
                  <circle r="12" fill={poi.color} opacity="0.2">
                    <animate attributeName="r" from="8" to="24" dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                  <circle r="8" fill="none" stroke={poi.color} strokeWidth="2" opacity="0.8" />
                </>
              )}

              {/* 针脚图标 */}
              <circle r="4" fill="#FFFFFF" stroke={poi.color} strokeWidth="3" />

              {/* 地标名称背景板 */}
              <rect x="-35" y="-22" width="70" height="14" rx="4" fill="#FFFFFF" fillOpacity="0.8" />
              {/* 地标名称文本 */}
              <text y="-11" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#1E293B">
                {poi.name}
              </text>
            </g>
          ))}

          {/* 正大门标记 */}
          <g transform="translate(400, 560)">
            <rect x="-30" y="-8" width="60" height="16" rx="8" fill="#1E293B" />
            <text y="4" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#FFFFFF">正大门</text>
          </g>

          {/* 指北针 */}
          <g transform="translate(750, 40)">
            <circle r="18" fill="#FFFFFF" fillOpacity="0.9" stroke="#CBD5E1" strokeWidth="1" />
            <polygon points="0,-14 4,0 0,-4 -4,0" fill="#EF4444" />
            <polygon points="0,14 4,0 0,4 -4,0" fill="#94A3B8" />
            <text y="-20" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#EF4444">N</text>
          </g>
        </svg>
      </div>

      {/* POI列表 */}
      <div className="poi-list" style={{
        maxHeight: '240px', overflowY: 'auto', backgroundColor: '#fff',
        borderTop: '1px solid #E2E8F0', padding: '8px 12px',
      }}>
        {filteredPois.map((poi) => (
          <div
            key={poi.id}
            className={`poi-item ${selectedPoi?.id === poi.id ? 'active' : ''}`}
            onClick={() => handlePoiClick(poi)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 8px', borderRadius: '10px', cursor: 'pointer',
              backgroundColor: selectedPoi?.id === poi.id ? '#F1F5F9' : 'transparent',
              transition: 'background 0.15s',
            }}
          >
            <div
              style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: poi.color + '15', color: poi.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <poi.icon size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>{poi.name}</div>
              <div style={{ fontSize: '12px', color: '#64748B' }}>
                {poi.category} · {poi.address}
              </div>
            </div>
            <MapPin size={14} style={{ color: '#94A3B8', flexShrink: 0 }} />
          </div>
        ))}
      </div>

      {/* 选中POI的详情弹窗 */}
      {selectedPoi && (
        <div
          className="news-modal-overlay"
          onClick={() => setSelectedPoi(null)}
        >
          <div className="news-modal" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  width: '48px', height: '48px', borderRadius: '12px',
                  background: selectedPoi.color + '15', color: selectedPoi.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <selectedPoi.icon size={24} />
              </div>
              <div>
                <h3 className="news-modal-title" style={{ marginBottom: '4px' }}>
                  {selectedPoi.name}
                </h3>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  {selectedPoi.category} · {selectedPoi.address}
                </span>
              </div>
            </div>
            <p className="news-modal-content">{selectedPoi.description}</p>
            <button
              className="send-btn"
              style={{
                marginTop: '20px',
                width: '100%',
                height: '40px',
                borderRadius: 'var(--radius-md)',
              }}
              onClick={() => setSelectedPoi(null)}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default CampusMap
