# Caro Calculator

A mobile-first single-page app for splitting a restaurant bill fairly between friends.
Runs entirely in the browser, deploys free to GitHub Pages.

**Status: Phase 3 complete** — bill entry, participants, assignment (shared link
or offline), and the final who-pays-what summary.

---

## Running it locally

You need Node.js 20+. If `node -v` doesn't work, install it with
[nvm](https://github.com/nvm-sh/nvm):

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 22
```

Then:

```bash
npm install     # once
npm run dev     # starts the dev server, prints a URL
```

Open the printed `http://localhost:5173/`. The dev server also prints a
**Network** URL (`http://192.168.x.x:5173/`) — open that on your phone while on
the same Wi-Fi to test the real mobile experience.

Other commands:

```bash
npm run build     # type-check + production build into dist/
npm run verify    # the maths checks (see "Verification" below)
npm run preview   # serve the production build locally
npm run lint      # oxlint
```

---

## How it works

### The money rule

**Every money value is stored as an integer number of minor units** — piastres
for EGP, cents for USD, fils for KWD. Nothing is ever stored as `12.34`.

This is not fussiness. Floating point can't represent `0.1` exactly, so
`0.1 + 0.2 === 0.30000000000000004`. Add up thirty receipt lines that way and
the shares stop summing to the bill total. Working in integers makes every sum
exact, and rounding happens once, deliberately, at the point of display.

Any field holding minor units is named `...Minor` so this is impossible to
forget. Switching currency rescales every stored amount, because KWD has three
decimal places and EGP has two.

### Order of operations

Matching how Egyptian receipts are normally printed:

1. Items subtotal — `Σ (unit price × quantity)`
2. **−** discount → *net subtotal*
3. **+** service charge, calculated on the net subtotal
4. **+** tax, calculated on **(net subtotal + service)** by default

Step 4's base is controlled by the *"Tax is charged on the service charge too"*
checkbox, which appears only when it can matter (service is on **and** tax is a
percentage). A fixed tax amount is always used verbatim.

### The receipt cross-check

Typing the printed total into *"Total printed on the receipt"* compares it with
the app's own maths and shows the difference. When they disagree, the app also
offers a one-tap **"Set service to X to match"** — it solves for the service
charge that would reconcile the two, which handles the common case of the
restaurant rounding its service line differently. If no non-negative service
charge can reconcile them, it says so instead, because that means a genuine
data-entry error is hiding in the items.

### Participants, party size, and the split basis

A participant is a **payer**, not a person. Caro dining with two guests is one
participant with a party size of 3 — Caro picks the food and settles for all
three. This distinction is why the app tracks two different counts: how many
people are paying (entries) and how many mouths were at the table (heads).

Which one matters depends on the cost:

| Cost | Divided by |
|---|---|
| Items someone claimed | that person, in full |
| Shared / unclaimed items | the **split basis** setting |

The split basis is a per-bill toggle:

- **Per person** (default) — divide by total headcount, then charge each entry
  for its party size. Caro's family covers 3 shares of the mezze.
- **Per entry** — divide by the number of names, ignoring party size.

The setting screen shows what the choice does to the shared items actually on
the current bill, in money, rather than describing the rule abstractly.

One participant is the **organizer** (⭐). The first person added gets the badge,
and any other can be promoted with one tap. Beyond being a label, the organizer
is where leftover piastres land when a share doesn't divide evenly — that is
what lets the individual shares sum to the bill total exactly.

Two participants may not share a name. In Phase 3 people pick themselves off a
list on their own phone, and two entries called "Caro" would be a coin flip, so
the form rejects the duplicate and asks for something distinguishing.

### Bilingual + RTL

There is no i18n library — just two dictionaries (`src/i18n/en.ts`, `ar.ts`) and
a `t()` function. `ar.ts` is typed against `en.ts`, so a missing Arabic string
is a build error rather than a mystery blank on screen.

Switching to Arabic sets `<html dir="rtl">`. All layout CSS uses **logical**
properties (`margin-inline-start`, `inset-inline-end`) rather than left/right,
so the whole interface mirrors correctly with no per-screen work.

Number input accepts Arabic-Indic digits (`١٢٫٥٠`) as well as Western ones.
Amounts are *displayed* in Western digits in both languages, which is what
prices are actually read in day to day.

### Getting items onto people

Two modes, one data structure. Both write to `bill.claims`, so the maths and
the summary do not know or care which was used, and you can switch between them
halfway through a bill.

**Option A — shared link.** The organizer publishes the bill to Firestore and
sends `…/#/b/<id>` round on WhatsApp. Each person opens it, taps their name
once (remembered per bill), picks what they had, and saves. Selections stream
back live.

**Option B — organizer assigns.** The organizer taps through the items on their
own device. No network, no Firebase, no link. This is the fallback whenever the
restaurant Wi-Fi is bad, and it is the only mode available if you never set up
Firebase at all.

Either way, quantities are capped at what is genuinely left — the ordered
quantity minus what everyone *else* has claimed — so the group cannot between
them claim four of three steaks. Your own claim never counts against your own
ceiling, so you can always increase your own portion back up.

### Concurrency, and why claims are stored per person

Claims live at `bills/{billId}/claims/{participantId}` — one document each —
not as one big object on the bill. Six friends tapping at the same moment write
six different documents and cannot clobber each other. The local shape
(`claims[participantId][itemId]`) mirrors that deliberately.

Two people *can* still grab the last portion simultaneously. Rather than
letting that inflate the bill, `computeShares` caps the line at what was
actually ordered, splits its cost between the claimers in proportion to what
they asked for, and raises an **over-claimed** warning naming the item. The
bill still reconciles; a human just needs to settle who really ate it.

### The exactness guarantee

**The shares always sum to the bill total, to the piastre.** This is the one
property the whole app rests on, and it is not obvious: 100.00 split three ways
is 33.333… each, and rounding each share independently gives 99.99.

Every division therefore goes through `src/lib/allocate.ts`, which floors each
part and hands the leftover units to one nominated person — the organizer, as
requested. Four allocations happen per bill (communal items, discount, service,
tax), so the organizer absorbs at most a few piastres in total. In exchange,
every number on the summary screen adds up, including the per-person
breakdowns.

Verified by `npm run verify`, which runs 5,000 randomized bills — random party sizes, prices, quantities,
deliberate over-claims, percentage and fixed charges, both split settings — all
of which reconcile exactly. `allocate` also handles the degenerate cases:
nobody nominated (falls back to largest-remainder), all weights zero (falls
back to an even split), and an absorber who ate nothing (skipped, so nobody is
ever charged a negative amount).

### Tips, and why they sit outside the bill

A tip is a fourth charge next to discount, service and tax — a percentage of
the food after discount, or a fixed amount.

It is deliberately **not** part of `calculatedTotal`. The receipt cross-check on
the Bill tab compares our maths against what the restaurant printed, and a tip
is money they never printed. Folding it in would make every correctly-entered
bill look like a mismatch. So `BillTotals` carries the printed bill
(`calculatedTotalMinor`) and the tip (`tipsMinor`) separately, with
`payableTotalMinor` as the sum.

### Rounding each share up

Optionally, every person's share is rounded **up** to a whole 1, 5 or 10
currency units — so nobody is counting out coins at the table.

Two things make this safe:

- It is applied **after** each person's exact share is known, so the underlying
  split stays fair and only the final handover is tidied.
- **Every piastre collected goes to the tip.** Nobody is quietly overcharged;
  the surplus lands somewhere it was always going to end up.

A zero share stays zero — someone who ate nothing is not charged 5 EGP for the
privilege. The step is stored in *major* units, so switching currency keeps it
meaningful (5 means five of whatever this is: 500 piastres, or 5000 fils).

This extends the exactness guarantee rather than replacing it. The invariant
becomes: **what everyone hands over equals the bill plus the tip, exactly**, and
the restaurant is never short-changed. Fuzzed over another 5,000 random bills.

### Order of the money

1. Each person pays for what they claimed.
2. Shared items **and anything unclaimed** are divided by the Phase 2 split
   basis (per head or per name). Unclaimed leftovers are flagged separately on
   the summary, and the organizer can hand one to a person instead with the
   *Give to…* dropdown — for when someone simply forgot to tick their dessert.
3. The discount is spread in proportion to each person's food.
4. Service, tax and the tip are spread by the **Dividing tax & service**
   setting: *By what you ate* (default) or *Equally*.
5. Each person's total is rounded up, if that is switched on, with the surplus
   added to the tip.

### Scanning a receipt

Photograph the bill and the items fill themselves in. Firebase AI Logic brokers
the call to Gemini, so **no model API key ships in the bundle** — which is what
normally makes OCR impossible in a static site.

The design rests on one observation: **this app already had the perfect check
for OCR output.** The Bill tab asks for the total printed on the receipt and
warns when the items do not add up to it. So the scan extracts the line items
*and* the printed total; if the model drops a line, the existing cross-check
says so, with the exact difference, before any money is divided.

That is what makes roughly-85%-accurate extraction genuinely useful. The
organizer is never asked to trust it — only to glance at a green tick.

Consequences of that, all deliberate:

- **Nothing reaches the bill unreviewed.** Extraction lands on an editable
  sheet. Rows the model reported low confidence on are visually flagged.
- **Merges, never replaces** — so a second photo of a long receipt adds to what
  is there.
- The photo is **downscaled on-device** (1600px long edge, JPEG) before upload.
  A raw 12 MP photo is slow on mobile data and buys no accuracy. Re-encoding
  also quietly solves iPhone HEIC.
- The photo is **never stored** — sent, read, discarded. It never enters
  Firestore or the shared bill. A one-time notice says so before the first
  photo leaves the device.
- Model ids are a **fallback list, not one pinned string**, because Google
  retires them on a schedule (Gemini 2.5 shuts down in October 2026). The first
  one that answers is remembered.
- The AI SDK is behind a dynamic `import()` — a 16 KB gzipped chunk that a
  hand-typed bill never downloads.

`src/lib/receipt.ts` — which turns the model's JSON into bill items — is pure,
with no network code, precisely so it can be tested against hostile input. See
the `receipt` suite.

### Installing it as an app

The app is a PWA: on a phone it can be installed to the home screen and then
opens without browser chrome.

- `public/manifest.webmanifest` — standalone display, icons generated from the
  logo including a maskable variant. `start_url` and `scope` are relative, so
  they work under the `/caro-calculator/` subpath without hard-coding it.
- `public/sw.js` — a hand-written service worker, forty lines, no build plugin.
  **Network-first for navigations**, so a deploy is picked up on the next visit
  rather than pinning users to a stale `index.html`; **cache-first for hashed
  assets**, which is safe because their filenames change every build. Firestore
  traffic is left entirely alone — caching live bill data would serve people
  stale claims.
- `src/components/InstallButton.tsx` — appears only on touch devices, and only
  when the app is not already installed. Chromium fires `beforeinstallprompt`,
  which we capture and replay on tap; its very existence is the "not installed"
  signal. iOS Safari has no such API and no programmatic install at all, so
  there the button explains *Share → Add to Home Screen* rather than pretending.

A side benefit of the service worker: the organizer's offline mode now really
is offline. The app shell opens with no signal at all.

### Routing

Hash routing (`…/#/b/<id>`), not real paths. The part after `#` never reaches
the server, so a shared link cannot 404 on GitHub Pages no matter how Pages is
configured — no `404.html` trick required. The whole router is 40 lines in
`src/router.tsx`; two destinations did not justify a routing library.

Bill ids are 20 hex characters (80 bits). With no logins, knowing the id *is*
the credential, so it must not be guessable.

### Branding

White and orange, light only — there is deliberately **no** `prefers-color-scheme`
override, so the app looks the same whatever the phone's system theme is set to.
Every colour comes from a variable at the top of `src/styles.css`; changing
`--accent` re-themes the whole app.

Warning banners are **red**, not the usual amber, because amber sits too close
to the brand orange to register as "something is wrong".

The logo (`src/components/GirlLogo.tsx`) is inline SVG using `currentColor`, so
it inherits the brand colour and stays sharp at any density. `public/favicon.svg`
is the same drawing with the orange hard-coded, since a favicon has no CSS
context to inherit from — if you change `--accent`, change the favicon too.

### Persistence

The bill is mirrored into `localStorage` after every change, so closing the tab
or refreshing loses nothing. No account, no server — everything so far is fully
offline.

Saved bills carry a schema `version`. When the shape changes, `storage.ts`
**migrates** the old save forward instead of throwing it away, so a bill
half-entered before an app update is still there afterwards. Genuinely
unreadable data is discarded rather than crashing the app on load.

---

## Verification

```bash
npm run verify
```

Three suites in `tests/`, no test framework — each is a plain script that
prints PASS/FAIL lines, so the dependency list stays at zero and the output is
readable when something breaks at 1am after a dinner.

| Suite | Covers |
|---|---|
| `totals` | parsing (including Arabic-Indic digits and 3-decimal KWD), formatting, the Egyptian compound-VAT order, discounts, and the receipt-matching solver |
| `participants` | headcount vs entries, both split bases, and the localStorage schema migrations v1 → v2 → v3 including corrupt input |
| `shares` | weighted allocation, shared and unclaimed items, over-claim capping, proportional vs equal tax, and **5,000 randomized bills asserting the shares always sum to the bill total** |
| `receipt` | the model's JSON → bill items: malformed shapes, string prices, negative and absurd values, 500-row responses, plus **3,000 rounds of fuzz asserting no corrupt item can reach the bill** |
| `tips` | tip bases, the tip staying out of the receipt check, round-up arithmetic per currency, and **5,000 more randomized bills asserting handed-over === bill + tip** |

The deploy workflow runs these before building, so a change that would get
someone's share wrong cannot reach the live site.

## Project layout

```
src/
  types.ts               Bill / BillItem / Charge / Participant / Claims
  router.tsx             40-line hash router
  lib/
    money.ts             parsing, formatting, minor-unit conversion
    calc.ts              bill-level maths (subtotal, tax, service, discount)
    allocate.ts          weighted integer division that always sums exactly
    shares.ts            who owes what — the core of Phase 3
    firebase.ts          Firestore sync, lazily loaded
    receiptScan.ts       the Gemini call, lazily loaded
    receipt.ts           model JSON -> bill items (pure, heavily tested)
    image.ts             on-device downscale before upload
    share.ts             WhatsApp text, clipboard
    currencies.ts        supported currencies and their decimal places
    storage.ts           localStorage read/write + schema migrations
    id.ts                short ids, and unguessable bill ids
  i18n/
    en.ts  ar.ts         the two dictionaries
    index.tsx            provider, t(), direction switching
  state/
    BillContext.tsx      reducer holding the bill + autosave
    useRemoteSync.ts     organizer <-> Firestore, once published
  components/            GirlLogo, InstallButton, MoneyInput, QuantityStepper,
                         ClaimRow,
                         ItemForm, ItemList, ChargeEditor, TotalsPanel,
                         ParticipantForm, ParticipantList
  screens/
    BillEntry.tsx        Phase 1 — the receipt
    Participants.tsx     Phase 2 — who is paying
    Assign.tsx           Phase 3 — share a link, or assign it yourself
    ParticipantClaim.tsx Phase 3 — what a guest sees at #/b/<id>
    Summary.tsx          Phase 3 — who pays what, and sending it round
```

`lib/calc.ts`, `lib/allocate.ts` and `lib/shares.ts` have no React imports on
purpose — the maths stays independently readable and testable.

The Firebase SDK is behind dynamic `import()`, so the ~160 KB of Firestore is a
separate chunk that Option B never downloads. The main bundle is ~79 KB gzipped.

---

## Roadmap

- [x] **Phase 0** — stack: React + Vite + TypeScript, Firebase Firestore, hand-written CSS
- [x] **Phase 1** — bill entry: items, discount/service/tax, receipt cross-check
- [x] **Phase 2** — participants with party sizes, organizer, split basis
- [x] **Phase 3** — assignment (shared link or offline), summary, WhatsApp export
- [x] **Phase 4** — automatic deployment to GitHub Pages

---

# Setup, end to end

Two independent halves. **Part 1 gets the app online** — do this first and you
have a working bill splitter in offline mode. **Part 2 turns on the shared
link.** Nothing in part 1 depends on part 2.

Everything below is $0 with no credit card. Set your username once so the
commands can be pasted as-is:

```bash
export GH_USER=your-github-username
```

## Part 1 — Put it on GitHub Pages

### 1.1 Create the repository

Either with the GitHub CLI:

```bash
gh repo create caro-calculator --public --source=. --remote=origin --push
```

Or by hand: go to <https://github.com/new>, name it **`caro-calculator`**, set
it to **Public**, and do *not* tick "add a README" — then:

```bash
git remote add origin https://github.com/$GH_USER/caro-calculator.git
git push -u origin main
```

> **The repo must be public.** GitHub Pages on a private repository requires a
> paid plan. Public keeps this at $0. The repo holds no secrets — `.env` is
> gitignored, and the Firebase keys go into Actions secrets in part 2.

> **The name must be `caro-calculator`,** because `vite.config.ts` builds asset
> paths from it. To use a different name, change `REPO_NAME` at the top of
> `vite.config.ts` to match, and commit that.

### 1.2 Turn Pages on

1. Go to `https://github.com/$GH_USER/caro-calculator/settings/pages`
2. Under **Build and deployment → Source**, choose **GitHub Actions**
   (*not* "Deploy from a branch").

That is the only setting. The workflow in `.github/workflows/deploy.yml` does
the rest.

### 1.3 Watch the first deploy

```bash
gh run watch          # or open the Actions tab in the browser
```

It takes about a minute. When it goes green, your app is at:

**`https://$GH_USER.github.io/caro-calculator/`**

From now on every push to `main` redeploys automatically.

At this point the app fully works — enter a bill, add people, use **I'll
assign**, get the summary, send it on WhatsApp. Only the shared link is
missing.

## Part 2 — Turn on the shared link

### 2.1 Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with any Google
   account.
2. **Create a project** → name it `caro-calculator` → **Continue**.
3. Google Analytics: **turn it off**. You do not need it, and it asks for more
   consent than this app warrants.
4. **Create project**, wait, **Continue**.

You are on the **Spark** plan by default: free forever, no credit card, and it
never asks for one unless you deliberately upgrade.

### 2.2 Create the database

1. Left sidebar → **Build → Firestore Database → Create database**.
2. Location: **`eur3`** or **`europe-west1`** — closest to Egypt, so the app
   feels quicker. *This cannot be changed later.*
3. Start in **production mode** (locked down). You paste proper rules next.
4. **Create**.

### 2.3 Paste the security rules

Open the **Rules** tab, replace everything with the contents of
[`firestore.rules`](./firestore.rules) from this repo, and **Publish**.

```bash
cat firestore.rules      # then copy/paste into the console
```

These rules confine all access to `/bills`, require every document to carry an
expiry, cap document sizes so nobody can burn your quota, and forbid clients
from deleting anything.

### 2.4 Retention — read this, but there is nothing to do

Every document the app writes carries an `expiresAt` timestamp 90 days out,
ready for a Firestore TTL policy to delete it automatically.

**You cannot turn TTL on with a free account.** Configuring a TTL policy calls
the Firestore Admin API, which refuses with
`403: Project ... has billing disabled` unless the project is on the paid Blaze
plan. This is a Google restriction, not a setting you have missed.

So on the Spark plan, published bills stay on the server until you remove them.
Your options:

- **Do nothing.** A bill is ~2 KB against a 1 GB free tier — about 500,000
  bills. Storage will never be the problem. The only cost is that old dinners
  remain retrievable by anyone holding their link.
- **Delete bills you care about by hand** in the Firestore console:
  Firestore Database → Data → `bills` → pick the document → Delete. Remember to
  delete its `claims` subcollection too.
- **Upgrade to Blaze later** if you ever want it automated. Blaze still costs
  $0 at this usage — it just requires a card on file. The `expiresAt` fields
  are already being written, so TTL would start working on existing bills the
  moment you enabled it, with no code change.

To change the 90-day window, edit `RETENTION_DAYS` in `src/lib/firebase.ts`.

### 2.5 Get your six keys

1. Click **⚙ gear → Project settings**.
2. Scroll to **Your apps** → click the web icon **`</>`**.
3. Nickname `web`, leave "Also set up Firebase Hosting" **unticked** (you are
   using GitHub Pages) → **Register app**.
4. You now see a `firebaseConfig` block. Keep this tab open.

```js
const firebaseConfig = {
  apiKey: "AIzaSy…",                             // -> VITE_FIREBASE_API_KEY
  authDomain: "caro-calculator.firebaseapp.com", // -> VITE_FIREBASE_AUTH_DOMAIN
  projectId: "caro-calculator",                  // -> VITE_FIREBASE_PROJECT_ID
  storageBucket: "caro-calculator.appspot.com",  // -> VITE_FIREBASE_STORAGE_BUCKET
  messagingSenderId: "123456789012",             // -> VITE_FIREBASE_MESSAGING_SENDER_ID
  appId: "1:123456789012:web:abc123"             // -> VITE_FIREBASE_APP_ID
};
```

> These are **not secrets**. Firebase web config is public by design and ships
> inside the JavaScript bundle of every Firebase web app in the world. What
> protects your data is the rules you pasted in 2.3, not hiding these values.
> They live in Actions secrets so you can rotate them without a commit.

### 2.6 Put the keys into GitHub

With the CLI — paste each value when prompted:

```bash
gh secret set VITE_FIREBASE_API_KEY
gh secret set VITE_FIREBASE_AUTH_DOMAIN
gh secret set VITE_FIREBASE_PROJECT_ID
gh secret set VITE_FIREBASE_STORAGE_BUCKET
gh secret set VITE_FIREBASE_MESSAGING_SENDER_ID
gh secret set VITE_FIREBASE_APP_ID
```

Or by hand: **Settings → Secrets and variables → Actions → New repository
secret**, six times, using the names above.

### 2.7 Redeploy

Secrets are read at build time, so the site needs rebuilding:

```bash
gh workflow run "Deploy to GitHub Pages"
```

Or push any commit. Once it is green, open the site → **Assign** tab → the
*Share a link* panel now offers **Create the shared link**.

### 2.8 Switch on receipt scanning (optional)

Needed only for the **Scan receipt** button. Everything else works without it.

1. Firebase console → left sidebar → **Build → AI Logic** → **Get started**.
2. Choose the **Gemini Developer API** — the no-cost path. Do **not** link a
   Cloud Billing account.
3. Accept the prompt to enable the required API on your project.

That is all — the keys you already set cover it. Reload the app and a
**📷 Scan receipt** button appears on the Bill tab.

> **Before 2 November 2026:** Firebase App Check becomes *mandatory* for AI
> Logic. It is also what stops a stranger who finds your public URL from
> spending your free quota. Set it up under **Build → App Check** with the
> **reCAPTCHA v3** provider (free), registering `ramynazmy.github.io`.

Free-tier limits, shared across everyone using the site: **1,500 scans/day**
and 10/minute. One scan per bill, so that is hundreds of dinners a day.

### 2.9 And for local development

```bash
cp .env.example .env     # then paste the same six values in
npm run dev
```

`.env` is gitignored, so your local keys never reach the repo.

---

## Checking it worked

1. Open the site, enter a couple of items, add two participants.
2. **Assign → Share a link → Create the shared link**.
3. Open that link in a private window — you should see the name picker.
4. Pick a name, choose an item, **Save my picks**.
5. Back in the first window, **Who has responded** flips to ✓ and the
   **Summary** tab updates. No refresh needed.

If step 3 shows *"This link is not valid"*, the keys did not reach the build —
check the Actions run log for the build step and confirm all six secrets exist.

## What this costs

**Nothing, and no credit card at any point.**

| | Free allowance | What that means here |
|---|---|---|
| GitHub Pages | 1 GB site, 100 GB/month traffic | The site is ~250 KB. Effectively unlimited. |
| GitHub Actions | Unlimited minutes on public repos | Every push redeploys, free. |
| Firestore reads | 50,000/day | A guest opening a link costs a handful. Thousands of guests a day. |
| Firestore writes | 20,000/day | ~1 per bill + ~2 per participant. **Hundreds of bills a day.** |
| Firestore storage | 1 GB | A bill is ~2 KB — about 500,000 bills. Never a factor. |

The realistic ceiling is 20,000 daily writes, far beyond a group of friends
eating out. Nothing here can generate a bill, because the Spark plan has no
payment method attached — if you ever did exceed a quota the app would stop
working for the rest of the day rather than charge you.

## Troubleshooting

**Blank white page after deploying.** `REPO_NAME` in `vite.config.ts` does not
match the actual repository name. They must be identical.

**404 at the site root.** Pages source is still "Deploy from a branch". Change
it to **GitHub Actions** (step 1.2) and re-run the workflow.

**A shared link opens the organizer's app instead of the name picker.** The `#`
was dropped when the link was pasted. The URL must be
`…/caro-calculator/#/b/<id>`.

**"Missing or insufficient permissions" in the browser console.** The rules in
2.3 were not published.

**`403: billing disabled` when adding a TTL policy.** Expected on the free
Spark plan — see 2.4. It does not affect the app.

**The workflow fails on `npm ci`.** `package-lock.json` is out of step with
`package.json` — run `npm install` locally and commit the updated lockfile.

## Why hash routing, and no 404.html

GitHub Pages serves static files. Asking it for `/caro-calculator/b/abc123`
returns 404, because no such file exists. The usual workaround is a `404.html`
that reroutes into the app — a redirect hack that breaks browser history in
subtle ways and needs re-testing whenever Pages changes.

Everything after `#` is never sent to the server, so
`…/caro-calculator/#/b/abc123` is, as far as Pages is concerned, a request for
the site root, which always exists. The link you send a friend cannot 404.
That is worth more than a prettier URL.
