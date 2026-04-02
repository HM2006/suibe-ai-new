/* ========================================
   小贸 - 校园资讯页面
   新闻列表 + 分类筛选 + 详情弹窗
   支持实时新闻数据对接
   ======================================== */
import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Bell,
  Calendar,
  GraduationCap,
  X,
  Clock,
  User,
  RefreshCw,
  ExternalLink,
  Paperclip,
} from 'lucide-react'

const NEWS_API = '/api/campus/news'

/* 新闻分类配置 */
const categories = [
  { key: 'all', label: '全部' },
  { key: 'news', label: '学校要闻' },
  { key: 'notice', label: '通知公告' },
  { key: 'activity', label: '校园活动' },
]

/* 分类标签样式 */
const tagStyles = {
  news: { className: 'news', label: '要闻' },
  notice: { className: 'notice', label: '通知' },
  activity: { className: 'activity', label: '活动' },
}

/* 实时新闻分类映射：后端category -> 前端category */
const liveCategoryMap = {
  '学校要闻': 'news',
  '教务通知': 'notice',
}

/* 模拟新闻数据 - 作为fallback保留 */
const mockNewsData = [
  {
    id: 1,
    title: '关于2025年春季学期期末考试安排的通知',
    category: 'notice',
    date: '2025-03-28',
    author: '教务处',
    summary: '根据学校教学安排，2025年春季学期期末考试将于6月20日至7月5日进行，请各位同学合理安排复习时间。',
    content: '根据学校教学安排，2025年春季学期期末考试将于6月20日至7月5日进行。\n\n具体安排如下：\n1. 考试时间：2025年6月20日 - 7月5日\n2. 考试地点：各教学楼指定教室\n3. 考试形式：闭卷考试\n\n注意事项：\n- 请携带学生证和身份证参加考试\n- 提前15分钟进入考场\n- 严禁携带手机等电子设备\n\n请各位同学合理安排复习时间，预祝考试顺利！',
  },
  {
    id: 2,
    title: '第十二届校园文化艺术节即将开幕',
    category: 'activity',
    date: '2025-03-25',
    author: '校团委',
    summary: '第十二届校园文化艺术节将于4月1日隆重开幕，届时将有文艺汇演、书画展览、摄影比赛等精彩活动。',
    content: '第十二届校园文化艺术节将于4月1日至4月15日隆重举行！\n\n活动安排：\n- 4月1日：开幕式暨文艺汇演（大礼堂）\n- 4月3日-5日：书画展览（图书馆一楼展厅）\n- 4月8日-10日：摄影比赛（线上+线下）\n- 4月12日：社团嘉年华（学生活动中心）\n- 4月15日：闭幕式暨颁奖典礼\n\n欢迎全校师生积极参与！',
  },
  {
    id: 3,
    title: '计算机学院举办人工智能前沿讲座',
    category: 'academic',
    date: '2025-03-22',
    author: '计算机学院',
    summary: '特邀清华大学张教授来校做"大语言模型的技术演进与应用"学术报告，欢迎师生参加。',
    content: '讲座信息：\n\n主题：大语言模型的技术演进与应用\n主讲人：张教授（清华大学计算机系）\n时间：2025年3月30日 14:00-16:00\n地点：第二教学楼 D401报告厅\n\n讲座内容：\n1. 大语言模型的发展历程\n2. Transformer架构详解\n3. 训练技术与优化方法\n4. 实际应用案例分析\n5. 未来发展趋势\n\n欢迎全校师生参加！',
  },
  {
    id: 4,
    title: '图书馆延长开放时间的通知',
    category: 'notice',
    date: '2025-03-20',
    author: '图书馆',
    summary: '为满足同学们期末复习需求，图书馆将于6月1日起延长开放时间至晚上11点。',
    content: '为满足同学们期末复习需求，经学校研究决定：\n\n自2025年6月1日起，图书馆开放时间调整为：\n- 周一至周五：7:00 - 23:00\n- 周六、周日：8:00 - 23:00\n\n自习室同步延长开放，请同学们注意安全，合理安排作息。',
  },
  {
    id: 5,
    title: '校园春季运动会报名开始',
    category: 'activity',
    date: '2025-03-18',
    author: '体育部',
    summary: '2025年校园春季运动会将于5月举行，即日起开始报名，设有田径、球类、趣味运动等多个项目。',
    content: '2025年校园春季运动会将于5月10日-11日举行！\n\n比赛项目：\n田径类：100米、200米、400米、800米、跳远、跳高、铅球\n球类：篮球、排球、羽毛球、乒乓球\n趣味运动：拔河、接力赛、两人三足\n\n报名时间：即日起至4月15日\n报名方式：通过校园APP或各班体育委员报名\n\n欢迎同学们踊跃参加！',
  },
  {
    id: 6,
    title: '我校科研团队在Nature发表重要成果',
    category: 'academic',
    date: '2025-03-15',
    author: '科研处',
    summary: '我校材料科学学院科研团队在新型纳米材料研究领域取得突破性进展，相关成果发表于Nature期刊。',
    content: '近日，我校材料科学学院王教授团队在新型纳米材料研究领域取得突破性进展，相关成果以"High-Performance Nanostructured Materials for Energy Storage"为题发表于国际顶级学术期刊Nature。\n\n该研究开发了一种新型纳米结构材料，在能量存储密度和循环稳定性方面均实现了显著提升，为下一代储能技术的发展提供了新的思路。\n\n该研究得到了国家自然科学基金重点项目和学校科研创新基金的支持。',
  },
]

function NewsPage() {
  /* 当前选中的分类 */
  const [selectedCategory, setSelectedCategory] = useState('all')
  /* 选中的新闻（用于弹窗） */
  const [selectedNews, setSelectedNews] = useState(null)
  /* 新闻列表 */
  const [newsList, setNewsList] = useState(null)
  /* 加载状态 */
  const [isLoading, setIsLoading] = useState(false)
  /* 数据来源标识 */
  const [dataSource, setDataSource] = useState('mock')
  /* 刷新按钮旋转状态 */
  const [isRefreshing, setIsRefreshing] = useState(false)

  /* 获取实时新闻 */
  const fetchNews = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true)
    setIsRefreshing(true)
    try {
      const res = await fetch(NEWS_API)
      const data = await res.json()
      if (data.success && data.data && data.data.news && data.data.news.length > 0) {
        /* 将实时新闻转换为组件格式 */
        const transformed = data.data.news.map((item) => ({
          id: item.id,
          title: item.title,
          category: liveCategoryMap[item.category] || 'news',
          date: item.date,
          author: item.category || '学校要闻',
          summary: item.summary || '',
          content: item.summary || '',
          url: item.url,
          imageUrl: item.imageUrl || '',
          hasAttachment: item.hasAttachment || false,
        }))
        setNewsList(transformed)
        setDataSource('live')
      }
    } catch (err) {
      console.error('获取实时新闻失败，使用模拟数据:', err)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  /* 组件挂载时获取新闻 */
  useEffect(() => {
    fetchNews()
  }, [fetchNews])

  /* 当前使用的新闻数据 */
  const displayNews = newsList || mockNewsData

  /* 根据分类过滤新闻 */
  const filteredNews = useMemo(() => {
    if (selectedCategory === 'all') return displayNews
    return displayNews.filter((news) => news.category === selectedCategory)
  }, [selectedCategory, displayNews])

  /* 处理新闻卡片点击 */
  const handleNewsClick = (news) => {
    /* 如果有外部链接，打开新窗口 */
    if (news.url) {
      window.open(news.url, '_blank', 'noopener,noreferrer')
    } else {
      /* 否则显示弹窗 */
      setSelectedNews(news)
    }
  }

  /* 获取分类标签 */
  const getTag = (news) => {
    return tagStyles[news.category] || { className: 'news', label: '要闻' }
  }

  return (
    <div className="news-container">
      {/* 页面标题 */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">校园资讯</h1>
          <p className="page-desc">获取最新校园动态</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* 数据来源标识 */}
          <span className={`data-source-tag ${dataSource === 'live' ? 'live' : 'mock'}`}>
            {dataSource === 'live' ? '实时同步' : '模拟数据'}
          </span>
          {/* 刷新按钮 */}
          <button
            className={`refresh-btn ${isRefreshing ? 'spinning' : ''}`}
            onClick={() => fetchNews(false)}
            disabled={isRefreshing}
          >
            <RefreshCw size={12} />
            刷新
          </button>
        </div>
      </div>

      {/* 分类筛选 */}
      <div className="news-categories">
        {categories.map((cat) => (
          <button
            key={cat.key}
            className={`category-btn ${selectedCategory === cat.key ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 加载中提示 */}
      {isLoading && (
        <div style={{
          textAlign: 'center',
          padding: '32px',
          color: 'var(--text-muted)',
          fontSize: '13px',
        }}>
          正在获取新闻...
        </div>
      )}

      {/* 新闻列表 */}
      {!isLoading && (
        <div className="news-list">
          {filteredNews.map((news) => {
            const tag = getTag(news)
            const hasImage = news.imageUrl
            return (
              <div
                key={news.id}
                className="news-card"
                onClick={() => handleNewsClick(news)}
              >
                {hasImage ? (
                  /* 带图片的新闻卡片 */
                  <div className="news-card-with-image">
                    <img
                      className="news-card-image"
                      src={news.imageUrl}
                      alt={news.title}
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                    <div className="news-card-content">
                      {/* 头部：标签 + 日期 */}
                      <div className="news-card-header">
                        <span className={`news-tag ${tag.className}`}>{tag.label}</span>
                        <span className="news-date">{news.date}</span>
                      </div>
                      {/* 标题 */}
                      <h3 className="news-card-title">{news.title}</h3>
                      {/* 摘要 */}
                      <p className="news-card-summary">{news.summary}</p>
                      {/* 外部链接提示 */}
                      {news.url && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          color: 'var(--primary)',
                          marginTop: '8px',
                        }}>
                          <ExternalLink size={12} />
                          查看原文
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* 无图片的新闻卡片 */
                  <>
                    <div className="news-card-header">
                      <span className={`news-tag ${tag.className}`}>{tag.label}</span>
                      <span className="news-date">{news.date}</span>
                    </div>
                    <h3 className="news-card-title">{news.title}</h3>
                    {news.summary && <p className="news-card-summary">{news.summary}</p>}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        {news.hasAttachment && (
                          <>
                            <Paperclip size={12} />
                            <span>含附件</span>
                          </>
                        )}
                      </div>
                      {news.url && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          color: 'var(--primary)',
                        }}>
                          <ExternalLink size={12} />
                          查看原文
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
          {filteredNews.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
              暂无该分类的资讯
            </div>
          )}
        </div>
      )}

      {/* 新闻详情弹窗（仅用于无外部链接的新闻） */}
      {selectedNews && (
        <div
          className="news-modal-overlay"
          onClick={() => setSelectedNews(null)}
        >
          <div
            className="news-modal"
            style={{ position: 'relative' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              className="news-modal-close"
              onClick={() => setSelectedNews(null)}
            >
              <X size={18} />
            </button>

            {/* 标签 */}
            <span className={`news-tag ${tagStyles[selectedNews.category]?.className || 'notice'}`}>
              {tagStyles[selectedNews.category]?.label || '通知'}
            </span>

            {/* 标题 */}
            <h2 className="news-modal-title">{selectedNews.title}</h2>

            {/* 元信息 */}
            <div className="news-modal-meta">
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <User size={14} />
                {selectedNews.author}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={14} />
                {selectedNews.date}
              </span>
            </div>

            {/* 正文内容 */}
            <div className="news-modal-content">
              {(selectedNews.content || selectedNews.summary || '').split('\n').map((paragraph, index) => (
                <p key={index} style={{ marginBottom: paragraph.trim() === '' ? '12px' : '8px' }}>
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NewsPage
