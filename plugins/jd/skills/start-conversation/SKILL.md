---
name: start-conversation
description: Use at the start of every conversation and before any reply (including clarifying questions) to apply jamehd's baseline working conventions — English-only docs/code, no redundant code comments, and mirror the user's conversation language (reply in Vietnamese when the user writes Vietnamese).
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

### 2. No redundant comments — comment WHY, not WHAT
Do **not** add a comment when the code already states clearly what it does. Add a
comment only when it carries information the code cannot: a non-obvious reason, a
constraint, a gotcha, a link to context.

- ❌ `count++; // increment count`
- ❌ `// loop over users` above an obvious `for user in users:`
- ✅ `// API caps page size at 100; chunk to stay under it`

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
