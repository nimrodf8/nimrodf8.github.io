# Family Points

**Live: https://nimrodf8.github.io/**

Chores, points and family rewards for the kids at home — a single static web app
with no build step, no server and no account anywhere. Everything lives in the
browser of the device the family uses.

Available in **English**, **Nederlands** and **עברית** (right-to-left). Every
account picks its own language, and what one person writes is translated into
the language of whoever reads it.

## Running it

This repository is the site: GitHub Pages publishes it at
https://nimrodf8.github.io/ straight from `main`, so anything pushed here is
live within a minute. To run it yourself, open `index.html` in a browser, or
serve the folder:

```sh
python3 -m http.server 8080     # then open http://127.0.0.1:8080
```

Any static host works too (GitHub Pages, Cloudflare Pages, a shared tablet's
home screen).

There is also a one-file build for hosts that want a single upload:

```sh
node build.js              # standalone.html — a complete page
node build.js --artifact   # artifact.html — page content without the <html>
                           # shell, for hosts that supply their own
```

Both are generated; `index.html` plus `assets/` and `js/` stay the source of
truth, so rebuild after changing anything there. The one-file builds inline the
icons as data URIs but drop the `@font-face` rules and the manifest link: a
single file has no siblings to load a font or an icon set from, and inlining
64 KB of font as base64 would nearly double a build whose whole point is to be
portable. They fall back to the system typeface, exactly as the real site does
before the font arrives. The first visit walks a parent through a four-step setup:

1. Family name and language
2. The first parent account (username + password)
3. The children — name, character, birthday and an optional 4-digit PIN
4. Choose the starting balance (500 unless you change it) and confirm; a starter
   set of tasks and rewards comes with it

## Everything is editable

Nothing in the app is a fixed rule — the starter tasks, categories and rewards
are examples to be renamed, repriced, reassigned or deleted:

- **People** — every parent and every child can be edited after the fact: name
  (per language), character, their own language, birthday and PIN for a child,
  username and password for a parent. There are 118 characters to pick from for
  a child and 38 for a parent.
- **What a new child starts with** — 500 by default; set it in the wizard or
  later in *Family → Points a new child starts with*. It applies to children
  added from then on and never rewrites a balance somebody already has.
- **Tasks** — add, edit, pause or delete, and change what they are worth.
- **Categories** — add, rename and change the icon.
- **Rewards** — a full catalogue, see below.
- **What the weekly winner wins** — "picks tonight's film" is only the default
  label; set it to anything (*Family → What the weekly winner wins*).
- **Notes, birthday wishes and outing wishes** — edit the text after writing it,
  reorder the outing wishes, delete any of them.

## How the points work

Every task carries the point change itself, so one shape covers all three cases
the family asked for:

| Task | When done | When not done |
|---|---|---|
| Rewarding | `+20` | `0` |
| Rewarding with a penalty | `+10` | `-5` |
| Neutral — only deducts | `0` | `-10` |

Each task also chooses who the points land on:

- **The child** — personal balance only
- **The group** — the shared family bank only
- **Both** — a personal amount *and* a group amount, configured separately

Tasks are grouped by subject (Cleaning, Tidiness, Schoolwork, Play, Dutch
practice, plus any category the parents add) and are assigned either to all
children or to specific ones.

**Balances are never stored.** Every award, penalty, manual adjustment and
starting balance is a ledger entry, and a balance is replayed from the ledger.
A mistaken award can be traced in the child's history instead of quietly
drifting.

## One family on every device

Syncing is off when you start: the family lives in the browser it was entered
in, and nothing leaves the device. Turn it on in *Family → One family on every
device* and the family moves onto a small server, with an **invite link** to
send to everyone else. Whoever opens that link joins the same family on their
own phone, tablet or computer, and from then on points, tasks, rewards and
notes reach every device within seconds.

How it holds together when two people are using it at once:

- The server keeps one document per family and a revision number. A device may
  only write onto the revision it started from; if it is behind, the server
  refuses the write and hands back what it has, so nothing is ever overwritten
  blind.
- The device then merges the two and writes again. Points, claims and rewards
  are append-only, so entries from both sides are kept — an award made on the
  phone and a deduction made on the tablet both survive. Things that are edited
  in place take the more recently saved side, and deletions are remembered, so a
  deleted task cannot crawl back from a device that still had it.
- Edits made with no signal are kept and sent when the device is back online.
- *Stop syncing* leaves the family on that device and cuts it loose; the others
  carry on.

Anyone holding the invite link is in the family, so treat it like a key to the
house. Reaching a family requires both its id — an unguessable one — and its
secret; the public API key on its own opens nothing.

The server is a Supabase project (`family-points`, eu-central-1) holding nothing
but that one table. To run this on your own server instead, set
`window.FP_SYNC_SERVER = {url, key}` before the app loads, or edit the two lines
at the top of `js/sync.js`; the schema it expects is `server/schema.sql`, which
applies to any Postgres behind PostgREST.

## Languages, names and simultaneous translation

Language is a personal setting, not a family-wide one: a parent can read the app
in Dutch while a child reads the same family in Hebrew. Each account stores its
own choice, so signing in switches the whole interface — including the
right-to-left layout for Hebrew — to that person's language. The family default
in settings only decides what a newly created account starts with.

**Names are never translated.** A person's name is not a phrase, and no machine
should be guessing at it. What a family can do instead is write a name once per
language: the family name, each parent and each child have a language row above
their name field, so "משפחת כהן" and "Familie Cohen" are the same family seen
from two languages. In the setup wizard the language you pick also decides which
spelling you are writing, and switching language keeps the one you just typed
rather than carrying it over. A language nobody filled in falls back to the
reader's language, then the family's own, then whatever was written first — it
is never invented.

Free text follows the reader. A note a child types in Hebrew shows up in Dutch
for the parent who reads Dutch, and a task a parent names in Dutch shows up in
Hebrew for the child who reads Hebrew. This covers notes, birthday wishes,
outing wishes, task names, custom category names and the reasons written on
manual point adjustments. Names and film titles are left exactly as they were
entered.

- Translated text carries a 🌐 badge; tapping it shows the original words and
  the language they were written in. Nothing is ever silently rewritten.
- The translation runs **inside the browser**, through Chrome's on-device
  Translator API. A child's notebook never leaves the device to be readable.
  The browser downloads a language pack the first time a pair is used —
  *Family → Simultaneous translation → Download the language packs* does it in
  one go, and after that it works offline.
- Each result is cached on the record, so a translated note renders instantly
  ever after and is not re-translated on every visit.
- If the browser cannot translate — anything older than Chrome 138, a missing
  language pair, or a language pack it cannot fetch — the text is shown exactly
  as written and tagged with its language, and settings says plainly why.
  Waiting for a pack never blocks the page: it gives up after a few seconds,
  shows the original, and picks the translation up once the pack arrives.
  Translation can also be switched off.
- The quality is whatever the on-device model gives you — good enough to
  understand a note, not a human translator.

## What each role sees

**Parents** (username + password, full admin)

- Home — group bank and the next reward it is saving for, standings, birthday
  countdowns, the weekly prize, pending approvals, recent activity
- Tasks — create/edit tasks, and award ✓ *done* or ✗ *not done* to a child
- Rewards — the whole catalogue, add/edit/delete, and hand a reward over
- Kids — a page per child: balance, manual +/− adjustments with a reason,
  wish list, outing wishes, notes, and the full points history
- Approvals — the "I did it" reports and the reward requests the children send,
  approved or rejected
- Family — own language, default language for new accounts, translation, the
  weekly prize, week start, its day, parent accounts, categories,
  backup export/import

**Children** (tap their character, plus a PIN if one was set)

A child can **add and ask, never change**. They add notes, birthday wishes and
outing wishes, and they ask — for a reward, or to say a chore is done — but they
cannot edit or delete anything already on a list, and nothing they do moves a
single point on its own. Every request waits for a parent, and hovering a
pending mark says exactly when the child reported it, on both sides.

- Me — their points, what they earned this week, birthday countdown and recent
  movement
- Tasks — everything assigned to them, with an **I did it** button that sends a
  report to the parents rather than awarding points directly
- Rewards — what their points can buy, what is still out of reach and by how
  much, and an **I want this** button that asks a parent
- Group — the shared bank and the history of movie nights and rewards. **No
  standings**: a child sees their own points, never a table of everyone else's,
  and no rank number either. Comparing the children is the parents' view, not
  a thing the children scroll past every day.
- Notes — their own notebook, birthday wish list and outing wishes; they add to
  these, and a parent edits or removes

## Rewards

The rewards screen is a catalogue the parents own. Every reward has a name, an
icon and a price, and is paid from one of two places:

- **Prizes to save up for** come out of the child's own points — extra screen
  time, a treat, choosing what is for dinner. A child asks for one from their
  Rewards tab, a parent approves it, and the points are deducted. A prize the
  child cannot afford cannot be requested, and cannot be approved either: the
  balance is re-checked at approval, so nothing ever goes negative. A prize can
  be offered to all the children or to specific ones.
- **Family rewards** come out of the group bank — pizza night, the cinema, a
  family outing. The group bank aims at the cheapest family reward it cannot
  afford yet, so the goal on the dashboard moves as the catalogue changes.
  Once one is affordable it shows as unlocked, and the child with the **highest
  balance** gets to choose — with their saved outing wishes offered as
  one-tap suggestions for what exactly to do.

Everything given is kept in a *Rewards given* history with who chose it and
what it cost.

Alongside the catalogue there is one weekly ritual: the child who earned the
most points *during the week* wins the week and gets the weekly prize on the
day you choose (Saturday, picking the film, by default). A parent records what
was picked and the history keeps every one.

Ties are broken by total balance and then by name, so the winner is always
stable rather than random.

## The Bank of Mum and Dad

Beside the points there is a second, separate thing: real money a child has
handed a parent to look after. The two never mix. Points are earned and spent
inside the app; the bank is a record of what a parent is actually holding, so
neither the child nor the parent has to remember.

**Paying in and taking out.** A parent moves money directly. A child can only
ask — a request with an amount and a reason, which lands in Approvals beside
chores and rewards, and moves nothing until a parent agrees. A withdrawal is
refused if the account cannot cover it, whoever asks.

**Two currencies.** The family works in shekels by default, but currency belongs
to each entry and each deposit rather than to the family. A child holds a shekel
account always, and a euro account appears the moment somebody actually gives
them euros — nothing to switch on. Balances, deposits, withdrawals and interest
are each judged against their own account: a euro withdrawal cannot be covered
by a shekel balance.

**Deposits.** A family writes its own kinds: a currency, a term in days, a yearly
rate, and whether the money may come out early. A new family starts with nine,
modelled on what Israeli banks actually paid on shekel deposits in mid-2026 —
about 1% on money you can take out any day, climbing to roughly 4.2% for a year
— and on the ECB deposit rate for the euro shelf, which is why a euro deposit
visibly pays less than a shekel one. They are a starting point, not advice: the
family bank pays out of a parent's pocket, so every number is editable, and the
screen says so. Money inside a deposit leaves the spendable balance and is
reported separately.

Interest is simple, not compound: the yearly rate for the days the money
actually sat there, which a child can check with a calculator. Breaking a
deposit early — where the kind allows it at all — returns the money and none of
the interest.

A deposit that comes to term pays itself out the next time anybody opens the
app; there is no server to do it. The interest row carries an id derived from
the deposit, so two phones settling the same deposit write the same row and the
merge keeps one.

**Privacy.** A child sees their own money and no one else's — not a sibling's
balance, not their name. Parents see everything, because parents are holding it.

**Points into money.** Off by default, and set per currency: a parent says how
many points buy one shekel and how many buy one euro, and each rate is offered
only once it is set. Converting writes two
linked entries, one in each ledger, and undoing either undoes both.

**Undo.** Nothing is ever deleted. Undoing writes a reversal entry pointing back
at the one it cancels, and the original stays in the history with a line through
it. On real money that is the point: a child must be able to see that a deposit
was taken back, when, and by whom. A deposit's lock and unlock rows cannot be
undone directly — a deposit is unwound by breaking it.

**Whole numbers and cents.** Points are integers everywhere; half a point would
mean nothing. Money and interest rates are not, and the store keeps the two
readers apart (`num` and `dec`) precisely because mixing them silently drops the
cents.

## Data, privacy and backups

Everything is stored in `localStorage` under `familyPoints.v1` on that one
device. The app itself makes no network calls: the only thing that ever goes
over the wire is the browser's own download of a translation language pack, and
the text being translated stays on the device.

- Parent passwords and children's PINs are stored as salted SHA-256 hashes
  (15,000 rounds), never as plain text. This keeps a curious sibling out; it is
  not protection against someone with the device and real intent.
- **Family → Data → Export backup** shows the whole family as text you can copy,
  and offers to save it as a file. Import takes either — paste the text or pick
  the file — so a family moves between devices even where a page is not allowed
  to start a download.
- Clearing the browser's site data erases the family. Export first.

**Until you turn syncing on, each device keeps its own copy.** Opening the link
on a phone and on a laptop gives you two separate families. Turn on syncing (see
above) to make them one, or move a family across by hand with *Restore from a
backup*, which sits on the very first screen and on the sign-in screen.

With syncing on, the family is also stored on the server as one document. That
is the trade: the family works across devices, and in exchange the notes and
points live somewhere other than your own device.

## Layout

```
family-points/
├── index.html          page shell — the screens are rendered from JS
├── site.webmanifest    name, colours and icons for a home-screen install
├── assets/
│   ├── styles.css      one stylesheet: light + dark, LTR + RTL
│   ├── icon.svg        the app's mark, drawn — favicon and manifest icon
│   ├── icon-*.png      the same mark for home screens that want a bitmap
│   └── fonts/          Rubik, self-hosted (see Typeface below)
└── js/
    ├── i18n.js         interface strings × en / nl / he
    ├── translate.js    on-device translation of what the family writes
    ├── sync.js         optional sync across devices, and the merge rules
    ├── avatars.js      emoji characters on coloured discs, and the child palette
    ├── sha256.js       hashing for passwords and PINs
    ├── store.js        data model, ledger, balances, weeks, birthdays, colours
    ├── ui.js           shared rendering helpers and the delegated click router
    ├── setup.js        first-run wizard and sign-in
    ├── parent.js       the admin screens
    ├── child.js        the children's screens
    └── app.js          routing, header, tabs, boot
server/
└── schema.sql          the table and the three functions the sync talks to
```

Scripts are plain classic `<script>` tags in dependency order, so the app also
runs straight from `file://` without a server.

### A colour of one's own

Every child carries one colour: the ring around their character, the card at the
top of their own page, the bar on their row in the standings. It is how a child
too young to read a name finds their row.

A parent can pick a colour from ten in the child's profile. When nobody has
picked, one is worked out from the order children were added — never stored, so
nothing has to be migrated onto families that already exist, and every device
computes the same answer from the same data, so one child is never two colours
on two phones. Colours a parent chose are taken out of the pool first, so an
automatic colour never lands on a deliberate one.

The gradient on a child's card is mixed towards a dark base rather than used
neat: at 68% every colour in the palette still carries white text at 4.5:1 or
better, where amber used neat would be 2.9:1.

### Typeface

Rubik, served from this repository — three files, about 64 KB, one per script.
Google publishes it as a variable font, so a single file per script covers every
weight the app uses.

It is self-hosted rather than linked from `fonts.googleapis.com` for three
reasons: the family's phones make no request to anyone else, a home screen that
has opened the app once keeps its typeface with no network at all, and the app
holds to its rule that it talks only to its own origin. `font-display: swap`
plus the system stack behind it in `styles.css` means text is readable from the
first paint and nothing about the layout depends on the font arriving.

Rubik is under the SIL Open Font License 1.1; the licence travels with it in
`assets/fonts/OFL.txt`.

### Why the home-screen icon opens in the browser

The manifest asks for `display: browser` and the page deliberately does not set
`apple-mobile-web-app-capable`. Both are load-bearing.

A home-screen icon that opens in the browser shares the browser's storage. A
standalone web app gets a storage container of its own — so switching an app to
standalone silently cuts a device off from everything it had saved. The family
document itself is safe on the server, but the id and secret needed to reach it
live in that storage, so the device is simply locked out and looks reset.

This was learned the hard way: standalone was turned on, a family member removed
and re-added the icon to pick up the new artwork, and came back to an empty app.
The full-screen look is not worth that. If it is ever wanted again, ship it
together with a way to get back in that does not depend on browser storage.

### Asking before signing out

The sign-out button sits in a small row at the top of every screen, next to the
language button, where a thumb finds it easily. Signing out loses nothing, but
on a child's phone it means finding a parent to type a PIN again, so it asks
first — naming whoever is about to be signed out, and offering "stay signed in"
rather than "cancel", so the two buttons say what they do.

### Motion

Balances count up to a new value rather than blinking to it, and points actually
earned are worth a few seconds of paper. Both are held to
`prefers-reduced-motion`: a reader who has asked for less motion gets the new
number immediately and no confetti at all.

---

## בעברית

אפליקציית מטלות ונקודות למשפחה. הכול נשמר בדפדפן של המכשיר המשפחתי — אין שרת,
אין חשבון ואין שליחת מידע החוצה.

- **הורים** נכנסים עם שם משתמש וסיסמה ומקבלים גישת אדמין: הקמת משימות לפי נושא,
  שיוך לכל הילדים או לילד מסוים, זיכוי וקיזוז נקודות, ואישור דיווחים.
- **ילדים** נכנסים בלחיצה על הדמות שלהם (ועם קוד סודי אם הוגדר), רואים את החשבון
  האישי ואת החשבון הקבוצתי, וכותבים הערות, רעיונות למתנות יום הולדת והעדפות
  לבילוי. **הם מוסיפים ומבקשים, לא משנים**: אי אפשר לערוך או למחוק מה שכבר רשום,
  ושום פעולה שלהם לא מזיזה נקודה בעצמה. "עשיתי!" ובקשת פרס ממתינות לאישור הורה,
  וריחוף מעל הסימון מראה מתי בדיוק הילד/ה דיווחו.
- כל ילד מתחיל עם **500 נקודות**. לכל משימה מוגדר ניקוד כשמבוצעת וניקוד כשלא
  מבוצעת — כך שאפשר גם משימה ניטרלית שנותנת 0 בביצוע ומקזזת כשלא בוצעה.
- **הכול ניתן לעריכה**: המשימות, הנושאים והפרסים שמגיעים עם האפליקציה הם רק
  דוגמאות — אפשר לשנות שם, מחיר, אייקון ושיוך, להוסיף חדשים או למחוק. גם פרטי
  ההורים והילדים ניתנים לעריכה בכל רגע: שם (לכל שפה), דמות, שפה, תאריך לידה
  וקוד סודי לילד, שם משתמש וסיסמה להורה. יש 118 דמויות לבחירה לילדים ו-38
  להורים.
- **קטלוג פרסים**: פרסים אישיים שנקנים מהנקודות של הילד (הילד מבקש, הורה מאשר,
  והנקודות יורדות), ופרסים משפחתיים שנקנים מהקופה הקבוצתית — וכשפרס משפחתי הופך
  זמין, הילד עם הכי הרבה נקודות בוחר, עם העדפות הבילוי שלו כהצעות בלחיצה.
- **פרס שבועי**: מי שצבר הכי הרבה נקודות במהלך השבוע זוכה, ביום שנבחר (שבת
  כברירת מחדל). "בוחר/ת את הסרט" זו רק ברירת המחדל — אפשר לכתוב כל פרס אחר.
- **שפה אישית לכל משתמש**: כל הורה וכל ילד בוחרים את השפה שלהם, והכניסה לחשבון
  מחליפה את כל הממשק (כולל פריסת RTL לעברית) לשפה של אותו אדם.
- **סנכרון בין מכשירים**: בהגדרות אפשר להפעיל סנכרון, לקבל **קישור הזמנה** ולשלוח
  אותו למשפחה. כל מי שפותח אותו מצטרף לאותה משפחה מהמכשיר שלו, ומאותו רגע נקודות,
  משימות, פרסים והערות מגיעים לכל המכשירים תוך שניות. עריכות שנעשו בלי רשת נשמרות
  ונשלחות כשחוזרים לאוויר, ושינויים משני מכשירים במקביל שניהם נשמרים.
- **תרגום סימולטני**: הערה שילד כותב בעברית מוצגת בהולנדית להורה שקורא הולנדית,
  ומשימה שהורה כתב בהולנדית מוצגת בעברית לילד שקורא עברית. התרגום מתבצע בתוך
  הדפדפן (Translator API של כרום) — הטקסט לא יוצא מהמכשיר. לצד כל טקסט מתורגם
  יש תג 🌐 שמציג את המקור בדיוק כפי שנכתב. שמות וכותרות סרטים לא מתורגמים.
