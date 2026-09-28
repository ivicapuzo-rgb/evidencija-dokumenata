# Евиденција докумената — PRD

## Original problem statement
Serbian mobile app that alarms/notifies users before their personal documents expire.
Subscription 4€ / 6 months, paid via IBAN bank transfer (LU824080000048751822), admin
confirms manually. Users create custom named cards. Push notification when a document
expires in a chosen number of days (2/5/10/15). Push notification when subscription expires.
Login/registration + admin panel (total users, online, subscribers, expiring subscriptions,
delete/view user accounts).

## User choices
- Auth: classic JWT (email + password + username)
- Push notifications: enabled (Emergent-managed)
- Payment: manual IBAN transfer; user marks "Уплатио сам" + optional proof image; admin confirms & extends 6 months; admin can also extend manually
- Admin panel: yes
- Design: modern, in the spirit of the provided mockups (orange brand, colored day chips)

## Architecture
- Backend: FastAPI + MongoDB (motor). JWT (PyJWT) + bcrypt. Object storage (Emergent) for proof images. Push relay (Emergent SuprSend) + hourly scheduler for expiry checks.
- Frontend: Expo Router (React Native). react-query for data. Bottom tabs (Документа / Претплата / Админ[admin only] / Профил). Theme tokens in src/theme.ts.

## Personas
- End user: tracks own documents, sets alarms, pays subscription via IBAN.
- Admin: manages users, confirms payments, extends subscriptions, monitors stats.

## Core requirements (static)
- Document CRUD with per-card alarm (2/5/10/15 days) and days-remaining status
- Subscription status + IBAN payment claim + proof upload
- Push notifications for document & subscription expiry
- Admin: stats, payment approve/reject, user view/delete/extend

## Implemented (2026-09-25)
- JWT auth (register w/ 14-day trial, login, me); admin seeded (admin@evidencija.rs)
- Documents: GET/POST/PUT/DELETE (soft delete), inline alarm change
- Subscription: GET status, claim payment, proof image upload via object storage
- Push: /api/register-push relay, send_push helper, hourly scheduler + /api/admin/run-checks
- Admin: stats, users list/detail, delete (self-guard), payments approve/reject, extend +6mo
- Frontend: welcome, login, register, tabs (documents/subscription/profile/admin), add/edit document modal, admin user detail. Serbian Cyrillic throughout.
- 21/21 backend tests passing; frontend journey validated.

## Backlog / remaining
- P1: Android push requires user's google-services.json + deployed build to work on device
- P2: native date picker (currently masked text input DD.MM.YYYY)
- P2: migrate RN Web deprecated shadow* props to boxShadow
- P2: payment history filters, export

## Next tasks
- Collect google-services.json from user for Android push
- Optional: email receipts on payment approval (Emergent Resend)

## Update 2026-09-26
- Admin password set to `puzopb` (login: admin@evidencija.rs). Startup now syncs admin password + is_admin flag from env each boot.
- Email confirmation implemented (Emergent managed Resend): on admin payment approval, user receives Serbian confirmation email with new valid-until date. Guardrail gate + send_email in server.py. Verified 202 Accepted.
- Push notifications confirmed implemented (server relay + hourly scheduler); needs google-services.json + native build for Android device delivery.

## Update 2026-09-28
- Installed expo-updates + built UpdatePrompt modal (Serbian): "Нова верзија је спремна — Ажурирај сада / Касније".
- Silent OTA check on launch and on every foreground (AppState active); downloads update in background then shows modal. "Ажурирај сада" calls Updates.reloadAsync() to restart into the new version without visiting the store.
- Gated by Updates.isEnabled && !__DEV__ so it is inert in Expo Go/preview and only active in real builds. Mounted in app/_layout.tsx.

## Update 2026-09-28 (b)
- Splash screen set to user's orange "EVIDENCIJA U DZEPU" image (assets/images/splash-image.png), backgroundColor #FF9902, contain.
- Local (on-device) notifications: src/utils/localNotifications.ts schedules a local notification per document at 09:00, alarm_days before expiry — fires on lock screen + notification tray even offline. syncDocReminders() runs from documents tab whenever the list changes; cancels+reschedules all. Sets app-icon badge via setBadgeCountAsync to number of documents inside their alarm window. Native-build only (inert on web).

## Update 2026-09-28 (c)
- User-selectable reminder time-of-day. Profile screen has a "Време подсетника" row opening a bottom-sheet picker (quick presets 07/08/09/12/18/20h, hour scroller 00-23, minute chips 00/15/30/45). Saved to local storage key `reminder_time` (HH:MM, default 09:00). localNotifications.syncDocReminders reads it and schedules all document reminders at that time; changing it re-syncs immediately from the cached documents query.
