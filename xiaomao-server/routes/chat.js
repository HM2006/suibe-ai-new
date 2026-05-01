/**
 * AI对话路由模块
 * 处理与HiAgent API的对话交互，支持普通模式和SSE流式模式
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { sendMessage, sendMessageStream, parseSSEStream } = require('../services/hiagent');
const db = require('../services/database');
const { authMiddleware } = require('../services/auth');

const router = express.Router();

/**
 * POST /api/chat - 发送消息到HiAgent API（非流式）
 *
 * 请求体:
 * {
 *   messages: [{ role: 'user'|'assistant', content: string }],
 *   conversation_id?: string,
 *   user?: string
 * }
 *
 * 响应:
 * {
 *   success: true,
 *   data: {
 *     answer: string,
 *     conversation_id: string,
 *     message_id: string
 *   }
 * }
 */
router.post('/chat', asyncHandler(async (req, res) => {
  const { messages, conversation_id, user } = req.body;

  // 参数校验
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new AppError('messages参数不能为空，必须是一个消息数组', 400, 'INVALID_PARAMS');
  }

  // 提取最后一条用户消息作为查询内容
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMessage || !lastUserMessage.content) {
    throw new AppError('消息列表中必须包含至少一条用户消息', 400, 'INVALID_PARAMS');
  }

  const query = lastUserMessage.content;
  const userId = user || 'default-user';

  console.log(`[Chat] 收到对话请求: "${query.substring(0, 80)}..."`);

  // 调用HiAgent API发送消息
  const result = await sendMessage(query, conversation_id, userId);

  // 保存对话记录
  let recordId = null;
  try {
    const authHeader = req.headers['authorization'];
    let recordUserId = null;
    let recordUsername = 'anonymous';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET || 'xiaomao-secret-key');
        recordUserId = decoded.userId;
        const userObj = db.getUserById(decoded.userId);
        recordUsername = userObj ? (userObj.nickname || userObj.username) : 'anonymous';
      } catch {}
    }
    recordId = db.saveChatRecord(recordUserId, recordUsername, query, result.answer);
  } catch (e) {
    console.error('[Chat] 保存对话记录失败:', e.message);
  }

  // 返回格式化响应
  res.json({
    success: true,
    data: {
      answer: result.answer,
      conversation_id: result.conversation_id,
      message_id: result.message_id,
      record_id: recordId
    }
  });
}));

/**
 * POST /api/chat/reaction - 更新对话反馈（赞/踩）
 */
router.post('/chat/reaction', asyncHandler(async (req, res) => {
  const { record_id, reaction } = req.body;

  if (!record_id || !['like', 'dislike'].includes(reaction)) {
    throw new AppError('参数无效', 400, 'INVALID_PARAMS');
  }

  db.updateChatRecordReaction(record_id, reaction);

  res.json({ success: true });
}));

/**
 * POST /api/chat/save - 保存本地对话记录（用于快速回复等）
 */
router.post('/chat/save', asyncHandler(async (req, res) => {
  const { user_message, ai_answer } = req.body;

  if (!user_message) {
    throw new AppError('user_message不能为空', 400, 'INVALID_PARAMS');
  }

  let recordUserId = null;
  let recordUsername = 'anonymous';
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET || 'xiaomao-secret-key');
      recordUserId = decoded.userId;
      const userObj = db.getUserById(decoded.userId);
      recordUsername = userObj ? (userObj.nickname || userObj.username) : 'anonymous';
    } catch {}
  }

  const recordId = db.saveChatRecord(recordUserId, recordUsername, user_message, ai_answer || '');

  res.json({ success: true, data: { record_id: recordId } });
}));

/**
 * GET /api/chat/stream - SSE流式响应端点
 *
 * 查询参数:
 * - query: 用户消息内容（必填）
 * - conversation_id: 会话ID（可选）
 * - user: 用户标识（可选）
 *
 * 响应: Server-Sent Events 流
 * 事件类型:
 * - message: 消息内容片段 { answer: string }
 * - done: 流式响应结束 { conversation_id, message_id }
 * - error: 错误信息 { message: string }
 */
router.get('/chat/stream', asyncHandler(async (req, res) => {
  const { query, conversation_id, user } = req.query;

  // 参数校验
  if (!query || query.trim().length === 0) {
    throw new AppError('query参数不能为空', 400, 'INVALID_PARAMS');
  }

  const userId = user || 'default-user';
  console.log(`[Chat] 收到流式对话请求: "${query.substring(0, 80)}..."`);

  // 设置SSE响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 禁用Nginx缓冲
  // 允许跨域SSE
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

  // 发送初始连接确认
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`);

  try {
    // 获取流式响应
    const response = await sendMessageStream(query, conversation_id, userId);

    // 解析SSE流并转发给客户端
    parseSSEStream(
      response.data,
      // onMessage: 收到消息片段
      (text) => {
        const eventData = JSON.stringify({ answer: text });
        res.write(`event: message\ndata: ${eventData}\n\n`);
      },
      // onComplete: 流式响应完成
      (fullAnswer, convId, msgId) => {
        const eventData = JSON.stringify({
          conversation_id: convId,
          message_id: msgId || uuidv4()
        });
        res.write(`event: done\ndata: ${eventData}\n\n`);
        res.end();
      },
      // onError: 出错
      (error) => {
        const eventData = JSON.stringify({ message: error.message });
        res.write(`event: error\ndata: ${eventData}\n\n`);
        res.end();
      }
    );

  } catch (error) {
    // 如果获取流式响应本身就失败了
    console.error('[Chat] 流式请求失败:', error.message);
    const eventData = JSON.stringify({ message: error.message });
    res.write(`event: error\ndata: ${eventData}\n\n`);
    res.end();
  }
}));

/**
 * POST /api/chat/stream - SSE流式响应端点（POST方式）
 * 与GET方式功能相同，但使用POST请求体传递参数
 *
 * 请求体:
 * {
 *   messages: [{ role: 'user'|'assistant', content: string }],
 *   conversation_id?: string,
 *   user?: string
 * }
 */
router.post('/chat/stream', asyncHandler(async (req, res) => {
  const { messages, conversation_id, user } = req.body;

  // 参数校验
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new AppError('messages参数不能为空，必须是一个消息数组', 400, 'INVALID_PARAMS');
  }

  // 提取最后一条用户消息
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMessage || !lastUserMessage.content) {
    throw new AppError('消息列表中必须包含至少一条用户消息', 400, 'INVALID_PARAMS');
  }

  const query = lastUserMessage.content;
  const userId = user || 'default-user';
  console.log(`[Chat] 收到POST流式对话请求: "${query.substring(0, 80)}..."`);

  // 设置SSE响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

  // 发送初始连接确认
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`);

  try {
    const response = await sendMessageStream(query, conversation_id, userId);

    parseSSEStream(
      response.data,
      (text) => {
        const eventData = JSON.stringify({ answer: text });
        res.write(`event: message\ndata: ${eventData}\n\n`);
      },
      (fullAnswer, convId, msgId) => {
        const eventData = JSON.stringify({
          conversation_id: convId,
          message_id: msgId || uuidv4()
        });
        res.write(`event: done\ndata: ${eventData}\n\n`);
        res.end();
      },
      (error) => {
        const eventData = JSON.stringify({ message: error.message });
        res.write(`event: error\ndata: ${eventData}\n\n`);
        res.end();
      }
    );

  } catch (error) {
    console.error('[Chat] POST流式请求失败:', error.message);
    const eventData = JSON.stringify({ message: error.message });
    res.write(`event: error\ndata: ${eventData}\n\n`);
    res.end();
  }
}));

module.exports = router;
