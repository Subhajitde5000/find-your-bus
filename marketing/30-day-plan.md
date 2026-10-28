# Pathsathi — 30-Day Launch Plan

**Read me first.** This file is the whole campaign: what to post, on which day, on which platform,
with the words, the hashtags, the links and the steps to make it. Every day is written out — there is
no "repeat week 1" shortcut.

**Three files work together:**

| File | What is in it |
|---|---|
| **this file** | the plan: 5 pre-launch days + 30 launch days, platform set-up, ground work, how-tos, tracking |
| [`shorts-scripts.md`](shorts-scripts.md) | the **8 videos** — shots, word-for-word speech for an AI voice, on-screen text, captions, end card |
| [`hashtag-pack.md`](hashtag-pack.md) | the **hashtag sets A–J**, which set goes with which day, and the ones never to use |

**Read in this order:** §1–§5 of this file (15 minutes), then [`hashtag-pack.md`](hashtag-pack.md) §1,
then the five pre-launch days. Come back to the rest as you reach it. Nothing here needs to be
memorised.

---

## 1. What the product is — the only version you may repeat in public

| Fact | Number |
|---|---|
| Bus routes | **651** |
| Bus stops | **2,194** |
| Stands / depots / terminals | **193** |
| App size, works with no signal after the first visit | **~2.8 MB** |
| Cost, login, ads | **free, no login, no ads** |

What it does, in the words of the screens:

- **Find a bus** (`/`) — type two stops, see every bus between them with its published time, plus
  one-change journeys when there is no direct bus.
- **At your stop** (`/stop?stop=Esplanade`) — the next buses and the wait, and behind one tap the
  whole day, hour by hour.
- **Inside the bus** (`/on-bus?route=1`) — your own GPS against the route and timetable says which
  bus you are most likely in, and counts down to your stop.
- **Follow the ride** (`/ride`) — distance to the next stop, times for every stop ahead, offline.
- **Scan** (`/scan`) — the QR stickers, which are ordinary links: they open the app if installed, the
  website if not.

**Never claim these** (each one is false, and someone will check):

1. **"Live tracking" / "real-time bus position".** No bus sends its position. It is published times
   plus your phone's GPS — and the screen says so.
2. **"On the Play Store / App Store."** Neither is published (`mobile/APP.md` lists them as future
   work, and they cost money). "Install" means **Add to Home Screen** until that changes.
3. **"Look for our sticker at Esplanade."** No sticker is printed or stuck anywhere yet, unless you
   personally did it.
4. **"Official" / "WBTC" / "government".** You are independent.
5. **Bus registration numbers.** Not printed yet.

> ⚠️ The old banners in `marketing/banners/` break rules 1, 2 and 3 at once (they say *"Real-time
> info"*, show Google Play and App Store badges, and still say *Cholo*). Do not post them. §16 lists
> every old file that needs replacing.

---

## 2. Words used in this file

| Word | What it means here |
|---|---|
| **Reel / Short** | a vertical video, up to 60 s. Same file posted to Instagram (Reel), YouTube (Short), Facebook (Reel) |
| **Story** | the 24-hour circle at the top of Instagram/Facebook. Cheap: a screenshot, one line of text, a link sticker |
| **Carousel** | one Instagram post with several images you swipe through |
| **Hook** | the first 1–2 seconds. Decides whether anyone watches the rest |
| **Caption** | the text under a post |
| **Cover** | the still frame shown in your grid |
| **CTA** | call to action — the sentence that tells the viewer what to do next |
| **Save** | when someone bookmarks a post. The strongest signal you can get; it predicts installs |
| **UTM tag** | the `?utm_source=…` bit added to a link so analytics can tell you which post brought the visitor |
| **GA4** | Google Analytics 4 — free, and the only way to read UTM tags |
| **Ground session** | 45 minutes in person at a bus stand showing the app to strangers. Where most installs come from |
| **PWA / Add to Home Screen** | turning the website into an app icon. No store, no fee, works offline |

---

## 3. How a post becomes a website visit and an install

This is the part most plans leave out, and it is the reason a post can get 5,000 views and 3 installs.
Every post in this plan does all five steps.

```
1  REEL / POST  ──►  2  profile link  ──►  3  {{SITE}}  ──►  4  answers in 10 s  ──►  5  install
   last 3 s:              one link,               tagged with a UTM                 Add to Home Screen
   URL on screen          same on every post                                        (pinned how-to video)
   + "link in bio"
```

1. **The URL appears on screen** in the last 3–4 seconds, typed into a browser bar. People do not
   remember a caption; they remember a word they saw.
2. **One link in the bio.** Not five. Instagram cannot put a link in a caption, so the bio link is
   the only road out.
3. **The link is tagged** with `?utm_source=<platform>&utm_medium=<format>&utm_campaign=<post>`.
   Untagged links teach you nothing, so never post one.
4. **The page must answer in under 10 seconds**, or the visitor is gone. Check this yourself: open
   the link on your phone, cold, and time it.
5. **The install ask is 15 seconds long** — the pinned "install" video (V3). Every profile needs it
   at the top before the first post goes out.

**And the free real-world version:** the same QR on your phone screen at a bus stand. Someone points
their camera at your screen, and the site is on their phone before they walk away. That is
§11, and it is why ground sessions are in this plan.

---

## 4. Fill this in before you start

I cannot invent these, and every caption depends on them. Write them on paper, then use them.

| Placeholder | What it is | Where you get it |
|---|---|---|
| `{{SITE}}` | the live website address | your host. **Two different domains appear in old marketing files** (`find-your-bus.vercel.app`, `pathsathi.vercel.app`) — confirm which is live and fix both files |
| `{{APP_LINK}}` | Play Store link — **only if** you publish it | Play Console. Leave empty otherwise |
| `{{IG}}` `{{FB}}` `{{X}}` `{{YT}}` | the handles you actually get | §5 |
| `{{WA}}` | WhatsApp Channel link | create it on P1 |
| `{{DESK}}` | the community-desk address (report a missing route) | wherever `user_input/` is deployed |
| `{{PHONE}}` | a phone number or email strangers can write to | you |

**Two decisions to make on day P1:**

1. **Store or home screen?** If the Play Store is not published (it is not, today), "install" means
   **Add to Home Screen** — ₹0, 15 seconds, works on every phone. Every caption in this plan assumes
   that. If you publish later, only the link and one video change.
2. **English or Banglish voice?** All eight scripts are written in **English**, because free AI voices
   read it cleanly. If you want Banglish, say so and the scripts get rewritten as a set — never
   half-translate them by hand, or the videos will sound like two different accounts.

---

## 5. The platforms — set-up, then what goes where

Seven places. Each has one job. Doing all seven takes about 50 minutes on a normal day.

| Platform | Its job | How often | Handle to try (fall back in order) |
|---|---|---|---|
| **Instagram** | discovery → profile → link | 2 posts + 2 stories a week | `pathsathi.kolkata` → `pathsathi` → `pathsathiapp` |
| **Facebook Page** | the only place a link in a post is clickable | same posts as Instagram | page name `Pathsathi — Kolkata bus times`, username `pathsathikolkata` |
| **Facebook groups** | the highest-intent free audience that exists for this | 1 useful post a week, comments daily | — (join as yourself) |
| **YouTube** | search and long life; a Short keeps earning views | every Reel, plus one long video later | `@pathsathiapp` |
| **WhatsApp Channel** | trust and forwarding; in Kolkata this out-converts everything | 2–3 messages a week | channel `Pathsathi — Kolkata bus times` |
| **X** | transport accounts, local media, "build in public" | 2–3 posts a week | `pathsathiapp` → `pathsathi_in` |
| **Reddit r/kolkata** | one honest post reaches thousands of people who like local tools | twice in the month | your own account, at least a few weeks old |
| *Telegram* (optional) | only if you already use it — otherwise put the time into WhatsApp | 2–3 a week | `pathsathi` |

### 5.1 Set-up steps (30 minutes per platform, do it once)

**Instagram**
1. Create the account → switch to a professional account → category **Transportation service**.
2. Name field (searchable, separate from the username): `Pathsathi — Kolkata bus times`.
3. Bio (127 characters, paste as-is):
```
পথসাথী — Kolkata bus times 🚌
Esplanade → Garia in 10 seconds. 651 routes, 2,194 stops.
Works offline. No login.
👇 Find your bus
```
4. Link: `{{SITE}}/?utm_source=instagram&utm_medium=bio` — test it on your own phone.
5. Profile photo: `fontend/public/icons/icon.svg` (already the brand green bus mark).
6. Highlights (create empty ones now, fill them as you post): **Install**, **Find a bus**, **At your stop**, **Offline**.

**Facebook Page**
1. Create → category **Transportation service** → username `pathsathikolkata`.
2. About (244 characters):
```
পথসাথী (Pathsathi) — Kolkata's bus timetable. Type two stops and see every bus with its published
times, plus one-change options when there is no direct bus. A ride screen that works with no signal.
Free, no login, 651 routes and 2,194 stops.
```
3. Button **Learn more** → `{{SITE}}/?utm_source=facebook&utm_medium=page`.

**X** (153 characters)
```
Kolkata bus times in 10 seconds.
Two stops → every bus, its times, one-change options.
Offline ride screen. 651 routes, 2,194 stops.
Pathsathi 🚌 {{SITE}}
```

**YouTube**
- Handle `@pathsathiapp`; description: first 100 characters must say what it is —
  `Pathsathi — Kolkata bus timetable and offline ride screen. 651 routes, 2,194 stops. Free, no login.`
- Banner: `[IMAGE — generate: 2560×1440, brand green, bus mark, "Pathsathi", the line "Find your bus in
  10 seconds", and {{SITE}}; keep all text inside the central safety area.]`

**WhatsApp Channel**
- Name `Pathsathi — Kolkata bus times`; description `Kolkata bus times. Two stops → every bus. Works
  offline. {{SITE}}`. Hard rule: **never more than 3 messages a week**, or people mute it.

**Reddit** — no brand account. Use your own, and read §15.3 before the first post.

---

## 6. The month at a glance

**35 days of content: 5 pre-launch days (P1–P5) + 30 launch days.** If you must start on a Monday,
start P1 on the Wednesday before, so launch day 1 lands on a Monday morning commute.

| Day | Post | Type |
|---|---|---|
| **P1** | nothing public — accounts, link, analytics, install test | setup |
| **P2** | "What this is" (so the profile is not empty) | static |
| **P3** | teaser: 651 routes, 2,194 stops | carousel |
| **P4** | teaser: "three answers at a bus stop" + first ground test | static |
| **P5** | teaser video, "something is coming Monday" | **V0** |
| **1** | LAUNCH — "find any bus in 10 seconds" | **V1** |
| **2** | "261 routes stop at Esplanade" | carousel |
| **3** | story poll + X thread | story + X |
| **4** | "no signal" | **V2** |
| **5** | "install in 15 seconds" (pin this one) | **V3** |
| **6** | ground session #2 (Esplanade) | ground + story |
| **7** | week 1 review | review |
| **8** | "which bus am I in" | **V4** |
| **9** | "inside the bus, step by step" | carousel |
| **10** | story quiz + WhatsApp | story |
| **11** | "we don't track buses — here's why that's good" | static |
| **12** | reply day + X + WhatsApp | X |
| **13** | "three answers at a bus stop" | **V5** |
| **14** | review + ground session #3 | review + ground |
| **15** | college / office commute | carousel |
| **16** | behind the scenes + X | story + X |
| **17** | "where our times come from" | static |
| **18** | "one stop, the whole day" | **V6** |
| **19** | ground session #4 + collect testimonials | ground |
| **20** | route spotlight poll | carousel |
| **21** | week 3 review | review |
| **22** | "your own stop" | carousel |
| **23** | "tell us what's missing" | static |
| **24** | "no direct bus? one change" | **V7** |
| **25** | ground session #5, ask 10 people to install | ground |
| **26** | "what a commuter told us" | static |
| **27** | Kolkata bus numbers | carousel |
| **28** | week 4 review | review |
| **29** | outreach: DM 5 pages + ground #6 | outreach |
| **30** | the month in numbers + what's next | static |

**Two rules that keep this realistic:** never two videos in the same week in the first fortnight, and
if a day slips, **drop the post, keep the ground session.** Replies and in-person demos are what move
installs; an extra static post does not.

---

## 7. Pre-launch — the 5 days before the first public post

The mistake most people make is announcing on day one to an empty profile. These five days fix the
shop before it opens, and build a small queue of curiosity.

### P1 — Build the shop (no posting)

**Goal:** everything a visitor could click works before anyone is invited to click it.

- [ ] All seven accounts created; bios, names and photos from §5.1.
- [ ] `{{SITE}}` in every bio, each UTM-tagged. Open each one on your phone and check it lands on the homepage.
- [ ] **Analytics installed** (GA4 in `fontend/src/app/layout.tsx`, or your host's free analytics). GA4 is the one that reads UTM tags. *I can write this patch for you — ask.*
- [ ] **`appinstalled` event** added, so a home-screen install is counted. (`fontend/src/components/PwaBridge.tsx` already knows the install state.)
- [ ] Open `{{SITE}}` on your phone → Add to Home Screen → **turn on airplane mode → open it → it must work.** If it does not, fix that today; the whole promise depends on it.
- [ ] WhatsApp Channel created; add only contacts you actually know (20 is plenty).
- [ ] Print nothing. Buy nothing.

**Time:** 90 minutes. **Check tonight:** one visitor in GA4 (you), one `install` event (you).

### P2 — First post: what this is

**Why:** when the teasers start sending people to your profile, an empty grid looks abandoned. This
post is the explanation a visitor reads once.

- **Platforms:** Instagram carousel (3 slides) + Facebook Page + WhatsApp channel.
- **Images:**
  - `[IMAGE — generate: 1080×1350 slide 1. Brand green #195A45 background, white bus mark, the words
    "Pathsathi", under it "Kolkata bus times, free, no login", and small "651 routes · 2,194 stops".]`
  - `[IMAGE — generate: 1080×1350 slide 2. Three mini phone frames side by side showing: a search
    result list, a stop page with times, a route line with a dot. Labels: "find a bus", "at your
    stop", "inside the bus".]`
  - `[IMAGE — generate: 1080×1350 slide 3. Green background, big "Works with no signal", a small
    airplane-mode icon, {{SITE}} and the QR.]`
- **Caption:**
```
Kolkata buses, without the guessing.

Type two stops → every bus between them, with its published time.
Standing at a stop → the next buses and how long until each one.
Already on the bus → which bus you're in, and minutes to your stop.
No signal → still works. The timetable lives on your phone.

651 routes, 2,194 stops. Free, no login, no ads. Not live tracking — published times, and we say so.

Link in bio.
```
- **Hashtags:** [Set A](hashtag-pack.md#set-a-core).
- **Link:** `{{SITE}}/?utm_source=instagram&utm_medium=carousel&utm_campaign=whatitdoes`
- **Time:** 20 min. **Check tonight:** 3 clicks.

### P3 — Teaser 1: "651 routes"

**Why:** curiosity about *their own city*, with no product reveal. It gets saves, which is what
Instagram rewards before you have followers.

- **Platforms:** Instagram carousel (2 slides) + Facebook + WhatsApp status.
- **Images:**
  - `[IMAGE — generate: 1080×1350. Off-white background, huge dark-green number "651", under it
    "bus routes in Kolkata", small "and 2,194 stops". Looks like a poster, not an app.]`
  - `[IMAGE — generate: 1080×1350. Same style, big "5", under it "is how many of those routes most
    people can name", small line "we're making the other 646 easier."]`
- **Caption:**
```
651 bus routes in Kolkata. 2,194 stops.

Most of us can name five, and ask a stranger for the rest.

That's changing this Monday, 8:30 am.

#Pathsathi #Kolkata #KolkataBus #KolkataCommute #PublicTransport #CityOfJoy
```
- **Hashtags:** [Set D](hashtag-pack.md#set-d-at-your-stop).
- **Time:** 15 min. **Check tonight:** saves. Saves on a teaser are a very good sign.

### P4 — Teaser 2: "three answers" + first ground test

**Why:** the relatable version of the problem, and the first time a stranger sees it.

- **Platforms:** Instagram single image + Facebook + WhatsApp status.
- **Image:** `[IMAGE — generate: 1080×1080. A bus stop shelter at dusk, three blurred figures, one
  speech bubble each reading "5 no", "S5", "AC5?" — dark green overlay, the line "three people. three
  answers." in white.]`
- **Caption:**
```
Ask three people at a Kolkata bus stop, get three answers.

Monday we're putting a fourth answer in your pocket — the one with the times in it.

#Pathsathi #Kolkata #KolkataMemes #BengaliMemes #CommuterLife #KolkataDiaries #Esplanade
```
- **Hashtags:** [Set F](hashtag-pack.md#set-f-street-and-relatable).
- **Ground test (30 min):** go to your nearest busy stop, open `/stop?stop=<that stop>` and show it to
  three people. Don't sell it — ask "does this show your bus?" Write down their exact words (§11).
- **Time:** 45 min total. **Check tonight:** did anyone ask how to get it? That sentence becomes your
  launch caption.

### P5 — Teaser 3: the video

**Why:** video earns more reach than images, and this one asks for a *return visit* — the cheapest
thing to ask for.

- **Platforms:** Instagram Reel + YouTube Short + Facebook Reel + WhatsApp channel + WhatsApp status.
- **Post:** [Script V0](shorts-scripts.md#v0-something-is-coming) — 15 s, no demo.
- **Hashtags:** [Set A](hashtag-pack.md#set-a-core).
- **Link:** `{{SITE}}/?utm_source=instagram&utm_medium=reel&utm_campaign=teaser01`
- **Also today:** tell 10 people you know, individually, that tomorrow morning you'll send them one
  link, and ask them to try it and reply with what broke. Ten honest testers beat 100 likes.
- **Time:** 40 min (the video is your Day −1 footage, edited).

---

## 8. The 30 launch days

Every day has: the goal, exactly what to post, the words, the hashtags, the tagged link, the time it
takes, and the one number to look at tonight. Video days link to the full script.

### Day 1 — LAUNCH · "find any bus in 10 seconds"

**Goal:** the first 50 real visitors. **Post:** [Script V1](shorts-scripts.md#v1-find-any-bus-in-10-seconds) (35 s).
**Platforms and times:**

| Time | Where | What |
|---|---|---|
| 08:30 | Instagram Reel | V1 + caption from the script |
| 08:40 | YouTube Short | same file, description line + `{{SITE}}` |
| 09:00 | Facebook Reel, then the same video as a normal post with the link inline | link is clickable here |
| 09:10 | WhatsApp channel + status | one line + link |
| 09:20 | X | one post + link |
| 13:00 | Instagram story | "we're live" + link sticker |
| 20:00 | replies | every comment, personally |

**Caption:** in [the script](shorts-scripts.md#v1-find-any-bus-in-10-seconds).
**Hashtags:** [Set A](hashtag-pack.md#set-a-core) + `#Esplanade`.
**Links:** `{{SITE}}/?utm_source=instagram&utm_medium=reel&utm_campaign=launch01` — and the same post
with `facebook` / `youtube` / `whatsapp` / `x` in `utm_source`.
**Time:** 25 min of posting (the video was made on P5).
**Tonight:** GA4 → Acquisition → Traffic acquisition → filter campaign `launch01`. If it is zero, the
bio link is wrong. Fix it before Day 2.

---

### Day 2 — "261 routes stop at Esplanade"

**Goal:** make it about *their* stop, not your app. **Post:** 3-slide carousel.

- **Images:**
  - `[IMAGE — generate: 1080×1350, dark green, huge "261", under it "routes stop at Esplanade", small
    "roughly 9,800 timetabled passes a day".]`
  - `[IMAGE — generate: 1080×1350, a clean phone screenshot mock of `/stop?stop=Esplanade`: a list of
    buses with times and wait badges, brand colours, readable at thumbnail size.]`
  - `[IMAGE — generate: 1080×1350, green, "Type your stop. See every bus." + {{SITE}} + QR.]`
- **Caption:**
```
261 routes stop at Esplanade. Around 9,800 timetabled passes a day.

You know about five of them.

Open your own stop once: the next buses, the wait for each one, and the whole day hour by hour.
Then tap any bus to follow the ride.

Which stop should we do next? Comment it and we'll post it. 👇

#Pathsathi #Kolkata #KolkataBus #BusStop #KolkataDiaries #PublicTransport #Esplanade
```
- **Platforms:** Instagram carousel (1 post) + Facebook Page (with the link inline) + WhatsApp channel.
- **Hashtags:** [Set D](hashtag-pack.md#set-d-at-your-stop) + `#Esplanade`.
- **Link:** `{{SITE}}/?utm_source=instagram&utm_medium=carousel&utm_campaign=stop01`
- **Tonight:** collect the stop names people comment. They are Day 10's story and Day 22's post.

---

### Day 3 — polls, replies, and the first thread

**Goal:** turn the first wave of attention into conversations. Cheap day, high return.

- **Story 1 (morning):** poll — `How do you find your bus today?` → `Ask someone` / `Guess` / `Wait for the right one`.
- **Story 2 (evening):** a 10-second screen recording of the stop that got the most comments on Day 2, with the link sticker (`?utm_source=instagram&utm_medium=story&utm_campaign=stop02`).
- **X thread (3 posts)** — post these one after another:
```
1/ I built a Kolkata bus timetable that works with no signal. 651 routes, 2,194 stops, free, no
login. Here's what it does 🧵
2/ Type two stops → every bus between them with its published time, and one-change journeys where
there's no direct bus. At a stop → the next buses and the whole day, hour by hour.
3/ Inside the bus, your GPS against the route tells you which bus you're in and when to get off —
offline. Not live tracking, and the screen says so. {{SITE}}
```
- **Hashtags:** one only, `#KolkataBus`, on the first and last post of the thread — X punishes tag
  walls, and [Set A](hashtag-pack.md#set-a-core) is written for Instagram, not here.
- **Replies:** every comment on Day 1 and Day 2, from your own account, in your own voice. Use §15.1
  when someone asks "is this live?".
- **Time:** 20 min. **Tonight:** replies sent / comments received. If nobody asked a question, your
  captions aren't inviting one — ask a question at the end of every post from now on.

---

### Day 4 — "no signal"

**Goal:** the single most surprising thing about the product. **Post:** [Script V2](shorts-scripts.md#v2-no-signal) (20 s).
- **Platforms:** Instagram Reel, YouTube Short, Facebook Reel, WhatsApp channel — all in the morning.
- **Caption + hashtags:** [Set B](hashtag-pack.md#set-b-offline) + `#EMBypass`, in the script.
- **Link:** `{{SITE}}/?utm_source=instagram&utm_medium=reel&utm_campaign=offline01`
- **Tonight:** clicks on `offline01` versus `launch01`. One of the two stories is your hook for the
  rest of the month. Post more of that one.

---

### Day 5 — "install in 15 seconds" (pin it)

**Goal:** every profile visitor now has an obvious next step. **Post:** [Script V3](shorts-scripts.md#v3-install-in-15-seconds) (25 s).
- **Platforms:** Instagram Reel — **pin it to the top of the profile** · YouTube Short · Facebook Reel.
- **Caption + hashtags:** [Set C](hashtag-pack.md#set-c-install), in the script.
- **Also:** add the video to the **Install** highlight. From today, every reply that says "how do I
  get it?" gets one word: *pinned*.
- **Tonight:** count replies asking how to install. If that number is zero, your captions are not
  asking for the install clearly enough — put "link in bio" in the *first* line, not the last.

---

### Day 6 — ground session #2: Esplanade

**Goal:** 10 strangers with the site on their phone. No camera needed.

- **What to do (45 min):** §11, steps 1–6. Stand near the queue, phone showing
  `/stop?stop=Esplanade`, let people look, let them scan your screen, ask "is your route missing?".
- **Story (during or after):** a 5-second clip of a hand scanning your screen (ask first) or just the
  stop, with text `day 2 of showing strangers` + poll `helpful?`.
- **Post nothing on the grid.** Today is about people, not pixels.
- **Tonight:** write down, word for word, the three most common things people said. One of them is
  Day 11's post, one is Day 23's, one is a bug you should look at.

---

### Day 7 — week 1 review

**Goal:** stop guessing. 25 minutes, no posting.

- Fill the tracking table (§13) for days P2–6.
- Answer three questions: which post brought the most **clicks**; which got the most **saves**; what
  did the bus-stand people say that no post answers.
- Decide next week from those answers: repeat the format that won, drop the one that did not
  (a format under 300 views twice in a row is dropped — decide now, not in the moment).
- **Story (optional):** `week 1 in numbers` — a plain screenshot of your tracking table. People love
  honesty about small numbers, and it starts conversations.

---

### Day 8 — "which bus am I in"

**Goal:** the feature nobody else has. **Post:** [Script V4](shorts-scripts.md#v4-which-bus-am-i-in) (40 s).
- **Platforms:** Instagram Reel · YouTube Short · Facebook Reel · WhatsApp channel.
- **Caption + hashtags:** [Set E](hashtag-pack.md#set-e-inside-the-bus) + `#ParkStreet`.
- **Link:** `{{SITE}}/?utm_source=instagram&utm_medium=reel&utm_campaign=onbus01`
- **Extra:** this is the video to show a friend who takes the bus daily, in person, on your phone.
- **Tonight:** if comments say "this is just GPS", reply once with the honest sentence from §15.1 and
  move on. Never argue twice with the same person.

---

### Day 9 — "inside the bus, step by step"

**Goal:** the same idea as Day 8, in a format people can read at their desk.

- **Images (3 slides):**
  - `[IMAGE — generate: 1080×1350. Phone in a bus seat, screen showing a route line with a dot,
    text "1 — open the sticker or the app".]`
  - `[IMAGE — generate: 1080×1350. Same style, the "which bus" card with minutes, text "2 — it names
    the bus you're most likely in".]`
  - `[IMAGE — generate: 1080×1350. Same style, a destination picker, text "3 — pick your stop, it
    counts down and buzzes", plus {{SITE}} + QR.]`
- **Caption:**
```
Inside the bus, in three steps.

1. Open the sticker on the bus, or the app.
2. It matches where you are against the route and the timetable, and tells you which bus you're
   most likely in, plus minutes to the next stop.
3. Pick where you're getting off — it counts down and buzzes before your stop.

Not live tracking: no bus sends its position. Your phone's GPS, plus the times the operators
publish. Works with no signal.

#Pathsathi #KolkataBus #KolkataCommute #BusRide #HonestTech #Kolkata #Garia
```
- **Platforms:** Instagram carousel + Facebook + WhatsApp channel.
- **Hashtags:** [Set E](hashtag-pack.md#set-e-inside-the-bus) + `#Garia`.
- **Tonight:** saves. A how-to gets saved more than it gets liked; saves are what you want.

---

### Day 10 — story quiz + WhatsApp

**Goal:** engagement with zero production. 12 minutes.

- **Story:** quiz sticker — `Which stop has 261 routes?` with `Esplanade` / `Howrah` / `Sealdah`, then
  a second story revealing it with a link sticker to `/stop?stop=Esplanade`
  (`?utm_source=instagram&utm_medium=story&utm_campaign=quiz01`).
- **WhatsApp channel:** one line — `Did you know 261 routes stop at Esplanade? Type your own stop:
  {{SITE}}`. No hashtags.
- **Tonight:** story taps per sticker. If nobody answers, your stories need a question, not a picture.

---

### Day 11 — "we don't track buses. Here's why that's good."

**Goal:** trust. This is the post that stops the "is this live?" objection forever, and it makes
every other number believable.

- **Image:** `[IMAGE — generate: 1080×1350. Off-white, a simple diagram: a bus icon with a dashed line
  and the words "no bus sends us its position" above; below, a phone icon with a solid line "your GPS
  + the published timetable"; caption strip "we tell you which is which".]`
- **Caption:** the honesty caption from
  [hashtag-pack.md §8](hashtag-pack.md#8-three-ready-made-captions-with-tags-attached).
- **Platforms:** Instagram + Facebook (this one travels further on Facebook) + X (shortened).
- **Hashtags:** [Set H](hashtag-pack.md#set-h-honesty-and-behind-the-scenes).
- **Link:** `{{SITE}}/?utm_source=instagram&utm_medium=post&utm_campaign=honest01`
- **Tonight:** read the comments. If someone says "finally, honesty", screenshot it — Day 26's card.

---

### Day 12 — reply day

**Goal:** the unglamorous day that decides the month. Nothing new is published.

- Reply to **every** comment across all platforms, including old posts.
- Answer 5 questions in Facebook groups about routes, **without** posting a link (you become a known
  helpful person first; the link comes in Day 23).
- **X:** one post — a route fact from the data, with one hashtag.
- **WhatsApp channel:** one message — the stop with the most routes you found today.
- **Tonight:** conversations started. This is the number that precedes installs by about a week.

---

### Day 13 — "three answers at a bus stop"

**Goal:** reach beyond people who already care. **Post:** [Script V5](shorts-scripts.md#v5-three-answers-at-a-bus-stop) (35 s).
- **Platforms:** Instagram Reel · YouTube Short · Facebook Reel · WhatsApp status.
- **Caption + hashtags:** [Set F](hashtag-pack.md#set-f-street-and-relatable) + `#Shyambazar`.
- **Consent:** ask before filming anyone. No faces, no plates, no voices without a yes (§11.4).
- **Tonight:** sends/shares. This video's job is to be forwarded in a WhatsApp group, so watch
  shares, not likes.

---

### Day 14 — review #2 + ground session #3

- **Review (25 min):** same three questions as Day 7. Look at the two-week click total: is it growing,
  flat, or falling? Flat means the *hook*, not the volume, is the problem.
- **Ground (45 min):** a stand you have not visited yet — Howrah Station, Salt Lake Sector V, Jadavpur
  or Dum Dum. Same six steps. Note the objections.
- **Story:** the ground clip, text `stand #3`, poll.
- **Tonight:** write down one sentence someone said that would make a good caption. Use it on Day 22.

---

### Day 15 — "college and office commute"

**Goal:** target a defined group instead of "everyone".

- **Images (3 slides):**
  - `[IMAGE — generate: 1080×1350. A college gate in the morning, students with bags, overlay
    "8:50 am. class at 9."]`
  - `[IMAGE — generate: 1080×1350. Phone screen: search "Jadavpur" → "Esplanade", result list with
    times, overlay "same journey, three options, every day".]`
  - `[IMAGE — generate: 1080×1350. Green, "save it before your next 9 am" + {{SITE}} + QR.]`
- **Caption:**
```
8:50 am. Class at 9. You're at Jadavpur, and you need to know if the next bus makes it.

Type the two stops once and you'll know every day: which buses connect them, the times, and how
long the wait is. Save it before your next 9 am.

Works with no signal, which is the only reason it's useful on a bus.

#Pathsathi #Kolkata #KolkataBus #KolkataCommunity #CityOfJoy #PublicTransport #Jadavpur
```
- **Platforms:** Instagram + Facebook + WhatsApp channel.
- **Hashtags:** [Set I](hashtag-pack.md#set-i-community) + `#Jadavpur`.
- **Tonight:** saves. If saves are high and clicks low, the CTA line is too quiet — move it to the
  first line.

---

### Day 16 — behind the scenes

**Goal:** make the person behind it visible. People install from people.

- **Story (3 frames):** your desk/phone, the data file open (`kolkata-bus-data.json`), and one line:
  `2,194 stops in one file. ask me anything about your route.` + question box.
- **X:** one post — how the data gets built, in three sentences, one hashtag.
- **Tonight:** collect the question-box answers. Every one is a future post, and every one is a
  person who will come back for the answer.

---

### Day 17 — "where our times come from"

**Goal:** answer the quiet suspicion that the times are made up.

- **Image:** `[IMAGE — generate: 1080×1350. Off-white poster: three stacked "source" cards labelled
  "operators' published times", "2,194 stop positions", "the route's own stop list"; a red-ish stamp
  reading "no guesses — where there is no time, we show no time".]`
- **Caption:**
```
Where do the times come from?

The operators' published passage times, compiled into one file, plus the route's own stop list.
Where a route has no published times, we show no times instead of inventing them — the screen says
so, plainly.

That's why some buses have exact times and some only have "runs to frequency". Both are true,
and you deserve to know which is which.

Free, no login: {{SITE}}

#Pathsathi #BuildInPublic #DataHonesty #MadeInKolkata #KolkataTech #KolkataBus
```
- **Platforms:** Instagram + Facebook + X (shortened) + WhatsApp channel.
- **Hashtags:** [Set H](hashtag-pack.md#set-h-honesty-and-behind-the-scenes).
- **Tonight:** comments that question the data. Answer each one with a specific route, checked on the
  site before you reply.

---

### Day 18 — "one stop, the whole day"

**Goal:** depth — this is what makes people save and come back. **Post:** [Script V6](shorts-scripts.md#v6-one-stop-the-whole-day) (30 s).
- **Platforms:** Instagram Reel · YouTube Short · Facebook Reel.
- **Caption + hashtags:** [Set D](hashtag-pack.md#set-d-at-your-stop) + `#Sealdah`.
- **Tonight:** saves per view. This is your best "save" video; if it is, reuse the format for the next
  month's videos.

---

### Day 19 — ground session #4, with a purpose: testimonials

- **Ground (45 min):** a stand you have not covered. This time, after the demo, ask two questions:
  "would you use this?" and "can I quote you?" — a voice note is perfect, a name is optional.
- **Collect:** 3 quotes minimum. Write them down exactly; do not tidy them.
- **Tonight:** you now have Day 26's post. If nobody would say yes, ask what would have to be true —
  that answer is more valuable than the quote.

---

### Day 20 — route spotlight poll

**Goal:** let the audience choose the content. Engagement with almost no work.

- **Images (2 slides):**
  - `[IMAGE — generate: 1080×1350. Dark green, the words "which one should we break down next?" and
    three route numbers as large pills: 1 · 230 · S12D.]`
  - `[IMAGE — generate: 1080×1350. Green, "vote in the poll, we post the winner on Sunday" + {{SITE}} + QR.]`
- **Caption:**
```
Three buses. One post each week. You pick.

1 — Ramnagar ↔ Mukundapur
230 — the long one through the south
S12D — the one nobody can pronounce

Vote in the poll on our story. We'll post the full stop list, the times and the odd facts about the
winner.

#Pathsathi #KolkataBus #KolkataRoutes #WBTC #BusRoute #Kolkata #Howrah
```
- **Platforms:** Instagram carousel + story poll + Facebook (poll as a post) + WhatsApp channel.
- **Hashtags:** [Set G](hashtag-pack.md#set-g-routes) + `#Howrah`.
- **Check before posting:** open each route on the site and use its real termini. Do not describe a
  route you have not opened today.
- **Tonight:** votes. The winner is next week's post; the losing options come back next month.

---

### Day 21 — review #3

- Same three questions. Add one: **which single post would you pay to boost?** That is your best
  creative — make more like it.
- Update the tracking table, and re-read §6: is any day slipping? If yes, drop the weakest post next
  week and keep the ground sessions.

---

### Day 22 — "your own stop"

**Goal:** close the loop with the people who commented on Day 2.

- **Images (4 slides):** four real stops, each a screenshot of that stop's page with its name set in
  the brand font: pick from the comments. `[IMAGE — generate: one 1080×1350 card per stop, same
  template: stop name large, "N routes call here", a phone screenshot of the next buses, the line
  "your stop, your times".]`
- **Caption:**
```
You asked, so here they are: <stop 1>, <stop 2>, <stop 3>, <stop 4>.

Each one with every bus that calls there, the wait for the next, and the whole day.

Comment your stop and we'll do it in the next batch. If a route is missing, tell us that too — that's
the one thing we actually need from you.

#Pathsathi #Kolkata #KolkataBus #BusStop #KolkataDiaries #PublicTransport #Tollygunge
```
- **Platforms:** Instagram carousel + Facebook + WhatsApp channel.
- **Hashtags:** [Set D](hashtag-pack.md#set-d-at-your-stop) + the area of the biggest stop.
- **Tonight:** new stop comments. These become Day 27 and next week's ground locations.

---

### Day 23 — "tell us what's missing"

**Goal:** the community desk. The highest-value ask you can make, because it improves the product
while it markets it.

- **Image:** `[IMAGE — generate: 1080×1350. Green card with a single big question mark made of route
  lines, the words "what's missing?", and two lines: "a route we don't have · a stop with the wrong
  name".]`
- **Caption:**
```
Two things we need from you, and neither takes a minute.

1. A route we don't have. Route number and two stops is enough.
2. A stop whose name or position is wrong. Tell us the stop and what it should say.

Send them here: {{DESK}} — or just comment. We check every one, and we'll tell you what we find.

#Pathsathi #Kolkata #KolkataBus #KolkataCommunity #CityOfJoy #PublicTransport
```
- **Platforms:** Instagram + Facebook + X + WhatsApp channel + **one Facebook group post** (the
  invite in §15.2, reworded for the group).
- **Hashtags:** [Set I](hashtag-pack.md#set-i-community).
- **Tonight:** count submissions. Ten real submissions is a better result than 100 likes, and it is
  content for the rest of the month.
- **If `{{DESK}}` is not deployed yet:** say "comment or DM" and skip the link. Never link to
  something that 404s.

---

### Day 24 — "no direct bus? one change"

**Goal:** reach people who believe their journey has no bus. **Post:** [Script V7](shorts-scripts.md#v7-no-direct-bus-one-change) (30 s).
- **Platforms:** Instagram Reel · YouTube Short · Facebook Reel · WhatsApp status.
- **Caption + hashtags:** [Set G](hashtag-pack.md#set-g-routes) + `#Behala`.
- **Tonight:** comments saying "does it work from X to Y?" — answer each by actually checking the pair
  on the site and saying yes/no. Those answers are your best trust-building, and they are free.

---

### Day 25 — ground session #5: ask for the install

**Goal:** the only day you ask strangers for something.

- **Ground (60 min):** busy stand, morning. Demo, then: "want it on your phone? 15 seconds." Do it for
  them — open `{{SITE}}`, Add to Home Screen, hand the phone back with the icon on it.
- **Count:** demos, installs, refusals. Refusals are data: ask why, once.
- **Story:** `installed 6 phones at Esplanade today`, with a link sticker.
- **Tonight:** your real install rate per demo. If it is above 1 in 3, this is the channel to double.

---

### Day 26 — "what a commuter told us"

**Goal:** social proof, in someone else's words.

- **Image:** `[IMAGE — generate: 1080×1350. A quote card: quotation marks, the exact sentence from
  Day 19, attributed only as "commuter, <area>" unless they agreed to their name; brand green border,
  small bus mark.]`
- **Caption:**
```
What people actually say when you show them, at the stop, on their own route:

"<their words>"

Not a review campaign. Just three people at a bus stand this week. If you've used it, tell us what's
wrong with it — that's more useful to us than a compliment.

{{SITE}}

#Pathsathi #Kolkata #KolkataBus #KolkataCommunity #CityOfJoy #PublicTransport
```
- **Platforms:** Instagram + Facebook + WhatsApp channel.
- **Hashtags:** [Set I](hashtag-pack.md#set-i-community).
- **Tonight:** whether anyone tags a friend. Tagging is the strongest sharing signal.

---

### Day 27 — Kolkata bus numbers

**Goal:** a saveable, shareable data post that has nothing to do with your app's features.

- **Images (3 slides):** build the numbers **from the data, today** (open the site, count, and use
  what you can verify): the stop with the most routes, the longest route's two termini, the number of
  routes that run through one busy junction.
  `[IMAGE — generate: three 1080×1350 cards, one number each, same template: giant number, one-line
  explanation, small "checked on our own data, today".]`
- **Caption:**
```
Three numbers from the data we compile:

· <N> routes call at <stop> — the busiest stop we have
· <route> is the longest we carry: <origin> to <destination>
· <N> routes pass through <area>

All of it is in the app, free, and it works with no signal. Which number surprised you?

#Pathsathi #Kolkata #KolkataBus #BusStop #KolkataDiaries #PublicTransport #SaltLake
```
- **Platforms:** Instagram carousel + Facebook + WhatsApp channel.
- **Hashtags:** [Set D](hashtag-pack.md#set-d-at-your-stop) + `#SaltLake`.
- **Rule:** every number must be checked on the site before you post it. If you cannot check it, cut
  the line. One invented number costs the trust the whole month buys.

---

### Day 28 — review #4

- Same three questions, plus: what is the **one** thing to keep doing next month, and what is the one
  thing to stop.
- Add up the month: views, clicks, installs, saves, followers, submissions.
- Decide the next month's shape now, while the numbers are in front of you — not later from memory.

---

### Day 29 — outreach day

**Goal:** borrow other people's audiences. Nothing new on your grid.

- **DM 5 pages** (college pages, Kolkata meme pages, local transport accounts): §15.4 template. One
  message, no follow-up if ignored.
- **Ground session #6:** the stand where you had the best conversations.
- **X:** one post tagging nobody, just the honest month summary in two sentences.
- **WhatsApp channel:** one message — the week's best stop page.
- **Tonight:** replies. Two yeses out of five is a good day.

---

### Day 30 — the month in numbers

**Goal:** close the loop publicly. This is the post that makes the next month easier.

- **Image:** `[IMAGE — generate: 1080×1350. Brand green, a simple four-number grid: stops covered,
  routes, people who installed, days. Below: "month one. thank you, Kolkata." and {{SITE}} + QR.]`
- **Caption:**
```
Thirty days.

<X> posts, <Y> people who installed it on their phone, <Z> routes we checked because you told us
they were wrong, and one lesson: nobody wants an app. They want to know when the bus comes.

Next month: more stops, more routes, and the same rule — if we can't back up a time, we don't show
it.

If this saved you one wait, send it to one person who takes the bus. That's the whole ask.

#Pathsathi #Kolkata #KolkataBus #CityOfJoy #KolkataDiaries #KolkataCommute
```
- **Platforms:** Instagram + Facebook + X + WhatsApp channel.
- **Hashtags:** [Set J](hashtag-pack.md#set-j-recap).
- **Tonight:** write down the three things you will do differently in month two. Then stop for the
  day — burnout at day 30 is the most common way this plan dies.

---

## 9. Weekly reviews (days 7, 14, 21, 28)

Twenty-five minutes, no posting. Fill the table in §13 first — the review is reading it, not
remembering it.

1. **Which post got the most clicks** (not likes)? Do that format twice next week.
2. **Which post got the most saves?** Saves predict installs more than any other number.
3. **What did people say in person** that no post answers? That becomes a post, or a fix.
4. **Which day slipped?** If two slipped, cut one post a week — permanently. A plan you finish beats
   a plan you abandon.

**Kill rules** (decide now, not in the moment):

- A format with under 300 views twice in a row is dropped.
- A platform with zero clicks for two weeks gets one post a week, not daily effort.
- If clicks are fine but **installs are low**, the problem is on the site, not the marketing: the
  install video (V3) is the fix, and it belongs in the bio, pinned.

---

## 10. What this plan costs

**₹0.** Nothing here needs an ad, a domain, a microphone or a subscription.

| Need | Free route |
|---|---|
| Camera | your phone, rear lens, 1080p |
| Editing | CapCut (free), 9:16, auto-captions |
| Voice | CapCut text-to-speech / Microsoft Edge Read aloud / gTTS |
| Screen recording | built-in recorder on Android and iOS |
| QR codes | **the repo's own** `qr-admin/index.html` |
| Images | screenshots of the real app + the `[IMAGE — generate: …]` briefs in this file |
| Analytics | GA4 free |
| Hosting | whatever static host is already serving `{{SITE}}` |

The only optional spend, and only if you want it: ₹100–200 printing A4 posters of one stop's QR at a
local shop. Everything in this plan works without it.

---

## 11. Ground sessions — the detailed version

Six sessions: **P4 (test), Day 6, 14, 19, 25, 29.** 45–60 minutes each. This is where installs
actually come from; a Reel gets views, a stranger with your icon on their home screen is an install.

1. **Pick the stand and the hour.** Morning peak (08:00–10:00) at Esplanade, Garia, Howrah Station,
   Salt Lake Sector V, Jadavpur, Dum Dum. Stand *near* the queue, not in it.
2. **Open the stop page before you talk to anyone:** `/stop?stop=<that stand>`.
3. **Don't pitch.** Hold the phone where it can be seen, look at it, wait. Curiosity starts the
   conversation: "is that the bus times?" gets you more than "excuse me, may I show you an app?".
4. **Let them work it themselves.** Hand the phone over, or let them scan it from your screen.
5. **Ask the one question that matters:** "is your route in there?" Then "what's wrong with it?"
6. **Ask for the install only on Day 25** — and do it *for* them: `{{SITE}}` → Add to Home Screen →
   phone back with the icon on it.

**Consent, always:** ask before filming. No face, no voice, no number plate without a yes. If
someone says no, say thank you and film the board, the queue's feet, or the road instead.

**What to write down after (5 minutes):** the three most common sentences people said, word for word.
Those words are better captions than anything written at a desk — the Day 22 and Day 26 posts come
straight from them.

---

## 12. How to do the technical bits

### 12.1 Screen recording
- **Android:** pull down the quick panel → Screen recorder. Turn off notifications for the recording.
- **iPhone:** Settings → Control Centre → add Screen Recording → swipe down → tap. (Airplane mode
  does not stop recording.)
- Record at 100% brightness with the light theme off, and **wait one second after every tap** — that
  second is what makes the edit readable later.

### 12.2 Making a Reel in CapCut (10 minutes, once)
1. New project → select the clips and screen recordings for that script.
2. Set the frame to 9:16; trim each clip to the timings in [`shorts-scripts.md`](shorts-scripts.md).
3. Audio → **Text to speech** → paste the script's speech → pick one calm voice → speed 0.95×.
4. Text → **Auto captions** → style white bold with a black outline, bottom third.
5. Add the on-screen text from the script (it is different from the captions — the captions are the
   voice, the on-screen text is the poster).
6. Add the end card image for the final 4 seconds.
7. Export 1080p, 30 fps. No watermark, no music.

### 12.3 Making the QR (2 minutes)
1. Open `qr-admin/index.html` in a browser (it is not part of the website).
2. Set the address to `{{SITE}}`, choose a route or a stop, download PNG or SVG.
3. The code already carries the Pathsathi mark and is raised to error-correction H so it still scans.
4. Paste it into the end card. Same QR every video.

### 12.4 Add to Home Screen (what you are asking people to do)
- **Android (Chrome):** open the site → ⋮ menu → **Add to Home screen** → Add.
- **iPhone (Safari):** open the site → Share → **Add to Home Screen** → Add.
- Then turn on airplane mode and open the icon. If it loads, the install worked. This is also V3.

### 12.5 Reading GA4 in two minutes
Reports → **Acquisition** → **Traffic acquisition** → set the dimension to **Session campaign**.
- Every row is one `utm_campaign` you posted.
- `Sessions` = visits from that post. `Engagement rate` = did they stay.
- If a post has views but no sessions, the link was missing, mistyped, or not in the bio.

---

## 13. Tracking table

Copy this into a notes app and fill it every night — five minutes. If a row is empty, you cannot
review; if you cannot review, you are guessing.

| Day | Post | Platform | Views | Sessions (UTM) | Installs | Saves | Comments | One line: what happened |
|---|---|---|---|---|---|---|---|---|
| P2 | what it is | IG | | | | | | |
| P3 | 651 routes | IG | | | | | | |
| 1 | V1 launch | IG | | | | | | |
| 1 | V1 launch | YT | | | | | | |
| … | | | | | | | | |
| **30** | **totals** | **all** | | | | | | |

**Planning numbers to replace on Day 7, not promises:** 3,000–8,000 views across the month, 200–500
tagged site visits, 20–60 installs, 150–400 followers. If they come in below, the answer is more
ground work and more replies — not more posts.

---

## 14. What to send me to generate a post

Say **"generate post <day number>"** (for example *"generate post 2"*) and you get:

1. the **image(s)** at the right size, built from the brief in that day, with the wordmark, the URL
   and the QR placed properly;
2. a **one-line description** of what the image says, so you can approve or change it;
3. the **caption**, inside the platform's limit, with the UTM link filled in.

Three things make that instant instead of a conversation:

1. **`{{SITE}}`** — the real address.
2. **Store or home screen** (§4) — it changes the last line of every caption.
3. **English or Banglish** (§4) — it changes every script.

If a post needs a photo of a real bus or a real stand, say whether you will shoot it or I should
generate it: generated images are fine for posters and cards, but a Kolkata audience can tell a
generated bus from a real one, so keep generated images for the graphics.

---

## 15. Talking to people

### 15.1 Replies to the questions you will get

| They say | You reply |
|---|---|
| "Is this live tracking?" | "No — no bus sends its location. It uses the published timetable and your GPS, and the screen says so." |
| "Google Maps does this." | "It does. This has the operators' published times, the whole day at a stop, and it works with no signal." |
| "My route isn't there." | "Tell me the route and two stops, I'll check the data. Missing ones are exactly what I want to hear." |
| "Is it on the Play Store?" | "Not yet. For now it installs from the browser in 15 seconds and works offline — no store, no fee." |
| "Is it official?" | "No. Independent and free, built from publicly available timetable data." |
| "How do I use it?" | "Link in bio → Add to Home Screen → open it. Fifteen seconds, and then it works with no signal." |
| "This is fake / the times are wrong." | "Tell me the route and the time you saw. If our data is wrong I'll fix it and tell you what changed." |

Two rules: never argue twice with the same person, and never answer a data complaint without opening
that route on the site first.

### 15.2 Facebook group invite (one post, after a week of being helpful)

```
People keep asking "which bus from X to Y" here, so I built a free tool for it: type two stops, see
every bus with its published time, and a one-change option when there is no direct bus. No login, no
ads, and it works inside the bus with no signal.

{{SITE}}?utm_source=facebook&utm_medium=group&utm_campaign=group01

If a route is missing, tell me in the comments and I'll check it. (I'm the one who built it.)
```
If an admin removes it: thank them, ask what would be allowed, do not repost.

### 15.3 Reddit r/kolkata — twice, maximum

- Use an account that is a few weeks old with some history; a new account posting one link is removed
  automatically.
- Title it as a person: *"I built a free Kolkata bus timetable that works with no signal — looking for
  people to break it."*
- Put the limits in the post: not live tracking, published times only, stickers not printed yet.
- Answer every comment and fix what people report, then post the second update in week 4 with the
  fixes.

### 15.4 DM template (5 pages, Day 29)

```
Hi — I built Pathsathi, a free Kolkata bus timetable (651 routes, 2,194 stops, works offline, no
login). Not asking for money or a shoutout: would you try it once on a route you actually take, and
tell me what's wrong with it? If it's useful, you're welcome to share it — here's the link:
{{SITE}}
```

---

## 16. Rules, and what to stop using

**Never:** say "real-time" or "live"; claim a store listing; claim a sticker is in a bus; claim to be
official; invent a number; buy followers, likes or views; post more than twice a day on one platform;
send more than one WhatsApp channel message a day; use someone's face, voice or number plate without
asking; repost watermarked edits; promise a missing route "today".

**Old marketing files that contradict this plan — do not publish from them:**

| File | Problem |
|---|---|
| `marketing/banners/*.png` | say *Cholo*, say "Real-time info", show Google Play / App Store badges that do not exist |
| `marketing/captions-bank.md` | old product claims, "650+" instead of 651, "real-time" lines |
| `marketing/bios-and-handles.md` | points at an unconfirmed domain (`pathsathi.vercel.app`) |
| `marketing/make-video.html` | hard-codes `find-your-bus.vercel.app` in five places |
| `marketing/hashtag-pack.md` | **updated — safe to use, this plan links to it** |
| `marketing/shorts-scripts.md` | **updated — the eight scripts this plan uses** |
| `marketing/AI-BANNERS-GALLERY.html`, `preview.html`, `shoto-videos.html`, `real-app-demo.html`, `slow-motion-reel.html` | old assets and old claims; treat as reference only |

Ask me and I will rewrite or regenerate any of them to match this plan.

---

*Pathsathi — Kolkata bus times. 651 routes, 2,194 stops. Free, no login, works offline.*
