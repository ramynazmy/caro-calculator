# Feasibility: entering a bill by photographing it

**Date:** 7 August 2026
**Status:** proposal — not started

---

## Verdict

**Feasible, at $0, with no credit card, using the Firebase project you already
have.** Recommended approach: **Firebase AI Logic → Gemini Flash**, called
straight from the browser.

The single thing that makes this work is that Firebase AI Logic brokers the
call, so no usable API key ever ships in the JavaScript bundle. Without that,
this feature would be impossible in a static site without either paying for a
server or handing the world a key to drain.

Two caveats that must be designed for, not discovered later:

1. **The free quota is shared across everyone using the deployed site**
   (1,500 requests/day for the whole project, not per user).
2. **Firebase App Check becomes mandatory on 2 November 2026.** That is roughly
   three months away. Any build of this feature must include App Check.

---

## The constraint that shapes everything

Caro Calculator is a static site on GitHub Pages. There is no server, and
there cannot be one at $0. Anything in the bundle is public — you can read the
Firebase config in the deployed JavaScript right now, by design.

That normally rules out OCR entirely, because every good receipt-reading API
authenticates with a secret key:

- Put the key in the bundle → anyone can extract it in ten seconds and spend
  your quota, or your money.
- Proxy it through a server → you now need a server, an account, and something
  to maintain.
- Do it on-device → no key needed, but the quality collapses (see below).

**Firebase AI Logic threads this needle.** The browser authenticates as *your
Firebase app*, not with a model API key; Firebase forwards the request to
Gemini. There is no secret to steal. App Check is what stops someone pointing
their own script at your project.

---

## Options considered

| Approach | Key exposed? | Cost / card | Arabic receipts | Verdict |
|---|---|---|---|---|
| **Firebase AI Logic → Gemini Flash** | No — brokered by Firebase | $0, no card, works on Spark | Very good | ✅ **Recommended** |
| Gemini API key in the bundle | **Yes, immediately** | $0 until someone drains it | Very good | ❌ Never |
| Cloudflare Worker / Vercel proxy | No | $0 free tier, no card | Very good | 🟡 Works, but a second service to own |
| Google Cloud Vision / AWS Textract | Needs a proxy anyway | **Requires billing account** | Good | ❌ Card required |
| Veryfi / Mindee / Taggun (receipt-specific) | Needs a proxy | **Paid, card required** | Good | ❌ Card required |
| Tesseract.js, fully on-device | None | $0 forever, works offline | **Poor** | 🟡 Fallback only |
| Browser Shape Detection API | None | $0 | Poor, patchy support | ❌ Not viable |

### Why not Tesseract.js, given it is free and offline?

It reads clean, flat, high-contrast text well. A restaurant receipt is none of
those: thermal print that fades, curled paper, glare, tight line spacing,
prices in a right-hand column that OCR happily merges into the item name, and
often Arabic — where Tesseract is markedly weaker. It also gives you raw text,
not structure: you would still have to write the logic that decides which
number is a price, which is a quantity, and which is the VAT line.

A vision model does the structuring as part of the same call. That difference
is most of the feature.

Keeping Tesseract as an *offline fallback* is possible but I would not build
it: two extraction paths of very different quality is a support burden, and the
honest fallback when there is no signal is the manual entry that already works.

---

## Why accuracy does not have to be perfect

This is the strongest argument for building it, and it is specific to this app.

Caro Calculator **already** has the exact validation mechanism an OCR feature
needs. The Bill tab asks for *"Total printed on the receipt"* and warns when
the items you entered do not add up to it.

So the photo flow becomes self-checking:

1. The model extracts the line items **and** the printed total.
2. Both go into the bill.
3. If the model dropped a line, mistyped a price, or hallucinated an item, the
   totals will not match — **and the app already says so, loudly, with the exact
   difference.**

That converts "roughly 85% accurate" from a dealbreaker into a time-saver. The
organizer is not asked to trust the extraction; they are asked to glance at a
green tick. When it is red, the difference tells them roughly what is missing.

Realistic expectation on a decent phone photo of a typical Egyptian receipt:
most line items correct, occasional price or quantity error, occasional merged
or dropped line. Good enough to save several minutes of typing. **Not** good
enough to skip review — so review is not optional in the design.

---

## Proposed flow

```
[ Bill tab ]
      |
      +-- "Scan receipt" button
      |
      v
Take / choose photo  ->  downscale on device  ->  Gemini Flash (structured JSON)
      |                                                     |
      |                                                     v
      |                                          Review screen: every row
      |                                          editable, low-confidence
      |                                          rows flagged
      |                                                     |
      v                                                     v
Manual entry (always available)  <----------------  Add to the bill
                                                            |
                                                            v
                                              Existing receipt cross-check
                                              confirms nothing was missed
```

Design rules:

- **Never write straight into the bill.** Extraction lands on a review screen.
- **Merge, don't replace.** Scanning a second page of a long receipt should add
  to what is there, not wipe it.
- **The photo is never stored.** Sent, read, discarded. No Firestore, no
  Storage, nothing in the shared bill document.
- **Manual entry stays the primary path.** Scanning is a shortcut, not a
  dependency — the app must remain fully usable with no signal.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **App Check mandatory 2 Nov 2026** | **High** | Set it up as part of this work, not after. reCAPTCHA v3 provider is free. |
| Shared 1,500 req/day project quota | Medium | Fine for a friend group. Add a clear "try again tomorrow" message. App Check stops outsiders burning it. |
| 10 requests/minute ceiling | Low | One scan per bill; a friendly retry message covers a rare collision. |
| Model deprecation | Medium | Gemini 2.5 shuts down Oct 2026. Do not pin to a dated model — target the current Flash and keep the model id in one constant. |
| Poor accuracy on bad photos | Medium | Review screen + existing total cross-check. Capture guidance ("flatten the receipt, avoid glare"). |
| Receipt photos sent to Google | Medium | Disclose it plainly in the UI before the first scan. Nothing is stored by us. |
| Arabic / mixed-script receipts | Low–Medium | Gemini handles Arabic well; must be part of the accuracy spike. |
| Adds ~30–50 KB and a new failure mode | Low | Lazy-load the AI module, exactly as Firestore already is. |

---

## TODO

### Phase A — Spike: does it actually read Egyptian receipts? (half a day)

**Do not build any UI until this passes.**

- [ ] A1. Enable **Firebase AI Logic** in the Firebase console, choosing the
      **Gemini Developer API** (the no-cost path — do *not* link a billing
      account).
- [ ] A2. Add `firebase/ai` behind a dynamic import, mirroring how
      `lib/firebase.ts` already lazy-loads Firestore.
- [ ] A3. Throwaway script: photo in → structured JSON out.
- [ ] A4. **Collect 8–10 real receipts** — Arabic, English, mixed; thermal and
      printed; one crumpled; one with a service charge and VAT; one with a
      discount.
- [ ] A5. Measure: % of line items correct (name, price, quantity), and whether
      the printed total is read correctly.
- [ ] **Gate:** if line-item accuracy is below ~70%, stop and reconsider.
      Below that, correcting is slower than typing.

### Phase B — Capture (half a day)

- [ ] B1. `<input type="file" accept="image/*" capture="environment">` — opens
      the camera on both iOS and Android with no permissions dance and no
      library.
- [ ] B2. Downscale and re-compress on-device via canvas before upload. Cap the
      long edge around 1,600px. Receipts are tall and thin; a raw 12 MP photo is
      slow to upload on mobile data and costs tokens for no accuracy gain.
- [ ] B3. Preview with retake.
- [ ] B4. Handle HEIC from iPhones (canvas re-encode to JPEG covers it).

### Phase C — Extraction (1 day)

- [ ] C1. JSON schema: `items[{name, unitPrice, quantity}]`, `service`, `tax`,
      `discount`, `printedTotal`, `currency`, plus a per-item `confidence`.
- [ ] C2. Prompt, covering: Arabic and English, the Egyptian
      service-then-VAT-on-both convention, quantity-vs-price column confusion,
      and "return the printed total verbatim, do not compute it".
- [ ] C3. Map the result onto `Bill` — reusing `parseToMinor` so everything
      lands as integer minor units like the rest of the app.
- [ ] C4. Set `actualTotalMinor` from the printed total, so the existing
      cross-check fires immediately.
- [ ] C5. Fail gracefully: unreadable photo, no signal, quota exhausted.

### Phase D — Review screen (1 day) — the important one

- [ ] D1. Screen listing every extracted item, all fields editable.
- [ ] D2. Flag low-confidence rows visually.
- [ ] D3. Add / delete rows before committing.
- [ ] D4. **Merge** into the existing bill rather than replacing it.
- [ ] D5. Show the cross-check result right there: *"These items add up to
      X; the receipt says Y."*
- [ ] D6. Cancel discards everything.

### Phase E — Hardening (1 day)

- [ ] E1. **Firebase App Check with reCAPTCHA v3** — required before
      2 Nov 2026, and the only thing stopping a stranger spending your quota.
- [ ] E2. Register `ramynazmy.github.io` as an allowed domain, plus
      `localhost` for development.
- [ ] E3. Quota-exceeded UX: a plain "scanning is unavailable right now, enter
      it manually" — never a stack trace.
- [ ] E4. One-time disclosure before the first scan: the photo is sent to
      Google for reading and is not stored.
- [ ] E5. Keep the model id in a single constant so a deprecation is a one-line
      change.
- [ ] E6. Lazy-load the AI module so bills entered by hand never download it.

### Phase F — Tests and docs (half a day)

- [ ] F1. Unit tests for the JSON→`Bill` mapping, including malformed and
      partial model output, using **recorded fixtures** — no network in the
      test suite.
- [ ] F2. Verify a scanned bill flows through to a correct split (the existing
      `shares` suite covers the maths; this covers the handoff).
- [ ] F3. README section, and a note in the setup walkthrough for App Check.

**Rough total: 4–5 days of focused work**, of which Phase A decides whether the
remaining four are worth spending.

---

## Cost

| | Free allowance | Reality for this app |
|---|---|---|
| Firebase AI Logic on Spark | No billing account needed | $0 |
| Gemini Flash — requests/day | 1,500 (whole project) | One scan per bill. Hundreds of dinners a day. |
| Gemini Flash — requests/minute | 10 | One person scanning one receipt. |
| Gemini Flash — tokens/minute | 250,000 | A receipt photo is a small fraction of this. |
| Firebase App Check (reCAPTCHA v3) | Free | $0 |

Still **$0, still no credit card.** The binding limit is 1,500 scans/day across
everyone using the site — which is only a risk if the public URL attracts
strangers, and App Check is what prevents that.

---

## Decisions needed before starting

1. **Is scanning for the organizer only, or for participants too?** Organizer
   only is my recommendation — participants only pick from a list they have
   already been given, so scanning adds nothing for them and multiplies quota
   use.
2. **How much does an unreadable receipt matter?** If "it failed, type it in"
   is acceptable, Phase A's bar can be lower.
3. **Are you comfortable with receipt photos being sent to Google to be read?**
   They would not be stored anywhere by this app, but they do leave the device.
   If that is a no, the honest answer is that this feature cannot be built at
   $0 — on-device OCR is not good enough for Arabic receipts.

---

## Sources

- [Firebase AI Logic — Understand pricing](https://firebase.google.com/docs/ai-logic/pricing)
- [Gemini API free tier limits](https://ai.google.dev/gemini-api/docs/pricing)
