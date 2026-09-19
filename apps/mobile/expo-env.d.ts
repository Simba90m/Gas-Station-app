/// <reference types="expo/types" />

// Expo normally regenerates this file itself (and its own template
// .gitignore excludes it) the first time you run an `expo` CLI command
// (`expo start`, `expo export`, ...). It's committed here instead, as a
// deliberate exception: `pnpm typecheck` runs plain `tsc --noEmit` directly
// (no Expo CLI bootstrap), so on a fresh clone this file must already exist
// or TypeScript never sees expo/types' ambient module declarations for
// *.css / *.module.css imports (see apps/mobile/src/constants/theme.ts and
// src/components/animated-icon.web.tsx). Its content is auto-generated and
// essentially never needs hand-editing — if a future Expo SDK upgrade
// changes it, just let it regenerate and re-commit.
