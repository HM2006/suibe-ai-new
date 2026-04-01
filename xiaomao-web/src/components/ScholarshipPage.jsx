/* ========================================
   小贸 - 奖学金综合测评计算器
   分步向导式页面，计算综合测评分数
   ======================================== */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  Dumbbell,
  Heart,
  Lightbulb,
  Hammer,
  Star,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader,
  Info,
} from 'lucide-react'
import { useUser } from '../contexts/UserContext'

/* API基础路径 */
const API_BASE = '/api/edu'

/* 参评学期 */
const TARGET_SEMESTER = '2025-2026-1'
const TARGET_SEMESTER_LABEL = '2025-2026学年第一学期'

/* 分步向导步骤配置 */
const STEPS = [
  { key: 'edu', label: '智育素质', icon: BookOpen, weight: '60%' },
  { key: 'pe', label: '体育素质', icon: Dumbbell, weight: '5%' },
  { key: 'moral', label: '德育素质', icon: Heart, weight: '20%' },
  { key: 'practice', label: '实践创新', icon: Lightbulb, weight: '10%' },
  { key: 'labor', label: '劳动教育', icon: Hammer, weight: '5%' },
  { key: 'extra', label: '附加分', icon: Star, weight: '+' },
  { key: 'result', label: '结果', icon: Trophy, weight: '' },
]

/* 实践创新类别配置 */
const PRACTICE_CATEGORIES = [
  { key: 'social', label: '社会实践', maxPoints: 15, maxScore: 30 },
  { key: 'volunteer', label: '志愿服务', maxPoints: 15, maxScore: 30 },
  { key: 'innovation', label: '创新实践', maxPoints: 15, maxScore: 30 },
  { key: 'culture', label: '文体活动', maxPoints: 5, maxScore: 10 },
]

/* 将后端成绩数据转换为统一格式 */
function transformGrades(rawData) {
  let grades = null
  if (Array.isArray(rawData)) {
    grades = rawData
  } else if (rawData && Array.isArray(rawData.grades)) {
    grades = rawData.grades
  }
  if (!grades) return []

  return grades.map((item, index) => ({
    id: index + 1,
    course: item.courseName || item.course || '',
    credit: item.credit || 0,
    score: item.score,
    scoreNum: item.scoreNum || (typeof item.score === 'number' ? item.score : 0),
    grade: item.grade || '',
    semester: item.semester || '',
    type: item.type || '必修',
    isLevelText: typeof item.score === 'string',
  }))
}

/* 从成绩中查找特定课程 */
function findCourseByName(grades, keyword) {
  return grades.find((g) => g.course.includes(keyword))
}

/* 从成绩中查找所有匹配课程 */
function findAllCoursesByName(grades, keyword) {
  return grades.filter((g) => g.course.includes(keyword))
}

/* PDF文本解析 - 提取各类别积分 */
function parsePdfText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const result = {
    social: 0,
    volunteer: 0,
    innovation: 0,
    culture: 0,
    labor: 0,
  }

  /* 分类关键词映射 */
  const categoryMap = {
    '社会实践': 'social',
    '志愿服务': 'volunteer',
    '创新实践': 'innovation',
    '文体活动': 'culture',
    '劳动实践': 'labor',
  }

  let currentCategory = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    /* 检查是否是分类标题行 */
    let matchedCategory = null
    for (const [keyword, key] of Object.entries(categoryMap)) {
      if (line.includes(keyword) && line.includes('总分')) {
        matchedCategory = key
        currentCategory = key
        break
      }
    }

    if (matchedCategory) continue

    /* 如果当前在某个分类下，检查是否是目标学期的记录 */
    if (currentCategory && line.includes(TARGET_SEMESTER_LABEL)) {
      /* 提取行末的数字作为积分值 */
      const parts = line.split(/\s+/)
      let points = 0
      for (let j = parts.length - 1; j >= 0; j--) {
        const num = parseFloat(parts[j])
        if (!isNaN(num) && num > 0) {
          points = num
          break
        }
      }
      result[currentCategory] += points
    }
  }

  return result
}

/* 使用 pdfjs-dist 解析 PDF */
async function extractPdfText(file) {
  try {
    /* 动态导入 pdfjs-dist */
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.js',
      import.meta.url
    ).toString()

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    let fullText = ''

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items.map((item) => item.str).join(' ')
      fullText += pageText + '\n'
    }

    return fullText
  } catch (err) {
    console.error('PDF解析失败:', err)
    throw new Error('PDF解析失败，请检查文件格式是否正确')
  }
}

/* ========================================
   主组件
   ======================================== */
function ScholarshipPage() {
  const { user, token } = useUser()

  /* 向导状态 */
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /* 成绩数据 */
  const [allGrades, setAllGrades] = useState([])
  const [gradesLoaded, setGradesLoaded] = useState(false)

  /* Step 1: 智育素质 */
  const [eduScore, setEduScore] = useState(null)
  const [eduCourses, setEduCourses] = useState([])

  /* Step 2: 体育素质 */
  const [peScore, setPeScore] = useState(null)
  const [peFromGrade, setPeFromGrade] = useState(false)
  const [peManualInput, setPeManualInput] = useState('80')

  /* Step 3: 德育素质 */
  const [moralPolicyScore, setMoralPolicyScore] = useState(85)
  const [moralPolicyFromGrade, setMoralPolicyFromGrade] = useState(false)
  const [moralDemocracyScore] = useState(100)
  const [moralActivityScore] = useState(100)

  /* Step 4: 实践创新 */
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfText, setPdfText] = useState(null)
  const [pdfParsing, setPdfParsing] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const [practiceScores, setPracticeScores] = useState({
    social: 0,
    volunteer: 0,
    innovation: 0,
    culture: 0,
  })

  /* Step 5: 劳动教育 */
  const [laborPoints, setLaborPoints] = useState(0)
  const [laborManualInput, setLaborManualInput] = useState('')

  /* Step 6: 附加分 */
  const [bloodDonation, setBloodDonation] = useState(false)

  const fileInputRef = useRef(null)

  /* 加载成绩数据 */
  useEffect(() => {
    const loadGrades = async () => {
      if (!token) return
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE}/grades`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('获取成绩失败')
        const data = await res.json()
        if (data.success && data.data) {
          const grades = transformGrades(data.data.grades || data.data)
          setAllGrades(grades)
          setGradesLoaded(true)
        } else {
          throw new Error('成绩数据格式异常')
        }
      } catch (err) {
        console.error('加载成绩失败:', err)
        setError(err.message)
        setGradesLoaded(true)
      } finally {
        setLoading(false)
      }
    }
    loadGrades()
  }, [token])

  /* 处理成绩数据 - 计算各步骤所需数据 */
  useEffect(() => {
    if (!gradesLoaded || allGrades.length === 0) return

    const semesterGrades = allGrades.filter((g) => g.semester === TARGET_SEMESTER)

    /* Step 1: 智育 - 筛选必修课，排除体育、形势与政策、重修、辅修 */
    const eduFiltered = semesterGrades.filter((g) => {
      if (g.type !== '必修') return false
      if (g.course.includes('体育')) return false
      if (g.course.includes('形势与政策')) return false
      if (g.course.includes('重修')) return false
      if (g.course.includes('辅修')) return false
      /* 排除等级文字成绩（如"合格"） */
      if (g.isLevelText) return false
      return true
    })
    setEduCourses(eduFiltered)

    if (eduFiltered.length > 0) {
      const totalWeighted = eduFiltered.reduce((sum, g) => sum + (g.scoreNum || 0) * g.credit, 0)
      const totalCredit = eduFiltered.reduce((sum, g) => sum + g.credit, 0)
      if (totalCredit > 0) {
        setEduScore(+(totalWeighted / totalCredit).toFixed(2))
      }
    }

    /* Step 2: 体育 - 搜索体育课 */
    const peCourse = findCourseByName(semesterGrades, '体育')
    if (peCourse && !peCourse.isLevelText) {
      setPeScore(peCourse.scoreNum || 0)
      setPeFromGrade(true)
    }

    /* Step 3: 德育 - 搜索形势与政策课 */
    const policyCourse = findCourseByName(semesterGrades, '形势与政策')
    if (policyCourse && !policyCourse.isLevelText) {
      setMoralPolicyScore(policyCourse.scoreNum || 0)
      setMoralPolicyFromGrade(true)
    }
  }, [gradesLoaded, allGrades])

  /* 处理PDF上传 */
  const handlePdfUpload = useCallback(async (file) => {
    if (!file || file.type !== 'application/pdf') {
      setPdfError('请上传PDF格式的文件')
      return
    }
    setPdfFile(file)
    setPdfParsing(true)
    setPdfError(null)

    try {
      const text = await extractPdfText(file)
      setPdfText(text)
      const parsed = parsePdfText(text)
      setPracticeScores({
        social: parsed.social,
        volunteer: parsed.volunteer,
        innovation: parsed.innovation,
        culture: parsed.culture,
      })
      setLaborPoints(parsed.labor)
      if (parsed.labor > 0) {
        setLaborManualInput(String(parsed.labor))
      }
    } catch (err) {
      setPdfError(err.message)
    } finally {
      setPdfParsing(false)
    }
  }, [])

  /* 计算德育总分 */
  const moralTotal = moralPolicyScore * 0.5 + moralDemocracyScore * 0.3 + moralActivityScore * 0.2

  /* 计算实践创新各项得分 */
  const practiceDetail = PRACTICE_CATEGORIES.map((cat) => {
    const points = practiceScores[cat.key] || 0
    const cappedPoints = Math.min(points, cat.maxPoints)
    const score = cappedPoints * 2
    return { ...cat, points, cappedPoints, score }
  })
  const practiceTotal = Math.min(100, practiceDetail.reduce((sum, d) => sum + d.score, 0))

  /* 计算劳动教育得分 */
  const laborPointsFinal = pdfText ? laborPoints : parseFloat(laborManualInput) || 0
  const laborScore = Math.min(100, Math.floor(laborPointsFinal / 0.25) * 10)

  /* 计算体育分 */
  const peScoreFinal = peFromGrade ? (peScore || 80) : parseFloat(peManualInput) || 80

  /* 附加分 */
  const extraScore = bloodDonation ? 1 : 0

  /* 综合分计算 */
  const comprehensiveScore =
    (eduScore || 0) * 0.6 +
    peScoreFinal * 0.05 +
    moralTotal * 0.2 +
    practiceTotal * 0.1 +
    laborScore * 0.05 +
    extraScore

  /* 导航函数 */
  const goToStep = (step) => setCurrentStep(step)
  const goNext = () => setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1))
  const goPrev = () => setCurrentStep((s) => Math.max(s - 1, 0))

  /* 渲染进度条 */
  const renderProgressBar = () => (
    <div style={{ marginBottom: '24px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '8px',
      }}>
        {STEPS.map((step, index) => {
          const Icon = step.icon
          const isActive = index === currentStep
          const isDone = index < currentStep
          return (
            <div
              key={step.key}
              onClick={() => goToStep(index)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                opacity: isActive ? 1 : isDone ? 0.7 : 0.4,
                transition: 'opacity 0.2s',
              }}
            >
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: isActive ? 'var(--primary)' : isDone ? 'var(--success)' : 'var(--bg-secondary)',
                color: isActive || isDone ? 'white' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                border: isActive ? '2px solid var(--primary)' : '2px solid transparent',
              }}>
                {isDone ? <CheckCircle size={18} /> : <Icon size={18} />}
              </div>
              <span style={{
                fontSize: '11px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
      {/* 进度线 */}
      <div style={{
        height: '3px',
        background: 'var(--bg-secondary)',
        borderRadius: '2px',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${((currentStep) / (STEPS.length - 1)) * 100}%`,
          background: 'linear-gradient(90deg, var(--primary), var(--primary-light))',
          borderRadius: '2px',
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )

  /* 渲染导航按钮 */
  const renderNavButtons = () => (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: '24px',
      paddingTop: '20px',
      borderTop: '1px solid var(--card-border)',
    }}>
      <button
        onClick={goPrev}
        disabled={currentStep === 0}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '10px 20px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--card-border)',
          background: 'var(--card-bg)',
          color: currentStep === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
          fontSize: '14px',
          fontWeight: 500,
          cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <ChevronLeft size={16} />
        上一步
      </button>
      <button
        onClick={goNext}
        disabled={currentStep === STEPS.length - 1}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '10px 20px',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: currentStep === STEPS.length - 1 ? 'var(--text-muted)' : 'var(--primary)',
          color: 'white',
          fontSize: '14px',
          fontWeight: 600,
          cursor: currentStep === STEPS.length - 1 ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
        }}
      >
        {currentStep === STEPS.length - 2 ? '查看结果' : '下一步'}
        <ChevronRight size={16} />
      </button>
    </div>
  )

  /* 卡片容器样式 */
  const cardStyle = {
    background: 'var(--card-bg)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '24px',
    marginBottom: '16px',
  }

  /* 提示框样式 */
  const infoBoxStyle = (type = 'info') => ({
    padding: '12px 16px',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    lineHeight: '1.6',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    marginBottom: '16px',
    background: type === 'warning' ? '#FFFBEB' : type === 'error' ? '#FEF2F2' : '#EEF2FF',
    border: `1px solid ${type === 'warning' ? '#FDE68A' : type === 'error' ? '#FECACA' : '#C7D2FE'}`,
    color: type === 'warning' ? '#92400E' : type === 'error' ? '#991B1B' : '#3730A3',
  })

  /* ========================================
     Step 1: 智育素质
     ======================================== */
  const renderStepEdu = () => {
    if (loading) {
      return (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px' }}>
          <Loader size={32} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>正在加载成绩数据...</p>
        </div>
      )
    }

    if (error || allGrades.length === 0) {
      return (
        <div style={cardStyle}>
          <div style={infoBoxStyle('warning')}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ fontWeight: 600, marginBottom: '4px' }}>未获取到成绩数据</p>
              <p>请先前往成绩查询页面获取成绩，系统将自动缓存您的成绩数据。</p>
            </div>
          </div>
          <Link
            to="/campus/grades"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 20px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary)',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'background 0.2s',
            }}
          >
            <BookOpen size={16} />
            前往成绩查询
          </Link>
        </div>
      )
    }

    return (
      <div style={cardStyle}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
          智育素质（权重 60%）
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          参评学期：{TARGET_SEMESTER_LABEL} | 必修课加权平均分
        </p>

        <div style={infoBoxStyle('info')}>
          <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            已自动排除：选修课、体育课、形势与政策课、重修课、辅修课
          </div>
        </div>

        {eduCourses.length > 0 ? (
          <>
            {/* 课程列表 */}
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              marginBottom: '16px',
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr',
                padding: '10px 16px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                borderBottom: '1px solid var(--card-border)',
              }}>
                <span>课程名称</span>
                <span style={{ textAlign: 'center' }}>学分</span>
                <span style={{ textAlign: 'center' }}>成绩</span>
              </div>
              {eduCourses.map((course) => (
                <div key={course.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr',
                  padding: '10px 16px',
                  fontSize: '14px',
                  borderBottom: '1px solid var(--card-border)',
                }}>
                  <span style={{ fontWeight: 500 }}>{course.course}</span>
                  <span style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{course.credit}</span>
                  <span style={{ textAlign: 'center', fontWeight: 600, color: 'var(--primary)' }}>{course.score}</span>
                </div>
              ))}
            </div>

            {/* 智育分结果 */}
            <div style={{
              background: 'var(--primary-bg)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                智育分 = &Sigma;(成绩 x 学分) / &Sigma;学分
              </span>
              <span style={{
                fontSize: '24px',
                fontWeight: 700,
                color: 'var(--primary)',
              }}>
                {eduScore !== null ? eduScore : '--'}
              </span>
            </div>
          </>
        ) : (
          <div style={infoBoxStyle('warning')}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p>在 {TARGET_SEMESTER_LABEL} 未找到符合条件的必修课成绩。</p>
              <p>请确认该学期有成绩记录，且课程类型标注为"必修"。</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ========================================
     Step 2: 体育素质
     ======================================== */
  const renderStepPE = () => (
    <div style={cardStyle}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
        体育素质（权重 5%）
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        参评学期体育课成绩
      </p>

      {peFromGrade ? (
        <>
          <div style={infoBoxStyle('info')}>
            <CheckCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              已从成绩数据中找到体育课成绩：<strong>{peScore} 分</strong>
            </div>
          </div>
          <div style={{
            background: 'var(--primary-bg)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>体育分</span>
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)' }}>
              {peScore}
            </span>
          </div>
        </>
      ) : (
        <>
          <div style={infoBoxStyle('warning')}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              未在 {TARGET_SEMESTER_LABEL} 的成绩中找到体育课。无体育课学期统一计80分，您也可以手动输入。
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              体育成绩：
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={peManualInput}
              onChange={(e) => setPeManualInput(e.target.value)}
              placeholder="0-100"
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid var(--card-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '14px',
                background: 'var(--card-bg)',
                color: 'var(--text-primary)',
                outline: 'none',
                maxWidth: '200px',
              }}
            />
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>分</span>
          </div>
          <div style={{
            background: 'var(--primary-bg)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '16px',
          }}>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>体育分</span>
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)' }}>
              {peManualInput || 80}
            </span>
          </div>
        </>
      )}
    </div>
  )

  /* ========================================
     Step 3: 德育素质
     ======================================== */
  const renderStepMoral = () => (
    <div style={cardStyle}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
        德育素质（权重 20%）
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        德育总分 = 形势与政策 x 50% + 民主评议 x 30% + 思政教育活动 x 20%
      </p>

      {/* 形势与政策 */}
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>形势与政策（50%）</span>
          <span style={{
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            fontSize: '11px',
            fontWeight: 600,
            background: moralPolicyFromGrade ? '#D1FAE5' : '#FEF3C7',
            color: moralPolicyFromGrade ? '#065F46' : '#92400E',
          }}>
            {moralPolicyFromGrade ? '来自成绩' : '默认值'}
          </span>
        </div>
        {moralPolicyFromGrade ? (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            已从成绩中获取，实际得分：<strong style={{ color: 'var(--primary)' }}>{moralPolicyScore}</strong> 分
          </p>
        ) : (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            未找到形势与政策课成绩，使用默认值：<strong style={{ color: 'var(--warning)' }}>85</strong> 分
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>手动调整：</label>
          <input
            type="number"
            min="0"
            max="100"
            value={moralPolicyScore}
            onChange={(e) => setMoralPolicyScore(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
            style={{
              width: '80px',
              padding: '6px 10px',
              border: '1px solid var(--card-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              background: 'var(--card-bg)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>分</span>
        </div>
      </div>

      {/* 民主评议 */}
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>民主评议（30%）</span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>
            {moralDemocracyScore} 分
          </span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>默认满分</p>
      </div>

      {/* 思政教育活动 */}
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>思政教育活动（20%）</span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>
            {moralActivityScore} 分
          </span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>默认满分</p>
      </div>

      {/* 德育总分 */}
      <div style={{
        background: 'var(--primary-bg)',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: '14px', fontWeight: 500 }}>德育总分</span>
        <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)' }}>
          {moralTotal.toFixed(1)}
        </span>
      </div>
    </div>
  )

  /* ========================================
     Step 4: 实践创新能力
     ======================================== */
  const renderStepPractice = () => (
    <div style={cardStyle}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
        实践创新能力（权重 10%）
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        上传第二课堂PDF，自动提取 {TARGET_SEMESTER_LABEL} 的积分记录
      </p>

      <div style={infoBoxStyle('info')}>
        <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          各类别积分上限：社会实践15分、志愿服务15分、创新实践15分、文体活动5分。
          每1积分 = 2分，总分上限100分。
        </div>
      </div>

      {/* PDF上传区域 */}
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed var(--card-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s',
          marginBottom: '16px',
          background: pdfFile ? 'var(--primary-bg)' : 'var(--bg-secondary)',
          borderColor: pdfFile ? 'var(--primary)' : 'var(--card-border)',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files[0]
            if (file) handlePdfUpload(file)
          }}
        />
        {pdfParsing ? (
          <>
            <Loader size={32} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>正在解析PDF...</p>
          </>
        ) : pdfFile ? (
          <>
            <FileText size={32} style={{ color: 'var(--primary)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              {pdfFile.name}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>点击重新上传</p>
          </>
        ) : (
          <>
            <Upload size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
              点击上传第二课堂PDF
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>支持 .pdf 格式</p>
          </>
        )}
      </div>

      {pdfError && (
        <div style={infoBoxStyle('error')}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>{pdfError}</div>
        </div>
      )}

      {/* 各类别积分详情 */}
      {pdfFile && !pdfParsing && (
        <div style={{ marginTop: '16px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>
            积分明细（{TARGET_SEMESTER_LABEL}）
          </h4>
          {practiceDetail.map((item) => (
            <div key={item.key} style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>{item.label}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                  {item.points.toFixed(2)} 积分（上限{item.maxPoints}）
                </span>
              </div>
              <span style={{
                fontSize: '16px',
                fontWeight: 700,
                color: item.cappedPoints >= item.maxPoints ? 'var(--success)' : 'var(--primary)',
              }}>
                {item.score} 分
              </span>
            </div>
          ))}

          <div style={{
            background: 'var(--primary-bg)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '12px',
          }}>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>实践创新总分</span>
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)' }}>
              {practiceTotal}
            </span>
          </div>
        </div>
      )}
    </div>
  )

  /* ========================================
     Step 5: 劳动教育
     ======================================== */
  const renderStepLabor = () => (
    <div style={cardStyle}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
        劳动教育（权重 5%）
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        从第二课堂PDF提取劳动实践积分，或手动输入
      </p>

      <div style={infoBoxStyle('info')}>
        <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          计算公式：每 0.25 积分 = 10分，上限100分。
          即：劳动分 = min(100, floor(积分 / 0.25) x 10)
        </div>
      </div>

      {pdfText ? (
        <>
          <div style={infoBoxStyle('info')}>
            <CheckCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              已从PDF中提取劳动实践积分：<strong>{laborPoints.toFixed(2)}</strong> 积分
            </div>
          </div>
          <div style={{
            background: 'var(--primary-bg)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>劳动教育分</span>
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)' }}>
              {laborScore}
            </span>
          </div>
        </>
      ) : (
        <>
          <div style={infoBoxStyle('warning')}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              未上传PDF文件。请在上一步上传第二课堂PDF，或在此手动输入劳动积分。
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              劳动积分：
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={laborManualInput}
              onChange={(e) => setLaborManualInput(e.target.value)}
              placeholder="如 1.88"
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid var(--card-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '14px',
                background: 'var(--card-bg)',
                color: 'var(--text-primary)',
                outline: 'none',
                maxWidth: '200px',
              }}
            />
          </div>
          {laborManualInput && parseFloat(laborManualInput) > 0 && (
            <div style={{
              background: 'var(--primary-bg)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '16px',
            }}>
              <span style={{ fontSize: '14px', fontWeight: 500 }}>劳动教育分</span>
              <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)' }}>
                {laborScore}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )

  /* ========================================
     Step 6: 附加分
     ======================================== */
  const renderStepExtra = () => (
    <div style={cardStyle}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
        附加分
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        附加分为额外加分，不计入100分上限
      </p>

      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)',
        padding: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              无偿献血
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              参加无偿献血可加 1 分
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setBloodDonation(false)}
              style={{
                padding: '8px 20px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--card-border)',
                background: !bloodDonation ? 'var(--primary)' : 'var(--card-bg)',
                color: !bloodDonation ? 'white' : 'var(--text-secondary)',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              否
            </button>
            <button
              onClick={() => setBloodDonation(true)}
              style={{
                padding: '8px 20px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--card-border)',
                background: bloodDonation ? 'var(--primary)' : 'var(--card-bg)',
                color: bloodDonation ? 'white' : 'var(--text-secondary)',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              是
            </button>
          </div>
        </div>
      </div>

      <div style={{
        background: 'var(--primary-bg)',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '16px',
      }}>
        <span style={{ fontSize: '14px', fontWeight: 500 }}>附加分</span>
        <span style={{ fontSize: '24px', fontWeight: 700, color: bloodDonation ? 'var(--success)' : 'var(--text-muted)' }}>
          +{extraScore}
        </span>
      </div>
    </div>
  )

  /* ========================================
     结果页
     ======================================== */
  const renderResult = () => {
    const items = [
      { label: '智育素质', score: eduScore || 0, weight: '60%', weighted: ((eduScore || 0) * 0.6).toFixed(2) },
      { label: '体育素质', score: peScoreFinal, weight: '5%', weighted: (peScoreFinal * 0.05).toFixed(2) },
      { label: '德育素质', score: moralTotal.toFixed(1), weight: '20%', weighted: (moralTotal * 0.2).toFixed(2) },
      { label: '实践创新', score: practiceTotal, weight: '10%', weighted: (practiceTotal * 0.1).toFixed(2) },
      { label: '劳动教育', score: laborScore, weight: '5%', weighted: (laborScore * 0.05).toFixed(2) },
    ]

    return (
      <div style={cardStyle}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px', color: 'var(--text-primary)', textAlign: 'center' }}>
          综合测评结果
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', textAlign: 'center' }}>
          {TARGET_SEMESTER_LABEL}
        </p>

        {/* 综合分大数字 */}
        <div style={{
          background: 'linear-gradient(135deg, var(--primary), var(--primary-light))',
          borderRadius: 'var(--radius-lg)',
          padding: '32px',
          textAlign: 'center',
          marginBottom: '24px',
          color: 'white',
        }}>
          <p style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>综合测评总分</p>
          <p style={{ fontSize: '48px', fontWeight: 800, lineHeight: 1.1 }}>
            {comprehensiveScore.toFixed(2)}
          </p>
          {extraScore > 0 && (
            <p style={{ fontSize: '13px', opacity: 0.8, marginTop: '8px' }}>
              （含附加分 +{extraScore}，原始加权分 {(comprehensiveScore - extraScore).toFixed(2)}）
            </p>
          )}
        </div>

        {/* 分项明细 */}
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>
          分项明细
        </h4>
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          marginBottom: '16px',
        }}>
          {/* 表头 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr',
            padding: '10px 16px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            borderBottom: '1px solid var(--card-border)',
          }}>
            <span>项目</span>
            <span style={{ textAlign: 'center' }}>原始分</span>
            <span style={{ textAlign: 'center' }}>权重</span>
            <span style={{ textAlign: 'center' }}>加权分</span>
          </div>
          {items.map((item) => (
            <div key={item.label} style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr',
              padding: '12px 16px',
              fontSize: '14px',
              borderBottom: '1px solid var(--card-border)',
              alignItems: 'center',
            }}>
              <span style={{ fontWeight: 500 }}>{item.label}</span>
              <span style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{item.score}</span>
              <span style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{item.weight}</span>
              <span style={{ textAlign: 'center', fontWeight: 600, color: 'var(--primary)' }}>{item.weighted}</span>
            </div>
          ))}
          {/* 附加分行 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr',
            padding: '12px 16px',
            fontSize: '14px',
            alignItems: 'center',
          }}>
            <span style={{ fontWeight: 500, color: 'var(--success)' }}>附加分</span>
            <span style={{ textAlign: 'center', color: 'var(--success)' }}>+{extraScore}</span>
            <span style={{ textAlign: 'center', color: 'var(--text-muted)' }}>额外</span>
            <span style={{ textAlign: 'center', fontWeight: 600, color: 'var(--success)' }}>+{extraScore.toFixed(2)}</span>
          </div>
        </div>

        {/* 公式说明 */}
        <div style={infoBoxStyle('info')}>
          <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
            综合分 = 智育 x 0.6 + 体育 x 0.05 + 德育 x 0.2 + 实践创新 x 0.1 + 劳动 x 0.05 + 附加分<br />
            满分100分（附加分为额外加分，可超过100分）
          </div>
        </div>

        {/* 德育和实践创新子项展开 */}
        <div style={{ marginTop: '16px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
            德育素质明细
          </h4>
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            fontSize: '13px',
            marginBottom: '12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>形势与政策（50%）</span>
              <span style={{ fontWeight: 600 }}>{moralPolicyScore} x 0.5 = <strong>{(moralPolicyScore * 0.5).toFixed(1)}</strong></span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>民主评议（30%）</span>
              <span style={{ fontWeight: 600 }}>{moralDemocracyScore} x 0.3 = <strong>{(moralDemocracyScore * 0.3).toFixed(1)}</strong></span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>思政教育活动（20%）</span>
              <span style={{ fontWeight: 600 }}>{moralActivityScore} x 0.2 = <strong>{(moralActivityScore * 0.2).toFixed(1)}</strong></span>
            </div>
          </div>

          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
            实践创新明细
          </h4>
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            fontSize: '13px',
          }}>
            {practiceDetail.map((item) => (
              <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>{item.label}（{item.points.toFixed(2)}积分）</span>
                <span style={{ fontWeight: 600 }}>
                  min({item.cappedPoints.toFixed(2)} x 2, {item.maxScore}) = <strong>{item.score}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 返回按钮 */}
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <button
            onClick={() => setCurrentStep(0)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 24px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--card-border)',
              background: 'var(--card-bg)',
              color: 'var(--text-secondary)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            重新计算
          </button>
        </div>
      </div>
    )
  }

  /* 渲染当前步骤内容 */
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0: return renderStepEdu()
      case 1: return renderStepPE()
      case 2: return renderStepMoral()
      case 3: return renderStepPractice()
      case 4: return renderStepLabor()
      case 5: return renderStepExtra()
      case 6: return renderResult()
      default: return null
    }
  }

  return (
    <div className="scholarship-container" style={{ padding: '24px', maxWidth: '700px', margin: '0 auto' }}>
      {/* 页面标题 */}
      <div className="page-header" style={{ padding: 0, marginBottom: '24px' }}>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Trophy size={24} style={{ color: 'var(--primary)' }} />
          奖学金综合测评
        </h1>
        <p className="page-desc">自动计算综合测评分数，助力奖学金申请</p>
      </div>

      {/* 进度条 */}
      {renderProgressBar()}

      {/* 当前步骤内容 */}
      {renderCurrentStep()}

      {/* 导航按钮（结果页不显示） */}
      {currentStep < STEPS.length - 1 && renderNavButtons()}
    </div>
  )
}

export default ScholarshipPage
