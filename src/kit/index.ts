// src/kit: the native component kit, ported from web src/components/ui.
// PLAN.md §3. Same rule as web: no business logic here. A component that knows
// what `fully_funded` means belongs in src/features, not the kit.
//
// The rules the set encodes:
//   · Orange appears exactly once per screen, and only when the answer is "you".
//   · Every value comes from the tokens (theme.tsx). No literals.
//   · One gut, shared by a row's icon column and its separator.
//   · Touch targets are at least 48dp.
export { ThemeProvider, OnDark, useTheme, useFs, rgba, ease, fonts, type Tokens } from "./theme";
export { Txt } from "./Text";
export { Ic, type IconName } from "./Ic";
export { Button, ButtonRow, Stack, type ButtonVariant } from "./Button";
export { Pill, type PillTone } from "./Pill";
export { StateLine, type State } from "./StateLine";
export { Group, Card, Row, type RowTone } from "./Row";
export { Screen, DashCard } from "./Screen";
export { DeadEnd } from "./DeadEnd";
