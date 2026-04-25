---
description: Consult and update mcp-memory-service
alwaysApply: true
---
# Memory via mcp-memory-service
BEFORE responding about any person, project, or past event:
- Call memory_search FIRST.
- Never guess from training data â€” verify.

AT the end of your turn, store the session summary:
- Call memory_store_session with tags=["agent:{persona-name}", "story:{story-id}"],
  content="<what-happened, outputs, next-handoff>"

IF blocked mid-turn, store a block note:
- Call memory_store with tags=["blocked", "agent:{persona-name}"],
  content="<why>, need: <resolver>"
