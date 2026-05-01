/**
 * 天气路由模块
 * 代理和风天气 API，为前端提供实时天气和分钟级降水预报
 *
 * 配置说明：
 * 和风天气 V4 版本需要使用专属 API Host，请在控制台获取：
 * https://console.qweather.com/setting -> API Host
 * 格式如：abc1234xyz.def.qweatherapi.com
 *
 * 环境变量配置（推荐）：
 *   QWEATHER_API_HOST=你的专属API Host
 *   QWEATHER_API_KEY=你的API Key
 */

const express = require('express');
const axios = require('axios');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const router = express.Router();

const QWEATHER_API_HOST = process.env.QWEATHER_API_HOST || 'n77fc3ctpr.re.qweatherapi.com';
const QWEATHER_API_KEY = process.env.QWEATHER_API_KEY || '9ca86aa0e64640588bf743b8b53dcd61';
const LOCATION = '121.23,31.03'; // 上海对外经贸大学松江校区

const QWEATHER_BASE_URL = `https://${QWEATHER_API_HOST}`;

/**
 * 构建 axios 请求配置
 * 自动检测代理环境变量（HTTP_PROXY / HTTPS_PROXY / http_proxy / https_proxy）
 */
function buildAxiosConfig() {
  const config = {
    timeout: 8000,
    headers: {
      'X-QW-Api-Key': QWEATHER_API_KEY,
      'Accept-Encoding': 'gzip, deflate',
    },
    decompress: true,
  };

  // 如果存在代理环境变量，使用 https-proxy-agent
  const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY
    || process.env.http_proxy || process.env.HTTP_PROXY;

  if (proxyUrl) {
    try {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      config.httpsAgent = new HttpsProxyAgent(proxyUrl);
      config.proxy = false; // 禁用 axios 内置代理，使用 httpsAgent
    } catch (e) {
      console.warn('[Weather] https-proxy-agent 未安装，跳过代理配置');
    }
  }

  return config;
}

// ==================== 实时天气 ====================

/**
 * GET /api/weather/now - 获取实时天气
 */
router.get('/weather/now', asyncHandler(async (req, res) => {
  const { data } = await axios.get(`${QWEATHER_BASE_URL}/v7/weather/now`, {
    ...buildAxiosConfig(),
    params: { location: LOCATION, lang: 'zh' },
  });

  if (data.code !== '200') {
    throw new AppError(`和风天气接口返回错误: ${data.code}`, 502, 'UPSTREAM_ERROR');
  }

  const now = data.now;

  res.json({
    success: true,
    data: {
      location: LOCATION,
      temp: now.temp,
      feelsLike: now.feelsLike,
      icon: now.icon,
      text: now.text,
      wind360: now.wind360,
      windDir: now.windDir,
      windScale: now.windScale,
      windSpeed: now.windSpeed,
      humidity: now.humidity,
      precip: now.precip,
      pressure: now.pressure,
      vis: now.vis,
      cloud: now.cloud,
      dew: now.dew,
      obsTime: now.obsTime,
    },
  });
}));

// ==================== 分钟级降水预报 ====================

/**
 * GET /api/weather/minutely - 获取分钟级降水预报
 */
router.get('/weather/minutely', asyncHandler(async (req, res) => {
  const { data } = await axios.get(`${QWEATHER_BASE_URL}/v7/minutely/5m`, {
    ...buildAxiosConfig(),
    params: { location: LOCATION, lang: 'zh' },
  });

  if (data.code !== '200') {
    throw new AppError(`和风天气接口返回错误: ${data.code}`, 502, 'UPSTREAM_ERROR');
  }

  res.json({
    success: true,
    data: {
      location: LOCATION,
      summary: data.summary,
      minutely: (data.minutely || []).map(item => ({
        time: item.fxTime,
        precip: item.precip,
        type: item.type,
      })),
    },
  });
}));

module.exports = router;
