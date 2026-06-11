---
description: Apply jamehd's baseline working conventions — English-only docs/code, no redundant code comments, and mirror the user's conversation language (Vietnamese in → Vietnamese out).
---

# Start Conversation — Baseline Conventions

Invoke the `jd:start-conversation` skill.

Steps:
1. Load the `jd:start-conversation` skill via the Skill tool.
2. Keep its three rules active for the rest of the session:
   - English for all docs and source code.
   - No redundant comments — comment WHY, not WHAT.
   - Mirror the user's conversation language (reply in Vietnamese when the user writes Vietnamese).
3. The user's explicit instructions always take precedence over these defaults.
