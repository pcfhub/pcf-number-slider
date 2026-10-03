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
Object.keys(window.__pcfNumberSliderProbe ?? {})   // five column names: the probe is running
```

Only this build creates that global, so it is the check. The bundle can't be
found by name in `performance.getEntriesByType('resource')` on this form
(2026-10-03: no entry at all while the probe ran — confirmed, five keys).

**Set-up on cll365 — done 2 Oct 2026**, with `pac solution import`, the
pp-prodev skill's `ppdev form control bind`, and the Web API for what ppdev
has no command for (columns, the tab, the records):

1. `NumberSliderSolution` 0.0.1 imported and published.
2. On **Account**, in solution `cll365dev` (prefix `cll`): *Min seats*
   `cll_minseats` and *Max seats* `cll_maxseats`, **Whole number**, 0..500.
   `cll_score` was already there — **Decimal, 0..100, precision 2**, not the
   0..10 / 1 first planned — and is used as it is.
3. The test form is account's **Information** main form
   (`b053a39a-041a-4356-acef-ddf00182762b`). A new tab *Number Slider
   probe*, after *File Preview probe*, with Number Slider on five columns:

   | Column | Kind | Style | Settings | Asks |
   | --- | --- | --- | --- | --- |
   | `numberofemployees` | Whole number, platform range | Slider | all blank | P1, P8 |
   | `revenue` (Annual revenue) | Currency | Slider | min 0, max 1000000, step 1000 | P1, P2 |
   | `address1_latitude` | FP, declared −90..90, precision 5 | Slider | all blank | P1 |
   | `cll_score` | Decimal, declared 0..100, precision 2 | Slider | step 0.5 | P1, P3, P6 |
   | `cll_minseats` | Whole number, declared 0..500 | **Range** | *Upper value* `cll_maxseats` | P5 |

   And a section *Plain fields* on the same tab with `cll_minseats` and
   `cll_maxseats` on the platform's own controls. The copies of
   `numberofemployees` and `revenue` on *Details* and of `address1_latitude`
   and `cll_score` on *General* are the platform's own controls too — only
   the probe tab is bound, so each column's probe registers once.
4. Accounts: *Probe numbers* (`c6361bf1-d0be-f111-aaaf-6045bd06056e`):
   250 employees, revenue 1,500,000, latitude 47.60621, score 72.5, seats
   10..400. *Probe empty* (`2676f16d-8dbe-f111-aaaf-6045bd06056e`, left from
   the File Preview probe), none filled. **The organisation has one currency,
   USD**, so P2's other-currency half cannot be asked here.

   ```
   https://cll365.crm.dynamics.com/main.aspx?pagetype=entityrecord&etn=account&id=c6361bf1-d0be-f111-aaaf-6045bd06056e&formid=b053a39a-041a-4356-acef-ddf00182762b
   ```

**What the set-up taught, for the bind tooling:**

- `ppdev form control bind` binds **every** copy of a column in the form's
  tabs. Two of this form's probe columns were already on *Details* and two on
  *General*, and it bound those as well — and **replaced** a binding the
  *General* copy of `cll_score` already had (most likely Star Rating: of the
  installed controls that bind a number, it alone is now on no form). Its
  settings were not recoverable; that copy is a plain Decimal field now.
- `--param upperValue=@cll_maxseats` wrote the second bound column with **no
  `type`**; the form designer writes one (`<endDate
  type="DateAndTime.DateOnly">`). Typed by hand, `type="Whole.None"`.
- A copy restored to the platform control has to lose its `uniqueid` with
  its description — and a Decimal copy carrying the **text box's** classid
  (`{F9A8A302-…}`, as the designer had left `cll_score`) is refused on save
  as "a custom control with no ControlDescription" (`0x80160019`) until it
  has the Decimal control's, `{C3EFE0C3-0EC6-42BE-8349-CBD9079DFD8E}`.
- `GET systemforms` answers with the **published** form: two saves without a
  publish between them overwrite each other.

| | Question | What to do | What it decides |
| --- | --- | --- | --- |
| P1 | What each kind hands over: `type` (the member, the whole group, or another member — all three have been seen on type groups), `raw`, `formatted`, and **every key of `attributes`**: is a declared range there, and is it `Precision` (Decimal, FP, Currency) or `Format` (whole) that tells the kinds apart? | Open *Probe numbers*; `dump()` each of the five; also `copy(JSON.stringify(await __pcfNumberSliderProbe['cll_score'].metadata(), null, 1))` for what the server says the column is | The whole-versus-fractional evidence; whether `Precision` can be read at all; whether the hub harness needs a `precision` (plan item F) |
| P2 | A currency: `formatted` on a record in another currency, against `formatCurrency(v)`, `formatCurrency(v, 2, '€')` and `numberFormattingInfo.currencySymbol` (the dump samples all of them) | `dump()` the `revenue` instance on *Probe numbers*; then `copy(JSON.stringify(await __pcfNumberSliderProbe['revenue'].readBack(), null, 1))` | Where the symbol comes from while dragging — the record's `formatted` at rest is the fallback |
| P3 | Writes the column cannot hold: above `MaxValue`; more places than `Precision`; a fraction into a whole number; `null` into a required column. Are `error` and `errorMessage` set? Does Save refuse? What is stored? | On `cll_score` (0..100, precision 2): `.write(150)`, Save; `.write(1.23456)`, Save, `readBack()`; on `numberofemployees`: `.write(3.5)`, Save, `readBack()`. Make `cll_score` Business required, `.write(null)`, Save. `dump()` after each | Clamp at the control, or leave it to the form; round before writing, or let the form |
| P4 | Echoes at key-repeat speed: 30 writes, 33 ms apart. Reordered? Dropped? How many form OnChange calls, and is the form dirty? | On `cll_score`: `.watchOnChange()`, then `copy(JSON.stringify(await __pcfNumberSliderProbe['cll_score'].burst(30, 33, 0), null, 1))` | Whether a held arrow key needs a throttle |
| P5 | The second column: the unmapped shape for a number (`type: null`?), and one notify writing both | On `cll_minseats`: `dump()` (the `upperValue` shape); `.writeBoth(15, 450)`, Save, `readBack()`. Then remove *Upper value* in the designer and `dump()` again | Range's configuration message, and that it never writes an unmapped column |
| P6 | Can the modern designer bind *Maximum* to a column? If so, which columns does it offer, and does a change on the form reach `updateView`? | Open `cll_score`'s Number Slider in the designer and look at *Maximum* — say what it offers. If it binds, bind it, change that column on the form, `dump()` | Whether the docs promise min and max from another column |
| P7 | Read-only: a deactivated account; a column the user cannot edit | Deactivate *Probe numbers*, `dump()` (`disabled` in each pass); if a secured column is handy, one too | The disabled and denied states |
| P8 | Keys reach a focused range on the form: Arrow, Page Up/Down, Home/End — or does the form take any of them? | Click `numberofemployees`'s thumb, press Right ×3, Page Up, Home, End, then Tab; `dump()` (`events`: `keydown` and `keydown.after`) | Whether the control has to handle keys itself |
| P9 | A phone: does dragging the thumb move it, or scroll the form? | Open *Probe numbers* in the Power Apps app on a phone; drag a slider and say what happened | `touch-action` on the track |
| P10 | A canvas app: OnChange per drag; a clear reaching the source; `context.formatting` present; `attributes` absent | A screen with the control on a number, OnChange `Set(changes, changes + 1)`, a label showing `changes`. Drag once, say the count; then, in the console, `__pcfNumberSliderProbe['value'].write(null)` | The canvas column of the docs |
| P11 | German number formats: separators in `formatted`, `numberFormattingInfo`, the formatting samples | Personal options → *Formats* → German (Germany), reload *Probe numbers*, `dump()` `cll_score` and `revenue`; switch back | The box's parser against what the form really sends |

## Measured

### P1 — what each kind hands over (2026-10-03, *Probe numbers*, web, en-US)

| Column | `type` | `raw` | `formatted` | `attributes` |
| --- | --- | --- | --- | --- |
| `numberofemployees` | `Whole.None` | 250 | `250` | `Type: "integer"`, Min 0, Max 1000000000, **`Precision: 0`, `Format: "0"`**, ImeMode null |
| `revenue` | `Currency` | 1500000 | `$1,500,000.00` | `Type: "money"`, Min 0, Max 100000000000000, `Precision: 2`, no `Format` |
| `address1_latitude` | `FP` | 47.60621 | `47.60621` | `Type: "double"`, Min −90, Max 90, `Precision: 5` |
| `cll_score` | `Decimal` | 72.5 | `72.50` | `Type: "decimal"`, Min 0, Max 100, `Precision: 2` (the casts agree: 0..100, 2) |
| `cll_minseats` (Range) | `Whole.None` | 10 | `10` | `Type: "integer"`, Min 0, Max 500, `Precision: 0`, `Format: "0"` |

- **`type` is the member, on every column.** None of the three type-group
  hosts the rig models showed up as the group string or a wrong member here.
- **Every number column carries `Precision` — a whole number's is 0.** The
  design (and `_template`'s `--bind number` scaffold, and its rig) told whole
  from fractional by "`Precision` on the fractional types, `Format` on a
  whole number"; a whole column has both. **The test is `Precision === 0`**,
  with `attributes.Type` (`integer`, `decimal`, `double`, `money`) as
  corroboration and the exact `Whole.None` veto for a host with no
  `attributes`.
- **The declared range arrives on the bound property**, matching the
  server's casts — no `EntityDefinitions` call needed. A system column's
  declared range is its own, not the platform default for new columns
  (`numberofemployees` 0..1e9, `revenue` 0..1e14).
- **`formatted` carries the currency symbol** and the column's precision
  (`72.50`, `47.60621`).
- **A bound property has more members than the typings:** `errorCode`,
  `notifications`, `predicted`, `predictionCitation`, `citationData`,
  `isMasked`, `isControlLoading`. `context.parameters` also carries
  `labelForPrefix`, `deviceSizeMode`, `viewportSizeMode`, `syncError`,
  `isEmpty`, `scope`, `forceColumnLayout`, `autoExpand`.
- **`upperValue` unmapped** is the eight-key shape (`type: null`,
  `attributes: {}`, `security: {}`); **mapped**, it has the full fifteen keys
  with its own range.
- **An input the maker left unset is `raw: null`, `type: null` — its
  manifest `default-value` does not arrive.** `style` (default `slider`) and
  `valueBox` (default `show`) were `null` on every instance where the binding
  named no value. The control reads `null` as the default.
- **`numberFormattingInfo` has every member twice**, PascalCase and
  camelCase.
- **`context.formatting`:** `formatDecimal(v)` gives two places;
  `formatCurrency(v, 2, '€')` → `€1,234.50`, `(…, 'EUR')` → `EUR1,234.50` (a
  code is prefixed as written); **`formatCurrency(-1234.5)` → `($1,234.50)`**
  — brackets, currency negative pattern 0.
- A second pass arrives about 2.7 s after load with `updatedProperties:
  ["orgSettings"]` and nothing else changed — a reason to keep renders cheap.

### P2 — currency (2026-10-03)

The record's currency is US Dollar, the organisation's only one; the read-back
gives `revenue` 1500000 and `$1,500,000.00`, the same as the bound
property's `formatted`. **Not verified:** a record in a non-base currency.

### P3 — writes the column cannot hold (2026-10-03)

| Write | What came back | Saved |
| --- | --- | --- |
| `cll_score` 150 (max 100) | `raw: 150`, **`error: true`, `errorMessage: "Enter a number between 0.00 and 100.00."`**, form dirty | **No** — the server still holds 1.23 |
| `cll_score` 1.23456 (precision 2) | **`raw: 1.23` within 138 ms**, no error | 1.23 |
| `numberofemployees` 3.5 (whole) | **`raw: 4`** within about 130 ms, no error | 4 |

- **Out of range is the form's refusal, said in its own words**: the bound
  property's `error`/`errorMessage` is set and Save does not go through. The
  control keeps a drag inside the range (a native range clamps) and the box
  refuses a typed value beyond it before the form has to.
- **Extra places and fractions are rounded on the way in, silently** — 1.23456
  became 1.23, and 3.5 became 4 in a whole-number column, with no message.
  So the control rounds to `Precision` itself before writing (its echo then
  equals its write), and **a whole-number column never gets a fraction from
  it**: the form would quietly change what the user chose.
- A release on the slider (`cll_score`, step 0.5) gave `pointerdown` →
  `input` 5.5 → `pointerup` → **one** `change` → one write, echoed about
  245 ms later. **Every write anywhere re-renders every control** on the
  form with `updatedProperties: ["value", "parameters"]` — each instance got
  that pass when another's value changed — so `updatedProperties` cannot say
  whether this control's own value moved; compare the value.
- Not run: `null` into a Business-required column.

### P4 — a held key's rate (2026-10-03)

30 writes to `cll_score`, 1 to 30, about 47 ms apart (the browser stretched
the 33 ms timer) over 1.36 s. **One** pass came back, 133 ms after the last
write, holding 30; **one** form OnChange; nothing reordered. The form
coalesces a burst of `notifyOutputChanged` into a single `updateView` and a
single OnChange, so **arrow keys write on every press, with no throttle**,
and the echo guard sees one echo, of the last value.

### P5 — the second column (2026-10-03)

One `getOutputs` carrying `value` 15 and `upperValue` 450, then Save: the
server holds `cll_minseats` 15 and `cll_maxseats` 450. A second bound column
saves exactly as the first. The unmapped shape was already measured in P1 on
the four instances with no upper column (`type: null`, `attributes: {}`,
`security: {}`), so the designer half of P5 was not needed.

### P8 — keys on a focused range, on the form (2026-10-03)

On `numberofemployees` (the probe's range 0..100, step 1): a click (focus,
`input` 5, one `change`), then → → → (6, 7, 8), Page Up (18), Home (0),
End (100), Tab (blur). **Every key reached the range** — `defaultPrevented`
false on each, none taken by the form — and **each press fired `input` and
`change` together**, so each wrote once; each value came back 200–350 ms
later. **The native range carries the keyboard**: 0.1.0 handles no keys
itself on the slider. Page Up's +10 cannot tell "ten steps" from "a tenth of
the range" on a 0..100 slider; with a real column range the walkthrough
looks again.

### P6 — an input bound to a column (2026-10-03, the modern designer)

*Maximum*, *Minimum*, *Step*, *Unit* and *Colour bands* each show **"Bind to
table column"**; checked, the list is **the table's columns of the
property's own type** — for *Maximum* (Decimal) on account: *Score* and
*Exchange Rate*, nothing else. So min, max and step can come from another
column **only if it is Decimal**; a whole-number or currency column cannot
be picked. Not verified: whether a change to that column on the form
reaches `updateView` (nothing was bound).

### P7 — read-only (2026-10-03)

Deactivating *Probe numbers* gave one pass with `updatedProperties:
["IsControlDisabled", "value", "parameters", "isPageReadOnly"]` and
`mode.isControlDisabled: true`; **`security.editable` stayed `true`** — the
column is editable, the page is not. The control disables on either.
(Deactivating saved the form: P8's unsaved 100 is now the stored value.)
Not run: a column under field-level security.

### P11 — German formats (2026-10-03, Formats: German (Germany), UI language still 1033)

| | en-US | de-DE |
| --- | --- | --- |
| `cll_score` `formatted` | `72.50` | `1,23` |
| `revenue` `formatted` | `$1,500,000.00` | `1.500.000,00 $` |
| `formatDecimal(1234.5)` | `1,234.50` | `1.234,50` |
| `formatCurrency(-1234.5)` | `($1,234.50)` | `-1.234,50 $` |
| separators (decimal / group) | `.` / `,` | `,` / `.` |
| currency patterns (positive / negative) | 0 / 0 | 3 / 8 |
| **`currencySymbol`** | `$` | **`$`** |

- The separators and the currency patterns follow the user's format; **the
  currency symbol does not** — it is the organisation's currency (USD), in a
  German layout. `languageId` stays 1033: formats are independent of the UI
  language.
- `formatCurrency(v, 2, 'EUR')` → `1.234,50 EUR`: a code follows the number
  in this pattern too.
- The box's parser reads `numberDecimalSeparator` / `numberGroupSeparator`
  from here, as the `--bind number` scaffold does; P11 confirms they swap.

### Not asked on the form

P9 (phone) and P10 (canvas) are optional and stay in *Not verified*; so does
P3's `null` into a Business-required column.

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
