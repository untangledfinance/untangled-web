#!/bin/bash
# Clean up completed task records and logs

TASKS_DIR="/tmp/bg_tasks"
TASKS_FILE="$TASKS_DIR/tasks.json"

[ -f "$TASKS_FILE" ] || { echo '{"success":true,"removed":0}'; exit 0; }

CLEAN_ALL=false
OLDER_THAN=60  # minutes

while [[ $# -gt 0 ]]; do
  case $1 in
    --all) CLEAN_ALL=true; shift ;;
    --older-than) OLDER_THAN="$2"; shift 2 ;;
    *) shift ;;
  esac
done

NOW=$(date +%s)
THRESHOLD=$((OLDER_THAN * 60))
REMOVED=0
REMOVED_IDS='[]'

# Process each non-running task
while IFS= read -r task; do
  [ -z "$task" ] && continue

  id=$(echo "$task" | jq -r '.id')
  status=$(echo "$task" | jq -r '.status')
  started=$(echo "$task" | jq -r '.started_at')
  log_file=$(echo "$task" | jq -r '.log_file')

  # Skip running tasks
  [ "$status" = "running" ] && continue

  # Check age
  if [ "$CLEAN_ALL" = false ]; then
    start_ts=$(date -d "$started" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$started" +%s 2>/dev/null || echo 0)
    age=$((NOW - start_ts))
    [ "$age" -lt "$THRESHOLD" ] && continue
  fi

  # Remove log file
  [ -f "$log_file" ] && rm -f "$log_file"

  REMOVED_IDS=$(echo "$REMOVED_IDS" | jq --arg id "$id" '. += [$id]')
  REMOVED=$((REMOVED + 1))
done < <(jq -c '.[]' "$TASKS_FILE")

# Update tasks file
for id in $(echo "$REMOVED_IDS" | jq -r '.[]'); do
  jq --arg id "$id" 'del(.[] | select(.id == $id))' "$TASKS_FILE" > "$TASKS_FILE.tmp" \
    && mv "$TASKS_FILE.tmp" "$TASKS_FILE"
done

jq -n \
  --argjson removed "$REMOVED" \
  --argjson ids "$REMOVED_IDS" \
  '{success:true, removed:$removed, task_ids:$ids}'
