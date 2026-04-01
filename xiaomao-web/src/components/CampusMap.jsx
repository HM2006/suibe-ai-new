/* ========================================
   小贸 - 校园导航页面
   SVG简化版校园地图 + 真实POI标记点列表
   ======================================== */
import { useState, useMemo } from 'react'
import {
  Search,
  MapPin,
  Building,
  BookOpen,
  Utensils,
  Dumbbell,
  GraduationCap,
  Trees,
  ShoppingBag,
  Camera
} from 'lucide-react'

/* 提取真实校园POI数据 */
const poiData = [
  {
    id: 1,
    name: '图文信息大楼',
    category: '办公/教学',
    address: '校园中心广场',
    description: '校园标志性建筑，行政与图文信息中心。',
    icon: Building,
    color: '#4F46E5',
    x: 48,
    y: 48,
  },
  {
    id: 2,
    name: '图书馆',
    category: '学习',
    address: '思源湖畔',
    description: '藏书丰富，提供安静的学习自习空间。',
    icon: BookOpen,
    color: '#7C3AED',
    x: 42,
    y: 60,
  },
  {
    id: 3,
    name: '学思楼',
    category: '教学楼',
    address: '图文大楼东侧',
    description: '主要教学楼区，各类公共课程在此进行。',
    icon: BookOpen,
    color: '#4F46E5',
    x: 62,
    y: 45,
  },
  {
    id: 4,
    name: '博识楼',
    category: '教学楼',
    address: '中心广场北侧',
    description: '教学研讨区域。',
    icon: Building,
    color: '#4F46E5',
    x: 45,
    y: 36,
  },
  {
    id: 5,
    name: '博雅楼',
    category: '教学楼',
    address: '博识楼东北侧',
    description: '专业课程教学楼。',
    icon: Building,
    color: '#4F46E5',
    x: 52,
    y: 30,
  },
  {
    id: 6,
    name: '博萃楼',
    category: '教学楼',
    address: '博雅楼西侧',
    description: '专业课程教学楼。',
    icon: Building,
    color: '#4F46E5',
    x: 46,
    y: 26,
  },
  {
    id: 7,
    name: '行知楼',
    category: '办公/教学',
    address: '校园西北区域',
    description: '行政办公与部分教学活动区域。',
    icon: Building,
    color: '#0891B2',
    x: 36,
    y: 26,
  },
  {
    id: 8,
    name: '校史馆',
    category: '文化',
    address: '校园西北角',
    description: '记录学校发展历程，传承上经贸大精神。',
    icon: Camera,
    color: '#D97706',
    x: 40,
    y: 22,
  },
  {
    id: 9,
    name: '乐群楼',
    category: '办公/活动',
    address: '校园西侧',
    description: '师生活动及部分办公区域。',
    icon: Building,
    color: '#0891B2',
    x: 32,
    y: 32,
  },
  {
    id: 10,
    name: '德政楼',
    category: '办公',
    address: '图文大楼西侧',
    description: '行政与教务办公楼。',
    icon: Building,
    color: '#0891B2',
    x: 30,
    y: 50,
  },
  {
    id: 11,
    name: '溯源楼',
    category: '办公/教学',
    address: '校园西南角',
    description: '教研与办公区域。',
    icon: Building,
    color: '#0891B2',
    x: 20,
    y: 60,
  },
  {
    id: 12,
    name: '思源餐厅',
    category: '餐饮',
    address: '校园西侧',
    description: '提供多样化的师生餐饮服务。',
    icon: Utensils,
    color: '#DC2626',
    x: 25,
    y: 35,
  },
  {
    id: 13,
    name: '教育超市',
    category: '服务',
    address: '思源餐厅旁',
    description: '提供各类生活日用品、零食饮料等。',
    icon: ShoppingBag,
    color: '#059669',
    x: 20,
    y: 40,
  },
  {
    id: 14,
    name: '学生餐厅',
    category: '餐饮',
    address: '校园最西侧',
    description: '大型学生食堂，提供三餐。',
    icon: Utensils,
    color: '#DC2626',
    x: 15,
    y: 45,
  },
  {
    id: 15,
    name: '体育馆',
    category: '运动',
    address: '校园东北角',
    description: '室内篮球场、羽毛球场等综合体育场馆。',
    icon: Dumbbell,
    color: '#D97706',
    x: 75,
    y: 25,
  },
  {
    id: 16,
    name: '体育场/操场',
    category: '运动',
    address: '校园东侧',
    description: '标准田径场及足球场。',
    icon: Dumbbell,
    color: '#059669',
    x: 85,
    y: 38,
  },
  {
    id: 17,
    name: '思源湖',
    category: '景观',
    address: '校园西南侧',
    description: '校园核心景观湖，风景优美。',
    icon: Trees,
    color: '#0284C7',
    x: 35,
    y: 68,
  },
  {
    id: 18,
    name: '正大门',
    category: '交通',
    address: '校园东南侧主路',
    description: '学校主入口。',
    icon: MapPin,
    color: '#1E293B',
    x: 65,
    y: 75,
  }
]

function CampusMap() {
  /* 搜索关键词 */
  const [searchText, setSearchText] = useState('')
  /* 选中的POI */
  const [selectedPoi, setSelectedPoi] = useState(null)

  /* 根据搜索关键词过滤POI */
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

  /* 点击POI项 */
  const handlePoiClick = (poi) => {
    setSelectedPoi(selectedPoi?.id === poi.id ? null : poi)
  }

  return (
    <div className="map-container">
      {/* 页面标题 */}
      <div className="page-header">
        <h1 className="page-title">校园导航</h1>
        <p className="page-desc">上经贸大 (SUIBE) 校园平面导览</p>
      </div>

      {/* 搜索框 */}
      <div className="map-search">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            className="map-search-input"
            placeholder="搜索教学楼、食堂、地标..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ paddingLeft: '38px' }}
          />
        </div>
      </div>

      {/* SVG校园地图 */}
      <div className="map-canvas">
        <svg className="map-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {/* 背景色 (浅绿色草地) */}
          <rect width="100" height="100" fill="#F0FDF4" />

          {/* 模拟地图上的水系 (河流与思源湖) */}
          <path d="M 0 80 Q 50 60 100 85 L 100 100 L 0 100 Z" fill="#E0F2FE" />
          <path d="M 50 100 L 100 60 L 100 45 L 60 75 Z" fill="#E0F2FE" />
          <ellipse cx="32" cy="72" rx="14" ry="10" fill="#BAE6FD" />
          <ellipse cx="85" cy="55" rx="10" ry="15" fill="#E0F2FE" />

          {/* 校园主干道线稿模拟 */}
          <path d="M 10 40 L 40 50 L 60 40 L 80 50" stroke="#D1D5DB" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 40 50 L 50 80 L 70 100" stroke="#D1D5DB" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 25 35 L 45 35 L 50 20" stroke="#D1D5DB" strokeWidth="1.5" fill="none" strokeLinecap="round" />

          {/* 绿化与操场色块示意 */}
          <rect x="75" y="32" width="18" height="12" rx="4" fill="#A7F3D0" />
          <ellipse cx="20" cy="20" rx="6" ry="4" fill="#BBF7D0" opacity="0.6" />
          <ellipse cx="60" cy="20" rx="8" ry="5" fill="#BBF7D0" opacity="0.6" />

          {/* POI标记点 */}
          {filteredPois.map((poi) => (
            <g
              key={poi.id}
              onClick={() => handlePoiClick(poi)}
              style={{ cursor: 'pointer' }}
            >
              {/* 选中状态高亮圈 */}
              {selectedPoi?.id === poi.id && (
                <circle
                  cx={poi.x}
                  cy={poi.y}
                  r="4"
                  fill="none"
                  stroke={poi.color}
                  strokeWidth="0.5"
                  opacity="0.5"
                >
                  <animate
                    attributeName="r"
                    from="3"
                    to="6"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.6"
                    to="0"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              {/* 标记点心 */}
              <circle
                cx={poi.x}
                cy={poi.y}
                r="2"
                fill={poi.color}
                stroke="white"
                strokeWidth="0.8"
              />
              {/* 标签文本 */}
              <text
                x={poi.x}
                y={poi.y - 3.5}
                textAnchor="middle"
                fontSize="2.2"
                fontWeight="700"
                fill="#1E293B"
                style={{ textShadow: '0px 1px 2px rgba(255,255,255,0.8)' }}
              >
                {poi.name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* POI列表 */}
      <div className="poi-list">
        {filteredPois.map((poi) => (
          <div
            key={poi.id}
            className={`poi-item ${selectedPoi?.id === poi.id ? 'active' : ''}`}
            onClick={() => handlePoiClick(poi)}
          >
            <div
              className="poi-icon"
              style={{ background: poi.color + '15', color: poi.color }}
            >
              <poi.icon size={18} />
            </div>
            <div className="poi-info">
              <div className="poi-name">{poi.name}</div>
              <div className="poi-address">
                {poi.category} · {poi.address}
              </div>
            </div>
            <MapPin size={16} style={{ color: 'var(--text-muted)' }} />
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
                className="poi-icon"
                style={{
                  background: selectedPoi.color + '15',
                  color: selectedPoi.color,
                  width: '48px',
                  height: '48px',
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
