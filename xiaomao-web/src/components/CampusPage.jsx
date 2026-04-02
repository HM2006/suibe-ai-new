/* ========================================
   小贸 - 校园服务主页
   功能卡片网格布局，点击跳转到对应子页面
   ======================================== */
import { Link } from 'react-router-dom'
import {
  Map,
  Calendar,
  BarChart3,
  BookOpen,
  Newspaper,
  Navigation,
  Clock,
  Award,
  Library,
  Bell,
} from 'lucide-react'

/* 服务模块配置 */
const services = [
  {
    path: '/campus/map',
    title: '校园导航',
    desc: '快速找到教学楼、食堂、图书馆等校园地点，支持搜索和路线规划',
    icon: Map,
    color: '#4F46E5',
    bgColor: '#EEF2FF',
  },
  {
    path: '/campus/schedule',
    title: '课表查询',
    desc: '查看本周课程安排，了解上课时间、教室和教师信息',
    icon: Calendar,
    color: '#059669',
    bgColor: '#D1FAE5',
  },
  {
    path: '/campus/grades',
    title: '成绩查询',
    desc: '查询各科成绩、GPA统计和成绩分布，支持学期筛选',
    icon: BarChart3,
    color: '#D97706',
    bgColor: '#FEF3C7',
  },
  // 图书馆入口暂时隐藏
  // {
  //   path: '/campus/library',
  //   title: '图书馆',
  //   desc: '查看当前借阅情况、搜索图书、获取推荐书目',
  //   icon: BookOpen,
  //   color: '#7C3AED',
  //   bgColor: '#EDE9FE',
  // },
  {
    path: '/campus/news',
    title: '校园资讯',
    desc: '获取最新校园通知、活动信息和学术动态',
    icon: Newspaper,
    color: '#DC2626',
    bgColor: '#FEE2E2',
  },
]

function CampusPage() {
  return (
    <div>
      {/* 页面标题 */}
      <div className="page-header">
        <h1 className="page-title">校园服务</h1>
        <p className="page-desc">一站式校园生活服务平台</p>
      </div>

      {/* 服务卡片网格 */}
      <div className="campus-grid">
        {services.map((service) => (
          <Link
            key={service.path}
            to={service.path}
            className="service-card"
          >
            <div
              className="service-card-icon"
              style={{ background: service.bgColor, color: service.color }}
            >
              <service.icon size={24} />
            </div>
            <h3 className="service-card-title">{service.title}</h3>
            <p className="service-card-desc">{service.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default CampusPage
