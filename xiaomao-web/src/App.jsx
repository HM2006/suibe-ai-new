/* ========================================
   小贸 - 校园AI助手 主应用组件
   路由配置
   ======================================== */
import { Routes, Route, Navigate } from 'react-router-dom'
import { UserProvider } from './contexts/UserContext'
import Layout from './components/Layout'
import ChatPage from './components/ChatPage'
import CampusPage from './components/CampusPage'
import CampusMap from './components/CampusMap'
import SchedulePage from './components/SchedulePage'
import GradesPage from './components/GradesPage'
import ProgramPage from './components/ProgramPage'
import LibraryPage from './components/LibraryPage'
import NewsPage from './components/NewsPage'
import UserPage from './components/UserPage'
import AdminPage from './components/AdminPage'
import ScholarshipPage from './components/ScholarshipPage'
import NotesPage from './components/NotesPage'
import MoocPage from './components/MoocPage'
import EmptyRoomsPage from './components/EmptyRoomsPage'
import ParkPage from './components/ParkPage'
import DashboardPage from './components/DashboardPage'

function App() {
  return (
    <UserProvider>
      <Routes>
        {/* 根路径重定向到首页看板 */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* 首页看板 */}
        <Route path="/dashboard" element={<Layout><DashboardPage /></Layout>} />

        {/* 聊天页面 */}
        <Route path="/chat" element={<Layout><ChatPage /></Layout>} />

        {/* 校园服务主页 */}
        <Route path="/campus" element={<Layout><CampusPage /></Layout>} />

        {/* 校园导航 */}
        <Route path="/campus/map" element={<Layout><CampusMap /></Layout>} />

        {/* 课表查询 */}
        <Route path="/campus/schedule" element={<Layout><SchedulePage /></Layout>} />

        {/* 成绩查询 */}
        <Route path="/campus/grades" element={<Layout><GradesPage /></Layout>} />

        {/* 培养方案 */}
        <Route path="/campus/program" element={<Layout><ProgramPage /></Layout>} />

        {/* 图书馆 - 暂时隐藏 */}
        {/* <Route path="/campus/library" element={<Layout><LibraryPage /></Layout>} /> */}

        {/* 校园资讯 */}
        <Route path="/campus/news" element={<Layout><NewsPage /></Layout>} />

        {/* 用户页面 */}
        <Route path="/user" element={<Layout><UserPage /></Layout>} />

        {/* 管理后台 */}
        <Route path="/admin" element={<Layout><AdminPage /></Layout>} />

        {/* 奖学金计算器 */}
        <Route path="/scholarship" element={<Layout><ScholarshipPage /></Layout>} />

        {/* 随记 */}
        <Route path="/notes" element={<Layout><NotesPage /></Layout>} />
        <Route path="/mooc" element={<Layout><MoocPage /></Layout>} />
        <Route path="/empty-rooms" element={<Layout><EmptyRoomsPage /></Layout>} />
        <Route path="/park" element={<Layout><ParkPage /></Layout>} />
      </Routes>
    </UserProvider>
  )
}

export default App
