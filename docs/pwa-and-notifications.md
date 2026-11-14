# Installing the planner on a phone, and notifications

## What is where

| Part | File |
|---|---|
| Manifest (name, colors, icons) | `public/manifest.json` |
| Icons: 192, 512, maskable 512, Apple 180 | `public/icons/` (made by `node scripts/pwa/make-icons.mjs`; replace with real artwork at the same sizes) |
| Service worker: lifecycle, `push`, `notificationclick` | `public/sw.js`, registered by `components/pwa/ServiceWorkerRegister.tsx` |
| Turn on / off for a device, iPhone detection | `components/pwa/push-client.ts`, shown in Settings, Notifications |
| Save and delete a device | `app/api/push/subscribe/route.ts` (signed-in user) |
| Send | `lib/push/send.ts`: `sendPush(userId \| "all", { title, body, url })`; a device that answers 404 or 410 is forgotten |
| What the owner is told about, and the wording | `lib/notify/notify-model.ts`, `lib/notify/owner.ts` |
| Test | `POST /api/push/test` (signed in): the Send a test button |
| Their choices | table `notification_prefs` (migration 069) |

A notice is sent when an agent puts a question in the owner's inbox (`ask_owner`) and when an agent makes a change ready to judge.

## Settings that must exist (Vercel, Production and Preview)

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. See `.env.example`. A change to them needs a redeploy. Changing the key pair logs every device out of notifications: each has to be turned on again.

## The files a phone fetches with no session

`/manifest.json`, `/sw.js`, `/icons/*`, `/apple-icon.png`, `/icon.svg` are let through in `middleware.ts`. If they redirect to sign-in the app cannot be installed.

## Checking it

1. **The basics, on a computer.** Chrome, open the planner, DevTools, Application: Manifest shows the name and four icons with no warnings; Service Workers shows `sw.js` activated. Lighthouse no longer has a PWA category (removed in Lighthouse 12); the Application panel's "Installability" section is the check now.
2. **Android, Chrome.** Open the planner, menu, Add to Home screen (or Install app). Open it from the icon: no browser bar. Settings, Notifications, Turn on notifications, allow, Send a test.
3. **iPhone (iOS 16.4 or later), Safari.** Open the planner, Share, Add to Home Screen. Open it from the icon. Settings, Notifications: the button appears only here, never in Safari itself. Turn on, allow, Send a test.
4. **A real one.** Have an agent ask a question (`ask_owner`) for a project: the phone shows "<project>: a question for you", and pressing it opens that project.

If a test says it reached 0 devices, no device is turned on. If the "This device" line says the browser was told not to allow them, that is undone in the browser's or phone's own settings for this site, not in the planner.
