---
name: Gemini model availability
description: Model compatibility constraint for the project's direct Gemini credential.
---

Use `gemini-3.6-flash` for new direct Gemini advisor calls in this project.

**Why:** The configured credential returns a provider 404 for `gemini-2.5-flash`, explicitly directing callers to Gemini 3.6 Flash.

**How to apply:** Preserve the deterministic financial fallback for unavailable-model, quota, or malformed-response failures; update any new Gemini feature to a model confirmed by the provider rather than copying the legacy advisor's model name.