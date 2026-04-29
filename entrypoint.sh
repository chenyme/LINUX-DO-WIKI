#!/bin/sh

set -e

replace_placeholder() {
  local placeholder="$1"
  local real_value="$2"

  if [ -z "$real_value" ]; then
    echo "⚠️ WARNING: Environment variable for placeholder '${placeholder}' is not set. Skipping replacement."
    return 0
  fi

  echo "🔍 Replacing placeholder '${placeholder}' with value '${real_value}'"

  local escaped
  escaped=$(printf '%s\n' "$real_value" | sed 's/[&/\]/\\&/g')

  local count
  count=$(grep -rl "$placeholder" /app/.next | wc -l)

  if [ "$count" -eq 0 ]; then
    echo "⚠️  WARNING: placeholder '${placeholder}' not found in any file"
  else
    grep -rl "$placeholder" /app/.next | xargs sed -i "s|${placeholder}|${escaped}|g"
    echo "✅ Replaced '${placeholder}' in ${count} file(s)"
  fi
}

replace_placeholder "__NEXT_PUBLIC_BASE_URL__"  "$NEXT_PUBLIC_BASE_URL"
replace_placeholder "__OAUTH_CLIENT_ID__"  "$OAUTH_CLIENT_ID"
replace_placeholder "__OAUTH_CLIENT_SECRET__"  "$OAUTH_CLIENT_SECRET"

exec "$@"
