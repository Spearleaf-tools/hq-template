# HQ

One place for your team's projects, tasks and EOS (Vision, 1-Year Plan, Rocks, Scorecard, Issues, the weekly
meeting and History). It runs on Cloudflare: one Worker plus a D1 database. Your team signs in with Google.

Made by [Spearleaf](https://spearleaf.com) for its own team, shared as a starting point for yours. Free to use,
change and share under the MIT license (see `LICENSE`).

- `public/`: the app (plain HTML, CSS and JS, no build step)
- `src/`: the Worker. `auth.js` handles sign-in, `data.js` handles loading and saving, `index.js` routes requests.
- `migrations/`: the database layout
- `wrangler.jsonc`: your settings (company name, logo, who can sign in, where it lives)

## What you need

- A free [Cloudflare](https://dash.cloudflare.com/sign-up) account. To use your own address (hq.yourcompany.com),
  your domain must be on that account; without one, the app runs at a free `workers.dev` address.
- A Google account on your company domain (Google Workspace) to set up sign-in.
- [Node.js](https://nodejs.org) 20 or newer on your computer.

## Set it up (about 30 minutes)

1. **Download and install.**
   ```bash
   git clone https://github.com/Spearleaf-tools/hq-template.git hq
   cd hq
   npm install
   npx wrangler login
   ```
2. **Fill in your settings.** Open `wrangler.jsonc` and change everything marked CHANGE: your company name,
   email domain, admin email and the address the app will live at. `npx wrangler whoami` shows your account id.
3. **Create the database.**
   ```bash
   npx wrangler d1 create hq
   ```
   Copy the `database_id` it prints into `wrangler.jsonc`, then build the tables:
   ```bash
   npm run db:remote
   ```
4. **Set up Google sign-in.**
   - Go to [Google Cloud Console](https://console.cloud.google.com), create a project (any name, e.g. "HQ").
   - APIs & Services > OAuth consent screen: choose **Internal** (only your company's accounts), fill in the app
     name and your email.
   - APIs & Services > Credentials > Create credentials > **OAuth client ID** > Web application.
   - Authorized JavaScript origins: `https://hq.yourcompany.com` (your real address).
   - Authorized redirect URIs: `https://hq.yourcompany.com/auth/google`.
   - Copy the **Client ID** into `GOOGLE_CLIENT_ID` in `wrangler.jsonc`. You don't need the client secret.
5. **Put it online.**
   ```bash
   npm run deploy
   ```
   Open your address and sign in. The first person to sign in becomes an admin, and so does anyone in
   `ADMIN_EMAILS`. Everyone else on your domain can sign in and shows up on the Team page the first time they do.

## Make it yours

- **Name:** `COMPANY_NAME` in `wrangler.jsonc`.
- **Logo:** put your logo file in `public/` (SVG or PNG, wide rather than tall), then set `LOGO` to its path,
  e.g. `"/logo.svg"`. Without a logo the menu shows your company name.
- **Colors:** the color list at the top of `public/app.css` (`:root`), plus the glow color in the "Default look"
  section further down.
- **Icons:** `public/favicon.svg` and `public/icon-*.png` (the browser tab and the phone home-screen icon).

Run `npm run deploy` after any change.

## How saving works

The app keeps a copy of the data. After every change it works out which rows changed and posts them to
`/api/sync`, which saves them as one D1 batch, so a change either saves completely or not at all. The screen
shows "Saving…", "All changes saved" or "Didn't save". A failed save keeps the work on screen and retries.
Every 20 seconds, when nobody is typing, the app reloads so teammates see each other's changes.
Who can change what is decided in `src/data.js` (`check`). Admins alone can close quarters and years,
correct closed quarters, archive projects, and change roles or deactivate people.

## Sign-in

- **Google** (the real way in): any Google account on `ALLOWED_DOMAINS`, plus anything in `ALLOWED_EMAILS`.
  It uses redirect mode, which works on phones and inside in-app browsers.
- **Preview code** (for testing): on only while the `PREVIEW_CODE` secret is set
  (`npx wrangler secret put PREVIEW_CODE`). Remove it when you're done: `npx wrangler secret delete PREVIEW_CODE`.
- **Developer sign-in**: only with `DEV_LOGIN=1` (in `.dev.vars`) and only on localhost.
- Sessions last 30 days, in a signed cookie. Deactivated people are signed out on their next request.

## Run it on your computer

```bash
cp .dev.vars.example .dev.vars   # local settings: developer sign-in on, example.com addresses allowed
npm run db:local                 # create the local database
npx wrangler dev --port 8798 --ip 127.0.0.1 --local-upstream 127.0.0.1:8798
# open http://127.0.0.1:8798 and use "Developer sign-in" with any @example.com address
node test/e2e.mjs http://127.0.0.1:8798   # full check (needs Google Chrome): every flow, reloads, admin rules, phone widths
```

`--local-upstream` matters: without it wrangler sends requests in as your live address and the developer sign-in
hides. The test writes screenshots to `test/out/`. Start it from an empty local database: it creates its own data.

## Changing the app

- New fields: add the column in a new file in `migrations/` AND to `TABLES` in `src/data.js` (the save step
  refuses fields it doesn't know). Then `npm run db:remote` and `npm run deploy`.
- Secrets go in `npx wrangler secret put NAME`, never in `wrangler.jsonc`.

## Backups

D1 keeps 30 days of point-in-time restore: `npx wrangler d1 time-travel restore hq --timestamp=<when>`.
For a file copy: `npx wrangler d1 export hq --remote --output=backup.sql`.
