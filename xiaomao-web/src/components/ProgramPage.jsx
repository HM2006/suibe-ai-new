/* ========================================
   小贸 - 培养方案完成情况页面
   递归树形展示模块和课程 + 计划外课程
   数据来源：用户页面登录教务系统后自动缓存
   ======================================== */
import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, CheckCircle, Clock, ChevronDown, ChevronRight, BookOpen, AlertCircle, TrendingUp } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { API } from '../config/api'

/* ========================================
   状态标签组件
   ======================================== */
function ResultTag({ type, small }) {
  const config = {
    PASSED: { label: '通过', color: 'var(--success)', bg: 'var(--success-container)', icon: CheckCircle },
    TAKING: { label: '在读', color: 'var(--warning)', bg: 'var(--warning-container)', icon: Clock },
    INCOMPLETE: { label: '未完成', color: 'var(--text-muted)', bg: 'var(--surface-container)', icon: TrendingUp },
  }
  const c = config[type] || config.INCOMPLETE
  const Icon = c.icon
  const sz = small ? 11 : 13
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '3px',
      padding: small ? '1px 8px' : '2px 10px',
      borderRadius: 'var(--radius-full)',
      fontSize: small ? '11px' : 'var(--body-sm)',
      fontWeight: 500,
      color: c.color,
      background: c.bg,
      whiteSpace: 'nowrap',
    }}>
      <Icon size={sz} />
      {c.label}
    </span>
  )
}

/* ========================================
   进度条组件
   ======================================== */
function ProgressBar({ passed, total, height }) {
  const pct = total > 0 ? Math.min((passed / total) * 100, 100) : 0
  return (
    <div style={{
      width: '100%',
      height: height || 8,
      borderRadius: 'var(--radius-full)',
      background: 'var(--surface-container-high)',
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        borderRadius: 'var(--radius-full)',
        background: 'linear-gradient(90deg, var(--primary), var(--primary-light))',
        transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
      }} />
    </div>
  )
}

/* ========================================
   统计卡片组件
   ======================================== */
function StatCard({ icon: Icon, label, value, color, bgColor }) {
  return (
    <div style={{
      background: 'var(--card-bg)',
      borderRadius: 'var(--radius-md)',
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      border: 'var(--ghost-border)',
      boxShadow: 'var(--shadow-sm)',
      flex: '1 1 0',
      minWidth: 0,
    }}>
      <div style={{
        width: '42px',
        height: '42px',
        borderRadius: 'var(--radius-sm)',
        background: bgColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={20} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--display-sm)', fontWeight: 700, color, lineHeight: 1.2 }}>
          {value}
        </div>
        <div style={{ fontSize: 'var(--body-sm)', color: 'var(--text-muted)', marginTop: '2px' }}>
          {label}
        </div>
      </div>
    </div>
  )
}

/* ========================================
   课程表格组件（叶子模块展开后显示）
   ======================================== */
function CourseTable({ courses }) {
  if (!courses || courses.length === 0) return null
  return (
    <div style={{
      marginTop: '12px',
      borderRadius: 'var(--radius-sm)',
      border: 'var(--ghost-border)',
      overflow: 'hidden',
      fontSize: 'var(--body-md)',
    }}>
      {/* 表头 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1.2fr 0.6fr 0.6fr 0.6fr 0.6fr 0.8fr',
        padding: '10px 14px',
        background: 'var(--surface-container)',
        color: 'var(--text-muted)',
        fontSize: 'var(--body-sm)',
        fontWeight: 600,
        gap: '8px',
      }}>
        <div>课程名称</div>
        <div>代码</div>
        <div>学分</div>
        <div>成绩</div>
        <div>绩点</div>
        <div>必修</div>
        <div>状态</div>
      </div>
      {/* 课程行 */}
      {courses.map((course, idx) => (
        <div key={idx} style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1.2fr 0.6fr 0.6fr 0.6fr 0.6fr 0.8fr',
          padding: '10px 14px',
          borderTop: '1px solid var(--ghost-border)',
          alignItems: 'center',
          gap: '8px',
          fontSize: 'var(--body-sm)',
        }}>
          <div style={{ fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={course.nameZh}>
            {course.nameZh}
          </div>
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
            {course.code}
          </div>
          <div>{course.credits}</div>
          <div style={{ fontWeight: 600 }}>{course.gradeStr || course.score || '-'}</div>
          <div>{course.gp || '-'}</div>
          <div>
            {course.compulsory ? (
              <span style={{ color: 'var(--primary)', fontWeight: 500 }}>必修</span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>选修</span>
            )}
          </div>
          <div><ResultTag type={course.resultType} small /></div>
        </div>
      ))}
    </div>
  )
}

/* ========================================
   递归模块树组件
   ======================================== */
function ModuleNode({ module, level }) {
  const [expanded, setExpanded] = useState(level === 0)
  const hasChildren = module.children && module.children.length > 0
  const hasCourses = module.courseList && module.courseList.length > 0
  const isLeaf = !hasChildren

  const paddingLeft = 16 + level * 20

  /* 计算完成百分比 */
  const requiredCredits = module.requireInfo?.credits || 0
  const passedCredits = module.completionSummary?.passedCredits || 0
  const takingCredits = module.completionSummary?.takingCredits || 0
  const failedCredits = module.completionSummary?.failedCredits || 0
  const pct = requiredCredits > 0 ? Math.min(Math.round((passedCredits / requiredCredits) * 100), 100) : 0

  return (
    <div>
      {/* 模块头部 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          paddingLeft: `${paddingLeft}px`,
          cursor: (hasChildren || hasCourses) ? 'pointer' : 'default',
          borderRadius: 'var(--radius-sm)',
          transition: 'background var(--transition-fast)',
          background: expanded && (hasChildren || hasCourses) ? 'var(--surface-container-low)' : 'transparent',
        }}
        onClick={() => {
          if (hasChildren || hasCourses) setExpanded(!expanded)
        }}
      >
        {/* 折叠箭头 */}
        <div style={{ width: 18, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
          {(hasChildren || hasCourses) ? (
            expanded
              ? <ChevronDown size={16} color="var(--text-muted)" />
              : <ChevronRight size={16} color="var(--text-muted)" />
          ) : (
            <span style={{ width: 16 }} />
          )}
        </div>

        {/* 模块名称 + 学分信息 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: level === 0 ? 600 : 500,
            fontSize: level === 0 ? 'var(--title-md)' : 'var(--body-md)',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {module.nameZh}
          </div>
          {/* 学分信息行 */}
          <div style={{ fontSize: 'var(--body-sm)', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span>要求 {requiredCredits} 学分</span>
            <span style={{ color: 'var(--success)' }}>已通过 {passedCredits}</span>
            {takingCredits > 0 && (
              <span style={{ color: 'var(--warning)' }}>在读 {takingCredits}</span>
            )}
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              ({pct}%)
            </span>
          </div>
          {/* 迷你进度条（仅一级模块显示） */}
          {level === 0 && (
            <div style={{ marginTop: '6px', width: '100%', maxWidth: 200 }}>
              <ProgressBar passed={passedCredits} total={requiredCredits} height={4} />
            </div>
          )}
        </div>

        {/* 状态标签：使用 INCOMPLETE 而非 FAILED */}
        <div style={{ flexShrink: 0 }}>
          <ResultTag type={module.resultType === 'PASSED' ? 'PASSED' : module.resultType === 'TAKING' ? 'TAKING' : 'INCOMPLETE'} small />
        </div>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div>
          {/* 子模块递归 */}
          {hasChildren && module.children.map((child, idx) => (
            <ModuleNode key={idx} module={child} level={level + 1} />
          ))}
          {/* 课程列表（叶子模块） */}
          {isLeaf && hasCourses && (
            <div style={{ paddingLeft: `${paddingLeft + 18}px`, paddingRight: '16px', paddingBottom: '12px' }}>
              <CourseTable courses={module.courseList} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ========================================
   Tab 切换组件
   ======================================== */
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex',
      gap: '4px',
      padding: '4px',
      background: 'var(--surface-container)',
      borderRadius: 'var(--radius-md)',
      marginBottom: '20px',
    }}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--body-md)',
            fontWeight: active === tab.key ? 600 : 400,
            color: active === tab.key ? 'var(--primary)' : 'var(--text-muted)',
            background: active === tab.key ? 'var(--card-bg)' : 'transparent',
            boxShadow: active === tab.key ? 'var(--shadow-sm)' : 'none',
            transition: 'all var(--transition-fast)',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/* ========================================
   主页面组件
   ======================================== */
function ProgramPage() {
  const navigate = useNavigate()
  const { user, token } = useUser()
  const [programData, setProgramData] = useState(null)
  const [activeTab, setActiveTab] = useState('program')
  const [loading, setLoading] = useState(true)

  /* 组件挂载时，从profile获取缓存的培养方案数据 */
  useEffect(() => {
    const loadCachedProgram = async () => {
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const res = await fetch(`${API.user}/profile`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (!res.ok) {
          setLoading(false)
          return
        }
        const data = await res.json()
        if (data.success && data.data?.programCache) {
          setProgramData(data.data.programCache.data)
        }
      } catch (err) {
        console.warn('加载缓存培养方案失败:', err)
      } finally {
        setLoading(false)
      }
    }
    loadCachedProgram()
  }, [token])

  /* 总览统计：在读学分 = 培养方案内 + 计划外 */
  const summary = useMemo(() => {
    if (!programData) return null
    const cs = programData.completionSummary
    const outerCs = programData.outerCompletionSummary
    const total = programData.requireInfo?.credits || 0
    const passed = cs?.passedCredits || 0
    const failed = cs?.failedCredits || 0
    const taking = (cs?.takingCredits || 0) + (outerCs?.takingCredits || 0)
    const pct = total > 0 ? Math.round((passed / total) * 100) : 0
    return { passed, failed, taking, total, pct }
  }, [programData])

  /* 计划外统计 */
  const outerSummary = useMemo(() => {
    if (!programData) return null
    const cs = programData.outerCompletionSummary
    return {
      passed: cs?.passedCredits || 0,
      failed: cs?.failedCredits || 0,
      taking: cs?.takingCredits || 0,
    }
  }, [programData])

  /* 加载中状态 */
  if (loading) {
    return (
      <div className="grades-container">
        <div className="page-header">
          <h1 className="page-title">培养方案</h1>
          <p className="page-desc">查看培养方案完成情况</p>
        </div>
        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '3px solid var(--surface-container-high)',
            borderTopColor: 'var(--primary)',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{ fontSize: 'var(--body-md)' }}>加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grades-container">
      {/* 页面标题 */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">培养方案</h1>
          <p className="page-desc">查看培养方案完成情况</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {programData && (
            <span className="data-source-tag cached">教务数据</span>
          )}
        </div>
      </div>

      {/* 未连接教务系统提示 */}
      {!programData && (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}>
          <GraduationCap size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>
            暂无培养方案数据
          </p>
          <p style={{ fontSize: '13px', marginBottom: '16px' }}>
            请前往「用户」页面连接教务系统以获取培养方案完成情况
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

      {/* 有数据时显示内容 */}
      {programData && (<>

        {/* 学生基本信息 + 培养方案名称 */}
        <div style={{
          background: 'var(--card-bg)',
          borderRadius: 'var(--radius-md)',
          padding: '20px',
          border: 'var(--ghost-border)',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '16px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            marginBottom: '14px',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--primary), var(--primary-light))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              flexShrink: 0,
            }}>
              <GraduationCap size={24} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--title-md)', color: 'var(--text-primary)' }}>
                {programData.program?.nameZh || '培养方案'}
              </div>
              <div style={{ fontSize: 'var(--body-sm)', color: 'var(--text-muted)', marginTop: '2px' }}>
                {programData.student?.name} | {programData.student?.code} | {programData.student?.grade}级
              </div>
            </div>
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          }}>
            <span style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--primary-container)',
              color: 'var(--on-primary-container)',
              fontSize: 'var(--body-sm)',
              fontWeight: 500,
            }}>
              {programData.program?.grade}级
            </span>
            <span style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface-container)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--body-sm)',
            }}>
              要求 {programData.requireInfo?.credits} 学分 / {programData.requireInfo?.subModuleNum} 个模块
            </span>
          </div>
        </div>

        {/* 总览统计卡片：已通过 + 在读 + 剩余 */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        }}>
          <StatCard
            icon={CheckCircle}
            label="已通过学分"
            value={summary.passed}
            color="var(--success)"
            bgColor="var(--success-container)"
          />
          <StatCard
            icon={Clock}
            label="在读学分"
            value={summary.taking}
            color="var(--warning)"
            bgColor="var(--warning-container)"
          />
          <StatCard
            icon={TrendingUp}
            label="剩余学分"
            value={summary.total - summary.passed - summary.taking}
            color="var(--text-muted)"
            bgColor="var(--surface-container)"
          />
        </div>

        {/* 进度条 */}
        <div style={{
          background: 'var(--card-bg)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          border: 'var(--ghost-border)',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '20px',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
          }}>
            <span style={{ fontSize: 'var(--body-md)', fontWeight: 500, color: 'var(--text-primary)' }}>
              总体完成进度
            </span>
            <span style={{ fontSize: 'var(--title-md)', fontWeight: 700, color: 'var(--primary)' }}>
              {summary.pct}%
            </span>
          </div>
          <ProgressBar passed={summary.passed} total={summary.total} height={10} />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '8px',
            fontSize: 'var(--body-sm)',
            color: 'var(--text-muted)',
          }}>
            <span>已通过 {summary.passed} 学分</span>
            <span>共需 {summary.total} 学分</span>
          </div>
        </div>

        {/* Tab 切换 */}
        <TabBar
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { key: 'program', label: '培养方案完成情况' },
            { key: 'outer', label: `计划外完成情况${outerSummary && (outerSummary.passed > 0 || outerSummary.taking > 0) ? ` (${outerSummary.passed + outerSummary.taking})` : ''}` },
          ]}
        />

        {/* 培养方案 Tab */}
        {activeTab === 'program' && (
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: 'var(--radius-md)',
            border: 'var(--ghost-border)',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}>
            {programData.modules && programData.modules.map((mod, idx) => (
              <div key={idx}>
                {idx > 0 && <div style={{ height: 1, background: 'var(--ghost-border)', margin: '0 16px' }} />}
                <ModuleNode module={mod} level={0} />
              </div>
            ))}
            {(!programData.modules || programData.modules.length === 0) && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <AlertCircle size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                <p>暂无模块数据</p>
              </div>
            )}
          </div>
        )}

        {/* 计划外 Tab */}
        {activeTab === 'outer' && (
          <div>
            {/* 计划外统计 */}
            {outerSummary && (outerSummary.passed > 0 || outerSummary.taking > 0) && (
              <div style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '16px',
                flexWrap: 'wrap',
              }}>
                <StatCard
                  icon={CheckCircle}
                  label="计划外已通过"
                  value={outerSummary.passed}
                  color="var(--success)"
                  bgColor="var(--success-container)"
                />
                <StatCard
                  icon={Clock}
                  label="计划外在读"
                  value={outerSummary.taking}
                  color="var(--warning)"
                  bgColor="var(--warning-container)"
                />
              </div>
            )}

            {/* 计划外课程表格 */}
            {programData.outerCourseList && programData.outerCourseList.length > 0 ? (
              <div style={{
                background: 'var(--card-bg)',
                borderRadius: 'var(--radius-md)',
                border: 'var(--ghost-border)',
                boxShadow: 'var(--shadow-sm)',
                overflow: 'hidden',
              }}>
                {/* 表头 */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.2fr 0.6fr 0.6fr 0.6fr 1.5fr',
                  padding: '10px 14px',
                  background: 'var(--surface-container)',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--body-sm)',
                  fontWeight: 600,
                  gap: '8px',
                }}>
                  <div>课程名称</div>
                  <div>代码</div>
                  <div>学分</div>
                  <div>成绩</div>
                  <div>状态</div>
                  <div>备注</div>
                </div>
                {programData.outerCourseList.map((course, idx) => (
                  <div key={idx} style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.2fr 0.6fr 0.6fr 0.6fr 1.5fr',
                    padding: '10px 14px',
                    borderTop: '1px solid var(--ghost-border)',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: 'var(--body-sm)',
                  }}>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={course.nameZh}>
                      {course.nameZh}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                      {course.code}
                    </div>
                    <div>{course.credits}</div>
                    <div style={{ fontWeight: 600 }}>{course.gradeStr || course.score || '-'}</div>
                    <div><ResultTag type={course.resultType} small /></div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={course.remark}>
                      {course.remark || '-'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                padding: '60px 20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                background: 'var(--card-bg)',
                borderRadius: 'var(--radius-md)',
                border: 'var(--ghost-border)',
                boxShadow: 'var(--shadow-sm)',
              }}>
                <BookOpen size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <p style={{ fontSize: 'var(--body-md)' }}>暂无计划外课程</p>
              </div>
            )}
          </div>
        )}

      </>)}
    </div>
  )
}

export default ProgramPage
