---
name: AI integration model quirks
description: Non-obvious behaviours of the Replit AI-integrations OpenAI proxy models used in this project.
---
- The vision model spends part of `max_completion_tokens` on internal reasoning. With small caps (~400) the visible content comes back **empty** with no error — JSON parsing then silently yields empty results. Give vision/JSON calls ≥1024–2048 tokens.
- **Why:** the pin-scan "describe" stage silently returned `{}` for every photo until the cap was raised; the failure looked like a prompt problem, not a token problem.
- **How to apply:** any new chat.completions call in api-server that expects structured output — budget tokens generously and log `finish_reason` when content is empty.

- Text metadata alone cannot distinguish sibling pins in one collection (e.g. mystery-box sets share collection text). Pin identification needs reference-image comparison; every catalogue image applied via the dry-run report directly improves scan accuracy.
