#!/bin/bash
# 小贸 - 校园AI助手 一键启动脚本

echo "========================================"
echo "  小贸 - 校园AI助手"
echo "========================================"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 启动后端服务
echo "[1/2] 启动后端服务..."
cd "$SCRIPT_DIR/xiaomao-server"
node server.js &
SERVER_PID=$!
echo "  后端PID: $SERVER_PID"
echo "  后端地址: http://localhost:3001"

# 等待后端启动
sleep 2

# 启动前端开发服务器
echo "[2/2] 启动前端服务..."
cd "$SCRIPT_DIR/xiaomao-web"
npx vite --host 0.0.0.0 &
FRONTEND_PID=$!
echo "  前端PID: $FRONTEND_PID"
echo "  前端地址: http://localhost:5173"

echo ""
echo "========================================"
echo "  ✅ 启动完成！"
echo "  🌐 访问地址: http://localhost:5173"
echo "  📖 API文档:  http://localhost:3001/api"
echo ""
echo "  按 Ctrl+C 停止所有服务"
echo "========================================"

# 捕获退出信号，清理子进程
cleanup() {
  echo ""
  echo "正在停止服务..."
  kill $SERVER_PID $FRONTEND_PID 2>/dev/null
  wait $SERVER_PID $FRONTEND_PID 2>/dev/null
  echo "服务已停止"
  exit 0
}

trap cleanup SIGINT SIGTERM

# 等待子进程
wait
