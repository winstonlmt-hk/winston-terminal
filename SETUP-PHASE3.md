<!-- SETUP-PHASE3.md – Winston Terminal v5 (Phase 3): the steps Winston does himself. Windows + browser only. -->
# Phase 3 setup – public data feeds + owner-only Live mode

**Time:** about 25 minutes. **Cost:** HK$0 (all free plans). **Tools:** a browser. No command line needed.

What you get:
- **Public site (everyone):** demo portfolio + real open data (HKMA, NY Fed, US Treasury, Fed, ECB, SEC, GDELT, headlines), refreshed by GitHub Actions 4× a day.
- **Live mode (only you):** real HK/US prices behind a passphrase, via your own Cloudflare Worker. The vendor keys live only in Cloudflare – never in the repo or the page.

You can stop after Part A: the public data works without Parts B–D.

---

## Part A – GitHub: switch on the data robot (≈ 8 min)

**1. Upload v5 to the repo.** Unzip `winston-terminal-v5.zip`. In the repo `winstonlmt-hk/winston-terminal` click **Add file → Upload files**, drag in everything from inside the unzipped folder, then **Commit changes**.
> ⚠ Drag-and-drop usually **skips the hidden `.github` folder**. Check that `.github/workflows/` exists in the repo. If it doesn't, create the two files by hand: **Add file → Create new file**, type the name `.github/workflows/feeds.yml` (typing the `/` makes the folders), paste in the contents of that file from the zip, and **Commit**. Then do the same for `.github/workflows/source-health.yml`.

**2. Let workflows write data.** Go to repo **Settings → Actions → General**. Under **Workflow permissions** choose **Read and write permissions**, then **Save**. (Leave "Allow all actions" on, which is the default.)

**3. Run it once.** Open the **Actions** tab. If you see "Workflows aren't being run on this repository", click **I understand my workflows, go ahead and enable them**. Click **Public feeds → Run workflow → Run workflow**. It takes 3–8 minutes. When it turns green, a new commit "data: public feeds snapshot …" appears, and about a minute later the header chip on the site shows the new time (`Data 05 Oct 18:23 HKT`).

**4. Tell the SEC who you are (recommended, 1 min).** The SEC blocks anonymous robots. Go to **Settings → Secrets and variables → Actions → Variables tab → New repository variable**. Name: `SEC_USER_AGENT`. Value: `Winston Leung your-email@example.com` (use your real email). This is a *variable*, not a secret, and it never appears on the site.
> Optional: a free FRED key adds US CPI. Get one at fred.stlouisfed.org → My Account → API Keys, then add it under the **Secrets** tab as `FRED_API_KEY`.

After this, the robot runs on its own at 06:41, 10:41, 14:41 and 18:23 HKT, and the health check runs every Monday at 09:07 HKT.

---

## Part B – Free price-data keys (≈ 5 min)

**5. EODHD (HK prices).** Sign up at **eodhd.com** (free plan). In your dashboard, copy your **API token**. Free plan = about 20 calls a day and 15-minute delayed prices, for your personal use only.

**6. Finnhub (US prices).** Sign up at **finnhub.io** (free). In your dashboard, copy your **API key**.

Keep both in your password manager. **Never paste them into GitHub or the site.**

---

## Part C – Cloudflare Worker: the private price gateway (≈ 10 min)

**7. Create a free Cloudflare account** at **dash.cloudflare.com/sign-up** and verify your email.

**8. Create the Worker.** In the dashboard: **Workers & Pages → Create → Create Worker** (the "Hello World" starter). Name it `winston-terminal-live` and click **Deploy**. If it asks you to pick a `workers.dev` subdomain, choose any name. Click **Edit code**, delete everything, paste the whole of `worker/worker.js` from the zip, and click **Deploy**.

**9. Make your passphrase hash.** Open your site, click the **○ DEMO DATA** pill (top bar), open **Make a passphrase hash**, type a passphrase of 12+ characters, and click **Make hash**. Copy the 64-character code. The hash is computed in your browser and nothing is sent anywhere. Save the passphrase itself in your password manager.

**10. Add the secrets.** In the Worker, go to **Settings → Variables and Secrets → Add**. Add these four, then click **Deploy**:

| Type | Name | Value |
|---|---|---|
| Secret | `EODHD_KEY` | your EODHD token (step 5) |
| Secret | `FINNHUB_KEY` | your Finnhub key (step 6) |
| Secret | `PASSPHRASE_HASH` | the hash from step 9 |
| Text | `ALLOWED_ORIGINS` | `https://winstonlmt-hk.github.io,null` |

Check: open `https://winston-terminal-live.<your-subdomain>.workers.dev/health` in your browser. You should see `"eodhd":true,"finnhub":true,"passphrase":true` (these are yes/no flags, never the keys).

---

## Part D – Connect the site (≈ 2 min)

**11. Paste the Worker URL.** On your site, click **○ DEMO DATA** (or go to **Rules & Settings → Live mode**). Paste `https://winston-terminal-live.<your-subdomain>.workers.dev`, then **Save URL**. This saves the URL in this browser only, so visitors still see "Live not configured".
> Want it on every device? In GitHub, open `config.js`, click the pencil, set `liveWorkerUrl: "https://…workers.dev"` and commit. The URL is not a secret (the passphrase protects it), but leaving it out of the repo keeps the Live button quiet for visitors.

**12. Go Live.** Click the pill, enter your passphrase, then click **Unlock Live**. The pill turns green (`● LIVE 14:32`) and the holdings recalculate with vendor prices, in memory only. **Exit Live** takes you back to demo prices. The session lasts 12 hours on that tab.

**Total: 12 steps (step 4 recommended; FRED and the config.js edit optional).**

---

## Alternative to step 8 (wrangler, needs Node.js on Windows)
```
cd worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put EODHD_KEY
npx wrangler secret put FINNHUB_KEY
npx wrangler secret put PASSPHRASE_HASH
```
`wrangler.toml` already sets the name, `main = "worker.js"` and `ALLOWED_ORIGINS`. For local testing, `npx wrangler dev` serves it at `http://localhost:8787`, and the site accepts that URL.

## Recheck these with your EODHD key (the free demo key can't see HK)
- **HK codes.** EODHD's documentation says HK tickers use 4 digits with leading zeros (`0700.HK`), which is what the Worker sends. Confirm in your browser: `https://eodhd.com/api/real-time/0700.HK?api_token=YOUR_TOKEN&fmt=json` should return a `close` price. Don't share that URL, because it contains your token.
- **Tokyo (`.TSE`), Korea (`.KO`), Taiwan (`.TW`).** These are used for value-chain names only. Check with `https://eodhd.com/api/exchanges-list/?api_token=YOUR_TOKEN&fmt=json` that Tokyo is `TSE`. Live mode currently prices only `.HK` (EODHD) and `.US` (Finnhub). Other markets show "not covered by the free plans".
- Whether the free plan counts a multi-ticker request as 1 call or as N calls: watch the EODHD dashboard's call counter after one Live refresh.

## If something goes wrong
- **Actions run is red on an HKMA step:** HKMA's gateway sometimes blocks bursts (HTTP 405/502). The run keeps the last good HKMA data and retries at the next schedule. Click **Re-run jobs** later.
- **"Live not configured":** no Worker URL is saved in this browser or in `config.js` (step 11).
- **"Worker unreachable":** the URL is wrong, or `ALLOWED_ORIGINS` is missing your site.
- **"Wrong passphrase":** redo step 9 and update `PASSPHRASE_HASH` (step 10). After 8 wrong tries, wait 10 minutes.
- **Scheduled runs stopped:** GitHub pauses schedules in repos with no activity for 60 days. Click **Enable workflow** on the Actions tab.

<!-- END OF FILE: SETUP-PHASE3.md -->
