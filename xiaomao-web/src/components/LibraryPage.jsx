/* ========================================
   小贸 - 图书馆页面
   当前借阅 + 搜索图书 + 图书推荐
   ======================================== */
import { useState, useMemo } from 'react'
import {
  Search,
  BookOpen,
  Clock,
  AlertCircle,
  CheckCircle,
  Star,
  BookMarked,
  ArrowRight,
} from 'lucide-react'

/* 模拟当前借阅数据 */
const borrowedBooks = [
  {
    id: 1,
    title: '深入理解计算机系统',
    author: 'Randal E. Bryant',
    borrowDate: '2025-03-01',
    dueDate: '2025-04-01',
    status: 'borrowed',
    category: '计算机科学',
  },
  {
    id: 2,
    title: 'JavaScript高级程序设计',
    author: 'Matt Frisbie',
    borrowDate: '2025-03-10',
    dueDate: '2025-03-28',
    status: 'due-soon',
    category: '编程语言',
  },
  {
    id: 3,
    title: '算法导论',
    author: 'Thomas H. Cormen',
    borrowDate: '2025-02-15',
    dueDate: '2025-03-15',
    status: 'returned',
    category: '计算机科学',
  },
  {
    id: 4,
    title: '经济学原理',
    author: 'N. Gregory Mankiw',
    borrowDate: '2025-03-05',
    dueDate: '2025-04-05',
    status: 'borrowed',
    category: '经济学',
  },
]

/* 模拟图书库数据 */
const libraryBooks = [
  { id: 5, title: 'Python编程：从入门到实践', author: 'Eric Matthes', category: '编程语言', status: 'available', rating: 4.5 },
  { id: 6, title: '机器学习实战', author: 'Peter Harrington', category: '人工智能', status: 'available', rating: 4.3 },
  { id: 7, title: '设计模式：可复用面向对象软件的基础', author: 'Erich Gamma', category: '软件工程', status: 'available', rating: 4.7 },
  { id: 8, title: '数据库系统概念', author: 'Abraham Silberschatz', category: '数据库', status: 'available', rating: 4.4 },
  { id: 9, title: '计算机网络：自顶向下方法', author: 'James Kurose', category: '计算机网络', status: 'available', rating: 4.6 },
  { id: 10, title: '人工智能：一种现代方法', author: 'Stuart Russell', category: '人工智能', status: 'available', rating: 4.8 },
  { id: 11, title: '代码大全', author: 'Steve McConnell', category: '软件工程', status: 'available', rating: 4.5 },
  { id: 12, title: '编译原理', author: 'Alfred Aho', category: '计算机科学', status: 'available', rating: 4.2 },
]

/* 推荐图书 */
const recommendedBooks = [
  { id: 13, title: '人类简史', author: 'Yuval Noah Harari', category: '人文社科', rating: 4.9, reason: '热门借阅' },
  { id: 14, title: '三体', author: '刘慈欣', category: '科幻小说', rating: 4.8, reason: '新书推荐' },
  { id: 15, title: '思考，快与慢', author: 'Daniel Kahneman', category: '心理学', rating: 4.7, reason: '高分好评' },
]

/* 借阅状态配置 */
const statusConfig = {
  borrowed: { label: '借阅中', className: 'borrowed', icon: BookOpen },
  'due-soon': { label: '即将到期', className: 'due-soon', icon: AlertCircle },
  returned: { label: '已归还', className: 'returned', icon: CheckCircle },
  available: { label: '可借阅', className: 'available', icon: CheckCircle },
}

function LibraryPage() {
  /* 搜索关键词 */
  const [searchText, setSearchText] = useState('')
  /* 当前Tab */
  const [activeTab, setActiveTab] = useState('borrowed')

  /* 过滤借阅列表 */
  const filteredBorrowed = useMemo(() => {
    if (!searchText.trim()) return borrowedBooks
    const keyword = searchText.trim().toLowerCase()
    return borrowedBooks.filter(
      (book) =>
        book.title.toLowerCase().includes(keyword) ||
        book.author.toLowerCase().includes(keyword)
    )
  }, [searchText])

  /* 过滤图书库 */
  const filteredLibrary = useMemo(() => {
    if (!searchText.trim()) return libraryBooks
    const keyword = searchText.trim().toLowerCase()
    return libraryBooks.filter(
      (book) =>
        book.title.toLowerCase().includes(keyword) ||
        book.author.toLowerCase().includes(keyword) ||
        book.category.toLowerCase().includes(keyword)
    )
  }, [searchText])

  /* 借阅统计 */
  const borrowStats = useMemo(() => ({
    total: borrowedBooks.filter((b) => b.status !== 'returned').length,
    dueSoon: borrowedBooks.filter((b) => b.status === 'due-soon').length,
  }), [])

  return (
    <div className="library-container">
      {/* 页面标题 */}
      <div className="page-header">
        <h1 className="page-title">图书馆</h1>
        <p className="page-desc">管理借阅和搜索图书</p>
      </div>

      {/* 搜索框 */}
      <div className="library-search">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            className="library-search-input"
            placeholder="搜索书名、作者或分类..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ paddingLeft: '38px' }}
          />
        </div>
      </div>

      {/* Tab切换 */}
      <div className="news-categories">
        {[
          { key: 'borrowed', label: `我的借阅 (${borrowStats.total})` },
          { key: 'search', label: '搜索图书' },
          { key: 'recommend', label: '推荐' },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`category-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {tab.key === 'borrowed' && borrowStats.dueSoon > 0 && (
              <span
                style={{
                  marginLeft: '4px',
                  background: '#FEE2E2',
                  color: '#EF4444',
                  padding: '0 6px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '11px',
                }}
              >
                {borrowStats.dueSoon}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 我的借阅列表 */}
      {activeTab === 'borrowed' && (
        <div className="book-list">
          {filteredBorrowed.map((book) => {
            const status = statusConfig[book.status]
            return (
              <div key={book.id} className="book-card">
                <div className="book-cover">
                  <BookMarked size={24} />
                </div>
                <div className="book-info">
                  <div className="book-title">{book.title}</div>
                  <div className="book-author">
                    {book.author} · {book.category}
                  </div>
                  <div className="book-meta">
                    <span className={`book-status ${status.className}`}>
                      <status.icon size={12} />
                      {status.label}
                    </span>
                    {book.status !== 'returned' && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        到期：{book.dueDate}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {filteredBorrowed.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
              没有找到相关借阅记录
            </div>
          )}
        </div>
      )}

      {/* 搜索图书 */}
      {activeTab === 'search' && (
        <div className="book-list">
          {filteredLibrary.map((book) => {
            const status = statusConfig[book.status]
            return (
              <div key={book.id} className="book-card">
                <div className="book-cover">
                  <BookMarked size={24} />
                </div>
                <div className="book-info">
                  <div className="book-title">{book.title}</div>
                  <div className="book-author">
                    {book.author} · {book.category}
                  </div>
                  <div className="book-meta">
                    <span className={`book-status ${status.className}`}>
                      <status.icon size={12} />
                      {status.label}
                    </span>
                    <span style={{ fontSize: '12px', color: '#D97706', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <Star size={12} fill="#D97706" />
                      {book.rating}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
          {filteredLibrary.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
              没有找到相关图书
            </div>
          )}
        </div>
      )}

      {/* 推荐图书 */}
      {activeTab === 'recommend' && (
        <div className="book-list">
          {recommendedBooks.map((book) => (
            <div key={book.id} className="book-card">
              <div className="book-cover">
                <BookMarked size={24} />
              </div>
              <div className="book-info">
                <div className="book-title">{book.title}</div>
                <div className="book-author">
                  {book.author} · {book.category}
                </div>
                <div className="book-meta">
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      background: '#FEF3C7',
                      color: '#92400E',
                      borderRadius: 'var(--radius-full)',
                      fontWeight: 600,
                    }}
                  >
                    {book.reason}
                  </span>
                  <span style={{ fontSize: '12px', color: '#D97706', display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <Star size={12} fill="#D97706" />
                    {book.rating}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default LibraryPage
