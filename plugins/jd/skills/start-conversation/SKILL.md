---
name: start-conversation
description: Use at the start of every conversation and before any reply (including clarifying questions) to apply jamehd's baseline working conventions — English-only docs/code, no code comments by default (only WHY the code cannot say), and mirror the user's conversation language (reply in Vietnamese when the user writes Vietnamese).
---

# Start Conversation — Baseline Conventions

Baseline rules that apply to **every** task in **every** conversation, unless the
user's explicit instructions override them. These are conventions, not a
workflow — keep them active in the background the whole session.

## The Rules

### 1. English for docs and source code — ALWAYS
All documentation and source code (identifiers, code comments, commit messages,
README/markdown, log strings) MUST be written in **English**, regardless of the
conversation language. Code is read by many people and tools; English keeps it
portable and reviewable.

- ✅ `// retry once on transient network failure`
- ❌ `// thử lại một lần khi lỗi mạng tạm thời`

### 2. Default: no comment — comment only WHY the code cannot say
Write code with **no comments by default**. Add one only for a constraint, gotcha,
or reason the code cannot express: a limit of an external system, a non-obvious
"why this way", a deliberate oddity someone might "fix", a link to the issue or spec.
Never add a comment that describes what the code does.

Always forbidden:

- Restating the code: `count++; // increment count`, `// loop over users` above `for user in users:`
- Section banners: `// ---- helpers ----`, `# ===== Constants =====`
- Change history: `// changed X to Y`, `// fixed bug #12`, `// new version` — that belongs in the commit message
- Docstrings that only repeat the name and parameters: `/** Gets the user. @param id the id */`
- Commented-out code — delete it; git keeps the history

Allowed:

- ✅ `// API caps page size at 100; chunk to stay under it`
- ✅ `// legacy MySQL stores local time (Asia/Ho_Chi_Minh), not UTC`
- ✅ Tool directives and legal headers: `//go:build`, `// eslint-disable-next-line <rule>`, `# type: ignore[...]`, license headers
- ✅ Public API docs where the project's language or linter requires them, written to add meaning beyond the signature

When you edit a file, delete forbidden comments **in the lines you are already
changing**; leave the rest of the file alone so the diff stays focused.

If you find yourself restating the code in words, delete the comment.

### 3. Mirror the user's conversation language
Detect the language the user writes in the **conversation** and reply in that
same language:

- User writes **Vietnamese** → reply in **Vietnamese**.
- User writes **English** → reply in English.

This applies only to conversational prose. It does **NOT** relax Rule 1 — docs and
code stay English even when the chat is in Vietnamese.

## Quick Reference

| Surface | Language |
|---|---|
| Conversation / chat reply | Mirror the user (Vietnamese in → Vietnamese out) |
| Source code, identifiers, code comments | English |
| Docs, README, markdown, commit messages, logs | English |

## Precedence

The user's explicit instructions always win. If the user asks for Vietnamese
comments in a specific file, do that for that file — then return to the baseline.
