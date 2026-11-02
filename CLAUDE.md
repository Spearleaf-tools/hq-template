# HQ

Projects, tasks and EOS for a team (Cloudflare Worker + D1). Everything you need is in README.md: setup, how saving
works, sign-in, running it locally, deploying, backups.

- Settings live in `wrangler.jsonc` `vars` (company name, logo, allowed domains, admins, Google client ID). Never
  hard-code a company name, domain or email in `public/` or `src/`; read it from `CONFIG` (the app) or `env` (the Worker).
- Before you finish a change, run `node test/e2e.mjs http://127.0.0.1:8798` against `wrangler dev` (empty local DB,
  `.dev.vars` copied from `.dev.vars.example`, started with `--local-upstream 127.0.0.1:8798`) and read the phone
  screenshots in `test/out/`.
- New fields: add the column in a new migration AND to `TABLES` in `src/data.js` (the sync refuses unknown fields).
- Secrets go in `wrangler secret put`, never in `wrangler.jsonc`.
- The team's data lives in the D1 database, not in git.
