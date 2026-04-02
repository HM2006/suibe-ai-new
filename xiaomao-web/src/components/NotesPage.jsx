/* ========================================
   小贸 - 随记页面（便签风格）
   支持文字/图片/附件 + 课程关联 + AI速览
   ======================================== */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, X, Save, Trash2, FileText, Paperclip,
  Sparkles, Loader, ChevronLeft,
  Download, AlertCircle, Camera, FileUp
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useUser } from '../contexts/UserContext'

const API_BASE = '/api/notes'
const MAX_FILE_SIZE = 10 * 1024 * 1024

/* 工具函数 */
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

function isImage(mimetype) {
  return mimetype && mimetype.startsWith('image/')
}

/* 便签颜色 */
const noteColors = [
  { bg: '#FFFFFF', border: '#E2E8F0' },
  { bg: '#FEF9C3', border: '#FDE68A' },
  { bg: '#DBEAFE', border: '#93C5FD' },
  { bg: '#D1FAE5', border: '#6EE7B7' },
  { bg: '#FCE7F3', border: '#F9A8D4' },
  { bg: '#EDE9FE', border: '#C4B5FD' },
  { bg: '#FFEDD5', border: '#FDBA74' },
]

/* ==================== 便签卡片 ==================== */
function NoteCard({ note, onClick }) {
  const color = noteColors[(note.id || 0) % noteColors.length]
  return (
    <div
      onClick={onClick}
      style={{
        background: color.bg, border: `1px solid ${color.border}`,
        borderRadius: '12px', padding: '14px 16px', cursor: 'pointer',
        transition: 'transform 0.15s, box-shadow 0.15s', minHeight: '80px',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
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
      {note.content && (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-all' }}>
          {note.content}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
        <span>{formatDate(note.updated_at)}</span>
        {note.attachment_count > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><Paperclip size={10} /> {note.attachment_count}</span>
        )}
      </div>
    </div>
  )
}

/* ==================== 随记编辑器 ==================== */
function NoteEditor({ note, courses, token, onSave, onDelete, onBack }) {
  const [title, setTitle] = useState(note?.title || '')
  const [courseName, setCourseName] = useState(note?.course_name || '')
  const [content, setContent] = useState(note?.content || '')
  const [aiSummary, setAiSummary] = useState(note?.ai_summary || '')
  const [attachments, setAttachments] = useState(note?.attachments || [])
  const [isSaving, setIsSaving] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)
  const imageInputRef = useRef(null)
  const currentNoteIdRef = useRef(note?.id || null)

  const isNew = !note
  const hasChanges = isNew
    ? (title.trim() || content.trim() || attachments.length > 0)
    : true

  /* 通用保存函数 */
  const doSave = useCallback(async (t, cn, c, aiS) => {
    if (!token) return null
    let savedNote
    if (currentNoteIdRef.current) {
      const res = await fetch(`${API_BASE}/${currentNoteIdRef.current}`, {
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
      currentNoteIdRef.current = savedNote.id
    }
    return savedNote
  }, [token])

  /* 上传新附件到服务器 */
  const uploadNewAttachments = useCallback(async (noteId) => {
    const newAtts = attachments.filter(a => a.isNew)
    if (newAtts.length === 0) return
    const filesData = newAtts.map(a => ({ filename: a.filename, mimetype: a.mimetype, data: a.data }))
    await fetch(`${API_BASE}/${noteId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ files: filesData }),
    })
    // 标记已上传
    setAttachments(prev => prev.map(a => a.isNew ? { ...a, isNew: false } : a))
  }, [attachments, token])

  /* 保存按钮 */
  const handleSave = async () => {
    if (!token) return
    setIsSaving(true)
    setError('')
    try {
      const savedNote = await doSave(title.trim(), courseName, content, aiSummary)
      await uploadNewAttachments(savedNote.id)
      onSave(savedNote)
    } catch (err) {
      setError(err.message || '保存失败')
    } finally {
      setIsSaving(false)
    }
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
      await fetch(`${API_BASE}/${currentNoteIdRef.current}/attachments/${att.id}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` },
      })
      setAttachments(prev => prev.filter(a => a.id !== att.id))
    } catch { setError('删除附件失败') }
  }

  /* AI速览 - 自动保存后调用 */
  const handleSummarize = async () => {
    if (!token) return
    setIsSummarizing(true)
    setError('')
    try {
      // 先保存当前内容
      const savedNote = await doSave(title.trim() || '未命名随记', courseName, content, aiSummary)
      await uploadNewAttachments(savedNote.id)

      // 调用AI
      const res = await fetch(`${API_BASE}/${savedNote.id}/summarize`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)
      const summary = data.data.summary
      setAiSummary(summary)

      // 自动保存AI结果
      await fetch(`${API_BASE}/${savedNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ai_summary: summary }),
      })
    } catch (err) {
      setError(err.message || 'AI速览失败')
    } finally {
      setIsSummarizing(false)
    }
  }

  /* 下载附件 */
  const handleDownload = async (att) => {
    try {
      const res = await fetch(`${API_BASE}/${currentNoteIdRef.current}/attachments/${att.id}`, {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶部导航栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--card-border)',
        background: 'var(--card-bg)', flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', gap: '2px',
          background: 'none', border: 'none', color: 'var(--primary)',
          fontSize: '14px', cursor: 'pointer', padding: '4px 0', fontWeight: 500,
        }}>
          <ChevronLeft size={20} /> 返回
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={handleSummarize} disabled={isSummarizing} style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '6px 12px', borderRadius: '20px', border: 'none',
            background: 'linear-gradient(135deg, #F59E0B, #EF4444)',
            color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            opacity: isSummarizing ? 0.7 : 1, boxShadow: '0 2px 8px rgba(245,158,11,0.3)',
          }}>
            {isSummarizing ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
            {isSummarizing ? '生成中' : 'AI速览'}
          </button>
          <button onClick={handleSave} disabled={isSaving || !hasChanges} style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '6px 14px', borderRadius: '20px', border: 'none',
            background: hasChanges ? 'var(--primary)' : 'var(--text-muted)',
            color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            opacity: isSaving ? 0.7 : 1,
          }}>
            {isSaving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
            保存
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{ margin: '8px 16px', padding: '8px 12px', background: '#FEF2F2', color: '#991B1B', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertCircle size={12} /> {error}
          <span style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => setError('')}><X size={12} /></span>
        </div>
      )}

      {/* 编辑区域 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {/* AI速览区域 - 常驻在内容上方 */}
        <div style={{
          marginBottom: '16px', borderRadius: '12px', overflow: 'hidden',
          border: aiSummary ? '1px solid #FDE68A' : '1px dashed #FDE68A',
          background: aiSummary ? 'linear-gradient(135deg, #FFFBEB, #FEF3C7)' : '#FFFBEB',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 14px', borderBottom: aiSummary ? '1px solid #FDE68A' : 'none',
            fontSize: '13px', fontWeight: 600, color: '#D97706',
          }}>
            <Sparkles size={14} /> AI速览
          </div>
          {aiSummary ? (
            <div style={{ padding: '14px 16px', fontSize: '13px', lineHeight: '1.8', color: '#92400E' }}>
              <ReactMarkdown>{aiSummary}</ReactMarkdown>
            </div>
          ) : (
            <div
              onClick={handleSummarize}
              style={{
                padding: '20px 16px', textAlign: 'center', cursor: 'pointer',
                color: '#D97706', fontSize: '13px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#FEF3C7'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Sparkles size={20} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.5 }} />
              点击生成AI速览，智能总结课程要点
            </div>
          )}
        </div>

        {/* 标题 */}
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="标题" style={{
          width: '100%', border: 'none', background: 'transparent',
          fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)',
          outline: 'none', padding: '4px 0', marginBottom: '8px',
        }} />

        {/* 课程关联下拉框 */}
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

        {/* 正文 */}
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="开始记录..." style={{
          width: '100%', minHeight: '180px', border: 'none', background: 'transparent',
          color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.8',
          resize: 'none', outline: 'none', fontFamily: 'inherit',
        }} />

        {/* 图片预览 */}
        {attachments.filter(a => isImage(a.mimetype)).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
            {attachments.filter(a => isImage(a.mimetype)).map(att => (
              <div key={att.id} style={{ position: 'relative', width: '100px', height: '100px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--card-border)' }}>
                <img src={`data:${att.mimetype};base64,${att.data}`} alt={att.filename} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => handleRemoveAttachment(att)} style={{
                  position: 'absolute', top: '2px', right: '2px', width: '20px', height: '20px',
                  borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
                }}><X size={10} /></button>
              </div>
            ))}
          </div>
        )}

        {/* 非图片附件 */}
        {attachments.filter(a => !isImage(a.mimetype)).length > 0 && (
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {attachments.filter(a => !isImage(a.mimetype)).map(att => (
              <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '12px' }}>
                <Paperclip size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.filename}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{formatSize(att.size)}</span>
                {!att.isNew && <Download size={13} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => handleDownload(att)} />}
                <X size={13} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => handleRemoveAttachment(att)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部工具栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderTop: '1px solid var(--card-border)',
        background: 'var(--card-bg)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button onClick={() => imageInputRef.current?.click()} style={{
            width: '36px', height: '36px', borderRadius: '50%', border: 'none',
            background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} title="插入图片"><Camera size={16} /></button>
          <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleAddFiles} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} style={{
            width: '36px', height: '36px', borderRadius: '50%', border: 'none',
            background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} title="添加附件"><FileUp size={16} /></button>
          <input ref={fileInputRef} type="file" multiple onChange={handleAddFiles} style={{ display: 'none' }} />
        </div>
        {!isNew && (
          <button onClick={onDelete} style={{
            width: '36px', height: '36px', borderRadius: '50%', border: 'none',
            background: '#FEF2F2', color: '#DC2626', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Trash2 size={16} /></button>
        )}
      </div>
    </div>
  )
}

/* ==================== 随记主页面 ==================== */
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

  if (editingNote !== null) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--bg)', zIndex: 100, display: 'flex', flexDirection: 'column' }}>
        <div style={{ maxWidth: '600px', width: '100%', margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <NoteEditor
            note={Object.keys(editingNote).length > 0 ? editingNote : null}
            courses={courses} token={token}
            onSave={() => { setEditingNote(null); loadData() }}
            onDelete={async () => {
              if (!editingNote?.id) return
              if (!confirm('确定删除这条随记吗？')) return
              try {
                await fetch(`${API_BASE}/${editingNote.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
                setEditingNote(null); loadData()
              } catch { /* ignore */ }
            }}
            onBack={() => setEditingNote(null)}
          />
        </div>
      </div>
    )
  }

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
