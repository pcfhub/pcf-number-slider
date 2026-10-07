---
title: Canvas apps
description: Bind a slider, range or stepper to a number, and react once per change.
order: 4
---

# Canvas apps

:::steps
1. Enable **Code components for canvas apps** for the environment.
2. **Insert → Get more components → Code**, and import **Number Slider**.
3. Bind **Value** to the number — a column of the record being edited, or a
   variable.
4. Set **Minimum**, **Maximum** and **Step**.
5. For **Range**, bind **Upper value** to the second number too.
:::

## Set the range

A canvas app does not describe the column behind a value, even when the value
comes from Dataverse, so the control cannot see a column's minimum, maximum or
decimal places. Blank **Minimum** and **Maximum** are 0 and 100 there. Set
them, and set **Step** to what the column can hold — `1` for a whole number,
`0.01` for two decimal places. The control cannot refuse a fraction for a
whole-number column in a canvas app: the box takes what is typed.

:::callout{type=warning}
**0.1.1 and earlier held every canvas value to two decimal places.** A canvas
app reports two decimal places for any number property, whatever it is bound
to, and those versions took that for the column's: a **Step** of `0.001` was
drawn as `0.01`, and `0.12345` typed into the box was written as `0.12`. 0.1.2
takes a precision only from a real column, so a canvas value is written as
typed and the step is the one you set.

Importing 0.1.2 does not update an app that already has the control. Open the
app in Studio after the import, accept **Update code components**, then save
and publish — if Save is greyed out, change any formula first.
:::

## OnChange runs once per change

The control writes when a drag is let go, on each key press and stepper
press, and when the box is committed — never while a thumb is moving. So
**OnChange** runs once per change, and a `Patch` in it saves once:

```powerfx
// OnChange of NumberSlider1
Patch(Opportunities, ThisItem, { 'Probability': NumberSlider1.Value })
```

For **Range**, read both:

```powerfx
Patch(Accounts, ThisItem, {
    'Min seats': NumberSlider1.Value,
    'Max seats': NumberSlider1.upperValue
})
```

## Clearing

Clearing the box writes a blank, which `IsBlank(NumberSlider1.Value)`
reports. With **Value box** hidden there is nothing to clear with.
