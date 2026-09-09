# Hero Shield Insurance — agent notes

Before running or debugging this app, read [CONTRIBUTING.md](CONTRIBUTING.md)
and [SETUP.md](SETUP.md). The app needs **Auth0**, **Neon `DATABASE_URL`**, and
the **Vercel AI Gateway** (`AI_GATEWAY_API_KEY` or a `VERCEL_OIDC_TOKEN` from
`vercel env pull`). Provision the database with the **Neon MCP server** rather
than the console. [README.md](README.md) explains what the app actually does.

Never echo `.env.local` values into chat, commits, or PR descriptions.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
