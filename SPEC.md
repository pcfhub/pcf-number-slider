# Number Slider

<!--
  SPEC.md is where findings that outlive a commit message go.

  It is not a design document written up front and it is not a changelog. It is
  what building this control taught you that the next person would otherwise
  rediscover: a platform API that turned out not to exist, a manifest shape that
  compiled but was wrong, a behaviour you observed rather than assumed.

  The test for whether something belongs here: would somebody starting the next
  control waste an afternoon without it?

  **Three things do not belong here, and each one is a trap that looks like
  diligence:**

  - **Measurements that a build reproduces.** Bundle sizes, zip sizes, whether
    lint passed. They are stale the moment anyone builds, and a number sitting
    in git that nobody re-runs is worse than no number, because it reads as
    authoritative. Quote them in the release notes or in the pull request, where
    they are dated by construction.
  - **Anything already explained in a comment beside the code.** The comment is
    better placed: it is read by whoever is about to change the thing.
  - **Anything already promoted to the skill.** Once a finding is general enough
    to live in the skill's `references/` — in its topic file, which
    `references/control-patterns.md` indexes — this file should *link* to it
    rather than repeat it — see "Promoting a finding" below.

  What is left is usually short, and short is the point. A SPEC.md nobody
  maintains is one nobody trusts.

  Delete the headings that have nothing under them.
-->

A slider, range, stepper or gauge for any number column — the controls the
platform deprecated (Linear Slider, Linear Gauge, Arc and Radial Knob in 2021,
Number Input in 2023) and never replaced. Chosen by the seventeenth demand run,
2 Oct 2026. Decided with the user, not to reopen: the slider with a typed box,
plus a two-column range, a read-only gauge (bar and arc), colour bands and a
stepper; and **a drag is one write** — on release, each arrow-key press, each
stepper press, the box on Enter or blur.

## What the build disagreed with

- **The four-type group generates `NumberProperty`, Currency included.**
  `refreshTypes` over `<type-group>` Whole.None, Decimal, FP, Currency typed
  both `value` and `upperValue` as `ComponentFramework.PropertyTypes.NumberProperty`
  (2 Oct 2026). The skill's *`of-type-group` costs more than it looks* named
  Whole.None, FP and Decimal as the members sharing that parent; Currency
  joins them. What the group costs is `Precision`, which `NumberMetadata`
  does not declare — reached by a cast, and only if P1 says a form hands it
  over.
- **The rig handed over only the inputs a test named.** The probe read
  `min` off `undefined` on its first run, because a test that set `style`
  replaced the whole `inputs` object. A host hands every declared input
  over, `raw: null` where the maker set none; the template's suite now merges
  a mount's inputs over `COLUMN.inputs` (`_template` 577df35).

## Probe 0.0.1 — what the form has to answer

`PROBE` is the build itself: `NumberSlider/index.ts` at 0.0.1 is a throwaway
control — one native range, or two for Range, writing on `change` — and
`NumberSlider/probe.ts` logs every pass in full the first time and compactly
after, every UI event (keys, pointer, touch, focus), and answers active calls
from the console. **Nothing of the control's design is in it.** An answer
that goes the wrong way removes the feature that depends on it rather than
being worked around.

The probe registers **per column**, because the form carries five instances
and a single global is last-mounted-wins:

```js
Object.keys(__pcfNumberSliderProbe)                  // one key per bound column
copy(__pcfNumberSliderProbe['numberofemployees'].dump())
```

First confirm the page runs this build, not a cached one (`customcontrols`
can say 0.0.1 while the page still runs an older bundle):

```js
const u = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /NumberSlider/.test(n) && /bundle\.js/.test(n));
(await (await fetch(u)).text()).includes('__pcfNumberSliderProbe')
```

**Set-up, once, on the Accounts test form (cll365):**

1. On **Account**, add — unless a probe of another control left one —
   *Score*, `cll_score`, **Decimal**, minimum **0**, maximum **10**,
   precision **1**; and *Min seats* `cll_minseats` and *Max seats*
   `cll_maxseats`, **Whole number**, minimum **0**, maximum **500**. Publish.
2. Import `NumberSlider_0.0.1_probe_unmanaged.zip`, publish.
3. A new tab *Number Slider probe*, with Number Slider on five columns:

   | Column | Kind | Style | Settings | Asks |
   | --- | --- | --- | --- | --- |
   | `numberofemployees` | Whole number, platform range | Slider | all blank | P1, P8 |
   | `revenue` (Annual revenue) | Currency | Slider | min 0, max 1000000, step 1000 | P1, P2 |
   | `address1_latitude` | FP, declared −90..90, precision 5 | Slider | all blank | P1 |
   | `cll_score` | Decimal, declared 0..10, precision 1 | Slider | step 0.5 | P1, P3, P6 |
   | `cll_minseats` | Whole number, declared 0..500 | **Range** | *Upper value* `cll_maxseats` | P5 |

   And put `cll_score` and `cll_minseats` on the tab a second time as plain
   fields, so the platform's own control shows what the column holds.
4. Two accounts: *Probe numbers*, every column above filled; *Probe empty*,
   none filled. If the organisation has a second currency, set *Probe
   numbers* to it (P2); say if it has none.

| | Question | What to do | What it decides |
| --- | --- | --- | --- |
| P1 | What each kind hands over: `type` (the member, the whole group, or another member — all three have been seen on type groups), `raw`, `formatted`, and **every key of `attributes`**: is a declared range there, and is it `Precision` (Decimal, FP, Currency) or `Format` (whole) that tells the kinds apart? | Open *Probe numbers*; `dump()` each of the five; also `copy(JSON.stringify(await __pcfNumberSliderProbe['cll_score'].metadata(), null, 1))` for what the server says the column is | The whole-versus-fractional evidence; whether `Precision` can be read at all; whether the hub harness needs a `precision` (plan item F) |
| P2 | A currency: `formatted` on a record in another currency, against `formatCurrency(v)`, `formatCurrency(v, 2, '€')` and `numberFormattingInfo.currencySymbol` (the dump samples all of them) | `dump()` the `revenue` instance on *Probe numbers*; then `copy(JSON.stringify(await __pcfNumberSliderProbe['revenue'].readBack(), null, 1))` | Where the symbol comes from while dragging — the record's `formatted` at rest is the fallback |
| P3 | Writes the column cannot hold: above `MaxValue`; more places than `Precision`; a fraction into a whole number; `null` into a required column. Are `error` and `errorMessage` set? Does Save refuse? What is stored? | On `cll_score`: `.write(15)`, Save; `.write(1.23456)`, Save, `readBack()`; on `numberofemployees`: `.write(3.5)`, Save, `readBack()`. Make `cll_score` Business required, `.write(null)`, Save. `dump()` after each | Clamp at the control, or leave it to the form; round before writing, or let the form |
| P4 | Echoes at key-repeat speed: 30 writes, 33 ms apart. Reordered? Dropped? How many form OnChange calls, and is the form dirty? | On `cll_score`: `.watchOnChange()`, then `copy(JSON.stringify(await __pcfNumberSliderProbe['cll_score'].burst(30, 33, 0), null, 1))` | Whether a held arrow key needs a throttle |
| P5 | The second column: the unmapped shape for a number (`type: null`?), and one notify writing both | On `cll_minseats`: `dump()` (the `upperValue` shape); `.writeBoth(15, 450)`, Save, `readBack()`. Then remove *Upper value* in the designer and `dump()` again | Range's configuration message, and that it never writes an unmapped column |
| P6 | Can the modern designer bind *Maximum* to a column? If so, which columns does it offer, and does a change on the form reach `updateView`? | Open `cll_score`'s Number Slider in the designer and look at *Maximum* — say what it offers. If it binds, bind it, change that column on the form, `dump()` | Whether the docs promise min and max from another column |
| P7 | Read-only: a deactivated account; a column the user cannot edit | Deactivate *Probe numbers*, `dump()` (`disabled` in each pass); if a secured column is handy, one too | The disabled and denied states |
| P8 | Keys reach a focused range on the form: Arrow, Page Up/Down, Home/End — or does the form take any of them? | Click `numberofemployees`'s thumb, press Right ×3, Page Up, Home, End, then Tab; `dump()` (`events`: `keydown` and `keydown.after`) | Whether the control has to handle keys itself |
| P9 | A phone: does dragging the thumb move it, or scroll the form? | Open *Probe numbers* in the Power Apps app on a phone; drag a slider and say what happened | `touch-action` on the track |
| P10 | A canvas app: OnChange per drag; a clear reaching the source; `context.formatting` present; `attributes` absent | A screen with the control on a number, OnChange `Set(changes, changes + 1)`, a label showing `changes`. Drag once, say the count; then, in the console, `__pcfNumberSliderProbe['value'].write(null)` | The canvas column of the docs |
| P11 | German number formats: separators in `formatted`, `numberFormattingInfo`, the formatting samples | Personal options → *Formats* → German (Germany), reload *Probe numbers*, `dump()` `cll_score` and `revenue`; switch back | The box's parser against what the form really sends |

## Demo

`full` is the candidate: no `<feature-usage>`, no Web API, nothing leaves the
browser (the probe's console calls are not the control). To be settled with
0.1.0: the hub's harness gives a bound column `MinValue`/`MaxValue` from the
fixture (`dataverse.columns`, `boundColumns`) and no `Precision`, and formats
a number's `formatted` as `String(value)`.

## Not verified

Everything P1–P11 asks. Until they are answered nothing below the probe is
built.

## Promoting a finding

When something here turns out to be general — true of PCF rather than true of
this control — move it to its topic file in the skill's `references/`
(`references/control-patterns.md` is the index that names each one) and
replace it here with a line naming where it went.

Repeating it in both places is how the two drift, and the copy nothing executes
always loses. The rule is: one home, and a pointer from anywhere else.
