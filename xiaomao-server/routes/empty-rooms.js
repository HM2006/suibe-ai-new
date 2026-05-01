/**
 * 空教室查询路由
 *
 * 提供空教室数据的抓取触发、状态查询和空教室查询接口
 */

const express = require('express');
const router = express.Router();
const EmptyRoomsService = require('../services/empty-rooms');

const emptyRoomsService = EmptyRoomsService.getInstance();

// ==================== 抓取状态 ====================

/**
 * GET /api/empty-rooms/status
 * 获取空教室抓取状态（最后抓取时间、覆盖日期范围等）
 */
router.get('/empty-rooms/status', (req, res) => {
  try {
    const status = emptyRoomsService.getStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    console.error('[EmptyRooms] 获取状态失败:', err.message);
    res.status(500).json({ success: false, message: '获取抓取状态失败' });
  }
});

// ==================== 触发抓取 ====================

/**
 * POST /api/empty-rooms/fetch
 * 触发空教室数据抓取（管理员用，暂不需要auth）
 * 可选参数:
 *   - startDate: 起始日期 (YYYY-MM-DD)，默认今天
 *   - endDate: 结束日期 (YYYY-MM-DD)，默认 2026-06-30
 */
router.post('/empty-rooms/fetch', async (req, res) => {
  try {
    if (emptyRoomsService.fetching) {
      return res.status(409).json({
        success: false,
        message: '抓取任务正在进行中，请稍后再试',
      });
    }

    // 异步执行抓取任务，立即返回
    const { startDate, endDate } = req.body || {};

    res.json({
      success: true,
      message: '抓取任务已启动',
    });

    // 异步执行，不阻塞响应
    emptyRoomsService.fetchEmptyRooms({ startDate, endDate }).catch(err => {
      console.error('[EmptyRooms] 异步抓取任务失败:', err.message);
    });
  } catch (err) {
    console.error('[EmptyRooms] 启动抓取失败:', err.message);
    res.status(500).json({ success: false, message: '启动抓取任务失败' });
  }
});

// ==================== 查询空教室 ====================

/**
 * GET /api/empty-rooms/query
 * 查询空教室
 * 参数:
 *   - date: 日期 (YYYY-MM-DD)，必填
 *   - slots: 节次数组，如 "1,2,3" 或 "1-3"，必填
 *   - minCapacity: 最小容量，可选
 *   - building: 楼宇筛选，可选
 */
router.get('/empty-rooms/query', (req, res) => {
  try {
    const { date, slots, minCapacity, building } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: '缺少必要参数: date' });
    }

    if (!slots) {
      return res.status(400).json({ success: false, message: '缺少必要参数: slots' });
    }

    // 解析 slots 参数
    // 支持格式: "1,2,3" 或 "1-3" 或 "1,2,4-6"
    const parsedSlots = _parseSlots(slots);
    if (!parsedSlots || parsedSlots.length === 0) {
      return res.status(400).json({ success: false, message: 'slots 参数格式错误，支持 "1,2,3" 或 "1-3"' });
    }

    // 验证节次范围
    const invalidSlots = parsedSlots.filter(s => s < 1 || s > 14);
    if (invalidSlots.length > 0) {
      return res.status(400).json({
        success: false,
        message: `节次超出范围 (1-14): ${invalidSlots.join(', ')}`,
      });
    }

    const result = emptyRoomsService.queryEmptyRooms({
      date,
      slots: parsedSlots,
      minCapacity: minCapacity ? parseInt(minCapacity, 10) : undefined,
      building: building || undefined,
    });

    res.json({
      success: true,
      data: {
        date,
        slots: parsedSlots,
        count: result.length,
        rooms: result,
      },
    });
  } catch (err) {
    console.error('[EmptyRooms] 查询失败:', err.message);
    res.status(500).json({ success: false, message: err.message || '查询空教室失败' });
  }
});

// ==================== 工具函数 ====================

/**
 * 解析 slots 参数
 * 支持格式:
 *   - "1,2,3" -> [1, 2, 3]
 *   - "1-3" -> [1, 2, 3]
 *   - "1,2,4-6" -> [1, 2, 4, 5, 6]
 */
function _parseSlots(slotsStr) {
  if (!slotsStr || typeof slotsStr !== 'string') return null;

  const result = new Set();
  const parts = slotsStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.includes('-')) {
      // 范围格式: "1-3"
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end) || start > end) continue;
      for (let i = start; i <= end; i++) {
        result.add(i);
      }
    } else {
      // 单个数字
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) {
        result.add(num);
      }
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

module.exports = router;
