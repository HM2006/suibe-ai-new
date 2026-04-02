/* ========================================
   小贸 - 随记页面
   备忘录式课程随记，支持文字/图片/附件 + AI一键总结
   ======================================== */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, X, Save, Trash2, FileText, Image, Paperclip,
  Sparkles, Loader, ChevronRight, BookOpen, ArrowLeft,
  Download, AlertCircle
} from 'lucide-react'
import { useUser } from '../contexts/UserContext'

const API_BASE = '/api/notes'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/* 文件转base64 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1]) // 去掉 data:xxx;base64, 前缀
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/* 格式化文件大小 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/* 格式化日期 */
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

/* 判断是否为图片 */
function isImage(mimetype) {
  return mimetype && mimetype.startsWith('image/')
}

/* ==================== 随记编辑器组件 ==================== */
function NoteEditor({ note, courses, token, onSave, onDelete, onBack }) {
  const [title, setTitle] = useState(note?.title || '')
  const [courseName, setCourseName] = useState(note?.course_name || '')
  const [content, setContent] = useState(note?.content || '')
  const [aiSummary, setAiSummary] = useState(note?.ai_summary || '')
  const [attachments, setAttachments] = useState(note?.attachments || [])
  const [isSaving, setIsSaving] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [error, setError] = useState('')
  const [showCourseDropdown, setShowCourseDropdown] = useState(false)

  const isNew = !note
  const hasChanges = isNew
    ? (title.trim() || content.trim() || attachments.length > 0)
    : true

  /* 保存 */
  const handleSave = async () => {
    if (!token) return
    setIsSaving(true)
    setError('')
    try {
      let savedNote
      if (isNew) {
        const res = await fetch(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ title: title.trim(), course_name: courseName, content }),
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.message)
        savedNote = data.data
      } else {
        const res = await fetch(`${API_BASE}/${note.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ title: title.trim(), course_name: courseName, content, ai_summary: aiSummary }),
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.message)
        savedNote = data.data
      }

      // 上传新附件
      const newAttachments = attachments.filter(a => a.isNew)
      if (newAttachments.length > 0 && savedNote) {
        const filesData = newAttachments.map(a => ({
          filename: a.filename,
          mimetype: a.mimetype,
          data: a.data,
        }))
        await fetch(`${API_BASE}/${savedNote.id}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ files: filesData }),
        })
      }

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
      if (file.size > MAX_FILE_SIZE) {
        setError(`文件 "${file.name}" 超过10MB限制`)
        return
      }
      try {
        const data = await fileToBase64(file)
        setAttachments(prev => [...prev, {
          id: `new_${Date.now()}_${Math.random()}`,
          filename: file.name,
          mimetype: file.type,
          size: file.size,
          data,
          isNew: true,
        }])
      } catch (err) {
        setError(`读取文件 "${file.name}" 失败`)
      }
    }
    e.target.value = ''
  }

  /* 删除附件 */
  const handleRemoveAttachment = async (att) => {
    if (att.isNew) {
      setAttachments(prev => prev.filter(a => a.id !== att.id))
      return
    }
    try {
      await fetch(`${API_BASE}/${note.id}/attachments/${att.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      setAttachments(prev => prev.filter(a => a.id !== att.id))
    } catch (err) {
      setError('删除附件失败')
    }
  }

  /* AI总结 */
  const handleSummarize = async () => {
    if (!token || !note) return
    setIsSummarizing(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/${note.id}/summarize`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)
      setAiSummary(data.data.summary)
    } catch (err) {
      setError(err.message || 'AI总结失败')
    } finally {
      setIsSummarizing(false)
    }
  }

  /* 下载附件 */
  const handleDownload = async (att) => {
    try {
      const res = await fetch(`${API_BASE}/${note.id}/attachments/${att.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (!data.success) return
      const link = document.createElement('a')
      link.href = `data:${att.mimetype};base64,${data.data.data}`
      link.download = att.filename
      link.click()
    } catch (err) {
      setError('下载失败')
    }
  }

  return (
    <div className="notes-editor">
      {/* 顶部操作栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          background: 'none', border: 'none', color: 'var(--text-secondary)',
          fontSize: '13px', cursor: 'pointer', padding: '4px 0',
        }}>
          <ArrowLeft size={16} /> 返回
        </button>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', background: '#FEF2F2', color: '#991B1B',
          borderRadius: '8px', fontSize: '13px', marginBottom: '12px',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <AlertCircle size={14} /> {error}
          <span style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => setError('')}><X size={14} /></span>
        </div>
      )}

      {/* 标题 */}
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="随记标题"
        className="notes-title-input"
      />

      {/* 课程关联 */}
      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={courseName}
            onChange={e => setCourseName(e.target.value)}
            onFocus={() => setShowCourseDropdown(true)}
            onBlur={() => setTimeout(() => setShowCourseDropdown(false), 200)}
            placeholder="关联课程（可选）"
            style={{
              width: '100%', padding: '8px 12px', border: '1px solid var(--card-border)',
              borderRadius: 'var(--radius-sm)', background: 'var(--bg)',
              fontSize: '13px', outline: 'none', color: 'var(--text-primary)',
            }}
          />
        </div>
        {showCourseDropdown && courses.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: '28px', right: 0, zIndex: 50,
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderRadius: 'var(--radius-sm)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            maxHeight: '200px', overflowY: 'auto',
          }}>
            {courses.filter(c => c.toLowerCase().includes(courseName.toLowerCase())).map(c => (
              <div
                key={c}
                onMouseDown={() => { setCourseName(c); setShowCourseDropdown(false) }}
                style={{
                  padding: '8px 12px', fontSize: '13px', cursor: 'pointer',
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={e => e.target.style.background = 'var(--bg-secondary)'}
                onMouseLeave={e => e.target.style.background = 'transparent'}
              >
                {c}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 正文 */}
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="记录课程重要内容..."
        className="notes-content-input"
      />

      {/* 附件区域 */}
      <div style={{ marginTop: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            附件 ({attachments.length})
          </span>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '6px 12px', borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--card-border)', background: 'var(--bg)',
            fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer',
          }}>
            <Plus size={14} /> 添加文件
            <input type="file" multiple onChange={handleAddFiles} style={{ display: 'none' }} />
          </label>
        </div>

        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {attachments.map(att => (
              <div key={att.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 12px', background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-sm)', fontSize: '13px',
              }}>
                {isImage(att.mimetype) ? (
                  <Image size={16} style={{ color: '#10B981', flexShrink: 0 }} />
                ) : (
                  <Paperclip size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                  {att.filename}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {formatSize(att.size)}
                </span>
                {!att.isNew && (
                  <Download size={14} style={{ color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }} onClick={() => handleDownload(att)} />
                )}
                <X size={14} style={{ color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }} onClick={() => handleRemoveAttachment(att)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI总结区域 */}
      {!isNew && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} style={{ color: 'var(--primary)' }} /> AI总结
            </span>
            <button
              onClick={handleSummarize}
              disabled={isSummarizing}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                border: 'none', background: 'var(--primary)', color: '#fff',
                fontSize: '12px', fontWeight: 500, cursor: isSummarizing ? 'not-allowed' : 'pointer',
                opacity: isSummarizing ? 0.7 : 1,
              }}
            >
              {isSummarizing ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
              {isSummarizing ? '总结中...' : '一键总结'}
            </button>
          </div>
          {aiSummary ? (
            <div style={{
              padding: '14px 16px', background: '#FFFBEB', border: '1px solid #FDE68A',
              borderRadius: 'var(--radius-md)', fontSize: '13px', lineHeight: '1.8',
              color: '#92400E', whiteSpace: 'pre-wrap',
            }}>
              {aiSummary}
            </div>
          ) : (
            <div style={{
              padding: '20px', textAlign: 'center', color: 'var(--text-muted)',
              fontSize: '13px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
            }}>
              点击"一键总结"，AI将分析文字和附件内容生成精炼要点
            </div>
          )}
        </div>
      )}

      {/* 底部操作栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--card-border)',
      }}>
        {!isNew && (
          <button onClick={onDelete} style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '8px 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid #FECACA', background: '#FEF2F2',
            color: '#DC2626', fontSize: '13px', cursor: 'pointer',
          }}>
            <Trash2 size={14} /> 删除
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={handleSave} disabled={isSaving || !hasChanges} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 20px', borderRadius: 'var(--radius-sm)',
          border: 'none', background: hasChanges ? 'var(--primary)' : 'var(--text-muted)',
          color: '#fff', fontSize: '13px', fontWeight: 500,
          cursor: hasChanges ? 'pointer' : 'not-allowed',
          opacity: isSaving ? 0.7 : 1,
        }}>
          {isSaving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
          {isSaving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}

/* ==================== 随记列表项 ==================== */
function NoteCard({ note, onClick }) {
  return (
    <div className="note-card" onClick={onClick}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{
            fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {note.title || '无标题随记'}
          </span>
          {note.course_name && (
            <span style={{
              fontSize: '11px', padding: '1px 8px', borderRadius: 'var(--radius-full)',
              background: '#EEF2FF', color: '#4F46E5', flexShrink: 0,
            }}>
              {note.course_name}
            </span>
          )}
          {note.ai_summary && (
            <Sparkles size={12} style={{ color: '#F59E0B', flexShrink: 0 }} />
          )}
        </div>
        <div style={{
          fontSize: '13px', color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {note.content || '暂无内容'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
          <span>{formatDate(note.updated_at)}</span>
          {note.attachment_count > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <Paperclip size={10} /> {note.attachment_count}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
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
  const [editingNote, setEditingNote] = useState(null) // null=列表, {}=新建, {...}=编辑

  /* 加载数据 */
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
    } catch (err) {
      console.warn('加载随记失败:', err)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadData() }, [loadData])

  /* 未登录 */
  if (!user) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
        <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>
          登录后使用随记功能
        </p>
        <button onClick={() => navigate('/user')} style={{
          padding: '8px 20px', borderRadius: '8px', border: 'none',
          background: 'var(--primary)', color: '#fff', fontSize: '13px', cursor: 'pointer',
        }}>
          前往登录
        </button>
      </div>
    )
  }

  /* 编辑模式 */
  if (editingNote !== null) {
    return (
      <div className="notes-container">
        <NoteEditor
          note={Object.keys(editingNote).length > 0 ? editingNote : null}
          courses={courses}
          token={token}
          onSave={() => { setEditingNote(null); loadData() }}
          onDelete={async () => {
            if (!editingNote?.id) return
            if (!confirm('确定删除这条随记吗？')) return
            try {
              await fetch(`${API_BASE}/${editingNote.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
              })
              setEditingNote(null)
              loadData()
            } catch (err) { /* ignore */ }
          }}
          onBack={() => setEditingNote(null)}
        />
      </div>
    )
  }

  /* 列表模式 */
  return (
    <div className="notes-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">随记</h1>
          <p className="page-desc">记录课程要点，AI帮你总结</p>
        </div>
        <button onClick={() => setEditingNote({})} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 16px', borderRadius: 'var(--radius-sm)',
          border: 'none', background: 'var(--primary)', color: '#fff',
          fontSize: '13px', fontWeight: 500, cursor: 'pointer',
        }}>
          <Plus size={16} /> 新建
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <Loader size={20} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
        </div>
      ) : notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>
            还没有随记
          </p>
          <p style={{ fontSize: '13px', marginBottom: '16px' }}>
            点击右上角"新建"创建第一条随记
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {notes.map(note => (
            <NoteCard key={note.id} note={note} onClick={() => setEditingNote(note)} />
          ))}
        </div>
      )}
    </div>
  )
}

export default NotesPage
