import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookMarked, ChevronRight, ChevronDown, GraduationCap,
  CheckCircle2, Circle, Clock, Search,
  AlertCircle, Loader2, RefreshCw, Info,
} from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { API } from '../config/api'

function CreditBar({ required, completed, label }) {
  const pct = required > 0 ? Math.min((completed / required) * 100, 100) : 0
  const isDone = pct >= 100
  return (
    <div className="tp-credit-bar">
      <div className="tp-credit-bar-header">
        <span className="tp-credit-label">{label}</span>
        <span className="tp-credit-num">
          <span className={isDone ? 'tp-done' : ''}>{completed}</span>
          <span className="tp-sep">/</span>
          <span>{required}</span>
          <span className="tp-unit">学分</span>
        </span>
      </div>
      <div className="tp-credit-track">
        <div className={`tp-credit-fill ${isDone ? 'tp-fill-done' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function CourseCard({ course, isCompleted }) {
  return (
    <div className={`tp-course-card ${isCompleted ? 'tp-completed' : ''}`}>
      <div className="tp-course-left">
        <div className="tp-course-status">
          {isCompleted ? <CheckCircle2 size={16} className="tp-icon-done" /> : <Circle size={16} className="tp-icon-pending" />}
        </div>
        <div className="tp-course-info">
          <div className="tp-course-name">
            {course.name}
            {course.marks?.length > 0 && <span className="tp-course-mark">{course.marks.map(m => m.mark || m.name).join(' ')}</span>}
          </div>
          <div className="tp-course-meta">
            <span className="tp-course-code">{course.code}</span>
            <span className="tp-course-credits">{course.credits}学分</span>
            {course.property && <span className={`tp-course-prop ${course.compulsory ? 'tp-required' : 'tp-elective'}`}>{course.property}</span>}
          </div>
          {course.terms?.length > 0 && <div className="tp-course-terms"><Clock size={12} /><span>第{course.terms.join('/')}学期</span></div>}
          {course.preCourses?.length > 0 && <div className="tp-course-pre"><Info size={12} /><span>先修: {course.preCourses.join(', ')}</span></div>}
        </div>
      </div>
      {isCompleted && course.score && <div className="tp-course-score">{course.score}</div>}
    </div>
  )
}

function ModuleNode({ mod, expandedIds, toggleExpand, completedCourseCodes, filter }) {
  const isExpanded = expandedIds.has(mod.id)
  const hasChildren = mod.children?.length > 0
  const hasCourses = mod.courses?.length > 0
  const filteredCourses = useMemo(() => {
    if (!mod.courses?.length) return []
    return mod.courses.filter(c => {
      if (filter === 'completed') return completedCourseCodes.has(c.code)
      if (filter === 'uncompleted') return !completedCourseCodes.has(c.code)
      return true
    })
  }, [mod.courses, filter, completedCourseCodes])
  const filteredChildren = mod.children || []
  const allCourseStats = useMemo(() => {
    const stats = { total: 0, completed: 0 }
    const walk = (node) => {
      if (node.courses?.length) { stats.total += node.courses.length; stats.completed += node.courses.filter(c => completedCourseCodes.has(c.code)).length }
      node.children?.forEach(walk)
    }
    walk(mod)
    return stats
  }, [mod, completedCourseCodes])
  if (filter !== 'all' && !hasChildren && filteredCourses.length === 0) return null
  return (
    <div className={`tp-module tp-depth-${Math.min(mod.depth || 0, 3)}`}>
      <div className="tp-module-header" onClick={() => toggleExpand(mod.id)} style={{ cursor: (hasChildren || hasCourses) ? 'pointer' : 'default' }}>
        {(hasChildren || hasCourses) && <span className="tp-module-arrow">{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>}
        <span className="tp-module-name">{mod.name}</span>
        {mod.requiredCredits > 0 && <span className="tp-module-credits">{mod.requiredCredits}学分</span>}
        {allCourseStats.total > 0 && <span className="tp-module-progress">{allCourseStats.completed}/{allCourseStats.total}</span>}
      </div>
      {isExpanded && mod.depth === 0 && Object.keys(mod.creditBySubModule || {}).length > 0 && (
        <div className="tp-submodule-credits">
          {Object.entries(mod.creditBySubModule).map(([name, credits]) => <span key={name} className="tp-submodule-tag">{name}: {credits}学分</span>)}
        </div>
      )}
      {isExpanded && (
        <div className="tp-module-body">
          {filteredChildren.map(child => <ModuleNode key={child.id} mod={child} expandedIds={expandedIds} toggleExpand={toggleExpand} completedCourseCodes={completedCourseCodes} filter={filter} />)}
          {filteredCourses.map(course => <CourseCard key={course.id} course={course} isCompleted={completedCourseCodes.has(course.code)} />)}
        </div>
      )}
    </div>
  )
}

export default function TrainingProgramPage() {
  const { user, token } = useUser()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [filter, setFilter] = useState('all')
  const [searchText, setSearchText] = useState('')
  const loadData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API.edu}/training-program?userId=${user?.id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.success && json.data) setData(json.data)
      else throw new Error(json.message || '获取失败')
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [user?.id])
  useEffect(() => { if (user?.id) loadData() }, [user?.id, loadData])
  const toggleExpand = useCallback((id) => { setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next }) }, [])
  const expandAll = useCallback(() => { if (!data?.modules) return; const ids = new Set(); const walk = (node) => { ids.add(node.id); node.children?.forEach(walk) }; data.modules.forEach(walk); setExpandedIds(ids) }, [data])
  const collapseAll = useCallback(() => { setExpandedIds(new Set()) }, [])
  const completedCourseCodes = useMemo(() => {
    if (!data) return new Set()
    const codes = new Set()
    const walk = (modules) => { for (const mod of modules) { mod.courses?.forEach(c => { if (c.completed) codes.add(c.code) }); mod.children?.length > 0 && walk(mod.children) } }
    walk(data.modules || [])
    return codes
  }, [data])
  const stats = useMemo(() => {
    if (!data) return { total: 0, completed: 0, credits: 0, completedCredits: 0 }
    let total = 0, completed = 0, credits = 0, completedCredits = 0
    const walk = (modules) => { for (const mod of modules) { mod.courses?.forEach(c => { total++; credits += c.credits || 0; if (c.completed) { completed++; completedCredits += c.credits || 0 } }); mod.children?.length > 0 && walk(mod.children) } }
    walk(data.modules || [])
    return { total, completed, credits, completedCredits }
  }, [data])
  if (loading) return (<div className="tp-loading"><Loader2 size={32} className="tp-spin" /><p>正在加载培养方案...</p></div>)
  if (error) return (<div className="tp-error"><AlertCircle size={48} /><h3>加载失败</h3><p>{error}</p><button className="tp-btn" onClick={loadData}><RefreshCw size={16} /> 重试</button>{!user?.eduConnected && <button className="tp-btn tp-btn-secondary" onClick={() => navigate('/user')}>前往登录教务系统</button>}</div>)
  if (!data?.modules?.length) return (<div className="tp-error"><BookMarked size={48} /><h3>暂无培养方案数据</h3><p>请先在个人中心登录教务系统并同步数据</p><button className="tp-btn" onClick={() => navigate('/user')}>前往登录</button></div>)
  return (
    <div className="tp-page">
      <div className="tp-overview">
        <div className="tp-overview-title"><GraduationCap size={20} /><span>培养方案概览</span></div>
        <div className="tp-stats-row">
          <div className="tp-stat-card"><div className="tp-stat-value">{stats.total}</div><div className="tp-stat-label">总课程数</div></div>
          <div className="tp-stat-card"><div className="tp-stat-value tp-stat-done">{stats.completed}</div><div className="tp-stat-label">已修课程</div></div>
          <div className="tp-stat-card"><div className="tp-stat-value">{stats.credits}</div><div className="tp-stat-label">总学分</div></div>
          <div className="tp-stat-card"><div className="tp-stat-value tp-stat-done">{stats.completedCredits}</div><div className="tp-stat-label">已修学分</div></div>
        </div>
        <CreditBar required={data.totalRequiredCredits} completed={stats.completedCredits} label="总学分进度" />
      </div>
      <div className="tp-toolbar">
        <div className="tp-toolbar-left">
          <div className="tp-filter-group">
            {[{ key: 'all', label: '全部' }, { key: 'completed', label: '已修' }, { key: 'uncompleted', label: '未修' }].map(f => (
              <button key={f.key} className={`tp-filter-btn ${filter === f.key ? 'tp-filter-active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
          </div>
        </div>
        <div className="tp-toolbar-right">
          <div className="tp-search"><Search size={14} /><input type="text" placeholder="搜索课程..." value={searchText} onChange={e => setSearchText(e.target.value)} /></div>
          <button className="tp-tool-btn" onClick={expandAll}>展开</button>
          <button className="tp-tool-btn" onClick={collapseAll}>折叠</button>
        </div>
      </div>
      <div className="tp-modules">{data.modules.map(mod => <ModuleNode key={mod.id} mod={mod} expandedIds={expandedIds} toggleExpand={toggleExpand} completedCourseCodes={completedCourseCodes} filter={filter} />)}</div>
    </div>
  )
}
