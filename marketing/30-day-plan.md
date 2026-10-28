# Pathsathi — 30-Day Plan (v2, rewritten for the real product)

**Status:** replaces the old 30-day plan. The old version was written for a product that no longer
exists: it promised "real-time info", pushed Google Play / App Store badges, pointed at
`find-your-bus.vercel.app`, and never mentioned QR stickers, `/on-bus`, `/stop`, `/scan`, the
offline ride screen, the community desk, or the sticker maker. All of that is out of date. This
version is built from the code in this repository and from what you can physically do in Kolkata
with ₹0.

---

## 1. Read this first

### 1.1 What the product actually is today

Say only these things in public. Every number below is from the repo, not from imagination.

| Fact | Where it comes from |
|---|---|
| **651** bus routes | `fontend/src/data/kolkata-bus-data.json` |
| **2,194** bus stops | same file |
| **193** stands / depots / terminals | same file |
| Pages: `/` (find a bus), `/map` (stop map), `/ride` (follow the route), `/on-bus` (which bus am I in), `/stop` (next buses at a stop), `/scan` (QR scanner) | `fontend/src/app/` |
| Installs to the home screen (PWA), ~**2.8 MB**, works with **no signal** after the first visit | `README.md`, `fontend/scripts/build_sw.mjs` |
| QR stickers exist as printable files (route sticker → `/on-bus`, stop sticker → `/stop`) | `qr-admin/`, `README.md` |
| "One change" journeys are shown when there is no direct bus | `fontend/src/app/page.tsx` |
| Community desk for missing routes / corrections | `user_input/` |

### 1.2 What it is **not** — never claim these

- **Not live tracking.** No bus reports its position. The app compares *your* GPS with the
  published timetable and says so on screen. Never write "real-time", "live bus", "track your bus"
  or "GPS tracking of buses". The banner in `marketing/banners/` says **"Real-time info"** — that
  banner must not be posted.
- **Not on the Play Store or App Store yet.** `mobile/APP.md` lists both as future work (USD 25 +
  USD 99). Store badges in the old banners are fiction. Do not use them until the listings are live.
- **No printed stickers in any bus or at any stop yet**, unless you have physically stuck them
  yourself. Until then, sticker content is "you can print one", not "look for it at Esplanade".
- **Not official.** Not WBTC, not the state government, not a bus operator.
- **Registration numbers** are not printed on stickers yet.

### 1.3 What "app download" means here (the one decision everything hangs on)

The plan works either way, but **you must pick A or B before Day 3**:

- **A — Play Store live:** every CTA is `{{APP_LINK}}` (Play Store). This is the strongest CTA, but
  it costs USD 25 one-time and a closed test first.
- **B — nothing published (recommended for 0 cost):** "install" = **Add to Home Screen**, a
  15-second action with no store and no fee. Every phone can do it; nothing to buy; no download
  friction; works offline immediately. Every CTA becomes `{{SITE}}` + "Add to Home Screen".

The rest of this document writes CTAs as `{{SITE}}` and `{{APP_LINK}}`. Under option B you never
fill in `{{APP_LINK}}`; you point at `{{SITE}}` and use Video 4 (the 15-second install) instead.

---

## 2. Fill-in sheet — do this before Day 1

I could not confirm these from the repository (two different domains are hard-coded in marketing
files, and no store listing exists). Fill them in once, then every post below is copy-paste ready.

| Placeholder | What it is | Where to get it | Default if you have nothing |
|---|---|---|---|
| `{{SITE}}` | The live website URL | your hosting dashboard | The repo mentions `find-your-bus.vercel.app` **and** `pathsathi.vercel.app` — neither is confirmed, so confirm and delete the other from `marketing/bios-and-handles.md` and `marketing/make-video.html` |
| `{{APP_LINK}}` | Play Store link | Play Console | leave blank (option B) |
| `{{IG}}` | Instagram username | pick one below | `pathsathi.kolkata` |
| `{{FB}}` | Facebook page name | pick one below | `Pathsathi — Kolkata bus times` |
| `{{X}}` | X username | pick one below | `pathsathiapp` |
| `{{YT}}` | YouTube handle | pick one below | `@pathsathiapp` |
| `{{WA}}` | WhatsApp Channel link | create it on Day 1 | — |
| `{{TG}}` | Telegram channel | optional, skip if you don't use it | — |
| `{{DESK}}` | Community desk URL (report a missing route) | wherever `user_input/` is deployed | skip until deployed |

**Also decide (I asked, no answer yet — the plan assumes the first option):**

1. **Voiceover language.** Scripts below are **English**, because free AI voices read English
   cleanly and the app's own copy is English. If you want Banglish ("Esplanade theke Garia"), say
   so and I will rewrite all five scripts — don't half-translate by hand.
2. **Who is on camera.** Assumed: nobody. All videos are screen recordings + hands + the street,
   narrated by AI. That is faster and needs no confidence on camera.
3. **When you can film.** Assumed: one weekday morning commute (08:00–09:30) and one Saturday.
4. **An app on the Play Store, or not** (§1.3).

---

## 3. The funnel: one video → one website visit → one install

This is the part the old plan never had. A post that only gets likes is a wasted post. Every video
here ends with the same three-part close, and the link is measured.

### 3.1 The chain

```
Reel / Short / Post
   ↓  (last 4 seconds: URL on screen + "link in bio" + QR)
Profile → link
   ↓  (one link, with a UTM tag per platform)
{{SITE}}/?utm_source=instagram&utm_medium=reel&utm_campaign=launch01
   ↓  (site shows the answer in under 10 s, so the visitor stays)
Home screen install (option B)  or  Play Store (option A)
   ↓
"Add to Home Screen" video pinned on the profile + linked from the homepage CTA
```

### 3.2 The five mechanics that make it convert (all free)

1. **One link in bio, not five.** Instagram and TikTok cannot put links in a caption, so the bio
   link is the only road. Point it at `{{SITE}}/?utm_source=instagram&utm_medium=bio`.
2. **Link in the first comment, pinned.** On every Reel and every YouTube Short. People who read
   comments are the ones who act. Facebook and X get the link inside the post (both are clickable).
3. **The URL appears on screen** for the final 3–4 seconds, typed in a browser bar (not a floating
   logo). Do it even with "link in bio": a viewer who memorises your name searches it later.
4. **A QR strip on the end card** for the in-person plays — the bus-stand demo, the auto-stand, a
   friend's phone. Not the main online conversion, but it is what makes ground work work.
5. **An install ask that costs the viewer 15 seconds.** Under option B, "Add to Home Screen" film is
   pinned at the top of every profile and is the first thing a new visitor sees on `{{SITE}}`.

### 3.3 UTM naming — one rule, every post

`?utm_source=<platform>&utm_medium=<format>&utm_campaign=<post-number>`

| Example | Reads as |
|---|---|
| `?utm_source=instagram&utm_medium=reel&utm_campaign=launch01` | Instagram reel, launch post |
| `?utm_source=facebook&utm_medium=post&utm_campaign=launch01` | Facebook page post |
| `?utm_source=whatsapp&utm_medium=channel&utm_campaign=stop01` | WhatsApp channel |
| `?utm_source=ground&utm_medium=qr&utm_campaign=esplanade` | QR shown in person at Esplanade |

Never post an untagged link. An untagged link teaches you nothing.

### 3.4 Measurement reality check (free only)

There is **no analytics in the site today** (`grep` finds none in `fontend/src`). Without one you
cannot tell which post brought a visitor, and this whole plan collapses into guesswork.

- **Day 1, 30 minutes:** add **GA4** (free) to `fontend/src/app/layout.tsx`, or host on Cloudflare
  Pages / Vercel and enable their free analytics. GA4 is the one that reads UTM tags.
- **Same day:** add an `appinstalled` listener so a home-screen install is counted as an event
  (`fontend/src/components/PwaBridge.tsx` already knows the install state — it needs one event).
- **If you want, I can write both changes**; say the word and they are a small, tested patch.

---

## 4. Platforms: handles, names, bios, and what each one is *for*

Seven places, not fifteen. Each has a job. Doing all seven costs about 45–60 minutes a day.

| # | Platform | Job in the funnel | Effort | Handle (check, fall back in order) |
|---|---|---|---|---|
| 1 | **Instagram** | Discovery → profile → link | 15 min/day | `@pathsathi.kolkata` → `@pathsathi` → `@pathsathiapp` |
| 2 | **Facebook Page** | The under-35-plus Kolkata commuter; the only platform where a link is clickable in a post | 10 min/day | Page name `Pathsathi — Kolkata bus times`; username `@pathsathikolkata` |
| 3 | **Facebook Groups** | The highest-intent audience that exists for this | 15 min × 3/week | no handle — join as your personal profile |
| 4 | **YouTube (Shorts)** | Search + long life; a Short keeps getting views for months | 10 min/video | `@pathsathiapp` |
| 5 | **WhatsApp Channel + Status** | Trust and forwarding; in Kolkata this out-converts everything else for installs | 5 min/day | Channel name `Pathsathi — Kolkata bus times` |
| 6 | **X (Twitter)** | Small in Kolkata, but free, and connects you to bus/metro/transport accounts and local media | 10 min × 3/week | `@pathsathiapp` → `@pathsathi_in` |
| 7 | **Reddit r/kolkata** | One honest post reaches a few thousand people who like local tools | 1 hour, twice | personal account, disclose you built it |
| 8 | *(optional)* **Telegram** | Only if you already use it; otherwise skip and put the effort into WhatsApp | 5 min/day | `@pathsathi` |

### 4.1 Bios — paste-ready

**Instagram (limit 150 characters)**
```
পথসাথী — Kolkata bus times 🚌
Esplanade → Garia in 10 seconds. 651 routes, 2,194 stops.
Works offline. No login.
👇 Find your bus
```
- Name field (searchable, separate from username): `Pathsathi — Kolkata bus times`
- Link: `{{SITE}}/?utm_source=instagram&utm_medium=bio`
- Category: `Transportation service`. Profile photo: the bus mark from
  `fontend/public/icons/icon.svg` (already brand green).
- First highlight: **Install** (Video 4), **Find a bus**, **At your stop**, **Offline**.

**Facebook Page (limit 255 characters)**
```
পথসাথী (Pathsathi) — Kolkata's bus timetable. Type two stops and see every bus with its published
times, plus one-change options when there is no direct bus. A ride screen that works with no signal.
Free, no login, 651 routes and 2,194 stops.
```
- Username: `@pathsathikolkata`. Category: `App page` or `Transportation service`.
- Button: **Learn more** → `{{SITE}}/?utm_source=facebook&utm_medium=page`.
- Action button for option A: **Install app** → `{{APP_LINK}}`.

**X (limit 160 characters)**
```
Kolkata bus times in 10 seconds.
Two stops → every bus, its times, one-change options.
Offline ride screen. 651 routes, 2,194 stops.
Pathsathi 🚌 {{SITE}}
```

**YouTube (first 100 characters decide whether anyone reads on)**
```
Pathsathi — Kolkata bus timetable and offline ride screen. 651 routes, 2,194 stops. Free, no login.
Short demos every week. Type two stops, see every bus with its published times, and follow your ride
with no signal. Not live tracking — published times, your own GPS.
{{SITE}}?utm_source=youtube&utm_medium=profile
```
- Banner: `[IMAGE — generate: 2560×1440, brand green, bus mark, word "Pathsathi", the line "Find your bus in 10 seconds", the URL `{{SITE}}`]** — keep text inside the central 1546×423 safe area.
- Playlists: `Find a bus`, `At your stop`, `Install & offline`.

**WhatsApp Channel** — Name `Pathsathi — Kolkata bus times`; description:
`Kolkata bus times. Two stops → every bus. Works offline. {{SITE}}` (2–3 messages a week, never
more; a channel that spams gets muted).

**Telegram (optional)** — Name `Pathsathi`; about: `Kolkata bus timetables. Works offline. {{SITE}}`.

**Reddit** — no brand account. Use your own, mention you built it, and read §9.4 before posting.

---

## 5. The month, sized for one person with a job

### 5.1 Honest shape of 30 days

| Content | Count | Why this many |
|---|---|---|
| Short videos (Reels + Shorts + FB) | **5** | One good video a week beats five rushed ones |
| Feed posts (image / carousel) | **10** | Two a week, cheap to make from screenshots |
| Stories | **~16** | Polls, screenshots, reposts. 3 minutes each |
| X posts | **10** | Reposts of the week's best, plus 2 threads |
| WhatsApp channel messages | **10** | The same posts, reworded one line |
| Ground sessions (real people, real buses) | **6** | This is where installs actually come from |
| Weekly reviews | **4** | Sunday, 20 minutes |

### 5.2 Time budget for a normal weekday (~50 minutes)

1. 20 min — make or edit that day's asset (most days: a screenshot with a caption, 5 minutes).
2. 10 min — post on IG + FB + WhatsApp channel (copy-paste the same caption).
3. 15 min — replies, DMs, group comments. **This is not optional**; it is where installs come from.
4. 5 min — log today's numbers in the tracking table (§11).

### 5.3 Targets — planning numbers, not promises

Replace them with your real week-1 numbers on Day 7. Do not quote them publicly.

| Metric | Day 30 (0 cost, no audience on Day 1) |
|---|---|
| Views across all videos | 3,000–8,000 |
| Site visits with a UTM tag | 200–500 |
| Home-screen installs / store installs | 20–60 |
| Followers (IG + FB + YT combined) | 150–400 |
| People who saved/bookmarked a post | 30–80 (saves matter more than likes) |

If the numbers come in under the low end, the answer is **not** more posts. It is better ground
work (§10) and more group/DM conversations.

---

## 6. Calendar at a glance

| Day | What | Type |
|---|---|---|
| 1 | Accounts, bios, one link, analytics | setup |
| 2 | Film everything for week 1 in one bus ride | setup |
| 3 | **LAUNCH** — "Find any bus in 10 seconds" | **Video 1** |
| 4 | "What Esplanade knows" (data post) | Post 1 |
| 5 | Story: poll. X: launch thread | Story + X |
| 6 | "No signal? Still works" | **Video 5** (short) |
| 7 | Week 1 review + first ground session | review |
| 8 | "Which bus am I in?" | **Video 2** |
| 9 | "Ask the app, not three people" (street) | Post 2 |
| 10 | Ground session at a bus stand + sticker test | ground |
| 11 | "No direct bus? One change" | Post 3 |
| 12 | Story quiz + WhatsApp channel | Story |
| 13 | "We don't track buses. Here's why our times still help." | Post 4 |
| 14 | Week 2 review | review |
| 15 | Install in 15 seconds | **Video 4** |
| 16 | Route spotlight (vote) | Post 5 |
| 17 | X thread: how the times are built | X |
| 18 | "261 routes at one stop" | Post 6 |
| 19 | Ground session, second stand | ground |
| 20 | College commute | Post 7 |
| 21 | Week 3 review | review |
| 22 | "Where our data comes from" | Post 8 |
| 23 | Story: behind the scenes + X | Story + X |
| 24 | Community desk: send us the missing route | Post 9 |
| 25 | Ground session, third stand + ask 10 people to install | ground |
| 26 | Route spotlight #2 / reply-driven post | Post 10 |
| 27 | Recap: the month in numbers | Post 11 |
| 28 | Week 4 review | review |
| 29 | Ask for reviews/testimonials; DM 5 pages | outreach |
| 30 | Next-30-days decision post | Post 12 |

Rule: **never two videos in one week in the first fortnight.** If a week slips, drop the feed post,
keep the ground session.

---

## 7. Week 1 in full (Days 1–7)

### Day 1 — Setup (no public posting)

- [ ] Instagram, Facebook Page, YouTube, X created. Bios pasted from §4.1.
- [ ] One link in every bio, UTM-tagged. Test it on your own phone.
- [ ] Analytics added to the site (§3.4) and checked that a UTM shows up as a campaign.
- [ ] `{{SITE}}` opened on your phone → Add to Home Screen → confirm it opens with airplane mode on.
  **If it does not open offline, fix that before Day 3** — the whole promise is offline.
- [ ] WhatsApp Channel created; add 20 contacts you actually know (not strangers).
- [ ] Profile photo from `fontend/public/icons/icon.svg`.

**Deliverable:** screenshots of all five profiles, and one screenshot of the site installed and
opening offline.

### Day 2 — The one film session (90 minutes, one bus ride)

Shoot everything for Videos 1, 2, 5 and Posts 1–2 in a single trip. Shot list:

| Shot | Length | How |
|---|---|---|
| Bus arriving, from the stop | 6 s | hand-held, chest height, don't chase |
| Hand holding the phone showing `/stop?stop=Esplanade` while standing at Esplanade | 8 s | screen visible, sun not on it |
| Inside the bus, phone showing `/on-bus?route=1` | 8 s | sit, brace elbows on the seat back |
| Screen recording: typing "Esplanade" → "Garia" → buses appear | 20 s | built-in screen recorder |
| Screen recording: `/stop?stop=Garia`, scroll the next buses | 15 s | — |
| Screen recording: turning on airplane mode, opening the app, `/map` still loading | 20 s | **the money shot** |
| Walking shot of you/your hand only, street behind | 6 s | no face needed |
| A conductor or a passenger in frame, unidentifiable, for texture | 4 s | only with consent (see §12) |

**Do not** film people's faces without asking. A "no" costs you nothing; a complaint can end the
account.

### Day 3 — LAUNCH — Video 1 "Find any bus in 10 seconds"

- **Platforms:** IG Reel, YouTube Short, Facebook Reel + Page post, WhatsApp channel, X post.
- **Post time:** Monday **08:30** (people are literally at the bus stop) and again no action needed.
- **Speech, on-screen text, shot list:** §8, Video 1.
- **Caption (Instagram):**
```
Kolkata, you don't have to ask "ei bus ta kothay jay?" any more.

Type where you are. Type where you're going. Every bus between those two stops, with its
published time — 651 routes, 2,194 stops.

No login. No ads. And it keeps working when the signal dies, which is exactly when you need it.

Link in bio 👆 (fit-it-on-your-home-screen in 15 seconds)

#Kolkata #KolkataBus #KolkataCommute #Pathsathi #Esplanade #Garia #PublicTransport
```
- **Facebook caption:** same, plus the link inline:
`Try it: {{SITE}}/?utm_source=facebook&utm_medium=post&utm_campaign=launch01`
- **X post:**
```
Every Kolkata bus between any two stops, with its published time. 651 routes, 2,194 stops.
No login. Works with no signal.

{{SITE}}?utm_source=x&utm_medium=post&utm_campaign=launch01
```
- **WhatsApp channel:** "Kolkata bus times, free, no login. Type two stops, see every bus. Works
  offline too: `{{SITE}}?utm_source=whatsapp&utm_medium=channel&utm_campaign=launch01`"
- **End card:** `[IMAGE — generate: end card 1080×1920, brand green background, the word Pathsathi,
  the URL `{{SITE}}` large, a QR of `{{SITE}}?utm_source=ground&utm_medium=qr&utm_campaign=launch01`,
  and one line "Works offline · Free · No login"]`
- **Check that it worked:** GA4 → Reports → Acquisition → Traffic acquisition → filter campaign
  `launch01`. By 21:00 you should see the first clicks.

### Day 4 — Post 1 "What Esplanade knows"

- **Platforms:** IG carousel (3 slides) + FB + WhatsApp.
- **Image briefs:**
  - Slide 1: `[IMAGE — generate: 1080×1350, dark green, large text "261 routes stop at Esplanade.", small line "Do you know which one is yours?"]`
  - Slide 2: `[IMAGE — generate: 1080×1350, screenshot mock of /stop?stop=Esplanade — next buses list with times and waits, brand colours]`
  - Slide 3: `[IMAGE — generate: 1080×1350, brand green, "Type your stop. See every bus." + URL `{{SITE}}` + QR]`
- **Caption:**
```
261 routes stop at Esplanade. Around 9,800 timetabled passes a day. You know about five of them.

Open your stop once and you get the next buses, the wait, and the whole day grouped by hour —
then tap any bus to follow the ride.

Which stop should we do next? Comment it. 👇

#Kolkata #Esplanade #KolkataBus #Pathsathi
```
- **Why this post:** it is about *their* stop, not about your app. It is the cheapest post to make
  (two screenshots) and the easiest to comment on.

### Day 5 — Story + X thread

- **Story 1:** poll — `How do you find your bus today?` / `Ask someone` / `Guess` / `Just wait`.
- **Story 2:** screen recording of `/stop?stop=<their answer from Day 4 comments>`, 10 s, with the
  link sticker + UTM `?utm_source=instagram&utm_medium=story&utm_campaign=stop02`.
- **X thread (3 posts):**
```
1/ I built a Kolkata bus timetable that works with no signal. 651 routes, 2,194 stops, free,
no login. Here's how it works 🧵
2/ Type two stops. You get every bus between them with its published time, plus one-change
journeys where there's no direct bus.
3/ Inside the bus, GPS matches your position to the route and tells you which bus you're in and
when to get off — offline. {{SITE}}?utm_source=x&utm_medium=thread&utm_campaign=stop01
```

### Day 6 — Video 5 "No signal"

- **Platforms:** IG Reel + YT Short + FB + WhatsApp.
- **Why now:** it is the single most surprising thing about the product and it is a 20-second edit
  of footage you already shot on Day 2.
- **Script:** §8, Video 5.
- **Caption:**
```
Airplane mode on. App still works.

The whole timetable — 651 routes, 2,194 stops — is inside the app. Nothing to stream, nothing to
wait for. Buses are exactly where the signal isn't.

Link in bio. It takes 15 seconds to put on your home screen.

#OfflineFirst #Kolkata #KolkataBus #EMBypass #Pathsathi
```

### Day 7 — First ground session + review

- **Ground, 45 min:** Esplanade or Garia stand. Open `/stop?stop=<that stand>` on your phone, show
  it to people waiting, let them scan the QR **from your screen**. Count: how many looked, how many
  scanned, how many said "this is useful". See §10.
- **Review, 20 min:** fill the tracking table. Three questions only: which post brought the most
  clicks, which brought the most saves, what did the ground people say was wrong.

---

## 8. Video scripts (copy-paste into a free AI voice)

Five videos. Format for every one: **1080×1920, 9:16, 30 fps, subtitles burned in**, hook in the
first second, URL on screen at the end. Speech is written to be read by an AI voice at ~150 words
per minute — a 30-second video is about 70 words.

**Direction for the voice (same for all five):** calm, matter-of-fact, slightly warm — a person
explaining something useful, not an advertisement. No exclamation marks, no "download now".
Pauses are marked `…` — make the voice stop there.

---

### Video 1 — "Find any bus in 10 seconds" (35 s) — LAUNCH

**Shots**
1. 0–2 s: bus arriving at the stop (Day 2 footage), text over it: **"Kolkata buses, in 10 seconds"**
2. 2–6 s: screen recording, typing "Esplanade" in the From field.
3. 6–12 s: typing "Garia", results appear.
4. 12–22 s: tap a bus → the timetable for that bus, times visible.
5. 22–28 s: back, tap one change → a journey with two buses.
6. 28–35 s: end card (below).

**Speech — word for word**
> Every day, you stand at a bus stop in Kolkata and ask the same question. Which bus goes where I
> need to go, and when does it come? … This answers it in about ten seconds. Type the stop you are
> standing at. Type where you want to go. … Every bus between them, with its published time. 651
> routes, and 2,194 stops, all inside. No login. No ads. … And when the signal dies, which it always
> does on a bus, it still works. … It is called Pathsathi. Link is in the bio, and it takes fifteen
> seconds to put on your home screen.

**On-screen text (burned in)**
- 0–2 s: `Kolkata buses, in 10 seconds`
- 12–22 s: `every bus · its published time`
- 28–35 s: `{{SITE}}` + `free · no login · works offline` + QR

---

### Video 2 — "Which bus am I in?" (40 s)

**Shots**
1. 0–3 s: inside the bus, phone in hand, window light (Day 2).
2. 3–8 s: screen recording of `/on-bus?route=1` — GPS dot on the route line.
3. 8–18 s: the card that says which bus, and how many minutes to the next stop.
4. 18–28 s: choosing a destination → countdown + "get ready" alert.
5. 28–40 s: end card.

**Speech — word for word**
> You are already on the bus. Someone asks where you are going, and you are not completely sure
> which bus this is. … Open the sticker on the bus, or the app, and it matches where you are
> against the route and the timetable. It tells you which bus you are most likely in, and how many
> minutes until your stop. … Choose the stop where you get off, and it counts down the journey, and
> buzzes when you are nearly there. … It is not live tracking. No bus is sending its location. It is
> your own GPS, against the times the operators publish. Which is honest, and it works with no
> signal. … Pathsathi. Link in the bio.

**On-screen text**
- 0–3 s: `which bus is this?`
- 8–18 s: `your GPS + the published timetable`
- 20–28 s: `not live tracking — and we say so`
- 28–40 s: `{{SITE}}` + QR

---

### Video 3 — "Ask the app, not three people" (35 s)

**Shots**
1. 0–4 s: three quick cuts of people talking at a bus stop (faces away or blurred).
2. 4–10 s: a hand holding a phone, screen recording of the search.
3. 10–22 s: results, then the stop page with the wait for the next bus.
4. 22–35 s: end card.

**Speech — word for word**
> Three people at the bus stop. Three different answers. … This one takes ten seconds. Type your
> stop. Type where you are going. … Every bus that connects them, with times, and the wait for the
> next one. If there is no direct bus, it shows the ways with one change. … It is free. No login. And
> it keeps working inside the bus, where the signal does not. … Pathsathi. Link in the bio.

**On-screen text**
- 0–4 s: `three answers. one app.`
- 10–22 s: `next bus · how long · the whole day`
- 22–35 s: `{{SITE}}` + QR

---

### Video 4 — "Install it in 15 seconds" (25 s) — pin this one

**Shots:** screen recording only. Android and iPhone side by side, or two consecutive takes.
1. 0–3 s: `{{SITE}}` typed in the browser bar.
2. 3–10 s (Android): menu → Add to Home screen → confirm.
3. 10–17 s (iPhone): Share → Add to Home Screen → Add.
4. 17–25 s: airplane mode on, tap the new icon, app opens. End card.

**Speech — word for word**
> Two steps, and then it behaves like an app. … On Android, open the menu and choose add to home
> screen. On an iPhone, tap share, then add to home screen. … That is it. It now lives with your
> other apps, opens full screen, and works with no signal at all. No login, no ads, and nothing to
> download from a store. … Pathsathi. Link in the bio.

**On-screen text**
- 3–10 s: `Android: menu → Add to Home screen`
- 10–17 s: `iPhone: Share → Add to Home Screen`
- 17–25 s: `works with no signal`
- End: `{{SITE}}` + QR

*(Option A: replace the speech with "search Pathsathi on Google Play", and keep the same end card
with `{{APP_LINK}}`.)*

---

### Video 5 — "No signal" (20 s)

**Shots**
1. 0–3 s: airplane mode being switched on (screen recording, real toggle).
2. 3–10 s: app icon tapped, `/map` loads, a route drawn.
3. 10–16 s: `/stop?stop=Garia`, buses and times appear.
4. 16–20 s: end card.

**Speech — word for word**
> Airplane mode. No internet at all. … The map still draws. The buses at this stop are still there,
> with their times. … Because the whole timetable, all 651 routes and 2,194 stops, is already inside
> the app. Buses are exactly where the signal is not. … Pathsathi. Free, and it stays on your home
> screen.

**On-screen text**
- 0–3 s: `airplane mode on`
- 10–16 s: `2,194 stops, no internet`
- 16–20 s: `{{SITE}}` + QR

---

## 9. The parts that are not posts

### 9.1 Zero-cost production kit

| Need | Free option | Notes |
|---|---|---|
| Camera | your phone, rear lens, 1080p 30 fps | wipe the lens; lock exposure by tapping and holding |
| Sound | AI voice (§8) | if you narrate, record in a quiet room with wired earphones, 20 cm from your mouth |
| AI voice (free tier) | CapCut text-to-speech, Microsoft Edge "Read aloud" (record its output), ElevenLabs free tier, or `gTTS` (Python) | one voice for all five videos, so it sounds like one brand |
| Editing | CapCut | 9:16, auto-captions on, trim to the script timings |
| Screen recording | built-in Android / iOS recorder | no watermarks |
| QR codes | **the repo's own** `qr-admin/index.html` | free, logo included, prints on A4 |
| Images | screenshots of the real app + the `[IMAGE — generate]` briefs in this file | I generate those for you on request |
| Hosting | Cloudflare Pages / GitHub Pages / Vercel free tier | static export, no server |
| Analytics | GA4 free | needed for UTM |
| Music | skip it, or the platform's own library only | a claimed video is taken down; silence + one voice works fine |

### 9.2 The ground playbook (where installs really come from)

Six sessions, ~45 minutes each, ₹0:

1. **Stand next to a queue, don't sell to it.** Open `/stop?stop=<the stop you are standing at>` on
   your phone and hold it where people can see it. Curiosity does the talking.
2. **Let them scan your screen** (they hold their camera at your phone). That is the whole demo —
   their phone now has the site, installed in 15 seconds, no store, no data cost.
3. **Ask one question:** "Is your route missing?" It is the best conversation opener you have, and
   the answer feeds the community desk.
4. **Note the objections** word for word. Every one becomes a post or a fix.
5. **Ask for a 10-second testimonial** (voice note is fine) with permission. Day 29 uses them.
6. **Never claim official.** Say "I built it", because you did — and people trust that more.

Places worth one session each: **Esplanade, Garia, Howrah Station, Salt Lake Sector V, Jadavpur,
Dum Dum**. Rotate; don't repeat until you have covered four.

### 9.3 Facebook groups (the highest-intent free channel)

Search these names on Facebook and join the **three biggest active ones**: `Kolkata Bus`,
`Kolkata Commuters`, `Kolkata Bus Routes`, `Calcutta`, `Kolkata Traffic`. Then:

- Spend the first week only answering other people's questions (no links). Groups remove
  drive-by advertisers; they tolerate a helpful member.
- Then post **once**, with the link, and say plainly that you built it:
```
People keep asking "which bus from X to Y" here, so I built a free tool for it. Type two stops,
see every bus with its published time, and a one-change option when there's no direct bus. No
login, no ads, and it works inside the bus with no signal.

{{SITE}}?utm_source=facebook&utm_medium=group&utm_campaign=group01

If a route is missing, tell me in the comments and I'll look at it. (I'm the one who built it.)
```
- If an admin removes it, thank them, and ask what would be allowed. Do not repost.

### 9.4 Reddit r/kolkata (twice, maximum)

Rules that decide whether this works:

- Use your own account, at least a few weeks old with some comment history. A brand-new account
  posting one link is removed automatically.
- Title it as a person, not a product: *"I built a free Kolkata bus timetable that works with no
  signal — looking for people to break it"*.
- Put the honest limits in the post itself: not live tracking, times are published times, stickers
  not printed yet. Reddit rewards that and punishes the opposite.
- Answer every comment, and fix what people report. Then post the second update in week 4 with the
  fixes.

### 9.5 Reply scripts (the questions you will get)

| Comment | Reply |
|---|---|
| "Is this live tracking?" | "No — no bus sends its location. It uses the published timetable + your GPS, and it says on the screen that it isn't live." |
| "Google Maps shows buses too." | "It does. This one has the operators' published times, the whole day at a stop, and it works with no signal." |
| "My route isn't there." | "Tell me the route and the stops and I'll check the data. Missing ones are exactly what I want to hear about." |
| "Is it on the Play Store?" | Option A: link. Option B: "Not yet — for now it installs from the browser in 15 seconds, and works offline. No store, no fee." |
| "Is it official?" | "No. Independent, free, uses publicly available timetable data." |
| "Where do the times come from?" | "The operators' published passage times, compiled into one file. Where no times are published, we show no times rather than guessing." |

---

## 10. Tracking table (fill it in daily, 5 minutes)

| Day | Post | Platform | Views | Clicks (UTM) | Installs | Saves | Comments | One line: what happened |
|---|---|---|---|---|---|---|---|---|
| 3 | Video 1 | IG | | | | | | |
| 3 | Video 1 | YT | | | | | | |
| … | | | | | | | | |

**Sunday review — three questions, 20 minutes**
1. Which post got the most **clicks**, not likes? Do that format again next week.
2. Which post got the most **saves**? Saves predict installs.
3. What did people say at the bus stand that no post addresses? That is next week's post.

**Kill rules** — decide these now, not in the moment:
- A format with under 300 views twice in a row is dropped.
- A platform with zero clicks for two weeks gets one post a week, not daily effort.
- If installs are low but clicks are fine, the problem is on the site (the 15-second install video
  is the fix), not in the marketing.

---

## 11. What not to do

- Don't say "real-time", "live", or "track". It is untrue and the app's own screens contradict it.
- Don't use the old banners: they say **Cholo**, say **"Real-time info"**, and show **Google Play /
  App Store** badges that do not exist.
- Don't buy followers, likes or views. Kolkata's local pages can tell, and it kills the trust you
  need for a commuting tool.
- Don't post more than twice a day on any platform, or more than one message a day on WhatsApp.
  A muted channel is a dead channel.
- Don't spam groups with the same text. Reword, and be a member first.
- Don't repost the same Reel to TikTok-styled watermarks elsewhere; export clean from the editor.
- Don't promise someone's missing route will be added "today". Say you will check.
- Don't use a real person's face, voice or bus in a video without asking them first.

---

## 12. What I need from you to generate a post

When you say "generate post 3", I will produce:

1. **The final image(s)** at the right size for the platform, using the brief in this file, with the
   wordmark, the URL and the QR in the right places.
2. **A one-line description** of what the image says, in case you want it changed.
3. **The caption**, already inside the platform's character limit, with the UTM link filled in.

To do that cleanly I need, in order of importance:

1. `{{SITE}}` — the real domain.
2. **Store link or not** (§1.3) — it decides the last line of every caption.
3. **Language** — English, or Banglish. Once chosen, all five scripts get rewritten to match, not
   half-translated.
4. The handles you actually got, if they differ from the suggestions in §4.
5. For any photo of a real bus or a real stand: whether you can shoot it, or whether I should
   generate it. Generated photos are not photos of real Kolkata buses — for a local audience that
   difference is visible, so use generated images for posters/cards and real footage for "inside the
   bus" content.

---

## 13. Housekeeping — old files that now contradict this plan

These still carry the old product's claims. Don't publish from them until they are updated:

| File | Problem |
|---|---|
| `marketing/banners/*.png` | Say "Cholo", "Real-time info", and show store badges that don't exist |
| `marketing/captions-bank.md` | "650 routes", "real-time", "offline map" framing from the old product |
| `marketing/shorts-scripts.md` | Old scripts; superseded by §8 here |
| `marketing/bios-and-handles.md` | Points at `pathsathi.vercel.app` (unconfirmed domain) |
| `marketing/make-video.html` | Hard-codes `find-your-bus.vercel.app` in five places |
| `marketing/hashtag-pack.md`, `captions-bank.md` | Hashtags fine; the claims are not |

Say the word and I'll rewrite each of those to match this plan, plus regenerate the banner artwork
with the Pathsathi wordmark.

---

*Pathsathi — Kolkata bus times. 651 routes, 2,194 stops. Free, no login, works offline.*
