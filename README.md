# DebtCalc Web

Local-first shared expense tracking app built with Next.js, TypeScript, Tailwind, Zustand, and PWA support.

Financial logic uses integer cents only through `amountCents`.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
npm run start
```

## Supabase Auth

DebtCalc can run without Supabase, but magic-link auth is available when these environment variables are set:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_USE_NORMALIZED_CLOUD_EVENTS=false
```

Create `.env.local` locally with real values. For Vercel, add the same variables in Project Settings -> Environment Variables.

For manual cloud sync, run the SQL in `supabase/migrations/001_user_app_state.sql` in your Supabase project. It creates `public.user_app_state` with RLS so each authenticated user can only read, write, and delete their own AppState.

For production collaboration, run the normalized cloud event migrations through `supabase/migrations/004_normalized_cloud_events_production.sql`, then set `NEXT_PUBLIC_USE_NORMALIZED_CLOUD_EVENTS=true`.

## Project Structure

```text
src/
  app/              Next.js app shell and routes
  components/       Shared app components
  features/         Feature UI slices
  domain/           Business models, CSV, analytics, financial helpers
  store/            Zustand state and localStorage persistence
  lib/              Framework-neutral helpers
```

## Deploy to Vercel

1. Push the project to GitHub.
2. Import the repository in Vercel.
3. Use the default Next.js settings.
4. Build command: `npm run build`.
5. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` if Cloud Account auth should be enabled.
6. Output is handled by Next.js automatically.

No backend or database is required for the first stage. Data is stored locally in the browser.

## Install as PWA on iPhone

1. Deploy the app and open it in Safari.
2. Tap Share.
3. Choose Add to Home Screen.
4. Launch DebtCalc from the Home Screen icon.

The app includes a manifest, iOS metadata, PWA icons, and a service worker for app shell caching.
