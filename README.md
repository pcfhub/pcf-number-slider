# Number Slider

A slider, range, stepper or gauge for any number column.

> **Reference example · built with AI.** This control was written with AI (Claude) and tested on a live Dataverse form; its code has not been reviewed line by line. It is published as a worked example and is not maintained — read the source and [`SPEC.md`](SPEC.md) (what was measured on the form) before you use it. Fixes are not guaranteed.

[![Build](https://github.com/pcfhub/pcf-number-slider/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-number-slider/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-number-slider/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-number-slider/actions/workflows/release.yml)

[![Try it live on PCFHub](https://pcfhub.dev/badges/try-it-live.svg)](https://pcfhub.dev/components/pcf-number-slider)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-number-slider), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.

## What it does

Drag, step or type a number into a Whole number, Decimal, Float or Currency
column — or show one as a gauge. Five styles: a **slider** with a box for the
exact value, a **range** across two columns, a **stepper**, and read-only
**bar** and **arc** gauges, coloured by threshold if you like
(`50 danger; 80 warning; 100 success`).

The platform deprecated its own number controls — Linear Slider, Linear
Gauge, the Arc and Radial Knobs, Number Input — and the controls a form offers
today have nothing for numbers. This is a replacement for model-driven forms
and canvas apps, with no dependencies.

Three decisions a reader might otherwise question:

- **It writes once per change.** A drag writes when it is let go, each arrow
  key or stepper press writes once, the box writes on Enter or blur. A form
  coalesces fast writes on its own, so nothing is throttled.
- **The column decides the range.** A column's own minimum and maximum are
  the slider's, unless they are the platform's default for the type — two
  billion either way for a whole number — which is treated as "no range" and
  becomes 0–100. A maker's **Minimum** and **Maximum** narrow it; wider is cut
  to what the column would accept.
- **What it writes is what the column keeps.** The form rounds a write to the
  column's decimal places without saying so; the control snaps and rounds
  first, so the value echoed back is the value written. A typed value the
  column would refuse — out of range, a fraction in a whole column — is
  refused at the box with the reason, not at Save.

Every one of these was measured on a model-driven form before it was built;
[SPEC.md](SPEC.md) has the measurements.

## Properties

| Property | Type | Usage | Default | What it controls |
| --- | --- | --- | --- | --- |
| `value` | Decimal, Whole.None, FP, Currency | bound, **required** | — | The column — the bottom of a range |
| `upperValue` | Decimal, Whole.None, FP, Currency | bound | — | The top of a range; read only by Range |
| `style` | Enum | input | `slider` | `slider`, `range`, `stepper`, `bar`, `arc` |
| `min` | Decimal | input | the column's range, else 0 | The start of the scale |
| `max` | Decimal | input | the column's range, else 100 | The end of the scale |
| `step` | Decimal | input | 1 | The step a thumb and the stepper move by |
| `valueBox` | Enum | input | `show` | `show` or `hide` the box (a stepper always shows it) |
| `unit` | SingleLine.Text | input | — | Shown after the value: `%`, `km` |
| `bands` | SingleLine.Text | input | — | `threshold colour; …` — `danger`, `warning`, `success`, `brand`, `neutral` or a CSS colour |

Strings ship in English, German, French, Spanish and Japanese. No framework is
bundled and none is used from the platform: the slider is the browser's own
range input, styled with the form's Fluent tokens. The control declares no
`uses-feature`, so the maker installing it is asked for no permissions, and it
is not premium.

## On the hub

The demo is **full** fidelity: the control reaches no Web API, device or
navigation, so the hub's harness runs it exactly as a form would, and a maker
can drag, type and step in it with `getOutputs` changing beside it. Nine
presets cover every style — a banded probability slider, a half-step rating, a
currency budget, a two-column seats range, a stepper, the bar and arc gauges,
an empty column and a value saved outside the range.

What the demo cannot show is listed with it: its columns are Decimal, so the
whole-number and currency behaviour is not there, and a read-only form or a
range with no second column cannot be set from a preset — the screenshots
show those.

## Install

Download the managed solution from the
[latest release](https://github.com/pcfhub/pcf-number-slider/releases/latest), or from
the component's page on the hub, and import it into your environment.

## Develop

```bash
npm install
npm start          # the PCF test harness
npm run build
npm run lint
npm run check      # what CI runs first: placeholders, pcfhub.json, control shape
npm run smoke      # assertions against the built bundle — see dev/
npm run harness    # serves dev/harness.html and opens it
```

`npm start` renders the control; `dev/` is for the states it cannot reach. Build
first, then `npm run smoke` for the assertions, or `npm run harness` for the
switches — field-level security, a failed business rule, a host that publishes
no theme or no column metadata, and for a dataset control, more than one page.
Both read the bundle `npm run build` wrote, and both are described in the header
of `dev/smoke.js`.

`npm run harness` serves the repository over `http://` rather than leaving you to
open the file: over `file://` a dataset fixture cannot be fetched and a module
script is refused, and both arrive as an empty control with a CORS error. It
takes `--port` and `--no-open`, and needs no dependency — `dev/serve.js` is
`node:http`. A React (virtual) control gets one too: `dev/fluent-stub.js` stands
in for the Fluent the platform would supply, and its header says exactly where
the stand-in is less capable than the real thing.

Run `npm run refreshTypes` after every manifest edit — until you do,
`context.parameters` is typed from the old manifest and `tsc` will accept code that
cannot work.

To pack the solution locally you need msbuild — either Visual Studio or the
Visual Studio Build Tools:

```bash
cd Solution
msbuild /t:build /restore /p:configuration=Release
```

Both zips land in `Solution/bin/Release`. This is the only local step that compiles
in **production** mode, so a green `npm run build` is not evidence the shipping
bundle compiles — and the pack is incremental, so delete `obj/`, `out/`,
`Solution/obj/` and `Solution/bin/` first if you intend to quote a bundle size from
it.

## Release

```bash
npm run bump -- --minor      # every version location, in one edit
npm run release -- --draft   # .release-notes.md, from the commits since the last tag
# …rewrite the notes, commit the bump…
npm run release -- --push
```

**On PowerShell, call the scripts directly** — `node scripts/version.mjs --minor`.
npm swallows a `--` flag there, warns *"Unknown cli config"*, and runs the
script with no arguments: it prints the report, changes nothing, and reads as a
bump that found nothing to do.

`npm run bump` with no argument is a **read**: it prints every place the version
lives and exits 1 if they disagree. Worth running before anything else, because
the same check otherwise happens in CI — on a Windows runner, after the pack, on
a tag that has already been pushed. `npm run check` now runs it too.

The version lives in **three** places, more in a repository holding several
controls, and they are checked against each other:

- `NumberSlider/ControlManifest.Input.xml` → `<control version="…">`
- `Solution/src/Other/Solution.xml` → `<Version>`
- `package.json` → `"version"`

Doing it by hand is still fine, and then the thing to get right is the tag:

```bash
git tag -a --cleanup=verbatim v1.2.3 -F notes.md && git push origin v1.2.3
```

**Without `--cleanup=verbatim`, git drops every `## Heading` in the notes as a
comment, silently.** `npm run release` passes it, and then reads the tag back to
confirm the headings survived — because the failure is invisible in the command
that caused it.

**The tag message is the release body, and the release body is the changelog
on the hub.** A lightweight tag gets GitHub's generated notes instead, which
for a repository without pull requests is a single compare link — and the
workflow warns when that is about to happen.

There is deliberately no `CHANGELOG.md`. The hub builds the changelog from
release notes, and `docs/changelog.md` is a hard failure in `npm run check`.

The release workflow builds, packs both solution types, and attaches them to a
GitHub Release. PCFHub picks the release up from its webhook within seconds, or
from the hourly sweep otherwise. A sync imports a draft; a person publishes it.

## Repository layout

| Path | What it is |
| --- | --- |
| `NumberSlider/` | The control: manifest, entry point, CSS, localised strings |
| `Solution/` | The Dataverse solution that packages it |
| `dev/` | A stand-in host: `npm run smoke` asserts, `harness.html` shows |
| `SPEC.md` | What building this corrected, and what is verified versus read |
| `docs/` | The pages PCFHub publishes — see the comments in each file |
| `media/` | Images and video referenced from the docs |
| `pcfhub.json` | The hub's manifest: identity, links, docs path, demo |
| `scripts/` | Template setup and the CI guard that keeps it adopted |

## Licence

[MIT](LICENSE)
