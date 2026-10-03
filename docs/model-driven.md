---
title: Model-driven apps
description: Put a slider, range, stepper or gauge on a number column on a form.
order: 3
---

# Model-driven apps

:::steps
1. Open the form in the form designer and select a **Whole number**,
   **Decimal**, **Float** or **Currency** column.
2. **+ Component**, then **Number Slider**.
3. Choose a **Style**. For **Range**, set **Upper value** to the second
   column — the top of the range.
4. Set **Minimum**, **Maximum** and **Step** if the column's own range is not
   the one you want (see below).
5. Save and publish the form.
:::

## The range: blank is a real setting

**Minimum** and **Maximum** left blank use the column's own range — the
*Minimum value* and *Maximum value* set on the column in the table designer.
Where the column has only the platform's default (about ±2.1 billion for a
whole number, ±100 billion for a decimal), the slider runs from 0 to 100
instead: set the two properties.

A range you set narrower than the column's is used as it is. One wider than
the column's is cut to the column's, because the column would refuse the
rest at Save.

:::callout{type=info}
Built-in columns often carry a range of their own: **Number of employees** is
0 to 1,000,000,000 and **Annual revenue** 0 to 100,000,000,000,000. Set
**Maximum** on those.
:::

**Step** left blank is 1. A whole-number column only takes whole steps, and a
step finer than the column's decimal places is raised to them.

## Range: two columns

A range is two values, and a column holds one, so **Range** writes two
columns: **Value** (the bottom) and **Upper value** (the top). The two thumbs
cannot cross. Leave **Upper value** unset and the field says so instead of
drawing a range.

Both columns must be writable for the range to be: if either is read-only to
the user, both thumbs are.

## What the user sees

- **Drag, click the track, or use the keys.** Arrow keys move one step; Page
  Up and Page Down, Home and End move further, as the browser decides for a
  range. Each change writes once.
- **The box takes an exact value**, in the user's own number format, on Enter
  or on leaving it. It does not snap a typed value to the step — the box is
  where an exact value goes — but it does refuse one outside the range.
  Escape puts the saved value back.
- **An empty column** shows the thumb waiting at the start, greyed, and an
  empty box. Clearing the box clears the column.
- **A saved value outside the range** — 150 on a 0–100 slider — is shown as
  saved in the box, with the thumb at the end and a note under the field. It
  is not rewritten.
- **Read-only** — a read-only form, an inactive record, or a column the
  user's security profile cannot edit — greys the thumb and the box.
- **The platform's own validation** (a business rule's message, a required
  column) is shown by the form under the field; the control marks the field
  red rather than repeating it.

## Colour bands

**Colour bands** colours the slider's fill and thumb and the gauges by the
value:

```text
50 danger; 80 warning; 100 success
```

Each entry is a threshold and a colour; a value up to the threshold takes
that colour, lowest threshold first, and a value above the last takes the
last. The names are Fluent's status colours — `danger`, `warning`, `success`,
`brand`, `neutral` — which follow the app's theme. Any CSS colour works too:
`#c50f1f`, `rgb(16, 124, 16)`, `teal`. Write the threshold with a dot,
whatever your number format: it is configuration, not data.

Bands colour **Slider**, **Bar** and **Arc**; **Range** and **Stepper** keep
the theme's colour.

## Unit and value box

**Unit** is shown after the value: `%`, `°` and `‰` directly, anything else
after a space — `72.50%`, `45 km`. **Value box** set to **Hide** leaves the
track alone for a cleaner field; the value can then only be dragged, not
typed or cleared. A stepper always shows its box.

## Minimum, Maximum and Step from another column

The form designer offers **Bind to table column** on these three. It lists
only **Decimal** columns — the type the properties are declared as — so a
whole-number or currency column cannot be picked there.
