---
title: FAQ
description: Questions that come up more than once.
order: 8
---

# FAQ

## Why does my slider run from 0 to 100?

The column has no range of its own — only the platform's default, which is
two billion wide — and **Minimum** and **Maximum** are blank. Set them, or
give the column a minimum and maximum in the table designer. In a canvas app
there is no column metadata at all, so set them there too.

## Why does the slider not go all the way to the maximum?

The step does not divide the range. A slider from 0 to 100 in steps of 7
stops at 98, the last step; type 100 in the box if 100 is what you want.

## Why was what I typed refused?

The box refuses a value outside the slider's range, a fraction in a
whole-number column, and anything that is not a number in your number format
— `1.5` to a German user, whose decimal separator is a comma. What you typed
stays in the box with the reason under it; Escape puts the saved value back.

## Why is the field showing a value outside the slider?

The value was saved before the control was added, or by something other than
the control. It is shown exactly as saved, with a note, and left alone until
someone changes it.

## Does it replace the platform's Linear Slider?

It covers what the deprecated Linear Slider, Linear Gauge and Arc Knob were
used for, and adds a two-column range and a stepper.

## How do I report a bug?

Open an issue at <https://github.com/pcfhub/pcf-number-slider/issues>, with the
platform version and the control version from the solution.
