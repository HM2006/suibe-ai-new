/* ========================================
   小贸 - 布局组件
   包含左侧导航栏（桌面端）和底部导航栏（移动端）
   ======================================== */
import { NavLink, useLocation, Link } from 'react-router-dom'
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
} from 'lucide-react'
import { useUser } from '../contexts/UserContext'

/* 导航菜单配置 */
const navItems = [
  { path: '/chat', label: 'AI对话', icon: MessageSquare },
  { path: '/campus/map', label: '校园导航', icon: Map },
  { path: '/campus/schedule', label: '课表', icon: Calendar },
  { path: '/campus/grades', label: '成绩', icon: BarChart3 },
  // { path: '/campus/library', label: '图书馆', icon: BookOpen }, // 暂时隐藏
  { path: '/campus/news', label: '资讯', icon: Newspaper },
  { path: '/scholarship', label: '奖学金', icon: Award },
]

/* 根据当前路径获取页面标题 */
function getPageTitle(pathname) {
  const titleMap = {
    '/chat': { title: 'AI对话', subtitle: '和小贸聊聊天' },
    '/campus': { title: '校园服务', subtitle: '一站式校园生活' },
    '/campus/map': { title: '校园导航', subtitle: '快速找到目的地' },
    '/campus/schedule': { title: '课表查询', subtitle: '查看本周课程安排' },
    '/campus/grades': { title: '成绩查询', subtitle: '查看各科成绩' },
    '/campus/library': { title: '图书馆', subtitle: '借阅与图书管理' },
    '/campus/news': { title: '校园资讯', subtitle: '最新校园动态' },
    '/scholarship': { title: '奖学金计算器', subtitle: '综合测评分数计算' },
  }
  return titleMap[pathname] || { title: '小贸', subtitle: '校园AI助手' }
}

function Layout({ children }) {
  const location = useLocation()
  const { title, subtitle } = getPageTitle(location.pathname)
  const { user } = useUser()

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
            <div className="sidebar-title">小贸 <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '4px' }}>v1.2.2</span></div>
            <div className="sidebar-subtitle">校园AI助手</div>
          </div>
        </div>

        {/* 导航列表 */}
        <ul className="nav-list">
          {navItems.map((item) => (
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
            <div className="top-header-title">{title}</div>
            <div className="top-header-subtitle">{subtitle}</div>
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
                }}>
                  {(user.nickname || user.username)[0].toUpperCase()}
                </div>
                <span style={{ fontSize: '13px' }}>{user.nickname || user.username}</span>
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
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `bottom-nav-link ${isActive ? 'active' : ''}`
                }
              >
                <item.icon className="nav-icon" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

export default Layout
