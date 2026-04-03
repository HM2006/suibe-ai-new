/* ========================================
   小贸 - 随记页面（重构版）
   contentEditable编辑器 + 骨架屏AI速览 + 双状态工具栏
   ======================================== */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, X, Save, Trash2, FileText, Paperclip,
  Sparkles, Loader, ChevronLeft,
  Download, AlertCircle, Camera, FileUp,
  CheckSquare, Type, Heading1, Heading2, Heading3,
  Bold, Strikethrough, Palette, Copy
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { useUser } from '../contexts/UserContext'

const API_BASE = '/api/notes'
const MAX_FILE_SIZE = 10 * 1024 * 1024

/* ========== 工具函数 ========== */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 172800000) return '昨天'
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function isImage(mimetype) { return mimetype && mimetype.startsWith('image/') }

function getFileExt(filename) {
  const parts = filename.split('.')
  return parts.length > 1 ? parts.pop().toUpperCase() : '?'
}

function getFileColor(ext) {
  if (['PDF'].includes(ext)) return '#EF4444'
  if (['DOC', 'DOCX'].includes(ext)) return '#3B82F6'
  if (['PPT', 'PPTX'].includes(ext)) return '#F97316'
  if (['XLS', 'XLSX'].includes(ext)) return '#22C55E'
  return '#6B7280'
}

/* ========== 便签颜色 ========== */
const noteColors = [
  { bg: '#FFFFFF', border: '#E2E8F0' },
  { bg: '#FEF9C3', border: '#FDE68A' },
  { bg: '#DBEAFE', border: '#93C5FD' },
  { bg: '#D1FAE5', border: '#6EE7B7' },
  { bg: '#FCE7F3', border: '#F9A8D4' },
  { bg: '#EDE9FE', border: '#C4B5FD' },
  { bg: '#FFEDD5', border: '#FDBA74' },
]

/* ========== 骨架屏组件 ========== */
function SkeletonLoader() {
  return (
    <div style={{ padding: '16px 18px' }}>
      <div className="skeleton-bar" />
      <div className="skeleton-bar" />
      <div className="skeleton-bar" />
    </div>
  )
}

/* ========== 便签卡片（列表） ========== */
function NoteCard({ note, onClick }) {
  const color = noteColors[(note.id || 0) % noteColors.length]
  return (
    <div className="note-card" onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = color.border; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {note.title || '无标题'}
          </span>
          {note.course_name && (
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'rgba(79,70,229,0.1)', color: '#4F46E5', flexShrink: 0, maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {note.course_name}
            </span>
          )}
          {note.ai_summary && <Sparkles size={12} style={{ color: '#F59E0B', flexShrink: 0 }} />}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {note.content?.replace(/<[^>]*>/g, '') || '暂无内容'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
          <span>{formatDate(note.updated_at)}</span>
          {note.attachment_count > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><Paperclip size={10} /> {note.attachment_count}</span>}
        </div>
      </div>
    </div>
  )
}

/* ========== 随记编辑器 ========== */
function NoteEditor({ initialNote, courses, token, onSave, onDelete, onBack }) {
  /* 状态 */
  const [noteId, setNoteId] = useState(initialNote?.id || null)
  const [title, setTitle] = useState(initialNote?.title || '')
  const [courseName, setCourseName] = useState(initialNote?.course_name || '')
  const [htmlContent, setHtmlContent] = useState(initialNote?.content || '')
  const [aiSummary, setAiSummary] = useState(initialNote?.ai_summary || '')
  const [attachments, setAttachments] = useState(initialNote?.attachments || [])
  const [isSaving, setIsSaving] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [showAiSummary, setShowAiSummary] = useState(!!initialNote?.ai_summary)
  const [error, setError] = useState('')
  const [toolbarState, setToolbarState] = useState('A') // 'A' = 主工具栏, 'B' = 格式工具栏
  const [isLoadingNote, setIsLoadingNote] = useState(!!initialNote?.id)

  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const imageInputRef = useRef(null)

  /* 打开已有随记时，从服务端加载完整数据（含附件base64） */
  useEffect(() => {
    if (!initialNote?.id || !token) return
    const loadFullNote = async () => {
      try {
        const res = await fetch(`${API_BASE}/${initialNote.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        const data = await res.json()
        if (data.success) {
          const n = data.data
          setAttachments(n.attachments || [])
          setHtmlContent(n.content || '')
          setAiSummary(n.ai_summary || '')
          setShowAiSummary(!!n.ai_summary)
        }
      } catch (err) {
        console.warn('加载随记详情失败:', err)
      } finally {
        setIsLoadingNote(false)
      }
    }
    loadFullNote()
  }, [initialNote?.id, token])

  /* 同步编辑器内容 */
  useEffect(() => {
    if (editorRef.current && !isLoadingNote) {
      if (editorRef.current.innerHTML !== htmlContent) {
        editorRef.current.innerHTML = htmlContent
      }
    }
  }, [isLoadingNote])

  const handleEditorInput = () => {
    if (editorRef.current) {
      setHtmlContent(editorRef.current.innerHTML)
    }
  }

  /* 通用保存 */
  const doSave = useCallback(async (t, cn, c, aiS) => {
    if (!token) return null
    let savedNote
    if (noteId) {
      const res = await fetch(`${API_BASE}/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ title: t, course_name: cn, content: c, ai_summary: aiS }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || '保存失败')
      savedNote = data.data
    } else {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ title: t, course_name: cn, content: c }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || '创建失败')
      savedNote = data.data
      setNoteId(savedNote.id)
    }
    return savedNote
  }, [token, noteId])

  /* 上传新附件 */
  const uploadNewAttachments = useCallback(async (nid, atts) => {
    const newAtts = atts.filter(a => a.isNew)
    if (newAtts.length === 0) return
    const filesData = newAtts.map(a => ({ filename: a.filename, mimetype: a.mimetype, data: a.data }))
    await fetch(`${API_BASE}/${nid}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ files: filesData }),
    })
    setAttachments(prev => prev.map(a => a.isNew ? { ...a, isNew: false } : a))
  }, [token])

  /* 保存按钮 */
  const handleSave = async () => {
    if (!token) return
    setIsSaving(true); setError('')
    try {
      const content = editorRef.current?.innerHTML || ''
      const savedNote = await doSave(title.trim(), courseName, content, aiSummary)
      await uploadNewAttachments(savedNote.id, attachments)
      onSave(savedNote)
    } catch (err) { setError(err.message || '保存失败') }
    finally { setIsSaving(false) }
  }

  /* 添加文件 */
  const handleAddFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) { setError(`"${file.name}" 超过10MB限制`); return }
      try {
        const data = await fileToBase64(file)
        setAttachments(prev => [...prev, {
          id: `new_${Date.now()}_${Math.random()}`,
          filename: file.name, mimetype: file.type, size: file.size,
          data, isNew: true,
        }])
      } catch { setError(`读取 "${file.name}" 失败`) }
    }
    e.target.value = ''
  }

  /* 删除附件 */
  const handleRemoveAttachment = async (att) => {
    if (att.isNew) { setAttachments(prev => prev.filter(a => a.id !== att.id)); return }
    try {
      await fetch(`${API_BASE}/${noteId}/attachments/${att.id}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` },
      })
      setAttachments(prev => prev.filter(a => a.id !== att.id))
    } catch { setError('删除附件失败') }
  }

  /* AI速览 */
  const handleSummarize = async () => {
    if (!token) return
    setIsSummarizing(true); setShowAiSummary(true); setError('')
    try {
      const content = editorRef.current?.innerHTML || ''
      const savedNote = await doSave(title.trim() || '未命名随记', courseName, content, aiSummary)
      await uploadNewAttachments(savedNote.id, attachments)

      const res = await fetch(`${API_BASE}/${savedNote.id}/summarize`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)
      const summary = data.data.summary
      setAiSummary(summary)

      await fetch(`${API_BASE}/${savedNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ai_summary: summary }),
      })
    } catch (err) { setError(err.message || 'AI速览失败') }
    finally { setIsSummarizing(false) }
  }

  /* 下载附件 */
  const handleDownload = async (att) => {
    try {
      const res = await fetch(`${API_BASE}/${noteId}/attachments/${att.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (!data.success) return
      const link = document.createElement('a')
      link.href = `data:${att.mimetype};base64,${data.data.data}`
      link.download = att.filename
      link.click()
    } catch { setError('下载失败') }
  }

  /* 复制AI总结 */
  const handleCopySummary = () => {
    navigator.clipboard.writeText(aiSummary).then(() => {
      // 简单反馈
    }).catch(() => {})
  }

  /* 格式化命令 */
  const execFormat = (command, value) => {
    document.execCommand(command, false, value || null)
    editorRef.current?.focus()
  }

  /* 插入待办 */
  const insertChecklist = () => {
    execFormat('insertHTML', '<div>☐ </div><br>')
  }

  /* 获取纯文本用于AI（去掉HTML标签） */
  const getPlainText = () => {
    const div = document.createElement('div')
    div.innerHTML = editorRef.current?.innerHTML || ''
    return div.textContent || div.innerText || ''
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* 顶部导航栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--card-border)',
        background: 'var(--card-bg)', flexShrink: 0, zIndex: 10,
      }}>
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', gap: '2px',
          background: 'none', border: 'none', color: 'var(--primary)',
          fontSize: '14px', cursor: 'pointer', padding: '4px 0', fontWeight: 500,
        }}>
          <ChevronLeft size={20} /> 返回
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={handleSave} disabled={isSaving} style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '6px 14px', borderRadius: '20px', border: 'none',
            background: 'var(--primary)', color: '#fff', fontSize: '12px', fontWeight: 600,
            cursor: 'pointer', opacity: isSaving ? 0.7 : 1,
          }}>
            {isSaving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
            保存
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{ margin: '8px 16px', padding: '8px 12px', background: '#FEF2F2', color: '#991B1B', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', zIndex: 10 }}>
          <AlertCircle size={12} /> {error}
          <span style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => setError('')}><X size={12} /></span>
        </div>
      )}

      {/* 可滚动编辑区域 */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px' }}>

          {/* AI速览区域 */}
          {showAiSummary && (
            <div style={{
              marginBottom: '16px', borderRadius: '12px', overflow: 'hidden',
              border: '1px solid #FDE68A',
              background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderBottom: '1px solid #FDE68A',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#D97706' }}>
                  <Sparkles size={14} /> AI速览
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {aiSummary && !isSummarizing && (
                    <button onClick={handleCopySummary} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D97706', padding: '2px' }}>
                      <Copy size={14} />
                    </button>
                  )}
                  <button onClick={() => setShowAiSummary(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D97706', padding: '2px' }}>
                    <X size={14} />
                  </button>
                </div>
              </div>
              {isSummarizing ? (
                <SkeletonLoader />
              ) : aiSummary ? (
                <div className="ai-summary-content" style={{ padding: '14px 16px', fontSize: '13px', lineHeight: '1.8', color: '#92400E' }}>
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {aiSummary}
                  </ReactMarkdown>
                </div>
              ) : (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: '#D97706', fontSize: '13px' }}>
                  <Sparkles size={20} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.5 }} />
                  点击底部AI速览按钮生成总结
                </div>
              )}
            </div>
          )}

          {/* 标题 */}
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="标题" style={{
            width: '100%', border: 'none', background: 'transparent',
            fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)',
            outline: 'none', padding: '4px 0', marginBottom: '8px',
          }} />

          {/* 课程关联 */}
          {courses.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <select value={courseName} onChange={e => setCourseName(e.target.value)} style={{
                width: '100%', maxWidth: '240px', padding: '6px 12px',
                border: '1px solid var(--card-border)', borderRadius: '8px',
                background: 'var(--bg)', color: 'var(--text-primary)',
                fontSize: '13px', outline: 'none', cursor: 'pointer', appearance: 'auto',
              }}>
                <option value="">不关联课程</option>
                {courses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* contentEditable 编辑器 */}
          {isLoadingNote ? (
            <div style={{ minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />
            </div>
          ) : (
            <div
              ref={editorRef}
              className="note-editor-canvas"
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              data-placeholder="开始记录..."
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          )}

          {/* 图片附件 - 全宽圆角 */}
          {attachments.filter(a => isImage(a.mimetype)).map(att => (
            <div key={att.id} style={{ position: 'relative', margin: '12px 0', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--card-border)' }}>
              <img src={`data:${att.mimetype};base64,${att.data}`} alt={att.filename} style={{ width: '100%', display: 'block', borderRadius: '14px' }} />
              <button onClick={() => handleRemoveAttachment(att)} style={{
                position: 'absolute', top: '8px', right: '8px', width: '24px', height: '24px',
                borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
              }}><X size={12} /></button>
            </div>
          ))}

          {/* 非图片附件 - 文件卡片 */}
          {attachments.filter(a => !isImage(a.mimetype)).map(att => {
            const ext = getFileExt(att.filename)
            const color = getFileColor(ext)
            return (
              <div key={att.id} className="file-card">
                <div className="file-card-icon" style={{ background: color }}>
                  {ext}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.filename}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {formatSize(att.size)}
                  </div>
                </div>
                {!att.isNew && (
                  <Download size={16} style={{ cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }} onClick={() => handleDownload(att)} />
                )}
                <X size={16} style={{ cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }} onClick={() => handleRemoveAttachment(att)} />
              </div>
            )
          })}

          {/* 底部占位（防止内容被工具栏遮挡） */}
          <div style={{ height: '70px' }} />
        </div>
      </div>

      {/* 底部工具栏 - 状态A */}
      {toolbarState === 'A' && (
        <div className="note-toolbar">
          <button className="note-toolbar-btn" onClick={handleSummarize} disabled={isSummarizing}
            style={{ color: isSummarizing ? 'var(--text-muted)' : '#F59E0B' }}>
            <Sparkles size={20} />
            <span>AI速览</span>
          </button>
          <button className="note-toolbar-btn" onClick={() => imageInputRef.current?.click()}>
            <Camera size={20} />
            <span>图片</span>
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleAddFiles} style={{ display: 'none' }} />
          <button className="note-toolbar-btn" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={20} />
            <span>文件</span>
          </button>
          <input ref={fileInputRef} type="file" multiple onChange={handleAddFiles} style={{ display: 'none' }} />
          <button className="note-toolbar-btn" onClick={insertChecklist}>
            <CheckSquare size={20} />
            <span>待办</span>
          </button>
          <button className="note-toolbar-btn" onClick={() => setToolbarState('B')}>
            <Type size={20} />
            <span>格式</span>
          </button>
        </div>
      )}

      {/* 底部工具栏 - 状态B（格式工具栏） */}
      {toolbarState === 'B' && (
        <div className="note-toolbar" style={{ justifyContent: 'center', gap: '4px' }}>
          <button className="format-btn" onClick={() => execFormat('foreColor', '#EF4444')} title="字体颜色">
            <Palette size={16} />
          </button>
          <button className="format-btn" onClick={() => execFormat('formatBlock', '<h1>')} title="一级标题">
            <Heading1 size={16} />
          </button>
          <button className="format-btn" onClick={() => execFormat('formatBlock', '<h2>')} title="二级标题">
            <Heading2 size={16} />
          </button>
          <button className="format-btn" onClick={() => execFormat('formatBlock', '<h3>')} title="三级标题">
            <Heading3 size={16} />
          </button>
          <button className="format-btn" onClick={() => execFormat('bold')} title="加粗">
            <Bold size={16} />
          </button>
          <button className="format-btn" onClick={() => execFormat('strikeThrough')} title="删除线">
            <Strikethrough size={16} />
          </button>
          <button className="format-btn" onClick={() => setToolbarState('A')} title="返回" style={{ color: '#EF4444' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* 删除按钮（浮动） */}
      {noteId && (
        <button onClick={onDelete} style={{
          position: 'absolute', bottom: toolbarState === 'A' ? '68px' : '68px', right: '16px',
          width: '36px', height: '36px', borderRadius: '50%', border: 'none',
          background: '#FEF2F2', color: '#DC2626', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 5,
        }}><Trash2 size={16} /></button>
      )}
    </div>
  )
}

/* ========== 随记主页面 ========== */
function NotesPage() {
  const navigate = useNavigate()
  const { user, token } = useUser()
  const [notes, setNotes] = useState([])
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingNote, setEditingNote] = useState(null)

  const loadData = useCallback(async () => {
    if (!token) { setLoading(false); return }
    setLoading(true)
    try {
      const [notesRes, coursesRes] = await Promise.all([
        fetch(API_BASE, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE}/courses`, { headers: { 'Authorization': `Bearer ${token}` } }),
      ])
      const notesData = await notesRes.json()
      const coursesData = await coursesRes.json()
      if (notesData.success) setNotes(notesData.data)
      if (coursesData.success) setCourses(coursesData.data)
    } catch (err) { console.warn('加载随记失败:', err) }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { loadData() }, [loadData])

  if (!user) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
        <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>登录后使用随记功能</p>
        <button onClick={() => navigate('/user')} style={{ padding: '10px 24px', borderRadius: '20px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>前往登录</button>
      </div>
    )
  }

  /* 编辑模式 */
  if (editingNote !== null) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--bg)', zIndex: 100, display: 'flex', flexDirection: 'column' }}>
        <NoteEditor
          initialNote={editingNote}
          courses={courses} token={token}
          onSave={() => { setEditingNote(null); loadData() }}
          onDelete={async () => {
            const nid = editingNote?.id
            if (!nid) return
            if (!confirm('确定删除这条随记吗？')) return
            try {
              await fetch(`${API_BASE}/${nid}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
              setEditingNote(null); loadData()
            } catch { /* ignore */ }
          }}
          onBack={() => setEditingNote(null)}
        />
      </div>
    )
  }

  /* 列表模式 */
  return (
    <div className="notes-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">随记</h1>
          <p className="page-desc">记录课程要点，AI帮你速览</p>
        </div>
        <button onClick={() => setEditingNote({})} style={{
          width: '40px', height: '40px', borderRadius: '50%', border: 'none',
          background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
        }}><Plus size={20} /></button>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <Loader size={20} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
        </div>
      ) : notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>还没有随记</p>
          <p style={{ fontSize: '13px' }}>点击右上角 + 创建第一条随记</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
          {notes.map(note => <NoteCard key={note.id} note={note} onClick={() => setEditingNote(note)} />)}
        </div>
      )}
    </div>
  )
}

export default NotesPage
