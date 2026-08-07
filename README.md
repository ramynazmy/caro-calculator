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

Verified by 5,000 randomized bills — random party sizes, prices, quantities,
deliberate over-claims, percentage and fixed charges, both split settings — all
of which reconcile exactly. `allocate` also handles the degenerate cases:
nobody nominated (falls back to largest-remainder), all weights zero (falls
back to an even split), and an absorber who ate nothing (skipped, so nobody is
ever charged a negative amount).

### Order of the money

1. Each person pays for what they claimed.
2. Shared items **and anything unclaimed** are divided by the Phase 2 split
   basis (per head or per name). Unclaimed leftovers are flagged separately on
   the summary, and the organizer can hand one to a person instead with the
   *Give to…* dropdown — for when someone simply forgot to tick their dessert.
3. The discount is spread in proportion to each person's food.
4. Service and tax are spread by the **Dividing tax & service** setting:
   *By what you ate* (default) or *Equally*.

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
  components/            GirlLogo, MoneyInput, QuantityStepper, ClaimRow,
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
- [ ] **Phase 4** — automatic deployment to GitHub Pages

## Setting up Firebase (needed only for the shared link)

Full step-by-step walkthrough comes in Phase 4. The short version:

1. <https://console.firebase.google.com> → **Add project** (no credit card, the
   free Spark plan is the default).
2. **Build → Firestore Database → Create database**, start in *test mode*.
3. **Project settings → Your apps → Web (`</>`)** → register the app → copy the
   six `firebaseConfig` values.
4. `cp .env.example .env`, paste the six values in, and restart `npm run dev`.

Until you do this the app runs fine — the *Share a link* panel simply explains
what is missing, and *I'll assign* works as normal.

Note on security rules: with no logins, anyone holding a bill's link can read
and write that bill. That is the intended design (participants have no
accounts), and bill ids are 80-bit random so they cannot be guessed. Phase 4
includes rules that scope writes to a single bill document and cap document
size.

## Deployment

Covered in Phase 4. The build is already configured for it: `vite.config.ts`
sets `base` to `/bill-splitter/` for production builds, which is what GitHub
Pages needs when the site is served from a repository subpath. Change the
`REPO_NAME` constant there if you name the repository something else.
