/* ========================================
   小贸 - 布局组件（整合版）
   桌面端：左侧导航栏（完整10项）
   移动端：底部导航栏（5项核心 + 更多功能入口）
   ======================================== */
import { useState } from 'react'
import { NavLink, useLocation, useNavigate, Link } from 'react-router-dom'
import {
  MessageSquare,
  Map,
  Calendar,
  BarChart3,
  BookOpen,
  Newspaper,
  Sparkles,
  User as UserIcon,
  Award,
  FileText,
  GraduationCap,
  DoorOpen,
  Car,
  Grid2X2,
  X,
  LayoutDashboard,
} from 'lucide-react'
import { useUser } from '../contexts/UserContext'

/* 侧边栏完整导航（桌面端10项） */
const sidebarNavItems = [
  { path: '/dashboard', label: '首页', icon: LayoutDashboard },
  { path: '/chat', label: 'AI对话', icon: MessageSquare },
  { path: '/campus/map', label: '校园导航', icon: Map },
  { path: '/campus/schedule', label: '课表', icon: Calendar },
  { path: '/campus/grades', label: '成绩', icon: BarChart3 },
  { path: '/campus/program', label: '培养方案', icon: GraduationCap },
  // { path: '/campus/library', label: '图书馆', icon: BookOpen }, // 暂时隐藏
  { path: '/campus/news', label: '资讯', icon: Newspaper },
  { path: '/notes', label: '随记', icon: FileText },
  { path: '/mooc', label: 'MOOC', icon: GraduationCap },
  { path: '/empty-rooms', label: '空教室', icon: DoorOpen },
  { path: '/park', label: '停车', icon: Car },
  { path: '/scholarship', label: '奖学金', icon: Award },
]

/* 底部导航（移动端5项，首页居中） */
const bottomNavItems = [
  { path: '/chat', label: 'AI对话', icon: MessageSquare },
  { path: '/campus/schedule', label: '课表', icon: Calendar },
  { path: '/dashboard', label: '首页', icon: LayoutDashboard },
  { path: '/campus/news', label: '资讯', icon: Newspaper },
  { path: '/more', label: '更多', icon: Grid2X2 },
]

/* "更多"面板中的功能项 */
const moreNavItems = [
  { path: '/campus/map', label: '校园导航', icon: Map, desc: '校园地图与导航' },
  { path: '/campus/grades', label: '成绩查询', icon: BarChart3, desc: '查看各科成绩' },
  { path: '/campus/program', label: '培养方案', icon: GraduationCap, desc: '查看培养方案完成情况' },
  { path: '/mooc', label: 'MOOC助手', icon: GraduationCap, desc: '网课学习管理' },
  { path: '/empty-rooms', label: '空教室查询', icon: DoorOpen, desc: '快速找到空闲教室' },
  { path: '/park', label: '停车定位', icon: Car, desc: '记录停车位置' },
  { path: '/scholarship', label: '奖学金计算器', icon: Award, desc: '综合测评分数计算' },
  { path: '/notes', label: '随记', icon: FileText, desc: '记录课程要点' },
]

/* 根据当前路径获取页面标题 */
function getPageTitle(pathname) {
  const titleMap = {
    '/dashboard': { title: '首页', subtitle: '校园信息一览' },
    '/chat': { title: 'AI对话', subtitle: '和小贸聊聊天' },
    '/campus': { title: '校园服务', subtitle: '一站式校园生活' },
    '/campus/map': { title: '校园导航', subtitle: '快速找到目的地' },
    '/campus/schedule': { title: '课表查询', subtitle: '查看本周课程安排' },
    '/campus/grades': { title: '成绩查询', subtitle: '查看各科成绩' },
    '/campus/program': { title: '培养方案', subtitle: '查看培养方案完成情况' },
    '/campus/library': { title: '图书馆', subtitle: '借阅与图书管理' },
    '/campus/news': { title: '校园资讯', subtitle: '最新校园动态' },
    '/notes': { title: '随记', subtitle: '记录课程要点' },
    '/mooc': { title: 'MOOC助手', subtitle: '网课学习管理' },
    '/empty-rooms': { title: '空教室查询', subtitle: '快速找到空闲教室' },
    '/scholarship': { title: '奖学金计算器', subtitle: '综合测评分数计算' },
  }
  return titleMap[pathname] || { title: '小贸', subtitle: '校园AI助手' }
}

function Layout({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { title } = getPageTitle(location.pathname)
  const { user } = useUser()
  const [showMore, setShowMore] = useState(false)

  /* 点击"更多"中的功能项后自动关闭面板 */
  const handleMoreNav = (path) => {
    setShowMore(false)
    navigate(path)
  }

  return (
    <div className="app-container">
      {/* 桌面端左侧导航栏 */}
      <aside className="sidebar">
        {/* Logo区域 */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Sparkles size={22} />
          </div>
          <div>
            <div className="sidebar-title">小贸 <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '4px' }}>v1.4.0</span></div>
            <div className="sidebar-subtitle">校园AI助手</div>
          </div>
        </div>

        {/* 导航列表 */}
        <ul className="nav-list">
          {sidebarNavItems.map((item) => (
            <li key={item.path} className="nav-item">
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `nav-link ${isActive ? 'active' : ''}`
                }
              >
                <item.icon className="nav-icon" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>

      {/* 主内容区域 */}
      <main className="main-content">
        {/* 顶部标题栏 */}
        <header className="top-header">
          <div style={{ flex: 1 }}>
            {/* 标题由各页面组件自行显示，避免重复 */}
          </div>
          {/* 用户入口 - 右上角 */}
          <Link to="/user" style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: 'var(--text-secondary)' }}>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 600,
                  overflow: 'hidden'
                }}>
                  {(user.avatar && !user.avatar.startsWith('/') && !user.avatar.startsWith('http') && !user.avatar.startsWith('data:')) ? (
                    <span style={{ fontSize: '18px', lineHeight: 1 }}>{user.avatar}</span>
                  ) : user.avatar ? (
                    <img src={user.avatar} alt="头像" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    (user.nickname || user.username)[0].toUpperCase()
                  )}
                </div>
                <span className="header-username">{user.nickname || user.username}</span>
              </div>
            ) : (
              <UserIcon size={20} />
            )}
          </Link>
        </header>

        {/* 页面内容 */}
        <div className="page-content">
          {children}
        </div>
      </main>

      {/* 移动端底部导航栏 */}
      <nav className="bottom-nav">
        <ul className="bottom-nav-list">
          {bottomNavItems.map((item) => (
            <li key={item.path}>
              {item.path === '/more' ? (
                <button
                  className={`bottom-nav-link more-btn ${showMore ? 'active' : ''}`}
                  onClick={() => setShowMore(true)}
                >
                  <item.icon className="nav-icon" />
                  <span>{item.label}</span>
                </button>
              ) : (
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `bottom-nav-link ${isActive ? 'active' : ''}`
                  }
                >
                  <item.icon className="nav-icon" />
                  <span>{item.label}</span>
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* 更多功能面板（移动端） */}
      {showMore && (
        <div className="more-panel-overlay" onClick={() => setShowMore(false)}>
          <div className="more-panel" onClick={(e) => e.stopPropagation()}>
            <div className="more-panel-header">
              <span className="more-panel-title">更多功能</span>
              <button className="more-panel-close" onClick={() => setShowMore(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="more-panel-list">
              {moreNavItems.map((item) => (
                <button
                  key={item.path}
                  className="more-panel-item"
                  onClick={() => handleMoreNav(item.path)}
                >
                  <div className="more-panel-item-icon">
                    <item.icon size={20} />
                  </div>
                  <div className="more-panel-item-info">
                    <div className="more-panel-item-label">{item.label}</div>
                    <div className="more-panel-item-desc">{item.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Layout
