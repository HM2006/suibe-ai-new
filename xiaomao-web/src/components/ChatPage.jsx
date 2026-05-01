/* ========================================
   小贸 - AI对话页面（核心页面）
   支持Markdown渲染、流式响应、知识库问答
   ======================================== */
import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { useUser } from '../contexts/UserContext'
import { API } from '../config/api'
import {
  Send,
  Calendar,
  BarChart3,
  Newspaper,
  Sparkles,
  GraduationCap,
  Award,
  Copy,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Check,
} from 'lucide-react'

/* 快捷功能按钮配置 */
const quickActions = [
  { label: '查课表', icon: Calendar, message: '帮我查看今天的课表' },
  { label: '查成绩', icon: BarChart3, message: '帮我查询本学期成绩' },
  { label: '校园资讯', icon: Newspaper, message: '最近有什么校园新闻？' },
  { label: '奖学金', icon: Award, message: '帮我计算奖学金综合分' },
]

/* 预设问题（完整列表，每次随机展示其中2个） */
const allPresetQuestions = [
  {
    question: '我们学校本科生奖学金的金额和人数比例分别是多少？',
    answer: `根据《上海对外经贸大学本科生奖学金评选管理办法》，本科生奖学金的金额和比例如下：\n\n### **优秀学生奖学金**\n\n1. **特等奖**：每学期5000元，获奖比例不超过在校学生的0.5%。\n2. **一等奖**：每学期1500元，获奖比例不超过在校学生的5%。\n3. **二等奖**：每学期800元，获奖比例不超过在校学生的10%。\n4. **三等奖**：每学期300元，获奖比例不超过在校学生的20%。\n\n### **单项（优秀学科）奖学金**\n\n- **优秀学科奖**：每学期200元，获奖比例不超过在校学生的5%。\n  （注：同一评选学期内，优秀学科奖不得与优秀学生奖学金重复获得。）\n\n如果需要更详细的信息，可以参考学校发布的《上海对外经贸大学本科生奖学金评选管理办法》。`,
  },
  {
    question: '我们学校英语A班、B班有什么区别？',
    answer: `根据《上海对外经贸大学英语教学实施方案》，英语A班和B班的主要区别如下：\n\n### 1. **分级方式**\n- **A班**：学生通过分级测试成绩和高考英语成绩综合评定，进入A班的学生通常英语水平较高。\n- **B班**：同样通过分级测试和高考成绩评定，但英语水平略低于A班学生。\n- **实验班**：部分实验班（如经济学创新实验班、金融学实验班等）有单独的英语课程安排。\n\n### 2. **教学目标**\n- **A班**：更注重学术英语能力的培养，包括听力、口语、阅读、写作、翻译等方面的高阶技能。\n  - 例如：能听懂语速较快的学术讲座，能用英语进行专业领域的讨论和写作。\n- **B班**：侧重于通用英语能力的提升，目标为掌握日常和专业领域的基本英语交流能力。\n  - 例如：能听懂语速正常的英语节目，能用英语进行一般性话题的讨论。\n\n### 3. **教学模式**\n- **A班**：采用"2+2"模式，即2学期学术英语课程+2学期英语拓展课程。\n- **B班**：采用"3+1"模式，即3学期通用英语课程+1学期英语拓展课程。\n\n### 4. **升级制度**\n- B班学生如果学期总评成绩达到90分以上，可以申请转入A班。\n\n### 5. **词汇量要求**\n- **A班**：接受性词汇量要求为8000词左右，掌握570个高频学术词族和1000个专业词汇。\n- **B班**：接受性词汇量要求为7000词左右，掌握570个高频学术词族和800个专业词汇。\n\n### 6. **课程安排**\n- **A班**：学术英语课程占比更高，包括学术英语读写、视听说等。\n- **B班**：通用英语课程占比更高，注重基础能力的培养。`,
  },
  {
    question: '本科生转专业需要满足什么条件？',
    answer: `根据《上海对外经贸大学学生转专业实施细则》，本科生转专业需要符合以下条件：\n\n### **1. 常规申请条件**\n- **兴趣与专长**：对确有兴趣和专长，且转专业更能发挥其专长的本科生。\n- **成绩要求**：第一学年课程考核平均学分绩点需达到 **3.15（含3.15）以上**（不含专升本）。\n- **申请时间**：学生应在第二学期第14周前提出申请（逾期不予受理）。\n- **学分认定**：被批准转专业的学生编入所转专业二年级学习，原已通过的课程可申请学分认定。\n\n### **2. 不予转专业的情况**\n- 所修课程有不及格的；\n- 曾受过处分的；\n- 以特殊招生形式录取的学生，国家有相关规定或录取前与学校有明确约定的；\n- 经学校审核确认不适合转专业的。\n\n### **3. 特殊情况**\n- **疾病或生理缺陷**：经学校指定医院检查并出具证明，不能在原专业学习，但尚能在其他专业学习的；\n- **特殊困难**：经学校审核确认，学生确有特殊困难，不转专业则无法继续学习的；\n- **休学创业或退役复学**：因自身情况需要转专业的，学校予以优先考虑。\n\n### **4. 其他限制**\n- **转专业次数**：仅限一次；\n- **年级限制**：本科三年级及以上学生不得申请转专业；\n- **录取分数线限制**：不得由低录取分数线专业转入高录取分数线专业（春招专业参照秋招最高分数线）。\n\n### **5. 办理流程**\n- 学生需在教务处网站提交申请或填写《转专业申请表》；\n- 经教务处初审后，参加转入学院的考核；\n- 公示无异议后，学校审批并通知学生办理相关手续。\n\n详情请查阅《上海对外经贸大学学生转专业实施细则》。`,
  },
]

function getRandomPresets() {
  const shuffled = [...allPresetQuestions].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 2)
}

/* 本地快捷回复模板 */
const getLocalResponses = (token) => ({
  '帮我查看今天的课表': async (tkn) => {
    try {
      if (!tkn) return '## 📅 课表查询\n\n请先登录后查看课表。'
      const res = await fetch(`${API.user}/profile`, {
        headers: { 'Authorization': `Bearer ${tkn}` }
      })
      if (!res.ok) return '## 📅 课表查询\n\n获取课表数据失败，请稍后重试。'
      const data = await res.json()
      if (!data.data?.scheduleCache?.data) {
        return '## 📅 课表查询\n\n暂无课表数据。请前往「用户」页面连接教务系统以获取课表。'
      }
      const scheduleRaw = data.data.scheduleCache.data
      const courses = scheduleRaw?.courses || (Array.isArray(scheduleRaw) ? scheduleRaw : [])
      const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
      const today = new Date().getDay()
      const dayIndex = today >= 1 && today <= 5 ? today - 1 : -1
      if (dayIndex === -1) {
        return '## 📅 今日课表\n\n今天是周末，没有课程安排！好好休息吧 🎉'
      }
      const dayName = dayNames[dayIndex]
      let todayCourses = []
      if (courses[dayName] || courses[dayIndex]) {
        todayCourses = courses[dayName] || courses[dayIndex] || []
      } else if (Array.isArray(courses)) {
        todayCourses = courses.filter(c => c.day === dayName || c.day === dayIndex || c.dayIndex === dayIndex)
      }
      if (todayCourses.length === 0) {
        return `## 📅 今日课表（${dayName}）\n\n今天没有课程安排！可以好好利用空闲时间 📖`
      }
      let courseList = todayCourses.map((c, i) => {
        const name = c.name || c.courseName || c.course || '未知课程'
        const time = c.time || c.timeSlot || `${c.slot || '?'}-${c.endSlot || '?'}节`
        const loc = c.location || c.classroom || c.room || '待定'
        const teacher = c.teacher || ''
        return `${i + 1}. **${name}**\n   - ⏰ ${time}\n   - 📍 ${loc}${teacher ? `\n   - 👨‍🏫 ${teacher}` : ''}`
      }).join('\n\n')
      return `## 📅 今日课表（${dayName}）\n\n今天共有 **${todayCourses.length}** 门课程：\n\n${courseList}\n\n💡 加油，又是充实的一天！`
    } catch (err) {
      return '## 📅 课表查询\n\n获取课表数据失败，请稍后重试。'
    }
  },
  '帮我查询本学期成绩': async (tkn) => {
    try {
      if (!tkn) return '## 📊 成绩查询\n\n请先登录后查看成绩。'
      const res = await fetch(`${API.user}/profile`, {
        headers: { 'Authorization': `Bearer ${tkn}` }
      })
      if (!res.ok) return '## 📊 成绩查询\n\n获取成绩数据失败，请稍后重试。'
      const data = await res.json()
      if (!data.data?.gradesCache?.data) {
        return '## 📊 成绩查询\n\n暂无成绩数据。请前往「用户」页面连接教务系统以获取成绩。'
      }
      const gradesRaw = data.data.gradesCache.data
      const grades = gradesRaw?.grades || (Array.isArray(gradesRaw) ? gradesRaw : [])
      const gpa = data.data.gradesCache.gpa
      const totalCredits = data.data.gradesCache.total_credits
      const semesterGrades = grades.filter(g => {
        const sem = g.semester || ''
        return sem.includes('2025-2026') && (sem.includes('1') || sem.includes('一'))
      })
      if (semesterGrades.length === 0) {
        if (grades.length === 0) return '## 📊 成绩查询\n\n暂无成绩记录。'
        let list = grades.slice(0, 10).map((g, i) => {
          const name = g.course || g.courseName || g.name || '未知'
          const score = g.score || g.scoreNum || g.grade || '-'
          const credit = g.credit || g.credits || '-'
          return `${i + 1}. **${name}** - ${score}分（${credit}学分）`
        }).join('\n')
        return `## 📊 成绩查询\n\n**GPA**：${gpa || '-'} | **总学分**：${totalCredits || '-'}\n\n${list}${grades.length > 10 ? '\n\n...及其他课程' : ''}\n\n💡 点击左侧「成绩」查看完整成绩单。`
      }
      let list = semesterGrades.map((g, i) => {
        const name = g.course || g.courseName || g.name || '未知'
        const score = g.score || g.scoreNum || g.grade || '-'
        const credit = g.credit || g.credits || '-'
        return `${i + 1}. **${name}** - ${score}分（${credit}学分）`
      }).join('\n')
      return `## 📊 本学期成绩\n\n**GPA**：${gpa || '-'} | **总学分**：${totalCredits || '-'}\n\n共 ${semesterGrades.length} 门课程：\n\n${list}\n\n💡 点击左侧「成绩」查看完整成绩单。`
    } catch (err) {
      return '## 📊 成绩查询\n\n获取成绩数据失败，请稍后重试。'
    }
  },
  '最近有什么校园新闻？': async () => {
    try {
      const res = await fetch(`${API.campus}/news`)
      if (!res.ok) return '## 📰 校园资讯\n\n获取新闻失败，请稍后重试。'
      const data = await res.json()
      const news = data.data?.news || data.news || []
      if (news.length === 0) return '## 📰 校园资讯\n\n暂无校园新闻。'
      const top5 = news.slice(0, 5)
      let list = top5.map((n, i) => {
        const title = n.title || '未知标题'
        const date = n.date || n.publishDate || ''
        return `${i + 1}. **${title}**\n   ${date ? `📅 ${date}` : ''}`
      }).join('\n\n')
      return `## 📰 校园资讯\n\n以下是最新校园动态：\n\n${list}\n\n💡 点击左侧「资讯」查看更多新闻。`
    } catch (err) {
      return '## 📰 校园资讯\n\n获取新闻失败，请稍后重试。'
    }
  },
  '帮我计算奖学金综合分': () => {
    return `## 🏅 奖学金综合分计算\n\n点击左侧「奖学金」即可使用智能奖学金计算器！\n\n**功能特色**：\n- 📊 自动导入教务成绩数据\n- 📄 支持上传第二课堂PDF自动提取积分\n- ✏️ 支持手动填写各项分数\n- 📈 实时计算综合分并展示各项权重\n\n**综合分计算公式**：\n> 综合分 = 智育×60% + 体育×5% + 德育×20% + 实践创新×10% + 劳动×5% + 附加分\n\n快去试试吧！`
  }
})

/* 欢迎消息 */
const welcomeMessage = `你好！我是**小贸**，你的校园知识库助手 🎓

我可以帮你：
- 📋 **教务处政策文件** - 转专业、休学、选课等教务政策查询
- 🏅 **奖学金加分** - 奖学金评定标准、加分细则查询
- 📝 **第二课堂** - 第二课堂学分要求和活动加分
- 📅 **课表成绩** - 查看课表和成绩信息
- 📰 **校园资讯** - 获取最新校园动态

有什么我可以帮你的吗？`

/* 加载状态阶段 */
const LOADING_STAGES = [
  { text: '', duration: 1000 },
  { text: '正在检索知识库', duration: 3000 },
  { text: '正在编辑回答', duration: 0 },
]

/* 消息操作按钮组件 */
function MessageActions({ message, onCopy, onRegenerate, onReaction }) {
  const [copied, setCopied] = useState(false)
  const [reaction, setReaction] = useState(message.reaction || null)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      onCopy?.(message.id)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = message.content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleReaction = (type) => {
    const newReaction = reaction === type ? null : type
    setReaction(newReaction)
    onReaction?.(message.id, newReaction, message.recordId)
  }

  return (
    <div className="message-actions">
      <button className="msg-action-btn" onClick={handleCopy} title="复制">
        {copied ? <Check size={14} /> : <Copy size={14} />}
        <span>{copied ? '已复制' : '复制'}</span>
      </button>
      <button className="msg-action-btn" onClick={() => onRegenerate?.(message)} title="重新生成">
        <RefreshCw size={14} />
        <span>重新生成</span>
      </button>
      <div className="msg-action-divider" />
      <button
        className={`msg-action-btn ${reaction === 'like' ? 'active like' : ''}`}
        onClick={() => handleReaction('like')}
        title="赞"
      >
        <ThumbsUp size={14} />
      </button>
      <button
        className={`msg-action-btn ${reaction === 'dislike' ? 'active dislike' : ''}`}
        onClick={() => handleReaction('dislike')}
        title="踩"
      >
        <ThumbsDown size={14} />
      </button>
    </div>
  )
}

/* 加载动画组件 */
function LoadingIndicator({ stage }) {
  return (
    <div className={`loading-indicator ${stage > 0 ? 'with-text' : ''}`}>
      {stage === 0 && (
        <div className="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      )}
      {stage === 1 && (
        <div className="loading-text-stage fade-in">
          <div className="loading-dots-small">
            <span></span><span></span><span></span>
          </div>
          <span className="loading-label">正在检索知识库</span>
        </div>
      )}
      {stage === 2 && (
        <div className="loading-text-stage fade-in">
          <div className="loading-dots-small">
            <span></span><span></span><span></span>
          </div>
          <span className="loading-label editing">正在编辑回答</span>
        </div>
      )}
    </div>
  )
}

function ChatPage() {
  const { token } = useUser()
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStage, setLoadingStage] = useState(0)
  const [presetQuestions] = useState(() => getRandomPresets())
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const loadingTimerRef = useRef(null)

  useEffect(() => {
    if (messages.length > 0 || isLoading) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading])

  useEffect(() => {
    return () => {
      if (loadingTimerRef.current) {
        loadingTimerRef.current.forEach(t => clearTimeout(t))
      }
    }
  }, [])

  const startLoadingAnimation = () => {
    setLoadingStage(0)
    const timers = []
    timers.push(setTimeout(() => setLoadingStage(1), LOADING_STAGES[0].duration))
    timers.push(setTimeout(() => setLoadingStage(2), LOADING_STAGES[0].duration + LOADING_STAGES[1].duration))
    loadingTimerRef.current = timers
  }

  const stopLoadingAnimation = () => {
    setLoadingStage(0)
    if (loadingTimerRef.current) {
      loadingTimerRef.current.forEach(t => clearTimeout(t))
      loadingTimerRef.current = null
    }
  }

  const saveLocalChatRecord = async (userMessage, aiAnswer) => {
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`${API.chat}/save`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_message: userMessage, ai_answer: aiAnswer }),
      })
      const data = await res.json()
      return data.data?.record_id || null
    } catch {
      return null
    }
  }

  const handleSend = async (text) => {
    const messageText = text || inputValue.trim()
    if (!messageText || isLoading) return

    setInputValue('')
    if (inputRef.current) {
      inputRef.current.style.height = '44px'
    }

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: messageText,
    }
    setMessages((prev) => [...prev, userMessage])
    setIsLoading(true)
    startLoadingAnimation()

    try {
      const aiMessageId = Date.now() + 1
      setMessages((prev) => [
        ...prev,
        { id: aiMessageId, role: 'assistant', content: '', recordId: null },
      ])

      const streamUrl = `${API.chat}/stream?query=${encodeURIComponent(messageText)}`
      const response = await fetch(streamUrl)

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''
      let firstChunkReceived = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          if (trimmed.startsWith('event: done')) {
            continue
          }

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6)
            if (dataStr === '[DONE]') continue
            try {
              const parsed = JSON.parse(dataStr)
              if (parsed.status === 'connected') continue
              const content = parsed.answer || parsed.content || ''
              if (content) {
                if (!firstChunkReceived) {
                  firstChunkReceived = true
                  stopLoadingAnimation()
                }
                fullContent += content
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiMessageId
                      ? { ...msg, content: fullContent }
                      : msg
                  )
                )
              }
            } catch {
               if (!firstChunkReceived) {
                 firstChunkReceived = true
                 stopLoadingAnimation()
               }
              fullContent += dataStr
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === aiMessageId
                    ? { ...msg, content: fullContent }
                    : msg
                )
              )
            }
          }
        }
      }

      if (!fullContent) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? { ...msg, content: '抱歉，我暂时无法理解你的问题。' }
              : msg
          )
        )
      }

      const recordHeaders = { 'Content-Type': 'application/json' }
      if (token) recordHeaders['Authorization'] = `Bearer ${token}`
      try {
        const saveRes = await fetch(`${API.chat}/save`, {
          method: 'POST',
          headers: recordHeaders,
          body: JSON.stringify({ user_message: messageText, ai_answer: fullContent }),
        })
        const saveData = await saveRes.json()
        if (saveData.data?.record_id) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, recordId: saveData.data.record_id }
                : msg
            )
          )
        }
      } catch { /* 保存记录失败不影响主流程 */ }

    } catch (error) {
      console.error('发送消息失败:', error)
      setMessages((prev) => {
        const filtered = prev.filter((msg) => msg.content !== '')
        return [
          ...filtered,
          {
            id: Date.now() + 1,
            role: 'assistant',
            content: '抱歉，连接出现了问题。请检查网络连接或稍后再试。\n\n如果后端服务未启动，请先运行 `npm run dev` 启动后端服务。',
            recordId: null,
          },
        ]
      })
    } finally {
      setIsLoading(false)
      stopLoadingAnimation()
    }
  }

  const handleLocalAction = async (action) => {
    if (isLoading) return

    const messageText = action.message
    setInputValue('')

    const userMsg = { id: Date.now(), role: 'user', content: messageText }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    startLoadingAnimation()

    const aiMsgId = Date.now() + 1
    setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '', recordId: null }])

    await new Promise(r => setTimeout(r, 1500))

    try {
      const responses = getLocalResponses(token)
      const responseGenerator = responses[messageText]
      if (!responseGenerator) {
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: '抱歉，功能暂不可用。' } : m))
        return
      }
      const fullContent = await responseGenerator(token)

      let current = ''
      const chars = fullContent.split('')
      const batchSize = 3
      for (let i = 0; i < chars.length; i += batchSize) {
        current += chars.slice(i, i + batchSize).join('')
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: current } : m))
        await new Promise(r => setTimeout(r, 15))
      }

      const recordId = await saveLocalChatRecord(messageText, fullContent)
      if (recordId) {
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, recordId } : m))
      }
    } catch (err) {
      console.error('本地回复失败:', err)
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: '获取数据失败，请稍后重试。' } : m))
    } finally {
      setIsLoading(false)
      stopLoadingAnimation()
    }
  }

  const handlePresetQuestion = async (preset) => {
    if (isLoading) return

    setInputValue('')
    const userMsg = { id: Date.now(), role: 'user', content: preset.question }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    startLoadingAnimation()

    const aiMsgId = Date.now() + 1
    setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '', recordId: null }])

    await new Promise(r => setTimeout(r, 1500))

    let current = ''
    const chars = preset.answer.split('')
    const batchSize = 3
    for (let i = 0; i < chars.length; i += batchSize) {
      current += chars.slice(i, i + batchSize).join('')
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: current } : m))
      await new Promise(r => setTimeout(r, 15))
    }

    const recordId = await saveLocalChatRecord(preset.question, preset.answer)
    if (recordId) {
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, recordId } : m))
    }

    setIsLoading(false)
    stopLoadingAnimation()
  }

  const handleCopy = (msgId) => {}

  const handleRegenerate = async (message) => {
    const msgIndex = messages.findIndex(m => m.id === message.id)
    if (msgIndex < 1) return

    const userMsg = messages[msgIndex - 1]
    if (userMsg.role !== 'user') return

    const isLocalPreset = allPresetQuestions.some(p => p.question === userMsg.content)
    const isLocalAction = quickActions.some(a => a.message === userMsg.content)

    setMessages(prev => prev.filter(m => m.id !== message.id))

    if (isLocalPreset) {
      const preset = allPresetQuestions.find(p => p.question === userMsg.content)
      await handlePresetQuestion(preset)
    } else if (isLocalAction) {
      const action = quickActions.find(a => a.message === userMsg.content)
      await handleLocalAction(action)
    } else {
      await handleSend(userMsg.content)
    }
  }

  const handleReaction = async (msgId, reaction, recordId) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, reaction } : m
    ))

    if (recordId) {
      try {
        await fetch(`${API.chat}/reaction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record_id: recordId, reaction }),
        })
      } catch (e) {
        console.error('反馈提交失败:', e)
      }
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e) => {
    setInputValue(e.target.value)
    const textarea = e.target
    textarea.style.height = '44px'
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
  }

  const handleQuickAction = (action) => {
    handleLocalAction(action)
  }

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="welcome-section">
            <div className="welcome-avatar">
              <Sparkles size={36} />
            </div>
            <h2 className="welcome-title">你好，我是小贸</h2>
            <p className="welcome-desc">集成校园知识库的AI助手，为你解答教务政策、奖学金等各类问题</p>

            <div className="quick-actions">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  className="quick-action-btn"
                  onClick={() => handleQuickAction(action)}
                >
                  <action.icon className="btn-icon" />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>

            <div className="message assistant" style={{ alignSelf: 'center', maxWidth: '600px', marginTop: '24px' }}>
              <div className="message-avatar">
                <Sparkles size={16} />
              </div>
              <div className="message-bubble">
                <div className="markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {welcomeMessage}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-avatar">
              {message.role === 'user' ? (
                <GraduationCap size={16} />
              ) : (
                <Sparkles size={16} />
              )}
            </div>
            <div className="message-content-wrapper">
              <div className="message-bubble">
                {message.content ? (
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <LoadingIndicator stage={loadingStage} />
                )}
              </div>
              {message.role === 'assistant' && message.content && !isLoading && (
                <MessageActions
                  message={message}
                  onCopy={handleCopy}
                  onRegenerate={handleRegenerate}
                  onReaction={handleReaction}
                />
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        {messages.length === 0 && (
          <div className="preset-questions">
            {presetQuestions.map((preset, index) => (
              <button
                key={index}
                className="preset-question-chip"
                onClick={() => handlePresetQuestion(preset)}
                disabled={isLoading}
              >
                {preset.question}
              </button>
            ))}
          </div>
        )}
        <div className="chat-input-capsule">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题..."
            rows={1}
            disabled={isLoading}
          />
          <button
            className="send-btn-inside"
            onClick={() => handleSend()}
            disabled={!inputValue.trim() || isLoading}
            title="发送消息"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatPage