<img src="assets/brand/app-icon.png" width="96" alt="" />

# Al Dawri | الدوري

A bilingual (Arabic / English) football community app built with **React Native + Expo**:
book pitches, join or create pickup games, compete in tournaments, and track your stats.

تطبيق مجتمع كرة قدم بالكويت بلغتين (عربي باللهجة الكويتية / إنجليزي): احجز ملعبك، دش مباراة أو سوّ مباراة، شارك بالبطولات وتابع إحصائياتك.

![Arabic](docs/screenshots/arabic.png)
![English](docs/screenshots/english.png)

## Features | المميزات

- **Players:** pitch booking with live availability, off-peak discounts and prayer times on the grid; governorate / indoor / air-conditioned filters; directions (Google Maps, Waze); reviews; pickup games with lineup, waitlist, results and MVP vote; tournaments; fixed teams with invite codes; points, tiers and rewards; reliability score; profile photo; reminders an hour before games; Arabic (Kuwaiti) and English; light and dark mode.
- **Academies:** browse programs by age group and enroll a child.
- **Pitch owners:** daily schedule with player names, block/unblock hours, 7/30-day revenue reports, price, opening hours and amenities.
- **Academy owners:** students, monthly revenue and fill rate; add/edit/delete programs; manage each program's students.
- **Super admin:** KPIs and chart, users and roles, pitches (show/hide, assign owner), bookings, tournaments, academies, support inbox, announcements.
- **Support:** FAQ, WhatsApp contact, support requests with a chat thread.
- **Backend:** Supabase (Postgres + RLS + server functions), phone OTP / Google sign-in. See [docs/BACKEND.md](docs/BACKEND.md). Without `.env` the app runs in demo mode.

## Run | التشغيل

```bash
npm install
npx expo start          # then scan the QR code with Expo Go, or press i / a / w
npx expo start --web    # run in the browser
npm run typecheck
```

## Structure

```
src/app/            Expo Router screens (tabs, pitch/[id], match/[id], match/create, tournament/[id], ...)
src/components/     UI kit (direction-aware), cards, sheets, toasts
src/i18n/           strings (ar / en) and date / money formatting
src/store/          app state (context + reducer, persisted with AsyncStorage)
src/data/           types and demo data
```

> Data is demo data stored on the device. Connecting a backend (e.g. Supabase) for real accounts, payments
> and notifications is the next step.
