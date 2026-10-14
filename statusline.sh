#!/bin/bash
# Claude Code statusline: context window + 5h/7d usage quotas, as progress bars.
# Reads the per-turn status JSON Claude Code pipes to stdin. See:
# https://docs.claude.com/en/docs/claude-code/statusline

input=$(cat)

GREEN=$'\033[32m'
YELLOW=$'\033[33m'
RED=$'\033[31m'
RESET=$'\033[0m'

bar() {
  local pct=$1 width=10 filled empty out i
  filled=$(( (pct * width + 50) / 100 ))
  (( filled > width )) && filled=$width
  (( filled < 0 )) && filled=0
  empty=$(( width - filled ))
  out=""
  for ((i = 0; i < filled; i++)); do out+="█"; done
  for ((i = 0; i < empty; i++)); do out+="░"; done
  printf '%s' "$out"
}

color() {
  local pct=$1
  if (( pct >= 80 )); then printf '%s' "$RED"
  elif (( pct >= 50 )); then printf '%s' "$YELLOW"
  else printf '%s' "$GREEN"; fi
}

segment() {
  local label=$1 pct=$2
  printf '%s [%s%s%s] %d%%' "$label" "$(color "$pct")" "$(bar "$pct")" "$RESET" "$pct"
}

MODEL=$(printf '%s' "$input" | jq -r '.model.display_name // "Claude"')
CTX_PCT=$(printf '%s' "$input" | jq -r '(.context_window.used_percentage // 0) | round')
CTX_USED=$(printf '%s' "$input" | jq -r '.context_window.total_input_tokens // 0')
CTX_SIZE=$(printf '%s' "$input" | jq -r '.context_window.context_window_size // 200000')
CTX_USED_K=$(( (CTX_USED + 500) / 1000 ))
CTX_SIZE_K=$(( (CTX_SIZE + 500) / 1000 ))

OUT="$MODEL | $(segment Ctx "$CTX_PCT") (${CTX_USED_K}k/${CTX_SIZE_K}k)"

FIVE_PCT=$(printf '%s' "$input" | jq -r 'if .rate_limits.five_hour.used_percentage != null then (.rate_limits.five_hour.used_percentage | round) else "" end')
if [ -n "$FIVE_PCT" ]; then
  OUT="$OUT | $(segment 5h "$FIVE_PCT")"
fi

SEVEN_PCT=$(printf '%s' "$input" | jq -r 'if .rate_limits.seven_day.used_percentage != null then (.rate_limits.seven_day.used_percentage | round) else "" end')
if [ -n "$SEVEN_PCT" ]; then
  OUT="$OUT | $(segment 7d "$SEVEN_PCT")"
fi

printf '%s\n' "$OUT"
