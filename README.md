# Freddy Fix It: mobile app

The Expo (React Native) app for Freddy Fix It clients and contractors. It is a
second client of the same Supabase backend as [the website](https://github.com/karanmann137-creator/freddy-fixit).

- **PLAN.md**: the plan of record (architecture, build order, review gates).
- **CLAUDE.md**: the rules for anyone (human or AI) writing code here.

```bash
npm ci
cp .env.example .env   # public Supabase URL + anon key
npm run check          # what CI runs
npx expo start
```
