#!/bin/bash
# List background tasks

TASKS_DIR="/tmp/bg_tasks"
TASKS_FILE="$TASKS_DIR/tasks.json"

[ -f "$TASKS_FILE" ] || { echo '{"success":true,"tasks":[],"count":0}'; exit 0; }

SHOW_ALL=false
STATUS_FILTER=""
REFRESH=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --all) SHOW_ALL=true; shift ;;
    --status) STATUS_FILTER="$2"; shift 2 ;;
    --refresh) REFRESH=true; shift ;;
    *) shift ;;
  esac
done

# Update status of running tasks
UPDATED=$(jq '[.[] |
  if .status == "running" then
    if (("/proc/" + (.pid|tostring)) | . as $p | try (input_filename | . != "") catch false) == false then
      .status = "completed"
    else . end
  else . end
]' "$TASKS_FILE" 2>/dev/null || cat "$TASKS_FILE")

# Actually check if PIDs are running
FINAL='[]'
while IFS= read -r task; do
  [ -z "$task" ] && continue
  pid=$(echo "$task" | jq -r '.pid')
  status=$(echo "$task" | jq -r '.status')

  if [ "$status" = "running" ]; then
    if ! kill -0 "$pid" 2>/dev/null; then
      # Process ended - mark as completed (can't determine exit code for non-child processes)
      task=$(echo "$task" | jq '.status = "completed"')
    fi
  fi

  # Calculate duration
  started=$(echo "$task" | jq -r '.started_at')
  if [ "$started" != "null" ]; then
    start_ts=$(date -d "$started" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$started" +%s 2>/dev/null || echo 0)
    now_ts=$(date +%s)
    duration=$((now_ts - start_ts))
    mins=$((duration / 60))
    secs=$((duration % 60))
    task=$(echo "$task" | jq --arg d "${mins}m ${secs}s" '. + {duration: $d}')
  fi

  FINAL=$(echo "$FINAL" | jq --argjson t "$task" '. += [$t]')
done < <(echo "$UPDATED" | jq -c '.[]')

# Save updated status
echo "$FINAL" | jq '.' > "$TASKS_FILE"

# Apply filters
if [ "$SHOW_ALL" = false ]; then
  FINAL=$(echo "$FINAL" | jq '[.[] | select(.status == "running")]')
fi

if [ -n "$STATUS_FILTER" ]; then
  FINAL=$(echo "$FINAL" | jq --arg s "$STATUS_FILTER" '[.[] | select(.status == $s)]')
fi

COUNT=$(echo "$FINAL" | jq 'length')
echo "$FINAL" | jq --argjson c "$COUNT" '{success:true, tasks:., count:$c}'
