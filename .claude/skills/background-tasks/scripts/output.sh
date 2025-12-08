#!/bin/bash
# Get output from a background task

TASKS_DIR="/tmp/bg_tasks"
TASKS_FILE="$TASKS_DIR/tasks.json"

[ -f "$TASKS_FILE" ] || { echo '{"success":false,"error":"No tasks found"}' >&2; exit 1; }

TASK_ID=""
TASK_NAME=""
TAIL_LINES=""
FILTER=""
FOLLOW=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --id) TASK_ID="$2"; shift 2 ;;
    --name) TASK_NAME="$2"; shift 2 ;;
    --tail) TAIL_LINES="$2"; shift 2 ;;
    --filter) FILTER="$2"; shift 2 ;;
    --follow) FOLLOW=true; shift ;;
    *) shift ;;
  esac
done

# Find task
if [ -n "$TASK_ID" ]; then
  TASK=$(jq --arg id "$TASK_ID" '.[] | select(.id == $id)' "$TASKS_FILE")
elif [ -n "$TASK_NAME" ]; then
  TASK=$(jq --arg n "$TASK_NAME" '.[] | select(.name == $n)' "$TASKS_FILE")
else
  echo '{"success":false,"error":"Provide --id or --name"}' >&2
  exit 1
fi

if [ -z "$TASK" ] || [ "$TASK" = "null" ]; then
  echo '{"success":false,"error":"Task not found"}' >&2
  exit 1
fi

LOG_FILE=$(echo "$TASK" | jq -r '.log_file')
TASK_ID=$(echo "$TASK" | jq -r '.id')
TASK_NAME=$(echo "$TASK" | jq -r '.name')
STATUS=$(echo "$TASK" | jq -r '.status')

if [ ! -f "$LOG_FILE" ]; then
  echo '{"success":false,"error":"Log file not found"}' >&2
  exit 1
fi

# Follow mode (streaming)
if [ "$FOLLOW" = true ]; then
  tail -f "$LOG_FILE"
  exit 0
fi

# Get output
if [ -n "$TAIL_LINES" ]; then
  OUTPUT=$(tail -n "$TAIL_LINES" "$LOG_FILE")
else
  OUTPUT=$(cat "$LOG_FILE")
fi

# Apply filter
if [ -n "$FILTER" ]; then
  OUTPUT=$(echo "$OUTPUT" | grep -E "$FILTER" || true)
fi

LINE_COUNT=$(echo "$OUTPUT" | wc -l)

# Escape output for JSON
OUTPUT_JSON=$(echo "$OUTPUT" | jq -Rs '.')

jq -n \
  --arg id "$TASK_ID" \
  --arg name "$TASK_NAME" \
  --arg status "$STATUS" \
  --argjson output "$OUTPUT_JSON" \
  --argjson lines "$LINE_COUNT" \
  '{success:true, id:$id, name:$name, status:$status, output:$output, lines:$lines}'
