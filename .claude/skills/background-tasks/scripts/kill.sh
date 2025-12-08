#!/bin/bash
# Kill a background task

TASKS_DIR="/tmp/bg_tasks"
TASKS_FILE="$TASKS_DIR/tasks.json"

[ -f "$TASKS_FILE" ] || { echo '{"success":false,"error":"No tasks found"}' >&2; exit 1; }

TASK_ID=""
TASK_NAME=""
SIGNAL="SIGTERM"
KILL_ALL=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --id) TASK_ID="$2"; shift 2 ;;
    --name) TASK_NAME="$2"; shift 2 ;;
    --signal) SIGNAL="$2"; shift 2 ;;
    --all) KILL_ALL=true; shift ;;
    *) shift ;;
  esac
done

kill_task() {
  local task="$1"
  local pid=$(echo "$task" | jq -r '.pid')
  local id=$(echo "$task" | jq -r '.id')
  local name=$(echo "$task" | jq -r '.name')
  local status=$(echo "$task" | jq -r '.status')

  if [ "$status" != "running" ]; then
    echo '{"success":false,"error":"Task '"$name"' is not running (status: '"$status"')"}' >&2
    return 1
  fi

  if kill -s "$SIGNAL" "$pid" 2>/dev/null; then
    # Update status in file
    jq --arg id "$id" '(.[] | select(.id == $id)).status = "killed"' "$TASKS_FILE" > "$TASKS_FILE.tmp" \
      && mv "$TASKS_FILE.tmp" "$TASKS_FILE"

    jq -n \
      --arg id "$id" \
      --arg name "$name" \
      --argjson pid "$pid" \
      --arg signal "$SIGNAL" \
      '{success:true, id:$id, name:$name, pid:$pid, signal:$signal, killed:true}'
  else
    echo '{"success":false,"error":"Failed to kill process '"$pid"'"}' >&2
    return 1
  fi
}

if [ "$KILL_ALL" = true ]; then
  RESULTS='[]'
  while IFS= read -r task; do
    [ -z "$task" ] && continue
    result=$(kill_task "$task" 2>&1) || true
    RESULTS=$(echo "$RESULTS" | jq --argjson r "$result" '. += [$r]')
  done < <(jq -c '.[] | select(.status == "running")' "$TASKS_FILE")

  count=$(echo "$RESULTS" | jq '[.[] | select(.success == true)] | length')
  echo "$RESULTS" | jq --argjson c "$count" '{success:true, killed:$c, results:.}'
  exit 0
fi

# Find single task
if [ -n "$TASK_ID" ]; then
  TASK=$(jq -c --arg id "$TASK_ID" '.[] | select(.id == $id)' "$TASKS_FILE")
elif [ -n "$TASK_NAME" ]; then
  TASK=$(jq -c --arg n "$TASK_NAME" '.[] | select(.name == $n)' "$TASKS_FILE")
else
  echo '{"success":false,"error":"Provide --id, --name, or --all"}' >&2
  exit 1
fi

if [ -z "$TASK" ] || [ "$TASK" = "null" ]; then
  echo '{"success":false,"error":"Task not found"}' >&2
  exit 1
fi

kill_task "$TASK"
