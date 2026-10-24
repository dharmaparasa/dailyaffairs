# Exam Affairs Daily (PWA)

React + TypeScript + Vite + vite-plugin-pwa. No backend, no analytics, no bundled key or demo news.

## Run
    npm install
    npm run dev        # local
    npm test           # 13 unit tests: IST dates, quota, validation, dedupe, JSON parsing, paging
    npm run build && npm run preview

## Get a Google API key
1. Open Google AI Studio (aistudio.google.com) > Get API key > create a key.
2. In Google Cloud Console > Credentials, restrict it: API = Generative Language API; Website restriction = your deployed URL.
3. Set a budget alert. Paste the key in the app: Settings > Save key > Test.
Model defaults to `gemini-2.5-flash` (editable in Settings). The app calls `generateContent` with the `google_search` tool.
Check ai.google.dev/gemini-api/docs/google-search for current supported models and pricing.

## How daily updates work
- On first open each IST day, if auto-fetch is on and no edition exists, ONE grounded request runs.
- "Re-verify today" is the only second request: it re-checks saved items with fresh searches. Hard cap: 2 per IST day.
- The counter increments before sending, so reloads, failures and double taps cannot add requests. An in-flight lock blocks concurrent calls. No retries.
- Test: open Settings > Test (not counted) > Fetch now. Reload repeatedly: no new calls. Used count shows in Settings.
- A PWA cannot guarantee background fetches when closed. Unattended updates need a separately hosted scheduler (e.g. a cron job calling Gemini and publishing JSON), which would need a server-held key.

## Verification pipeline (what the code enforces)
Model output must parse as JSON, carry search-grounding metadata, and each item must pass `validateItem`: known category, no placeholder text, evidence note, only https source URLs, `verified` needs two different source hosts, `official_only` needs a .gov.in/.nic.in/RBI/SEBI/ISRO/DRDO/ECI host, no `conflict` flag. Failures are dropped; near-duplicates merge. Failed calls never overwrite saved editions.
**Limit:** the code cannot prove a fact is true or that two hosts are truly independent, and URLs are model-supplied. Always glance at the source links.

## Pricing and security
- Search grounding is billed per search the model runs (one request may run several), and free-tier limits differ by model. See Google's pricing page.
- The key lives in this browser's localStorage (or sessionStorage if you untick Remember) and is sent only to Google, in a header. It is readable by anyone with device access or injected scripts. Restrict it and cap spend.

## Offline
App shell and all saved editions, bookmarks and search work offline. Fetching, key testing and source links need a connection.

## Deploy
### GitHub Pages
The included GitHub Actions workflow runs the tests, builds the app with the repository's Pages base path, and deploys `dist/` whenever changes are pushed to `main` (or when run manually).

1. In the repository, open **Settings > Pages** and set the build and deployment source to **GitHub Actions**.
2. Push to `main`, or run **Deploy to GitHub Pages** from the **Actions** tab.
3. Open the deployment URL shown in the workflow. The workflow also publishes a `404.html` fallback for static hosting.

The app uses a repository-scoped path on GitHub Pages and relative paths for local and other static-host builds. GitHub Pages serves the app over HTTPS, which is required for PWA installation. For Netlify, Vercel, or Cloudflare Pages, run `npm run build` and deploy the generated `dist/` directory.
