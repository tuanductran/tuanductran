#!/usr/bin/env bash
# PreToolUse hook for Edit/Write: blocks direct edits to README.md.
#
# README.md is generated output (src/build-readme.ts renders
# README.template.md via Mustache and writes README.md with Bun.write,
# invoked through Bash, not through the Edit/Write tools) — so this hook
# only ever needs to stop the Edit/Write tools specifically, never Bash.
# See CLAUDE.md's "Conventions" section for the same rule documented for
# humans; this is the machine-enforced version of it.
set -euo pipefail

file_path=$(python3 -c '
import json
import sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

print(data.get("tool_input", {}).get("file_path", ""))
')

case "$file_path" in
  */README.md | README.md)
    python3 -c '
import json

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            "README.md is generated output (src/build-readme.ts renders "
            "README.template.md). Edit README.template.md and the src/ "
            "generators instead, then run `bun run build`."
        ),
    }
}))
'
    ;;
  *)
    exit 0
    ;;
esac
