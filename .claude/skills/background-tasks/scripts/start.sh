#!/bin/bash
# Start a command as a background task with tracking

set -e

TASKS_DIR="/tmp/bg_tasks"
TASKS_FILE="$TASKS_DIR/tasks.json"

# Initialize storage
mkdir -p "$TASKS_DIR"
[ -f "$TASKS_FILE" ] || echo '[]' > "$TASKS_FILE"

# Parse arguments
COMMAND=""
NAME=""
CWD="$(pwd)"
ENV_VARS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --name) NAME="$2"; shift 2 ;;
    --cwd) CWD="$2"; shift 2 ;;
    --env) ENV_VARS="$2"; shift 2 ;;
    -*) echo '{"success":false,"error":"Unknown option: '"$1"'"}' >&2; exit 1 ;;
    *) COMMAND="$1"; shift ;;
  esac
done

if [ -z "$COMMAND" ]; then
  echo '{"success":false,"error":"No command provided"}' >&2
  exit 1
fi

# Generate ID and name
TASK_ID="bg_$(date +%s)_$$"
[ -z "$NAME" ] && NAME="$TASK_ID"

# Check for duplicate name
if jq -e --arg n "$NAME" '.[] | select(.name == $n and .status == "running")' "$TASKS_FILE" > /dev/null 2>&1; then
  echo '{"success":false,"error":"Task with name '"'$NAME'"' already running"}' >&2
  exit 1
fi

LOG_FILE="$TASKS_DIR/${TASK_ID}.log"
STARTED_AT=$(date -Iseconds)

# Start background process
cd "$CWD"
if [ -n "$ENV_VARS" ]; then
  env $(echo "$ENV_VARS" | tr ',' ' ') bash -c "$COMMAND" > "$LOG_FILE" 2>&1 &
else
  bash -c "$COMMAND" > "$LOG_FILE" 2>&1 &
fi
PID=$!

# Register task
TASK=$(jq -n \
  --arg id "$TASK_ID" \
  --arg name "$NAME" \
  --arg pid "$PID" \
  --arg cmd "$COMMAND" \
  --arg cwd "$CWD" \
  --arg started "$STARTED_AT" \
  --arg log "$LOG_FILE" \
  '{id:$id, name:$name, pid:($pid|tonumber), command:$cmd, cwd:$cwd, status:"running", started_at:$started, log_file:$log}')

jq --argjson task "$TASK" '. += [$task]' "$TASKS_FILE" > "$TASKS_FILE.tmp" && mv "$TASKS_FILE.tmp" "$TASKS_FILE"

echo "$TASK" | jq '. + {success:true}'
