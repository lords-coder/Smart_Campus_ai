# SmartCampus AI — Frontend

Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + shadcn/ui.

This folder is part of the `smartcampus` project. **See the project
[README](../README.md)** for setup, environment variables and credentials, and
[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for how the UI talks to the API.

## Scripts

```bash
npm run dev        # http://localhost:3000
npm run build
npm run lint
npx tsc --noEmit
```

Environment: copy `.env.example` to `.env.local` (`NEXT_PUBLIC_API_URL`).

## Layout

- `src/app/(app)/` — protected screens behind `AuthGuard`; `app-shell.tsx` provides the sidebar/header
- `src/app/login/` — public sign-in
- `src/components/auth/` — `login-form.tsx`, `guards.tsx` (`AuthGuard`, `RoleGuard`)
- `src/lib/api.ts` — the single HTTP client (envelope parsing, 401 event)
- `src/hooks/use-api.ts` — shared loading/error/data hook used by all data pages
