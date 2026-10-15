#!/bin/bash
# Claude Code statusline: context window + 5h/7d usage quotas, as progress bars.
# Reads the per-turn status JSON Claude Code pipes to stdin. See:
# https://docs.claude.com/en/docs/claude-code/statusline

input=$(cat)

# Palette tuned for dark-background terminals. A statusline script only gets
# JSON on stdin — it can't query the terminal for its actual theme, so this
# is a fixed choice rather than an auto-detected one.
LIGHT=$'\033[97m'    # bright white — default color for plain/structural text
MAGENTA=$'\033[95m'  # bright magenta — repo name
BLUE=$'\033[94m'     # bright blue — git branch
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
RED=$'\033[31m'
RESET=$'\033[0m'
SEP=" | "

# Claude's brand color, 256-color rather than 24-bit true-color since
# 256-color support is close to universal while true-color isn't. Used for
# the model name/effort, and bold for the logo asterisk (the one exception
# to the "nothing is bold" rule below) so it reads as a mark rather than a
# stray character.
ORANGE=$'\033[38;5;166m'
LOGO_ORANGE=$'\033[1;38;5;166m'
LOGO="*"

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
  printf '%s [%s%s%s] %d%%' "$label" "$(color "$pct")" "$(bar "$pct")" "$LIGHT" "$pct"
}

MODEL=$(printf '%s' "$input" | jq -r '.model.display_name // "Claude"')
EFFORT=$(printf '%s' "$input" | jq -r '.effort.level // empty')
CTX_PCT=$(printf '%s' "$input" | jq -r '(.context_window.used_percentage // 0) | round')
CTX_USED=$(printf '%s' "$input" | jq -r '.context_window.total_input_tokens // 0')
CTX_SIZE=$(printf '%s' "$input" | jq -r '.context_window.context_window_size // 200000')
CTX_USED_K=$(( (CTX_USED + 500) / 1000 ))
CTX_SIZE_K=$(( (CTX_SIZE + 500) / 1000 ))

CWD=$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // empty')
REPO=$(printf '%s' "$input" | jq -r '.workspace.repo.name // empty')
if [ -z "$REPO" ] && [ -n "$CWD" ]; then
  REPO=$(basename "$CWD")
fi
BRANCH=""
[ -n "$CWD" ] && BRANCH=$(git -C "$CWD" branch --show-current 2>/dev/null)

DISPLAY_PATH=""
if [ -n "$CWD" ]; then
  case "$CWD" in
    "$HOME") DISPLAY_PATH="~" ;;
    "$HOME"/*) DISPLAY_PATH="~${CWD#"$HOME"}" ;;
    *) DISPLAY_PATH="$CWD" ;;
  esac
fi

GIT_INFO=""
[ -n "$REPO" ] && GIT_INFO="${MAGENTA}${REPO}${LIGHT}"
[ -n "$BRANCH" ] && GIT_INFO="${GIT_INFO:+$GIT_INFO:}${BLUE}${BRANCH}${LIGHT}"
[ -n "$GIT_INFO" ] && GIT_INFO="🌿 $GIT_INFO"

# Public IPv4 is a network call, so it's cached on disk and refreshed at most
# once per CACHE_TTL. A fetch failure keeps the last known-good value and
# still touches the cache file, so a flaky/offline network doesn't trigger a
# retry (and its ~1.5s timeout) on every single statusline render.
USERNAME=$(whoami 2>/dev/null)
IP_CACHE="${TMPDIR:-/tmp}/claude-statusline-public-ip"
IP_CACHE_TTL=300
IP_CACHE_AGE=$(( $(date +%s) - $(date -r "$IP_CACHE" +%s 2>/dev/null || stat -c %Y "$IP_CACHE" 2>/dev/null || echo 0) ))
if [ ! -f "$IP_CACHE" ] || (( IP_CACHE_AGE > IP_CACHE_TTL )); then
  FETCHED_IP=$(curl -s --max-time 1.5 -4 https://api.ipify.org 2>/dev/null)
  if printf '%s' "$FETCHED_IP" | grep -qE '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'; then
    printf '%s' "$FETCHED_IP" > "$IP_CACHE"
  else
    touch "$IP_CACHE"
  fi
fi
PUBLIC_IP=$(cat "$IP_CACHE" 2>/dev/null)

OUT1="${LIGHT}"
OUT1="$OUT1${ORANGE}${MODEL}"
[ -n "$EFFORT" ] && OUT1="$OUT1 - ${EFFORT}"
OUT1="$OUT1${LIGHT}"
if [ -n "$USERNAME" ] || [ -n "$PUBLIC_IP" ]; then
  OUT1="${OUT1}${SEP}"
  OUT1="${OUT1}💻 ${USERNAME}${PUBLIC_IP:+@$PUBLIC_IP}"
fi
[ -n "$DISPLAY_PATH" ] && OUT1="$OUT1${SEP}📁 ${LIGHT}${DISPLAY_PATH}"
[ -n "$GIT_INFO" ] && OUT1="$OUT1$SEP$GIT_INFO"

OUT2="${LIGHT}$(segment "Context window" "$CTX_PCT") (${CTX_USED_K}k/${CTX_SIZE_K}k)"

FIVE_PCT=$(printf '%s' "$input" | jq -r 'if .rate_limits.five_hour.used_percentage != null then (.rate_limits.five_hour.used_percentage | round) else "" end')
if [ -n "$FIVE_PCT" ]; then
  OUT2="$OUT2$SEP$(segment "Session (5h)" "$FIVE_PCT")"
fi

SEVEN_PCT=$(printf '%s' "$input" | jq -r 'if .rate_limits.seven_day.used_percentage != null then (.rate_limits.seven_day.used_percentage | round) else "" end')
if [ -n "$SEVEN_PCT" ]; then
  OUT2="$OUT2$SEP$(segment "Weekly (7d)" "$SEVEN_PCT")"
fi

printf '%s%s%s %s%s\n  %s%s\n' "$LOGO_ORANGE" "$LOGO" "$RESET" "$OUT1" "$RESET" "$OUT2" "$RESET"
