/* ========================================
   小贸 - AI对话页面（核心页面）
   支持Markdown渲染、流式响应、快捷功能
   ======================================== */
import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import {
  Send,
  Map,
  Calendar,
  BarChart3,
  BookOpen,
  Newspaper,
  Sparkles,
  GraduationCap,
  Utensils,
  Clock,
  Award,
} from 'lucide-react'

/* 快捷功能按钮配置 */
const quickActions = [
  { label: '校园导航', icon: Map, message: '帮我导航到图书馆' },
  { label: '查课表', icon: Calendar, message: '帮我查看今天的课表' },
  { label: '查成绩', icon: BarChart3, message: '帮我查询本学期成绩' },
  { label: '图书馆', icon: BookOpen, message: '帮我查一下图书馆的借阅情况' },
  { label: '校园资讯', icon: Newspaper, message: '最近有什么校园新闻？' },
  { label: '食堂推荐', icon: Utensils, message: '今天食堂有什么好吃的推荐？' },
  { label: '奖学金', icon: Award, message: '帮我计算奖学金综合分' },
]

/* 本地快捷回复模板 */
const localResponses = {
  '帮我导航到图书馆': async () => {
    return `## 📚 图书馆导航\n\n📍 **上海对外经贸大学松江校区图书馆**\n\n**位置**：校园中心区域，博学路与思源路交汇处\n\n**开放时间**：\n- 周一至周五：8:00 - 22:00\n- 周六至周日：9:00 - 21:00\n\n**楼层导览**：\n- 1F：总服务台、自助借还机、报刊阅览室\n- 2F：社会科学图书借阅区\n- 3F：自然科学图书借阅区\n- 4F：电子阅览室、自习区\n\n💡 **小贴士**：考试周期间图书馆会延长开放时间，建议提前关注图书馆公众号通知。\n\n你可以点击左侧「校园导航」查看详细地图哦！`
  },
  '帮我查看今天的课表': async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return '## 📅 课表查询\n\n请先登录后查看课表。'
      const res = await fetch('/api/user/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
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
  '帮我查询本学期成绩': async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return '## 📊 成绩查询\n\n请先登录后查看成绩。'
      const res = await fetch('/api/user/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
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
  '帮我查一下图书馆的借阅情况': () => {
    return `## 📚 图书馆借阅\n\n目前图书馆借阅查询功能正在开发中，敬请期待！\n\n**临时替代方案**：\n1. 前往图书馆一楼自助借还机查询\n2. 登录上海对外经贸大学图书馆官网查询\n3. 关注「上海对外经贸大学图书馆」微信公众号\n\n**图书馆联系方式**：\n- 📞 电话：021-67703000\n- 🌐 网址：library.suibe.edu.cn`
  },
  '最近有什么校园新闻？': async () => {
    try {
      const res = await fetch('/api/campus/news')
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
  '今天食堂有什么好吃的推荐？': () => {
    return `## 🍜 食堂推荐\n\n**松江校区食堂一览**：\n\n### 🥇 第一食堂（学生食堂）\n- 推荐：红烧肉、番茄炒蛋、糖醋排骨\n- 人均：¥12-15\n\n### 🥈 第二食堂（教工食堂）\n- 推荐：麻辣香锅、铁板烧、石锅拌饭\n- 人均：¥15-20\n\n### 🥉 第三食堂\n- 推荐：兰州拉面、黄焖鸡米饭、水煮鱼\n- 人均：¥10-15\n\n### ☕ 特色餐饮\n- **奶茶**：校园内有蜜雪冰城、茶百道\n- **小吃**：煎饼果子、烤冷面、炸鸡排\n\n💡 **今日随机推荐**：去第二食堂试试麻辣香锅吧，评分超高！🌶️\n\n> 以上信息仅供参考，具体菜品以食堂当日供应为准。`
  },
  '帮我计算奖学金综合分': () => {
    return `## 🏅 奖学金综合分计算\n\n点击左侧「奖学金」即可使用智能奖学金计算器！\n\n**功能特色**：\n- 📊 自动导入教务成绩数据\n- 📄 支持上传第二课堂PDF自动提取积分\n- ✏️ 支持手动填写各项分数\n- 📈 实时计算综合分并展示各项权重\n\n**综合分计算公式**：\n> 综合分 = 智育×60% + 体育×5% + 德育×20% + 实践创新×10% + 劳动×5% + 附加分\n\n快去试试吧！`
  }
}

/* 欢迎消息 */
const welcomeMessage = `你好！我是**小贸**，你的校园AI助手 🎓

我可以帮你：
- 🗺️ **校园导航** - 快速找到教学楼、食堂、图书馆等地点
- 📅 **课表查询** - 查看每天的课程安排
- 📊 **成绩查询** - 查询各科成绩和GPA
- 📚 **图书馆** - 查询借阅情况和搜索图书
- 📰 **校园资讯** - 获取最新校园动态
- 🍜 **生活助手** - 食堂推荐、天气查询等

有什么我可以帮你的吗？`

function ChatPage() {
  /* 消息列表状态 */
  const [messages, setMessages] = useState([])
  /* 输入框内容 */
  const [inputValue, setInputValue] = useState('')
  /* 是否正在加载AI回复 */
  const [isLoading, setIsLoading] = useState(false)
  /* 消息列表引用，用于自动滚动 */
  const messagesEndRef = useRef(null)
  /* 输入框引用 */
  const inputRef = useRef(null)

  /* 自动滚动到底部 */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  /* 发送消息 */
  const handleSend = async (text) => {
    const messageText = text || inputValue.trim()
    if (!messageText || isLoading) return

    /* 清空输入框 */
    setInputValue('')
    if (inputRef.current) {
      inputRef.current.style.height = '44px'
    }

    /* 添加用户消息 */
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: messageText,
    }
    setMessages((prev) => [...prev, userMessage])

    /* 开始加载AI回复 */
    setIsLoading(true)

    try {
      /* 创建AI消息占位 */
      const aiMessageId = Date.now() + 1
      setMessages((prev) => [
        ...prev,
        { id: aiMessageId, role: 'assistant', content: '' },
      ])

      /* 调用后端API */
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: messageText }],
          conversation_id: null,
        }),
      })

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`)
      }

      /* 检查是否为SSE流式响应 */
      const contentType = response.headers.get('content-type') || ''

      if (contentType.includes('text/event-stream')) {
        /* SSE流式响应处理 */
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let fullContent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          /* 解析SSE数据 */
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                const content = parsed.answer || parsed.content || parsed.delta || ''
                fullContent += content
                /* 逐步更新AI消息内容 */
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiMessageId
                      ? { ...msg, content: fullContent }
                      : msg
                  )
                )
              } catch {
                /* 如果不是JSON，直接作为文本内容 */
                fullContent += data
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
      } else {
        /* 普通JSON响应 */
        const data = await response.json()
        const aiContent = data.data?.answer || data.answer || data.reply || '抱歉，我暂时无法理解你的问题。'
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? { ...msg, content: aiContent }
              : msg
          )
        )
      }
    } catch (error) {
      console.error('发送消息失败:', error)
      /* 移除空的AI消息，添加错误提示 */
      setMessages((prev) => {
        const filtered = prev.filter((msg) => msg.content !== '')
        return [
          ...filtered,
          {
            id: Date.now() + 1,
            role: 'assistant',
            content: '抱歉，连接出现了问题。请检查网络连接或稍后再试。\n\n如果后端服务未启动，请先运行 `npm run dev` 启动后端服务。',
          },
        ]
      })
    } finally {
      setIsLoading(false)
    }
  }

  /* 本地快捷回复处理（模拟流式输出） */
  const handleLocalAction = async (action) => {
    if (isLoading) return

    const messageText = action.message
    setInputValue('')

    /* 添加用户消息 */
    const userMsg = { id: Date.now(), role: 'user', content: messageText }
    setMessages(prev => [...prev, userMsg])

    setIsLoading(true)

    /* 创建AI消息占位 */
    const aiMsgId = Date.now() + 1
    setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '' }])

    /* 模拟思考 */
    await new Promise(r => setTimeout(r, 1500))

    try {
      /* 获取回复内容 */
      const responseGenerator = localResponses[messageText]
      if (!responseGenerator) {
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: '抱歉，功能暂不可用。' } : m))
        return
      }
      const fullContent = await responseGenerator()

      /* 逐字输出（模拟流式） */
      let current = ''
      const chars = fullContent.split('')
      const batchSize = 3
      for (let i = 0; i < chars.length; i += batchSize) {
        current += chars.slice(i, i + batchSize).join('')
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: current } : m))
        await new Promise(r => setTimeout(r, 15))
      }
    } catch (err) {
      console.error('本地回复失败:', err)
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: '获取数据失败，请稍后重试。' } : m))
    } finally {
      setIsLoading(false)
    }
  }

  /* 处理键盘事件（Enter发送，Shift+Enter换行） */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  /* 自动调整输入框高度 */
  const handleInputChange = (e) => {
    setInputValue(e.target.value)
    const textarea = e.target
    textarea.style.height = '44px'
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
  }

  /* 点击快捷功能按钮 */
  const handleQuickAction = (action) => {
    handleLocalAction(action)
  }

  return (
    <div className="chat-container">
      {/* 消息列表 */}
      <div className="chat-messages">
        {/* 欢迎消息（无历史消息时显示） */}
        {messages.length === 0 && (
          <div className="welcome-section">
            <div className="welcome-avatar">
              <Sparkles size={36} />
            </div>
            <h2 className="welcome-title">你好，我是小贸</h2>
            <p className="welcome-desc">你的校园AI助手，随时为你解答问题</p>

            {/* 快捷功能按钮 */}
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

            {/* 欢迎消息内容 */}
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

        {/* 历史消息列表 */}
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            {/* 头像 */}
            <div className="message-avatar">
              {message.role === 'user' ? (
                <GraduationCap size={16} />
              ) : (
                <Sparkles size={16} />
              )}
            </div>
            {/* 消息气泡 */}
            <div className="message-bubble">
              {message.content ? (
                <div className="markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                /* 加载中的打字指示器 */
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* 滚动锚点 */}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
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
        </div>
        <button
          className="send-btn"
          onClick={() => handleSend()}
          disabled={!inputValue.trim() || isLoading}
          title="发送消息"
        >
          <Send className="btn-icon" />
        </button>
      </div>
    </div>
  )
}

export default ChatPage
