#!/bin/zsh
set -u

APP_DIR="/Users/wee./Desktop/takagi-q-interactive"
ELECTRON_BIN="$APP_DIR/node_modules/.bin/electron"
ELECTRON_APP="$APP_DIR/node_modules/electron/dist/Electron.app"
ELECTRON_EXE="$ELECTRON_APP/Contents/MacOS/Electron"
PID_FILE="$APP_DIR/takagi-q.pid"
LOG_FILE="/tmp/takagi-q-desktop-pet.log"
PLIST_LABEL="com.takagi.q.pet"
PLIST_FILE="/Users/wee./Library/LaunchAgents/$PLIST_LABEL.plist"
CONTROL_URL="http://127.0.0.1:17431"

is_running() {
  /usr/bin/curl -fsS "$CONTROL_URL/status" >/dev/null 2>&1
}

cleanup_orphans() {
  /usr/bin/pkill -f "$APP_DIR" >/dev/null 2>&1 || true
  rm -f "$PID_FILE"
}

write_plist() {
  mkdir -p "/Users/wee./Library/LaunchAgents"
  cat > "$PLIST_FILE" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$ELECTRON_EXE</string>
    <string>$APP_DIR</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>$APP_DIR</string>
  <key>StandardOutPath</key>
  <string>$LOG_FILE</string>
  <key>StandardErrorPath</key>
  <string>$LOG_FILE</string>
</dict>
</plist>
PLIST
}

start_pet() {
  if is_running; then
    echo "Takagi Q 已经在运行。"
    return 0
  fi

  rm -f "$PID_FILE"
  /usr/bin/open -na "$ELECTRON_APP" --args "$APP_DIR"

  local attempts=0
  while [[ $attempts -lt 30 ]]; do
    if is_running; then
      echo "Takagi Q 已启动。"
      return 0
    fi
    sleep 0.2
    attempts=$((attempts + 1))
  done

  echo "启动失败，请查看日志：$LOG_FILE"
  return 1
}

launch_pet() {
  if is_running; then
    exit 0
  fi

  rm -f "$PID_FILE"
  cd "$APP_DIR" || exit 1
  exec "$ELECTRON_EXE" "$APP_DIR" >> "$LOG_FILE" 2>&1
}

stop_pet() {
  if is_running; then
    /usr/bin/curl -fsS "$CONTROL_URL/quit" >/dev/null 2>&1 || true
    sleep 0.5
    cleanup_orphans
    echo "Takagi Q 已关闭。"
  else
    cleanup_orphans
    echo "Takagi Q 已关闭。"
  fi
}

status_pet() {
  if is_running; then
    echo "Takagi Q 正在运行。"
  else
    echo "Takagi Q 未运行。"
  fi

  if [[ -f "$PLIST_FILE" ]]; then
    echo "开机自启：已配置 ($PLIST_FILE)"
  else
    echo "开机自启：未配置"
  fi
}

enable_autostart() {
  write_plist
  launchctl bootout "gui/501" "$PLIST_FILE" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/501" "$PLIST_FILE"
  launchctl enable "gui/501/$PLIST_LABEL" >/dev/null 2>&1 || true
  echo "开机自启已开启。"
}

disable_autostart() {
  launchctl bootout "gui/501" "$PLIST_FILE" >/dev/null 2>&1 || true
  rm -f "$PLIST_FILE"
  echo "开机自启已关闭。"
}

case "${1:-status}" in
  start)
    start_pet
    ;;
  launch)
    launch_pet
    ;;
  stop|close)
    stop_pet
    ;;
  restart)
    stop_pet
    start_pet
    ;;
  status)
    status_pet
    ;;
  autostart-on)
    enable_autostart
    ;;
  autostart-off)
    disable_autostart
    ;;
  *)
    echo "用法：$0 {start|stop|restart|status|autostart-on|autostart-off}"
    exit 2
    ;;
esac
