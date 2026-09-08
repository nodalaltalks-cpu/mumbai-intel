# NDT Apify Test Actor (integration test only)

Pushes exactly **one hardcoded dummy Project record** to its dataset. Makes
no network requests and scrapes nothing — the whole Actor is the ~20 lines
in `src/main.js`. Its only purpose is to produce one real Apify run/dataset
to prove the webhook → `/api/ingest/apify` → staging → review pipeline
works end-to-end.

## Deploy it (pick one)

**Option A — paste into Apify Console (fastest, no CLI needed):**
1. Apify Console → **Actors** → **Create new** → choose the **Empty project** (Node.js) template.
2. Replace the generated `src/main.js` with this folder's `src/main.js`.
3. In the template's `package.json`, make sure `apify` is a dependency (the Empty template already includes it).
4. Click **Build**, then **Save**.

**Option B — Apify CLI, from this exact folder:**
```bash
cd apify-actor/ndt-apify-test-actor
apify login          # if not already logged in
apify push            # creates/updates the Actor in your account from this folder
```

## Configure the webhook (only if you haven't already)

On this Actor's **Settings → Webhooks** tab, add a webhook for **Run succeeded**,
pointing at your bridge, with the `Authorization: Bearer <APIFY_WEBHOOK_SECRET>`
header — see the earlier webhook-setup instructions for the exact values.

## Run it

Actor page → **Start**. No input needed (this Actor takes none). A run
typically finishes in a few seconds.

## What to check afterward

1. **Apify Console** → this run → **Dataset** tab → should show exactly one
   item, matching the object in `src/main.js`.
2. **Apify Console** → the webhook's delivery log → should show a `200`
   response from `/api/ingest/apify` shortly after the run succeeds.
3. **NoDalalTalks admin** → `/admin/data-sync/review` → should show one new
   "Project" entry named `NDT APIFY TEST - Do Not Publish`, proposed as a
   **new** record (not a merge), awaiting approval.

Reject it in the Review Queue once confirmed — it's a dummy record and
should never be approved into the live Projects table.
