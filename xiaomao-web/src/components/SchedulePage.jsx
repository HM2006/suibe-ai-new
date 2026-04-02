/* ========================================
   小贸 - 课表查询页面
   周选择器 + 课程表格 + 当前时间高亮
   数据来源：用户页面登录教务系统后自动缓存
   ======================================== */
import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, MapPin, User, Calendar } from 'lucide-react'
import { useUser } from '../contexts/UserContext'

/* 星期配置 */
const weekDays = ['周一', '周二', '周三', '周四', '周五']

/* 时间段配置（14个节次，与教务系统一致） */
const timeSlots = [
  { label: '第1节', time: '08:00-08:45' },
  { label: '第2节', time: '08:55-09:40' },
  { label: '第3节', time: '10:00-10:45' },
  { label: '第4节', time: '10:55-11:40' },
  { label: '第5节', time: '13:30-14:15' },
  { label: '第6节', time: '14:25-15:10' },
  { label: '第7节', time: '15:20-16:05' },
  { label: '第8节', time: '16:15-17:00' },
  { label: '第9节', time: '18:00-18:45' },
  { label: '第10节', time: '18:55-19:40' },
  { label: '第11节', time: '19:50-20:35' },
  { label: '第12节', time: '20:45-21:30' },
  { label: '第13节', time: '21:35-22:20' },
  { label: '第14节', time: '22:25-23:10' },
]

/* 课程颜色配置 */
const courseColors = [
  { bg: '#EEF2FF', text: '#4338CA', border: '#C7D2FE' },
  { bg: '#D1FAE5', text: '#065F46', border: '#A7F3D0' },
  { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  { bg: '#FCE7F3', text: '#9D174D', border: '#FBCFE8' },
  { bg: '#CFFAFE', text: '#155E75', border: '#A5F3FC' },
  { bg: '#EDE9FE', text: '#5B21B6', border: '#DDD6FE' },
  { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
]

/* 模拟课表数据（按星期排列） - 作为fallback保留 */
const mockScheduleData = {
  0: [
    { name: '高等数学', teacher: '张教授', room: 'A101', time: '08:00-09:40', slot: 0, color: 0 },
    { name: '大学英语', teacher: '李老师', room: 'B203', time: '10:00-11:40', slot: 1, color: 1 },
    { name: '数据结构', teacher: '王教授', room: 'C305', time: '14:00-15:40', slot: 2, color: 2 },
  ],
  1: [
    { name: '线性代数', teacher: '赵教授', room: 'A102', time: '08:00-09:40', slot: 0, color: 3 },
    { name: '计算机网络', teacher: '刘教授', room: 'D401', time: '14:00-15:40', slot: 2, color: 4 },
    { name: '体育课', teacher: '陈老师', room: '体育馆', time: '16:00-17:40', slot: 3, color: 5 },
  ],
  2: [
    { name: '高等数学', teacher: '张教授', room: 'A101', time: '08:00-09:40', slot: 0, color: 0 },
    { name: '操作系统', teacher: '孙教授', room: 'E201', time: '10:00-11:40', slot: 1, color: 6 },
    { name: '大学英语', teacher: '李老师', room: 'B203', time: '14:00-15:40', slot: 2, color: 1 },
  ],
  3: [
    { name: '线性代数', teacher: '赵教授', room: 'A102', time: '08:00-09:40', slot: 0, color: 3 },
    { name: '数据结构', teacher: '王教授', room: 'C305', time: '10:00-11:40', slot: 1, color: 2 },
    { name: '计算机网络', teacher: '刘教授', room: 'D401', time: '16:00-17:40', slot: 3, color: 4 },
  ],
  4: [
    { name: '操作系统', teacher: '孙教授', room: 'E201', time: '08:00-09:40', slot: 0, color: 6 },
    { name: '思想政治', teacher: '周老师', room: 'F101', time: '10:00-11:40', slot: 1, color: 5 },
  ],
}

/* 将真实课表数据转换为组件格式 */
function transformRealSchedule(realData) {
  const result = { 0: [], 1: [], 2: [], 3: [], 4: [] }

  if (!realData) return result

  const courseColorMap = {}
  let colorIndex = 0

  if (typeof realData === 'object' && !Array.isArray(realData)) {
    for (let dayKey = 0; dayKey < 7; dayKey++) {
      const dayCourses = realData[dayKey] || realData[String(dayKey)]
      if (!Array.isArray(dayCourses)) continue
      dayCourses.forEach((course) => {
        if (!(course.name in courseColorMap)) {
          courseColorMap[course.name] = colorIndex % courseColors.length
          colorIndex++
        }
        if (dayKey < 5) {
          result[dayKey].push({
            name: course.name,
            teacher: course.teacher || '',
            room: course.location || '',
            time: course.time || '',
            slot: course.slot ?? 0,
            color: courseColorMap[course.name],
            weeks: course.weeks || '',
            type: course.type || '',
            code: course.code || '',
            enrollment: course.enrollment || '',
          })
        }
      })
    }
  } else if (Array.isArray(realData)) {
    const weekdayToIndex = { '周一': 0, '周二': 1, '周三': 2, '周四': 3, '周五': 4 }
    realData.forEach((dayData) => {
      const dayIndex = typeof dayData.day === 'number' ? dayData.day - 1 : weekdayToIndex[dayData.weekday]
      if (dayIndex === undefined || dayIndex < 0 || dayIndex > 4) return
      if (!(dayData.name in courseColorMap)) {
        courseColorMap[dayData.name] = colorIndex % courseColors.length
        colorIndex++
      }
      result[dayIndex].push({
        name: dayData.name,
        teacher: dayData.teacher || '',
        room: dayData.location || '',
        time: dayData.time || '',
        slot: dayData.slot ?? 0,
        color: courseColorMap[dayData.name],
        weeks: dayData.weeks || '',
        type: dayData.type || '',
      })
    })
  }

  return result
}

function SchedulePage() {
  const navigate = useNavigate()
  const today = new Date().getDay()
  const [selectedDay, setSelectedDay] = useState(
    today >= 1 && today <= 5 ? today - 1 : 0
  )

  const { user, token } = useUser()

  /* 真实课表数据（从缓存加载） */
  const [realSchedule, setRealSchedule] = useState(null)
  const [dataSource, setDataSource] = useState('mock')

  /* 组件挂载时，从profile获取缓存的课表数据 */
  useEffect(() => {
    const loadData = async () => {
      if (!token) return
      try {
        const res = await fetch('/api/user/profile', {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (data.success && data.data?.scheduleCache) {
          const scheduleRaw = data.data.scheduleCache.data
          const transformed = transformRealSchedule(
            scheduleRaw?.courses || scheduleRaw
          )
          const hasData = Object.values(transformed).some((courses) => courses.length > 0)
          if (hasData) {
            setRealSchedule(transformed)
            setDataSource('cached')
          }
        }
      } catch (err) {
        console.warn('加载缓存课表失败:', err)
      }
    }
    loadData()
  }, [token])

  /* 获取当前时间段（用于高亮，基于14个节次） */
  const currentTimeSlot = useMemo(() => {
    const now = new Date()
    const hours = now.getHours()
    const minutes = now.getMinutes()
    const currentMinutes = hours * 60 + minutes

    if (currentMinutes >= 480 && currentMinutes < 525) return 0
    if (currentMinutes >= 535 && currentMinutes < 580) return 1
    if (currentMinutes >= 600 && currentMinutes < 645) return 2
    if (currentMinutes >= 655 && currentMinutes < 700) return 3
    if (currentMinutes >= 810 && currentMinutes < 855) return 4
    if (currentMinutes >= 865 && currentMinutes < 910) return 5
    if (currentMinutes >= 920 && currentMinutes < 965) return 6
    if (currentMinutes >= 975 && currentMinutes < 1020) return 7
    if (currentMinutes >= 1080 && currentMinutes < 1125) return 8
    if (currentMinutes >= 1135 && currentMinutes < 1180) return 9
    if (currentMinutes >= 1190 && currentMinutes < 1235) return 10
    if (currentMinutes >= 1245 && currentMinutes < 1290) return 11
    if (currentMinutes >= 1295 && currentMinutes < 1340) return 12
    if (currentMinutes >= 1345 && currentMinutes < 1390) return 13
    return -1
  }, [])

  /* 当前使用的课表数据 */
  const scheduleData = realSchedule || {}

  /* 获取指定位置的课程（考虑跨节次） */
  const getCourse = (day, slot) => {
    const courses = scheduleData[day] || []
    return courses.find((c) => {
      const start = c.slot ?? 0
      const end = c.endSlot ?? start
      return slot >= start && slot <= end
    }) || null
  }

  /* 判断是否是课程的起始节次（用于决定是否显示课程卡） */
  const isCourseStart = (day, slot) => {
    const courses = scheduleData[day] || []
    const course = courses.find((c) => {
      const start = c.slot ?? 0
      const end = c.endSlot ?? start
      return slot >= start && slot <= end
    })
    return course && (course.slot ?? 0) === slot
  }

  /* 获取课程的跨行数 */
  const getCourseSpan = (day, slot) => {
    const courses = scheduleData[day] || []
    const course = courses.find((c) => {
      const start = c.slot ?? 0
      const end = c.endSlot ?? start
      return slot >= start && slot <= end
    })
    if (!course) return 1
    return (course.endSlot ?? course.slot ?? slot) - (course.slot ?? slot) + 1
  }

  /* 判断是否为当前时间 */
  const isCurrentSlot = (day, slot) => {
    const todayIndex = new Date().getDay() - 1
    return todayIndex === day && currentTimeSlot === slot
  }

  return (
    <div className="schedule-container">
      {/* 页面标题 */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">课表查询</h1>
          <p className="page-desc">查看本周课程安排</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {dataSource === 'cached' && (
            <span className="data-source-tag cached">教务数据</span>
          )}
        </div>
      </div>

      {/* 未连接教务系统提示 */}
      {!realSchedule && (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}>
          <Calendar size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>
            暂无课表数据
          </p>
          <p style={{ fontSize: '13px', marginBottom: '16px' }}>
            请前往「用户」页面连接教务系统以获取真实课表
          </p>
          <button
            onClick={() => navigate('/user')}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--primary)',
              color: '#fff',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            前往连接
          </button>
        </div>
      )}

      {/* 有数据时显示课表 */}
      {realSchedule && (<>

      {/* 星期选择器 */}
      <div className="schedule-week-selector">
        {weekDays.map((day, index) => (
          <button
            key={day}
            className={`week-btn ${selectedDay === index ? 'active' : ''}`}
            onClick={() => setSelectedDay(index)}
          >
            {day}
          </button>
        ))}
      </div>

      {/* 今日课程概览（移动端友好） */}
      <div className="schedule-overview">
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>
          {weekDays[selectedDay]}课程概览
        </h3>
        {scheduleData[selectedDay] && scheduleData[selectedDay].length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {scheduleData[selectedDay]
              .sort((a, b) => a.slot - b.slot)
              .map((course) => {
                const colorConfig = courseColors[course.color % courseColors.length]
                const isCurrent = isCurrentSlot(selectedDay, course.slot)
                return (
                  <div
                    key={course.name + course.time}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      background: 'var(--card-bg)',
                      border: `1px solid ${isCurrent ? 'var(--primary)' : 'var(--card-border)'}`,
                      borderRadius: 'var(--radius-md)',
                      boxShadow: isCurrent ? '0 0 0 2px rgba(79,70,229,0.1)' : 'none',
                      transition: 'box-shadow 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isCurrent) e.currentTarget.style.borderColor = 'var(--primary)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isCurrent) e.currentTarget.style.borderColor = 'var(--card-border)'
                    }}
                  >
                    <div
                      style={{
                        width: '4px',
                        height: '40px',
                        borderRadius: '2px',
                        background: colorConfig.text,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {course.name}
                        </span>
                        {isCurrent && (
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '1px 6px',
                              background: '#EEF2FF',
                              color: '#4F46E5',
                              borderRadius: 'var(--radius-full)',
                              flexShrink: 0,
                            }}
                          >
                            进行中
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {course.teacher} · {course.room} · {course.time}
                        {course.weeks && ` · ${course.weeks}`}
                      </div>
                    </div>
                    <Clock size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </div>
                )
              })}
          </div>
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: '32px',
              color: 'var(--text-muted)',
              fontSize: '14px',
            }}
          >
            今天没有课程，好好休息吧！
          </div>
        )}
      </div>

      {/* 课程表格（桌面端显示） */}
      <div className="schedule-table">
        {/* 表头 */}
        <div className="schedule-table-header">
          <div className="header-cell">时间</div>
          {weekDays.map((day) => (
            <div
              key={day}
              className="header-cell"
              style={{
                background: selectedDay === weekDays.indexOf(day) ? '#EEF2FF' : undefined,
                color: selectedDay === weekDays.indexOf(day) ? '#4F46E5' : undefined,
              }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* 课程内容 */}
        <div className="schedule-table-body">
          {timeSlots.map((slot, slotIndex) => (
            <>
              <div className="time-cell">
                <span style={{ fontWeight: 600, fontSize: '11px' }}>
                  {slot.label}
                </span>
                <span style={{ fontSize: '10px', marginTop: '2px' }}>
                  {slot.time.split('-')[0]}
                </span>
              </div>

              {[0, 1, 2, 3, 4].map((dayIndex) => {
                const course = getCourse(dayIndex, slotIndex)
                const isCurrent = isCurrentSlot(dayIndex, slotIndex)
                const isStart = isCourseStart(dayIndex, slotIndex)
                const span = getCourseSpan(dayIndex, slotIndex)
                const colorConfig = course
                  ? courseColors[course.color % courseColors.length]
                  : null

                /* 如果不是课程起始节次，跳过（被上面的 rowSpan 覆盖） */
                if (course && !isStart) return null

                return (
                  <div
                    key={`${dayIndex}-${slotIndex}`}
                    className="course-cell"
                    style={span > 1 ? { gridRow: `span ${span}` } : undefined}
                  >
                    {course ? (
                      <div
                        className={`course-card ${isCurrent ? 'current' : ''}`}
                        style={{
                          background: colorConfig.bg,
                          color: colorConfig.text,
                          border: `1px solid ${colorConfig.border}`,
                          height: span > 1 ? '100%' : undefined,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.02)'
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                          e.currentTarget.style.zIndex = '2'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'none'
                          e.currentTarget.style.boxShadow = 'none'
                          e.currentTarget.style.zIndex = '1'
                        }}
                      >
                        <div className="course-name" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {course.name}
                        </div>
                        <div className="course-info">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <MapPin size={10} />
                            {course.room}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <User size={10} />
                            {course.teacher}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </>
          ))}
        </div>
      </div>
      </>)}
    </div>
  )
}

export default SchedulePage
