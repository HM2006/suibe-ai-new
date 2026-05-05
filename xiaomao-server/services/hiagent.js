/**
 * HiAgent API 服务层
 * 封装与 HiAgent 平台 API 的通信逻辑
 *
 * API 文档：https://agent.suibe.edu.cn/platform/doc/api/agent-api-call/agent-api-documentation
 *
 * 流程：
 * 1. create_conversation → 获取 AppConversationID
 * 2. chat_query (SSE) → 流式对话
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { v4: uuidv4 } = require('uuid');
const { HttpsProxyAgent } = require('https-proxy-agent');

// 配置
const API_BASE = process.env.HIAGENT_API_BASE || 'https://agent.suibe.edu.cn/api/proxy/api/v1';
const API_KEY = process.env.HIAGENT_API_KEY || '';

// 检查 HiAgent 是否已配置
function checkConfig() {
  if (!API_KEY) {
    return { configured: false, message: 'HiAgent API 密钥未配置，请在环境变量中设置 HIAGENT_API_KEY' };
  }
  return { configured: true };
}

// 代理配置（从环境变量读取）
const PROXY_URL = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || null;
const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : null;

/**
 * 通用 HTTPS 请求（支持代理）
 */
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const fullPath = API_BASE + path;
    const url = new URL(fullPath);
    const isHttps = url.protocol === 'https:';
    const payload = body ? JSON.stringify(body) : '';

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Apikey': API_KEY,
      },
      ...(proxyAgent ? { agent: proxyAgent } : {}),
    };

    if (payload) {
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = (isHttps ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, raw: data });
        } catch {
          resolve({ status: res.statusCode, data: data, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy(new Error('请求超时'));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * 创建会话
 * @param {string} userId - 用户标识
 * @returns {Promise<string>} AppConversationID
 */
async function createConversation(userId) {
  console.log(`[HiAgent] 创建会话, userId=${userId}`);

  const response = await request('POST', '/create_conversation', {
    UserID: userId,
  });

  if (response.status !== 200) {
    console.error('[HiAgent] 创建会话失败:', response.status, response.raw?.substring(0, 200));
    throw new Error(`创建会话失败: HTTP ${response.status}`);
  }

  const conversationId = response.data?.Conversation?.AppConversationID;
  if (!conversationId) {
    throw new Error('创建会话失败：未返回 AppConversationID');
  }

  console.log(`[HiAgent] 会话创建成功: ${conversationId}`);
  return conversationId;
}

/**
 * 发送消息（非流式）
 * @param {string} query - 用户消息
 * @param {string} conversationId - 会话 ID
 * @param {string} userId - 用户标识
 * @returns {Promise<{answer: string, conversationId: string, messageId: string}>}
 */
async function sendMessage(query, conversationId, userId = 'default-user') {
  // 检查配置
  const config = checkConfig();
  if (!config.configured) {
    console.error('[HiAgent]', config.message);
    throw new Error(config.message);
  }

  let convId = conversationId;

  if (!convId) {
    convId = await createConversation(userId);
  }

  console.log(`[HiAgent] 发送消息: "${query.substring(0, 50)}..."`);

  const response = await request('POST', '/chat_query', {
    Query: query,
    AppConversationID: convId,
    ResponseMode: 'blocking',
    UserID: userId,
  });

  // HiAgent blocking 模式也返回 SSE 格式，需要解析
  let answer = '暂无回复';
  const raw = response.raw || '';

  // 尝试从 SSE 格式中提取 answer
  const answerMatch = raw.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
  if (answerMatch && answerMatch.length > 0) {
    // 取最后一个 answer（message_end 中的是完整回答）
    const lastMatch = answerMatch[answerMatch.length - 1];
    const extracted = lastMatch.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (extracted) {
      answer = extracted[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
    }
  } else if (typeof response.data === 'string') {
    answer = response.data;
  } else if (response.data?.answer) {
    answer = response.data.answer;
  }

  return {
    answer: typeof answer === 'string' ? answer : JSON.stringify(answer),
    conversationId: convId,
    messageId: response.data?.id || uuidv4(),
  };
}

/**
 * 发送消息（流式 SSE）- 返回原始响应流
 * @param {string} query - 用户消息
 * @param {string} conversationId - 会话 ID
 * @param {string} userId - 用户标识
 * @returns {Promise<http.IncomingMessage>} 原始响应流
 */
async function sendMessageStream(query, conversationId, userId = 'default-user') {
  // 检查配置
  const config = checkConfig();
  if (!config.configured) {
    console.error('[HiAgent]', config.message);
    throw new Error(config.message);
  }

  let convId = conversationId;

  if (!convId) {
    convId = await createConversation(userId);
  }

  console.log(`[HiAgent] 发送流式消息: "${query.substring(0, 50)}..."`);

  return new Promise((resolve, reject) => {
    const fullPath = API_BASE + '/chat_query';
    const url = new URL(fullPath);
    const isHttps = url.protocol === 'https:';
    const payload = JSON.stringify({
      Query: query,
      AppConversationID: convId,
      ResponseMode: 'streaming',
      UserID: userId,
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Apikey': API_KEY,
        'Accept': 'text/event-stream',
        'Content-Length': Buffer.byteLength(payload),
      },
      ...(proxyAgent ? { agent: proxyAgent } : {}),
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      res._conversationId = convId;
      resolve(res);
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy(new Error('请求超时'));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * 解析 HiAgent SSE 事件流
 * HiAgent SSE 格式：每行 "data: {json}"
 *
 * @param {import('stream').Readable} stream
 * @param {Function} onMessage - (text: string) => void
 * @param {Function} onComplete - (fullAnswer, conversationId, messageId) => void
 * @param {Function} onError - (error: Error) => void
 */
function parseSSEStream(stream, onMessage, onComplete, onError) {
  let fullAnswer = '';
  let conversationId = '';
  let messageId = '';
  let buffer = '';
  let isCompleted = false;

  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;

      if (trimmed.startsWith('data:')) {
        const dataStr = trimmed.substring(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;

        try {
          const data = JSON.parse(dataStr);
          const event = data.event;

          // 提取消息内容 - 支持多种可能的字段名
          const content = data.answer || data.content || data.text || data.message || data.output || '';
          
          switch (event) {
            case 'message':
            case 'message_output':
              // 消息内容片段
              if (content) {
                fullAnswer += content;
                onMessage(content);
              }
              // 也可能是 delta 格式
              if (data.delta) {
                const deltaContent = typeof data.delta === 'string' ? data.delta : (data.delta.content || '');
                if (deltaContent) {
                  fullAnswer += deltaContent;
                  onMessage(deltaContent);
                }
              }
              if (data.conversation_id) conversationId = data.conversation_id;
              if (data.id || data.task_id) messageId = data.id || data.task_id;
              break;

            case 'message_end':
            case 'message_output_end':
            case 'message_finish':
              // 消息结束事件
              if (content && !fullAnswer.includes(content)) {
                fullAnswer += content;
              }
              if (data.conversation_id) conversationId = data.conversation_id;
              if (data.id || data.task_id) messageId = data.id || data.task_id;
              if (!isCompleted) {
                isCompleted = true;
                onComplete(fullAnswer, conversationId, messageId);
              }
              break;

            case 'message_failed':
            case 'error':
              onError(new Error(data.message || data.error || 'AI 服务返回错误'));
              break;

            case 'message_start':
              if (data.conversation_id) conversationId = data.conversation_id;
              if (data.id || data.task_id) messageId = data.id || data.task_id;
              break;

            case 'message_replace':
              fullAnswer = content || '';
              break;

            case 'message_cost':
            case 'message_usage':
              // 成本/用量信息，忽略
              break;

            default:
              // 对于未知事件，如果有内容也尝试处理
              if (content && event !== 'ping' && event !== 'heartbeat') {
                fullAnswer += content;
                onMessage(content);
              }
              break;
          }
        } catch (parseError) {
          // 尝试提取可能被截断的 JSON 中的 answer
          const answerMatch = dataStr.match(/"answer"\s*:\s*"([^"]*)"/);
          if (answerMatch) {
            const extracted = answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
            fullAnswer += extracted;
            onMessage(extracted);
          } else {
            console.warn('[HiAgent] SSE 数据解析失败:', dataStr.substring(0, 100));
          }
        }
      }
    }
  });

  stream.on('end', () => {
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        try {
          const data = JSON.parse(trimmed.substring(5).trim());
          const content = data.answer || data.content || data.text || data.message || data.output || '';
          if (content) fullAnswer += content;
          if (data.conversation_id) conversationId = data.conversation_id;
          if (data.id || data.task_id) messageId = data.id || data.task_id;
        } catch (e) { 
          // 尝试提取可能被截断的 JSON 中的内容
          const answerMatch = trimmed.match(/"answer"\s*:\s*"([^"]*)"/);
          if (answerMatch) {
            fullAnswer += answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
          }
        }
      }
    }
    if (!isCompleted) {
      isCompleted = true;
      onComplete(fullAnswer, conversationId, messageId);
    }
  });

  stream.on('error', (error) => {
    console.error('[HiAgent] SSE 流错误:', error.message);
    onError(error);
  });
}

module.exports = {
  createConversation,
  sendMessage,
  sendMessageStream,
  parseSSEStream,
};
