---
title: Overview
description: A number column as a slider, a two-column range, a stepper, or a read-only bar or arc gauge — each with a box to type the exact value.
order: 1
---

# Number Slider

Drag, step or type a number into any number column, or show one as a gauge.

:::callout{type=warning}
**Reference example · built with AI.** This control was written with AI (Claude) and tested on a live Dataverse form; its code has not been reviewed line by line. It is published as a worked example and is not maintained — read the source and [SPEC.md](https://github.com/pcfhub/pcf-number-slider/blob/main/SPEC.md) (what was measured on the form) before you use it. Fixes are not guaranteed.
:::

::image{src=media/states-light.png alt="Twelve Number Slider fields: a slider at 72.50 with its value box; a currency slider at $250,000.00; a green-banded slider at 85.00%; a two-thumb range from 10 to 400; a stepper at 3 with minus and plus buttons; an orange bar gauge at 42.00%; a blue arc gauge reading 72.50; a greyed read-only slider; an empty slider with its thumb at the start; a slider at 150.00 with a note that the saved value is outside the range of 0.00 to 100.00; a slider with no value box; and a range with no second column, saying to choose one."}

The platform's own number controls — Linear Slider, Linear Gauge, the Arc and
Radial Knobs, Number Input — were deprecated and never replaced, and the
controls a form offers today have nothing for numbers. This is one you can
install, for model-driven forms and canvas apps.

## Five styles

| Style | What it is | Writes |
| --- | --- | --- |
| **Slider** (the default) | A track and a thumb, with a box for the exact value | yes |
| **Range** | Two thumbs on one track, each on its own column — a minimum and a maximum, a from and a to | yes, both columns |
| **Stepper** | − and + buttons around the value | yes |
| **Bar** | A filled bar and the value | no — a gauge |
| **Arc** | A half-circle gauge with the value in its hollow | no — a gauge |

## What it does

- **Takes its range from the column.** A column with a declared minimum and
  maximum is the slider's range, unless the maker narrows it. The platform's
  own default for a type — two billion either way for a whole number — is not
  treated as a range, or every pixel would move millions.
- **Writes once per change, not once per pixel.** A drag writes when it is let
  go; each arrow-key press, each stepper press writes once; the box writes on
  Enter or when it loses focus. A form's OnChange runs once per change.
- **Writes what the column will keep.** A value is snapped to the step and
  rounded to the column's decimal places before it is written, so what you
  see is what is saved. A whole-number column only ever gets whole steps.
- **Reads and types the user's number format.** `1.234,5` is twelve hundred
  and thirty-four and a half to a German user; `1.5` is refused rather than
  read as fifteen. A currency column shows its symbol.
- **Refuses at the box, not at Save.** A typed value outside the range, a
  fraction in a whole-number column, or text that is not a number is refused
  with the reason, and what was typed stays there to be corrected.
- **Colours by threshold.** `50 danger; 80 warning; 100 success` colours the
  slider and the gauges red up to 50, amber to 80, green above — in Fluent's
  own status colours, or any CSS colour.
- **Leaves an out-of-range value alone.** A saved value outside the slider's
  range is shown as it is, with a note, and never rewritten until someone
  changes it.

## Where it runs

Model-driven forms and canvas apps, on a **Whole number**, **Decimal**,
**Float** or **Currency** column. Styled from the form's own Fluent theme,
dark mode and brand colour included. It has no dependencies, calls no service
and asks for no permissions. English, German, French, Spanish and Japanese.
