/**
 * Google Gemini AI 服务
 * 使用 REST API 实现原生多模态总结
 * 文件直接以 base64 传给 Gemini，不做任何预处理
 */

const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDAOsu4OQi-jY4ju5TkuLoMRzz5mEy19KQ';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const SYSTEM_INSTRUCTION = `你是一个专业的'课程总结助手'。你的核心任务是接收用户上传的课程考核、重点内容（包括文字、图片、文件格式），并输出精炼的文字版总结要点。

行为准则：
1) 纯粹总结：
 a) 不进行任何闲聊或废话。不提供开场白、问候语或总结性的陈词滥调。
 b) 直接开始列出总结要点。如果用户上传的内容不全，仅根据现有内容进行总结，不做过度推测。

2) 内容处理：
 a) 仔细分析文字、图片或文件中的关键考核点和核心知识。
 b) 以清晰的列表或段落形式呈现总结，确保逻辑严密。
 c) 篇幅控制：保持简明扼要，篇幅不宜过长，剔除冗余信息。

3) 输出格式：
 a) 使用简洁的文字进行表达。
 b) 每一条要点应具有高度的概括性。

整体基调：
极简主义、高效、专业且务实。`;

/**
 * 调用 Gemini API 进行多模态总结
 * @param {string} textContent - 文字内容
 * @param {Array<{filename: string, mimetype: string, data: string}>} files - 附件列表（data为base64）
 * @returns {Promise<string>} AI总结文本
 */
async function summarizeNote(textContent, files = []) {
  // 构建 parts
  const parts = [];

  // 添加文字内容
  if (textContent && textContent.trim()) {
    parts.push({ text: textContent.trim() });
  }

  // 添加文件（直接base64传给Gemini，原生多模态）
  for (const file of files) {
    parts.push({
      inlineData: {
        mimeType: file.mimetype,
        data: file.data,
      },
    });
  }

  if (parts.length === 0) {
    return '暂无内容可供总结。';
  }

  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const response = await axios.post(url, {
      system_instruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents: [{
        parts: parts,
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    }, {
      timeout: 60000, // 60秒超时
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || 'AI未能生成总结，请稍后重试。';
  } catch (err) {
    console.error('[Gemini] API调用失败:', err.response?.data || err.message);
    if (err.response?.status === 429) {
      return 'AI请求过于频繁，请稍后重试。';
    }
    return `AI总结失败: ${err.message}`;
  }
}

module.exports = { summarizeNote };
