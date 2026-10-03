---
title: Examples
description: Settings for common number fields.
order: 6
---

# Examples

| Field | Column | Style | Minimum | Maximum | Step | Unit | Colour bands |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Probability | Whole number 0–100 | Slider | — | — | 5 | `%` | `30 danger; 70 warning; 100 success` |
| Rating | Decimal, 1 place, 0–10 | Slider | — | — | 0.5 | — | — |
| Budget | Currency | Slider | 0 | 1000000 | 1000 | — | — |
| Seats | two Whole number columns | Range | 0 | 500 | 1 | — | — |
| Quantity | Whole number | Stepper | 0 | 99 | 1 | — | — |
| Account health | Decimal 0–100 | Bar | — | — | — | `%` | `40 danger; 70 warning; 100 success` |
| Score | Decimal 0–100 | Arc | — | — | — | — | — |

A dash means leave it blank: the column's own range is used, and a blank
step is 1.

::image{src=media/screenshot-range.png alt="A Seats range from 10 to 400 with a box under each end of the track, and a Quantity stepper at 3 with minus and plus buttons."}

## A gauge beside the slider

A gauge never writes, so the same column can carry a slider on one form and a
bar on a dashboard form — or both on one form, in two sections, the gauge for
reading at a glance and the slider for changing it.

::image{src=media/screenshot-gauges.png alt="An orange bar gauge for Health at 42.00%, and a blue arc gauge for Score reading 72.50 in its hollow."}

## Thresholds that read the right way round

Bands read from the bottom up. For a value where low is good — days overdue,
error count — put the good colour first:

```text
3 success; 10 warning; 999 danger
```
