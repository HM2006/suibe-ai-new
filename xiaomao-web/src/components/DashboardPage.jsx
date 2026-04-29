/* ========================================
   小贸 - 首页看板组件
   问候语 + 天气 + 今日课程 + 快捷入口 + 校园资讯
   ======================================== */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudDrizzle,
  Wind, Droplets, Thermometer, Calendar, MapPin, User, Clock,
  MessageSquare, Map, DoorOpen, StickyNote, Newspaper, RefreshCw,
  Link as LinkIcon, ChevronRight, AlertCircle,
} from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { API, API_BASE } from '../config/api'

function getGreeting(hour) {
  if (hour >= 6 && hour < 12) return '早上好'
  if (hour >= 12 && hour < 18) return '下午好'
  return '晚上好'
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return `${year}年${month}月${day}日 ${weekDays[date.getDay()]}`
}

function getWeatherIcon(icon) {
  if (!icon) return Sun
  const code = parseInt(icon)
  if (code === 100 || code === 150 || code === 900) return Sun
  if (code >= 101 && code <= 103) return Cloud
  if (code >= 104 && code <= 104) return Cloud
  if (code >= 300 && code <= 399) return CloudRain
  if (code >= 400 && code <= 499) return CloudSnow
  if (code >= 500 && code <= 515) return CloudDrizzle
  if (code >= 502 && code <= 515) return CloudLightning
  return Cloud
}

const shortcuts = [
  { path: '/chat', label: 'AI对话', icon: MessageSquare, color: '#4F46E5', bgColor: '#EEF2FF' },
  { path: '/campus/map', label: '校园导航', icon: Map, color: '#059669', bgColor: '#D1FAE5' },
  { path: '/campus/schedule', label: '课表', icon: Calendar, color: '#D97706', bgColor: '#FEF3C7' },
  { path: '/empty-rooms', label: '空教室', icon: DoorOpen, color: '#7C3AED', bgColor: '#EDE9FE' },
  { path: '/notes', label: '随记', icon: StickyNote, color: '#DC2626', bgColor: '#FEE2E2' },
  { path: '/campus/news', label: '校园资讯', icon: Newspaper, color: '#0891B2', bgColor: '#CFFAFE' },
]

function DashboardPage() {
  const navigate = useNavigate()
  const { user, token } = useUser()

  const [greeting, setGreeting] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [weather, setWeather] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [weatherError, setWeatherError] = useState(false)
  const [precip, setPrecip] = useState(null)
  const [schedule, setSchedule] = useState(null)
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [news, setNews] = useState([])
  const [newsLoading, setNewsLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    setGreeting(getGreeting(now.getHours()))
    setDateStr(formatDate(now))
    const timer = setInterval(() => {
      const n = new Date()
      setGreeting(getGreeting(n.getHours()))
      setDateStr(formatDate(n))
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const fetchWeather = async () => {
      setWeatherLoading(true)
      setWeatherError(false)
      try {
        const [nowRes, precipRes] = await Promise.all([
          fetch(`${API_BASE}/weather/now`),
          fetch(`${API_BASE}/weather/minutely`),
        ])
        if (nowRes.ok) {
          const nowData = await nowRes.json()
          if (nowData.success && nowData.data) setWeather(nowData.data)
          else setWeatherError(true)
        } else setWeatherError(true)
        if (precipRes.ok) {
          const precipData = await precipRes.json()
          if (precipData.success && precipData.data) setPrecip(precipData.data)
        }
      } catch (err) {
        console.error('获取天气失败:', err)
        setWeatherError(true)
      } finally {
        setWeatherLoading(false)
      }
    }
    fetchWeather()
  }, [])

  /* ---- 获取今日课程（从 profile 缓存中读取，与课表页面一致） ---- */
  useEffect(() => {
    const fetchSchedule = async () => {
      setScheduleLoading(true)
      try {
        if (!token) { setScheduleLoading(false); return }
        const res = await fetch(`${API.user}/profile`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (!res.ok) { setScheduleLoading(false); return }
        const data = await res.json()
        if (data.success && data.data?.scheduleCache) {
          const scheduleRaw = data.data.scheduleCache.data
          const courses = scheduleRaw?.courses || scheduleRaw || []
          // 获取今天是星期几（0=周日, 1=周一, ..., 6=周六）
          const today = new Date()
          const dayIndex = today.getDay() // 0=周日
          const dayMap = { 0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 } // 转换为课表的 0=周一
          const targetDay = dayMap[dayIndex]
          // 从课表数据中筛选今天的课程
          let todayCourses = []
          if (Array.isArray(courses)) {
            todayCourses = courses.filter(c => {
              const cDay = typeof c.day === 'number' ? c.day - 1 : -1
              return cDay === targetDay
            })
          } else if (typeof courses === 'object') {
            const dayCourses = courses[targetDay] || courses[String(targetDay)]
            if (Array.isArray(dayCourses)) todayCourses = dayCourses
          }
          setSchedule(todayCourses)
        }
      } catch (err) {
        console.error('获取今日课程失败:', err)
      } finally {
        setScheduleLoading(false)
      }
    }
    fetchSchedule()
  }, [token])

  useEffect(() => {
    const fetchNews = async () => {
      setNewsLoading(true)
      try {
        const res = await fetch(`${API.campus}/news?limit=3`)
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.data?.news) setNews(data.data.news.slice(0, 3))
        }
      } catch (err) {
        console.error('获取校园资讯失败:', err)
      } finally {
        setNewsLoading(false)
      }
    }
    fetchNews()
  }, [])

  const renderWeatherCard = () => {
    if (weatherLoading) {
      return (
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <span className="dashboard-card-title">天气</span>
          </div>
          <div className="dashboard-loading">
            <div className="weather-main">
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-container)', animation: 'pulse 1.5s infinite' }} />
              <div>
                <div style={{ width: 64, height: 24, borderRadius: 4, background: 'var(--surface-container)', marginBottom: 6 }} />
                <div style={{ width: 80, height: 14, borderRadius: 4, background: 'var(--surface-container)' }} />
              </div>
            </div>
          </div>
        </div>
      )
    }
    if (weatherError) {
      return (
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <span className="dashboard-card-title">天气</span>
            <button onClick={() => window.location.reload()} className="refresh-btn"><RefreshCw size={12} /> 重试</button>
          </div>
          <div className="dashboard-empty">
            <AlertCircle size={20} />
            <span>天气数据加载失败，请检查API配置</span>
          </div>
        </div>
      )
    }
    const WeatherIcon = getWeatherIcon(weather.icon)
    return (
      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <span className="dashboard-card-title">天气</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>松江校区</span>
        </div>
        <div className="weather-main">
          <WeatherIcon size={40} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <div>
            <div className="weather-temp">{weather.temp}°C</div>
            <div className="weather-desc">{weather.text || '未知'}</div>
          </div>
        </div>
        <div className="weather-details">
          <div className="weather-detail-item">
            <Thermometer size={14} style={{ color: 'var(--text-muted)' }} />
            <div>
              <div className="weather-detail-label">体感温度</div>
              <div className="weather-detail-value">{weather.feelsLike || '--'}°C</div>
            </div>
          </div>
          <div className="weather-detail-item">
            <Droplets size={14} style={{ color: 'var(--text-muted)' }} />
            <div>
              <div className="weather-detail-label">湿度</div>
              <div className="weather-detail-value">{weather.humidity || '--'}%</div>
            </div>
          </div>
          <div className="weather-detail-item">
            <Wind size={14} style={{ color: 'var(--text-muted)' }} />
            <div>
              <div className="weather-detail-label">风向风力</div>
              <div className="weather-detail-value">{weather.windDir || '--'} {weather.windScale || '--'}级</div>
            </div>
          </div>
        </div>
        {precip?.summary && (
          <div className="weather-precip">
            <CloudDrizzle size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <span className="weather-precip-summary">{precip.summary}</span>
          </div>
        )}
      </div>
    )
  }

  const renderScheduleCard = () => {
    if (scheduleLoading) {
      return (
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <span className="dashboard-card-title">今日课程</span>
          </div>
          <div className="dashboard-loading">
            {[1, 2, 3].map(i => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0' }}>
                <div style={{ width: 60, height: 14, borderRadius: 4, background: 'var(--surface-container)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ width: '70%', height: 16, borderRadius: 4, background: 'var(--surface-container)', marginBottom: 6 }} />
                  <div style={{ width: '50%', height: 12, borderRadius: 4, background: 'var(--surface-container)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }
    /* 未登录或无课表缓存 */
    if (!token || schedule === null) {
      return (
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <span className="dashboard-card-title">今日课程</span>
          </div>
          <div className="dashboard-empty">
            <LinkIcon size={20} />
            <span>{!token ? '请先登录' : '尚未连接教务系统'}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{!token ? '登录后可查看今日课表' : '连接后可查看今日课表'}</span>
            <button className="dashboard-connect-btn" onClick={() => navigate('/user')}>{!token ? '前往登录' : '前往连接'}</button>
          </div>
        </div>
      )
    }
    const courses = Array.isArray(schedule) ? schedule : []
    if (!courses || courses.length === 0) {
      return (
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <span className="dashboard-card-title">今日课程</span>
            <button onClick={() => navigate('/campus/schedule')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 2 }}>查看全部 <ChevronRight size={12} /></button>
          </div>
          <div className="dashboard-empty">
            <Calendar size={20} />
            <span>今天没有课程，好好休息！</span>
          </div>
        </div>
      )
    }
    return (
      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <span className="dashboard-card-title">今日课程</span>
          <button onClick={() => navigate('/campus/schedule')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 2 }}>查看全部 <ChevronRight size={12} /></button>
        </div>
        <div className="schedule-today-list">
          {courses.map((course, index) => (
            <div key={course.id || index} className="schedule-today-item">
              <div className="schedule-today-time">
                <Clock size={12} />
                {course.time || course.startTime || '--'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="schedule-today-name">{course.name || course.courseName || '未知课程'}</div>
                <div className="schedule-today-location">
                  {course.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><MapPin size={11} /> {course.location}</span>}
                  {course.teacher && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 8 }}><User size={11} /> {course.teacher}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderNewsCard = () => (
    <div className="dashboard-card">
      <div className="dashboard-card-header">
        <span className="dashboard-card-title">校园资讯</span>
        <button onClick={() => navigate('/campus/news')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 2 }}>更多 <ChevronRight size={12} /></button>
      </div>
      {newsLoading ? (
        <div className="dashboard-loading">
          {[1, 2, 3].map(i => (
            <div key={i} style={{ padding: '10px 0' }}>
              <div style={{ width: '80%', height: 14, borderRadius: 4, background: 'var(--surface-container)', marginBottom: 6 }} />
              <div style={{ width: 60, height: 12, borderRadius: 4, background: 'var(--surface-container)' }} />
            </div>
          ))}
        </div>
      ) : news.length > 0 ? (
        <div className="dashboard-news-list">
          {news.map((item, index) => (
            <div key={item.id || index} className="dashboard-news-item" onClick={() => navigate('/campus/news')}>
              <span className="dashboard-news-title">{item.title}</span>
              <span className="dashboard-news-date">{item.date}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="dashboard-empty">
          <Newspaper size={20} />
          <span>暂无校园资讯</span>
        </div>
      )}
    </div>
  )

  return (
    <div className="dashboard-page">
      <div className="dashboard-greeting">
        <h1 className="dashboard-greeting-title">{greeting}{user?.nickname ? `，${user.nickname}` : ''}</h1>
        <p className="dashboard-greeting-date">{dateStr}</p>
      </div>
      <div className="dashboard-grid">
        {renderWeatherCard()}
        {renderScheduleCard()}
      </div>
      <div className="dashboard-shortcuts">
        {shortcuts.map((item) => (
          <div key={item.path} className="dashboard-shortcut-item" onClick={() => navigate(item.path)}>
            <div className="dashboard-shortcut-icon" style={{ background: item.bgColor, color: item.color }}>
              <item.icon size={22} />
            </div>
            <span className="dashboard-shortcut-label">{item.label}</span>
          </div>
        ))}
      </div>
      {renderNewsCard()}
    </div>
  )
}

export default DashboardPage
