---
name: OpenAPI URL parameters
description: OpenAPI URL query schema compatibility with the workspace's Zod 3 code generator.
---

Avoid `format: uri` on OpenAPI URL query parameters in this workspace. Define them as plain strings and validate the required HTTPS format in the server route.

**Why:** The generated Zod code calls `zod.url()` for `format: uri`, but the workspace uses Zod 3, where that API is unavailable and the library typecheck fails after code generation.

**How to apply:** For URL-like query fields, use `type: string` in the API spec, then check protocol and normalization in the route before calling external services.