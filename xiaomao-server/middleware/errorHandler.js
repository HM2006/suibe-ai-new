/**
 * 全局错误处理中间件
 * 统一处理所有路由中抛出的错误，返回格式化的错误响应
 */

class AppError extends Error {
  /**
   * 自定义应用错误类
   * @param {string} message - 错误信息
   * @param {number} statusCode - HTTP状态码
   * @param {string} [code] - 业务错误码
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // 标记为可预期的操作错误

    // 捕获堆栈信息，排除构造函数本身
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 未找到中间件
 * 当请求的路由不存在时触发
 */
function notFoundHandler(req, res, next) {
  const error = new AppError(
    `接口不存在: ${req.method} ${req.originalUrl}`,
    404,
    'NOT_FOUND'
  );
  next(error);
}

/**
 * 全局错误处理中间件
 * 在所有路由之后注册，捕获所有传递过来的错误
 */
function errorHandler(err, req, res, next) {
  // 设置默认错误信息
  err.statusCode = err.statusCode || 500;
  err.code = err.code || 'INTERNAL_ERROR';

  // 开发环境返回详细错误信息，生产环境隐藏内部细节
  const isDev = process.env.NODE_ENV === 'development';

  const response = {
    success: false,
    code: err.code,
    message: err.message,
    // 开发环境才返回堆栈信息
    ...(isDev && { stack: err.stack })
  };

  // 记录错误日志
  console.error(`[${new Date().toISOString()}] 错误: ${err.message}`);
  console.error(`  状态码: ${err.statusCode}`);
  console.error(`  路径: ${req.method} ${req.originalUrl}`);
  if (isDev) {
    console.error(`  堆栈: ${err.stack}`);
  }

  res.status(err.statusCode).json(response);
}

/**
 * 异步路由包装器
 * 自动捕获异步函数中抛出的错误并传递给错误处理中间件
 * @param {Function} fn - 异步路由处理函数
 * @returns {Function} Express中间件函数
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  AppError,
  notFoundHandler,
  errorHandler,
  asyncHandler
};
