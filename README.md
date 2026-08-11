# STRAND

STRAND is a mobile-first hair health journal and clinical companion for afro and textured hair.
Members track wash days, products and tools, style records, treatment plans, appointments and
blood-marker history in one place, and receive personalised guidance grounded in
*How to Love Your Afro* by Paige Lewin.

Alongside members, STRAND serves professionals (trichologists, dermatologists and specialists,
who access a client's record only with that client's consent) and brands (product catalogues and
campaign placements).

## Stack

- Vite + React + TypeScript, Tailwind CSS and shadcn/ui
- Supabase for auth, Postgres (row-level security throughout), storage and edge functions
- AI guidance via the Lovable AI Gateway, retrieved from the manuscript source of truth

## Development

```sh
npm install
npm run dev      # dev server on port 8080
npm run build
npm run lint
npm run test
```

The whole app renders inside a 375px-wide phone frame — design every screen for that width.
