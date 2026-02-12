#!/bin/bash
# bankr-trade.sh — Submit a trade to Bankr and wait for completion
# Usage: ./bankr-trade.sh "Swap all my WETH for RIPS on Base"
#
# Requires: BANKR_API_KEY env var or ~/.clawdbot/skills/bankr/config.json

set -e

PROMPT="$1"
if [ -z "$PROMPT" ]; then
  echo "Usage: $0 \"<natural language trade prompt>\""
  exit 1
fi

# Load API key
if [ -z "$BANKR_API_KEY" ]; then
  CONFIG_FILE="${HOME}/.clawdbot/skills/bankr/config.json"
  if [ -f "$CONFIG_FILE" ]; then
    BANKR_API_KEY=$(cat "$CONFIG_FILE" | grep -o '"apiKey"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"apiKey"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
  fi
fi

if [ -z "$BANKR_API_KEY" ]; then
  echo "Error: No API key found. Set BANKR_API_KEY or create ~/.clawdbot/skills/bankr/config.json"
  exit 1
fi

API_URL="${BANKR_API_URL:-https://api.bankr.bot}"

# Submit job
RESPONSE=$(curl -s -X POST "${API_URL}/agent/jobs" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${BANKR_API_KEY}" \
  -d "{\"prompt\": $(echo "$PROMPT" | jq -Rs .)}")

JOB_ID=$(echo "$RESPONSE" | jq -r '.jobId // empty')
if [ -z "$JOB_ID" ]; then
  echo "Failed to submit job: $RESPONSE"
  exit 1
fi

echo "Job submitted: $JOB_ID"
echo "Polling for results..."

# Poll until complete (max 120 seconds)
MAX_WAIT=120
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  sleep 5
  WAITED=$((WAITED + 5))

  STATUS=$(curl -s "${API_URL}/agent/jobs/${JOB_ID}" \
    -H "x-api-key: ${BANKR_API_KEY}")

  JOB_STATUS=$(echo "$STATUS" | jq -r '.status // "unknown"')

  if [ "$JOB_STATUS" = "completed" ]; then
    echo "✓ Job completed"
    echo "$STATUS" | jq '.'
    exit 0
  elif [ "$JOB_STATUS" = "failed" ] || [ "$JOB_STATUS" = "error" ]; then
    echo "✗ Job failed"
    echo "$STATUS" | jq '.'
    exit 1
  fi
done

echo "✗ Timed out after ${MAX_WAIT}s"
echo "Check manually: ${API_URL}/agent/jobs/${JOB_ID}"
exit 1
