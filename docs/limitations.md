---
title: Limitations
description: What the control does not do, and why.
order: 7
---

# Limitations

## Horizontal only, no tick marks

The track is horizontal, with no tick marks or labels along it. The value is
in the box beside it, and in the screen reader's announcement.

## The platform's default range is ignored

A column whose minimum and maximum are the platform's own defaults — about
±2.1 billion for a whole number — is treated as having no range, and the
slider runs from 0 to 100 unless **Minimum** and **Maximum** are set. Built-in
columns often have a large range of their own (**Number of employees** runs
to a billion): set **Maximum** on those too.

## Minimum, Maximum and Step bind to Decimal columns only

The form designer's **Bind to table column** lists only Decimal columns for
these three, because that is the type they are declared as. Set them as
numbers for a whole-number or currency limit.

## Duration, time zone and language columns

A whole number formatted as a duration, a time zone or a language is a
different column type, and the control cannot be bound to it.

## Gauges are read-only

**Bar** and **Arc** show a value and never write one. For a value that is
both read and changed, put a slider on the same column in another section.

## Bands colour the slider and the gauges

**Range** and **Stepper** ignore **Colour bands**: a range has two values and
no single colour, and a stepper has no fill to colour.

## Clearing needs the box

The column is cleared by emptying the value box. With **Value box** set to
**Hide**, a slider can be moved but not cleared.

## The currency symbol is the organisation's

A currency column shows the symbol the platform formats it with, which is the
organisation's currency in the user's number layout. A record in another
currency is not yet verified to show its own symbol.

## A canvas app sees the value after release

**OnChange** runs once per change — when a drag ends, not while it moves. A
label that should follow the thumb as it moves cannot: the value is not
written until the thumb is let go.

## Page Up and Page Down

Arrow keys move one step. Page Up and Page Down move by the browser's own
amount for a range input, which is not a setting.
