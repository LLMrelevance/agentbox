# The phone app: the plan

Status: drafted 2026-10-20 on w-9f9c2570e2. Not reviewed by Codex yet. Nothing
built.

## What was asked

"I tried a web version with a progressive web app and a relay but the mobile
interface is just so much better for this, especially now that we're going
multiplayer and trying to replace Slack. I think we really do need a good
mobile app because it's really important for notifications and similar
things."

Two worries came with it: Xcode's memory use on the Mac, and how hard it is to
get an app approved.

## The choice: Expo (React Native), built in Expo's cloud

- **No Xcode anywhere.** EAS Build compiles the iPhone app on Expo's own Macs,
  and EAS Submit uploads it to App Store Connect from any machine, the Linux
  cloud runs included. The phone itself replaces the Simulator, through
  TestFlight or a development build.
- **Cloud agents can do most of the work.** TypeScript, unit tests in vitest,
  and the app's web target screenshotted in Chromium at iPhone size for design
  review. A JavaScript-only fix reaches installed phones through EAS Update on
  their next launch, with no new build and no review.
- **The renderer's language.** React and TypeScript, and `shared/*.mjs`
  imports unchanged.
- **iPhone and Android from one code base.**

Not chosen:

- **SwiftUI.** It would feel the most native, but every build and every check
  needs Xcode on the Mac, cloud agents on Linux could not build or test it, and
  it is iPhone only.
- **Capacitor around the phone site.** The fastest to make, but it is the web
  screen that was already found wanting, and an app that is "a repackaged
  website" is what guideline 4.2 turns away.

## What the app talks to

The same online inbox the phone site uses (docs/cloud/PHONE-PLAN.md). The app
adds no server of its own except the alert sender.

- **The owner's threads.** It reads `phone_projects` and `phone_threads` (the
  snapshot shape is `shared/phone-snapshot.mjs`) and writes `phone_commands`,
  every kind the site sends today: `reply`, `new`, `snooze`, `close`, `stop`,
  `run-now`, `send-now`, `reopen`, `schedule`, `approve` (migration
  20261019000000). It never folds a personal project's ledger lines;
  PHONE-PLAN's finding 5 still holds.
- **Files.** Signed links from the `phone-files` bucket, as on the site.
- **Live changes.** supabase-js Realtime on those tables, where row security
  applies, instead of the site's poll every 5 s. The app reads afresh when it
  comes to the front, and polls only while Realtime is down.
- **People's messages.** New, because the site has none. The app reads `lines`
  for shared projects and Direct conversations and folds them with
  `foldWorkItems` (shared/work-items.mjs). It writes a message to a teammate as
  a new line straight to the cloud, so a message between people needs no Mac
  awake. Question 3 below asks whether that is safe.
- **Deadlines.** Every request has one. supabase-js takes a `fetch`, and the
  app gives it one that stops at a timeout.
  `tests/no-network-call-in-the-app-can-wait-forever` is extended to read
  `mobile/`.
- **No agent starts on the phone.** A command reaches the Mac, which starts the
  run through `spawnWorker`, as it does for the site. The cloud scheduler
  (docs/cloud/PLAN.md, "Next", step 4) will do the same with the Mac shut.

The phone site stays until the app does everything it does. Retiring it is the
owner's decision then.

## What version 1 does

1. **Sign in** with Apple, Google, or email and password.
2. **The inbox.** The rows that need the person, in the desktop's order and
   words. Pull down to refresh; swipe for Later or Close.
3. **A thread.** The conversation, the result, and the pictures, films and
   pages it names, drawn in place. Permission cards with Allow and Deny. Stop,
   Run now, Send now, Reopen and Undo. A reply box with the composer's choices:
   engine, model, effort, start later.
4. **A new thread.** Pick the project, then the same composer.
5. **People.** Direct messages and shared projects' conversations, with
   @mentions. Report a message; block a person.
6. **Settings.** Which projects are on the phone, alerts, sign out, delete the
   account, the privacy policy, a contact address.

Beyond what a website can do: alerts on the lock screen, replying from the
alert itself, a badge with the number waiting, and an alert that opens its
thread.

Not in version 1: repeating tasks, pins, dragging rows, the Team page, other
settings, and an iPad layout. The app is iPhone only, and it still has to work
in an iPad's iPhone mode, because reviewers sometimes test there.

## Alerts (PHONE-PLAN step 3)

- `push_devices`: owner, platform, Expo push token, app version, last seen.
  Owner-only.
- `push_outbox`: owner, a dedupe key, the thread, title, body, created and sent
  times. Two things write it:
  - the Mac, for its own threads, from the same arrivals that make a desktop
    banner today (`shared/notify-rules.mjs`, and the arrivals
    main/phone-link.mjs fed to web push);
  - a database trigger on `lines`, for a message to a person: a Direct
    message, an @mention, a task given to them. These have to buzz with every
    Mac shut.
- An Edge Function sends new outbox rows through Expo's push service, which
  passes them to Apple and Google. One alert per dedupe key. It tries a few
  times, waiting longer each time, then gives up and marks the row. It drops
  rows older than a few minutes, so a Mac waking after a night sends no
  backlog. It deletes tokens Expo reports as dead.
- The alert shows the thread's title and first line. A setting hides the text
  (guideline 4.5.4: no sensitive information in alerts).
- Replying from the alert has to be proven on a real phone in phase 2. If the
  app cannot send from the background, the action opens the thread with the
  reply box instead.

## Sign-in and accounts

- Supabase Auth, as today. Google through its native sign-in and
  `signInWithIdToken`; email and password; Sign in with Apple through
  `expo-apple-authentication` and `signInWithIdToken`. Apple is off today
  (`[auth.external.apple] enabled = false` in cloud/supabase/config.toml) and
  has to be switched on in the hosted project with Apple's key.
- The session is kept encrypted on the phone. The keychain (SecureStore) holds
  only small values, so it keeps the encryption key, and the encrypted session
  lives in AsyncStorage, the pattern Supabase's own Expo guide uses.
- Sign in with Apple's "Hide My Email" gives an address that matches no
  teammate invite. Question 5 below.
- Delete account, inside the app (guideline 5.1.1(v)). An Edge Function deletes
  the sign-in and the person's phone tables, files and devices. What they wrote
  in shared projects stays, credited to "A former member". Question 6 below.

## Where the code lives and how it is tested

- `mobile/` in this repository. Expo SDK 58 (the current release on
  2026-10-20), TypeScript, expo-router. Metro watches `../shared`, so the app
  imports the shared modules as they are.
- Logic lives in `mobile/src/lib/` with no React Native imports, and vitest
  runs it with the rest of the suite, in the push hook and on GitHub. A screen
  is checked first on the web target in Chromium at iPhone size, then on the
  phone.
- Three EAS build profiles: `development` (the owner's phone, registered
  once), `preview` (TestFlight, internal) and `production`. EAS Update carries
  JavaScript-only fixes. A new feature goes out as a new, reviewed build, never
  as an update (guideline 2.5.2).
- Builds start from the Mac at first. Building on GitHub when `mobile/`
  changes on main needs an Expo token kept as a repository secret, which is the
  owner's decision.
- `npm run ship` does not change. Screens under `mobile/` are tier "look".

## Getting it onto phones, and approved

App Review is not the gate for the team. TestFlight's internal testing needs no
review: up to 100 people with App Store Connect roles install each build once
Apple has processed it, and each build lasts 90 days. Review applies to the
public App Store and to TestFlight's public links.

1. **Apple Developer Program.** scripts/release.mjs needs a "Developer ID
   Application" certificate, which only a paid membership can make, so one
   probably exists. Check that it is active, and whether it is an individual or
   a company account: the store shows that name as the seller. A new company
   account needs a D-U-N-S number first (Apple: allow up to 5 business days if
   Dun & Bradstreet has no record), then Apple's own check.
2. **App Store Connect.** Create the app, which reserves its name; the bundle
   id is permanent. Free apps need no paid-apps agreement. Declare trader
   status for the EU (Digital Services Act): a trader's address, phone and
   email are shown on the EU product page. Apple says verification takes about
   5 business days; several 2026 forum threads report weeks. Start it on day
   one, or leave the EU storefronts off at first.
3. **Expo.** An account, `eas init`, and EAS signed in to the Apple account
   once (a two-factor code on the phone). EAS makes the certificates,
   provisioning profiles and the push key.
4. **The first build, to TestFlight internal.** On the owner's phone the same
   day. Teammates are added as App Store Connect users with the Marketing role,
   then as internal testers.
5. **A week of daily use.** Fixes go out through EAS Update.
6. **The public App Store** waits on three things outside this plan: accounts
   for anyone (w-6633e825a7, step 3), the privacy and terms pages
   (w-7a670f07bb; today they say nothing is hosted), and an installed desktop
   app that can sign in to the cloud (`loadCloudConfig` answers null when
   packaged). Without them, a stranger who downloads the app has nothing to
   connect it to.
7. **The submission.** Name, subtitle, description and keywords; 6.9-inch
   iPhone screenshots of the real app; privacy policy and support addresses;
   the App Privacy answers; the age-rating questions (people message each
   other); export compliance, answered once in the app config
   (`ITSAppUsesNonExemptEncryption: false`); the review notes and a demo
   account. Apple: "On average, 90% of submissions are reviewed in less than
   24 hours." Plan for one rejection round.
8. **Android.** Play Console costs $25 once. A personal account made after 13
   November 2023 must run a closed test with 12 testers for 14 days before it
   can publish; an organization account is exempt. Android teammates can use
   the closed test from its first day.

## What App Review will look for in this app

| Guideline | What could go wrong | The answer |
|---|---|---|
| 2.1 completeness | The reviewer signs in, replies, and nothing answers, because no Mac is paired. | A review account with seeded threads and a stand-in computer in the cloud that answers its commands while the review lasts. The notes say what it is and explain the desktop app. The demo account must not expire. |
| 4.8 sign-in | Google sign-in without an equivalent private option. | Sign in with Apple. |
| 5.1.1(v) | No way to delete the account in the app. | Settings › Delete account. |
| 5.1.1(i) | No privacy policy, or one that says nothing is hosted. | w-7a670f07bb, linked in the listing and in Settings. |
| 5.1.2(i) | Personal data sent to third-party AI without explicit permission. | A first-run screen: what you send an agent goes to Claude (Anthropic) or Codex (OpenAI) on your own account. An explicit Continue, recorded, and revocable in Settings. The privacy policy names both. |
| 1.2 user content | People message each other with no report, block or contact. | Report a message, block a person, a contact address. The notes say messages go only between invited teammates. |
| 4.2 minimum function | A repackaged website. | Native screens, lock-screen alerts, replies from the alert. |
| 3.1.1 purchases | Selling or advertising the paid cloud. | The app sells nothing and shows no prices or upgrade prompts. Phone access is free (decided 2026-10-14). If the cloud is ever sold from the phone, the US storefront may link out (3.1.1(a)); elsewhere it needs in-app purchase. |
| 4.5.4 alerts | The app needing alerts to work, or marketing in them. | It works with alerts off. No marketing alerts. |

## Costs

- Apple: $99 a year, probably already paid.
- Google: $25 once, for Android.
- Expo: the free plan covers 15 iOS and 15 Android builds a month and updates
  to 1,000 monthly users; Starter is $19 a month (expo.dev/pricing, read
  2026-10-20).
- ChatGPT Plus: $20 a month, for Codex's reviews. It includes Codex in the
  CLI, an estimated 15 to 160 GPT-6.1 Sol messages per 5 hours, and weekly
  limits on top (learn.chatgpt.com/docs/pricing, read 2026-10-20).

## Phases, each one shippable

1. **The app on the owner's phone.** Sign-in (all three), the inbox, a thread,
   replies, new threads, commands, files, Realtime, delete account, the AI
   notice. To TestFlight internal.
2. **Alerts.** `push_devices`, `push_outbox`, the sender, the Mac writing
   outbox rows, reply from the alert, the badge.
3. **People.** Direct and shared-project conversations from the phone, written
   straight to `lines`; their alerts from the trigger; report and block.
4. **The App Store.** The review account and its stand-in computer, the
   listing, the submission. Waits on the three things in step 6 above.
5. **Android.** The closed test, then production.

## Questions for Codex's review

1. Is Expo right for this app and this repository, against SwiftUI and
   Capacitor? What in the repository (the push hook, the risk tier,
   `npm run ship`, vitest, the public-repository check) breaks when `mobile/`
   arrives?
2. Is Realtime on `phone_threads` and `phone_commands` safe and cheap enough
   for many phones, or should the app keep polling and let alerts wake it?
3. Can the phone write `lines` directly for messages between people, given the
   team sync's known weaknesses: the `seq` cursor skipping a line two writers
   commit out of order, and the fold settling equal-time edits by arrival?
   Which row-security rules does a phone writer need?
4. Who decides an alert: the Mac for its threads and a trigger for people's
   messages, as above, or one server-side rule for both? How is backfill kept
   out, and how is the desk case handled (no buzz while the person is active at
   a Mac)?
5. How should Sign in with Apple's hidden addresses meet team invites sent by
   email: identity linking, or claiming an invite with another address?
6. What should deleting an account do to what the person wrote in shared
   projects?
7. What is the least the review account's stand-in computer must do to pass
   guideline 2.1?
8. Is Expo's push service acceptable for alert text from private threads, or
   should the sender talk to Apple and Google directly?

## The owner's steps outside the code

1. ChatGPT Plus, then `codex login` on the Mac, so Codex can review this plan.
2. Check the Apple Developer membership: active, and individual or company.
3. Pick the app's name and bundle id, both permanent once used.
4. Decide on the EU: trader status with a business address now, or the EU
   storefronts later.
5. An Expo account, and EAS signed in to Apple once.
