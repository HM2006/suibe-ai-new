/**
 * 随记路由
 * CRUD + 文件上传 + AI总结
 */
const express = require('express');
const router = express.Router();
const db = require('../services/database');
const { authMiddleware } = require('../services/auth');
const { summarizeNote } = require('../services/gemini');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ==================== 随记 CRUD ====================

/**
 * GET /api/notes - 获取当前用户所有随记
 */
router.get('/notes', authMiddleware, (req, res) => {
  const notes = db.getNotes(req.user.userId);
  res.json({ success: true, data: notes });
});

/**
 * GET /api/notes/courses - 获取当前用户的课程列表（用于下拉选择）
 */
router.get('/notes/courses', authMiddleware, (req, res) => {
  const courses = db.getUserCourseNames(req.user.userId);
  res.json({ success: true, data: courses });
});

/**
 * GET /api/notes/:id - 获取单个随记详情（含附件列表）
 */
router.get('/notes/:id', authMiddleware, (req, res) => {
  const note = db.getNoteById(parseInt(req.params.id, 10));
  if (!note || note.user_id !== req.user.userId) {
    return res.status(404).json({ success: false, message: '随记不存在' });
  }
  res.json({ success: true, data: note });
});

/**
 * POST /api/notes - 创建随记
 */
router.post('/notes', authMiddleware, (req, res) => {
  const { title, course_name, content } = req.body;
  const note = db.createNote(req.user.userId, { title, course_name, content });
  res.json({ success: true, data: note });
});

/**
 * PUT /api/notes/:id - 更新随记
 */
router.put('/notes/:id', authMiddleware, (req, res) => {
  const noteId = parseInt(req.params.id, 10);
  const note = db.getNoteById(noteId);
  if (!note || note.user_id !== req.user.userId) {
    return res.status(404).json({ success: false, message: '随记不存在' });
  }
  const updated = db.updateNote(noteId, req.body);
  res.json({ success: true, data: updated });
});

/**
 * DELETE /api/notes/:id - 删除随记
 */
router.delete('/notes/:id', authMiddleware, (req, res) => {
  const noteId = parseInt(req.params.id, 10);
  const note = db.getNoteById(noteId);
  if (!note || note.user_id !== req.user.userId) {
    return res.status(404).json({ success: false, message: '随记不存在' });
  }
  db.deleteNote(noteId);
  res.json({ success: true });
});

// ==================== 附件管理 ====================

/**
 * POST /api/notes/:id/attachments - 上传附件（支持多文件）
 * Content-Type: multipart/form-data
 * 每个文件字段名为 "files"
 */
router.post('/notes/:id/attachments', authMiddleware, (req, res) => {
  const noteId = parseInt(req.params.id, 10);
  const note = db.getNoteById(noteId);
  if (!note || note.user_id !== req.user.userId) {
    return res.status(404).json({ success: false, message: '随记不存在' });
  }

  // 使用 express 的 raw body 解析（需要在 server.js 中配置）
  // 这里我们用 base64 JSON 方式上传
  const { files } = req.body;
  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ success: false, message: '缺少文件数据' });
  }

  const results = [];
  for (const file of files) {
    if (!file.data || !file.filename) continue;

    // 检查文件大小（base64解码后的大小约为 base64.length * 3/4）
    const estimatedSize = Math.floor(file.data.length * 3 / 4);
    if (estimatedSize > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        message: `文件 "${file.filename}" 超过10MB限制`,
      });
    }

    const attachmentId = db.addAttachment(noteId, {
      filename: file.filename,
      mimetype: file.mimetype || 'application/octet-stream',
      size: estimatedSize,
      data: file.data,
    });
    results.push({ id: attachmentId, filename: file.filename });
  }

  // 更新随记的 updated_at
  db.updateNote(noteId, {});

  res.json({ success: true, data: results });
});

/**
 * GET /api/notes/:id/attachments/:aid - 下载附件
 */
router.get('/notes/:id/attachments/:aid', authMiddleware, (req, res) => {
  const noteId = parseInt(req.params.id, 10);
  const aid = parseInt(req.params.aid, 10);

  const note = db.getNoteById(noteId);
  if (!note || note.user_id !== req.user.userId) {
    return res.status(404).json({ success: false, message: '随记不存在' });
  }

  const attachment = db.getAttachmentById(aid);
  if (!attachment || attachment.note_id !== noteId) {
    return res.status(404).json({ success: false, message: '附件不存在' });
  }

  res.json({
    success: true,
    data: {
      id: attachment.id,
      filename: attachment.filename,
      mimetype: attachment.mimetype,
      size: attachment.size,
      data: attachment.data,
    },
  });
});

/**
 * DELETE /api/notes/:id/attachments/:aid - 删除附件
 */
router.delete('/notes/:id/attachments/:aid', authMiddleware, (req, res) => {
  const noteId = parseInt(req.params.id, 10);
  const aid = parseInt(req.params.aid, 10);

  const note = db.getNoteById(noteId);
  if (!note || note.user_id !== req.user.userId) {
    return res.status(404).json({ success: false, message: '随记不存在' });
  }

  const attachment = db.getAttachmentById(aid);
  if (!attachment || attachment.note_id !== noteId) {
    return res.status(404).json({ success: false, message: '附件不存在' });
  }

  db.deleteAttachment(aid);
  res.json({ success: true });
});

// ==================== AI 总结 ====================

/**
 * POST /api/notes/:id/summarize - AI一键总结
 * 将随记的文字 + 所有附件直接发给 Gemini（原生多模态）
 */
router.post('/notes/:id/summarize', authMiddleware, async (req, res) => {
  const noteId = parseInt(req.params.id, 10);
  const note = db.getNoteById(noteId);
  if (!note || note.user_id !== req.user.userId) {
    return res.status(404).json({ success: false, message: '随记不存在' });
  }

  if (!note.content && (!note.attachments || note.attachments.length === 0)) {
    return res.status(400).json({ success: false, message: '随记内容为空，无法总结' });
  }

  try {
    // 获取所有附件的完整数据（含base64）
    const attachmentsWithData = db.getNoteAttachmentsWithData(noteId);

    // 直接传给Gemini，原生多模态，不做任何处理
    const summary = await summarizeNote(note.content, attachmentsWithData);

    // 保存AI总结到数据库
    db.updateNote(noteId, { ai_summary: summary });

    res.json({ success: true, data: { summary } });
  } catch (err) {
    console.error('[Notes] AI总结失败:', err);
    res.status(500).json({ success: false, message: 'AI总结失败，请稍后重试' });
  }
});

module.exports = router;
