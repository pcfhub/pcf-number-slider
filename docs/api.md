---
title: API reference
description: Properties and outputs, generated from the control manifest.
order: 5
---

# API reference

## Input properties

::props-table{kind=input}

## Bound properties

::props-table{kind=bound}

## Notes

- **Blank means the default.** An unset **Style** is Slider, an unset
  **Value box** is Show, an unset **Step** is 1. Unset **Minimum** and
  **Maximum** are the column's own range — or 0 and 100 where the column has
  only the platform's default range, and in a canvas app. The control decides
  this, not the manifest's default value, which some hosts apply and others do
  not.
- **Bound types.** **Value** and **Upper value** take a Whole number (format
  *None*), Decimal, Float or Currency column. A whole number formatted as a
  duration, a time zone or a language is a different type and cannot be bound.
- **Upper value** is read only by **Range**, and never written when it is not
  mapped.
- **An empty box is written as a cleared column**, not as zero.
- **What is written is snapped and rounded.** A thumb's value is snapped to
  **Step** from **Minimum**; any value is rounded to the column's decimal
  places, as the platform would round it on save. A typed value is not
  snapped to the step.
- **Bar and Arc never write.**
- **Colour bands** is `threshold colour` entries separated by `;`, lowest
  first in effect whatever the order written: `50 danger; 80 warning;
  100 success`. Colours are `danger`, `warning`, `success`, `brand`,
  `neutral`, or any CSS colour the browser accepts. An entry that is neither
  is ignored.
