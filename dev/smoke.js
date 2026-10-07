/*
 * Drives the real built bundle outside a browser.
 *
 *     npm run build && npm run smoke
 *
 * What it does: installs the DOM and the platform globals, loads
 * `out/controls/NumberSlider/bundle.js` the way a form would, drives the control
 * through the states a form can put it in, and asserts what it did.
 *
 * Why it exists alongside `npm start` and `dev/harness.html`: both of those
 * *show* you the control, and the states that matter most are ones nobody
 * thinks to look at — a column the user cannot read, a business rule that
 * failed, a host with no column metadata, a cleared value that has to travel
 * back as `null` rather than `undefined`. Those are decisions, they are what
 * regresses, and here they are assertions with an exit code.
 *
 * Why no test framework: there is none in this repository, and adding one to
 * run a handful of assertions against a bundle would be a dependency, a config
 * file and a second build pipeline for something `node` already does. It also
 * runs the **built bundle** rather than the TypeScript sources, which is the
 * part worth checking — webpack, the externals and the manifest all sit between
 * the source and what a form actually loads. CI runs it after the msbuild pack,
 * so there it drives the production bundle.
 *
 * **What passing here does NOT mean.** Every value below is supplied by this
 * file. It cannot tell you that the control looks right, that the stylesheet
 * applies, that focus order works, that a real form hands down what these
 * fixtures hand down, or that a save persists anything. Keep the answers to
 * those in SPEC.md under "Not verified".
 *
 * **If the bundle will not load here at all**, because it carries a browser
 * application that reads `document` at module scope — a Monaco, a map, a
 * charting library — do not grow `dom.js` to meet it. Keep the control's
 * decisions in modules that import nothing of the library, and drive those
 * instead, through `dev/modules.js`: it transpiles them with the TypeScript
 * already in devDependencies and refuses one that imports the library
 * (`pcf-code-editor` is the worked example). The skill has the shape under
 * *When the bundle cannot load in Node*.
 *
 * **And a stub must never be more capable than the thing it stands in for.**
 * `dev/host.js` withholds `security`, `attributes` and `fluentDesignLanguage`
 * exactly where the platform withholds them. When you add to it, stub the
 * refusals first — the argument the call requires, the field it omits, the
 * empty collection it hands back. If you cannot say what the real call
 * withholds, the stub is a guess and the assertions resting on it prove
 * nothing.
 *
 * ---
 *
 * **The assertions below the divider are a worked example. Replace them.**
 * Everything above the divider is plumbing that works for any field control;
 * the examples exercise the scaffolded control and are meant to be thrown away
 * with it.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Resolved from this file rather than from the working directory, so the script
// behaves the same run directly or through npm.
const root = path.join(__dirname, '..');
const dom = require('./dom.js');
const host = require('./host.js');
const clock = require('./clock.js');
const fixture = require('./fixture.js');

const BUNDLE = path.join(root, 'out', 'controls', 'NumberSlider', 'bundle.js');

if (!fs.existsSync(BUNDLE)) {
    console.error('\n  No bundle at out/controls/NumberSlider. Run npm run build first.\n');
    process.exit(1);
}

/* ----------------------------------------------------------- the platform */

dom.install(global);

/*
 * Time, replaced with something the test drives.
 *
 * `vm.runInThisContext` below evaluates the bundle in *this* realm, so the
 * `Date`, `setInterval` and `setTimeout` the control closes over are the ones
 * installed here. That is what makes a control with a clock testable without
 * an injectable clock parameter — which would be production code bent to suit
 * a harness, and the only reason that seam would exist.
 *
 * A control with no timers is unaffected by this: nothing schedules, nothing
 * fires, and `time.pending()` stays at zero. Keep it anyway — the teardown
 * assertion at the bottom of this file is written against it, and it is the
 * assertion worth keeping when the worked example goes.
 *
 * The start value is arbitrary and fixed. A suite that starts at "now" asserts
 * something slightly different every time it runs.
 */
const time = clock.install(Date.UTC(2026, 0, 1, 12, 0, 0), global);

const registration = host.captureRegistration(global);

const source = fs.readFileSync(BUNDLE, 'utf8');

/*
 * The platform libraries, supplied under the names the bundle actually asks
 * for — read out of the bundle rather than written down here.
 *
 * A `<platform-library>` entry becomes a webpack external, and the global it
 * compiles to carries a version in its name. **That version is not the one the
 * manifest declares.** `pcf-scripts` maps a declared version onto the platform
 * build it supports, so Fluent `9.46.2` arrives as `FluentUIReactv940` and
 * React `16.14.0` as `Reactv16`. Hardcoding either is a trap that springs on
 * the next version bump, with a `ReferenceError` naming a global that appears
 * nowhere in the repository.
 *
 * A standard control has no externals at all, in which case both lists are
 * empty and nothing below runs.
 */
const reactGlobals = [...new Set(source.match(/\bReactv[\w]*\b/g) || [])];
const fluentGlobals = [...new Set(source.match(/\bFluentUIReact[\w]*\b/g) || [])];

let React = null;

if (reactGlobals.length > 0) {
    React = require(path.join(root, 'node_modules', 'react'));
    reactGlobals.forEach((name) => {
        global[name] = React;
    });
}

/*
 * Fluent is stubbed rather than loaded, the way the grid rig stubs it: every
 * component resolves to its own name as an element type, so
 * `React.createElement(Input, …)` produces `{ type: 'Input', props }` and the
 * props the control passed survive for inspection. These assertions are about
 * the control's decisions, not about how Fluent renders them — and Fluent 9
 * ships no UMD build, so there is nothing to load in a browser either.
 */
/*
 * **A stand-in component per name, not the name as the element type.** React
 * lower-cases an unknown element, so `MenuItem` became `<menuitem>` — which
 * HTML treats as a void element, and `renderToStaticMarkup` throws rather
 * than give it children. Every capitalised export is therefore a function
 * component rendering a `<div data-fluent="Name">` with the string, number
 * and boolean props the control passed — className, aria-*, title, disabled
 * — so `renderDeep` can look for them; a lower-case export (`webLightTheme`,
 * `tokens`) is a plain object. Found by `pcf-calendar-view`, whose move menu
 * was the first `MenuItem` a suite tried to render.
 */
const standIns = new Map();

function fluentStandIn(name) {
    if (!standIns.has(name)) {
        const StandIn = (props) => {
            const passed = { 'data-fluent': name };

            Object.keys(props || {}).forEach((key) => {
                const value = props[key];

                if (key !== 'children' && ['string', 'number', 'boolean'].includes(typeof value)) {
                    passed[key] = value;
                }
            });

            return React.createElement('div', passed, props.children);
        };

        StandIn.displayName = name;
        standIns.set(name, StandIn);
    }

    return standIns.get(name);
}

const fluent = new Proxy({}, {
    get: (_target, name) => {
        if (typeof name !== 'string') {
            return undefined;
        }

        return /^[A-Z]/.test(name) ? fluentStandIn(name) : {};
    },
});

fluentGlobals.forEach((name) => {
    global[name] = fluent;
});

vm.runInThisContext(source, { filename: 'bundle.js' });

/* ---------------------------------------------------------------- harness */

const results = [];

function check(label, ok, detail) {
    results.push({ ok, label, detail });
}

// `getString` returns a marked key rather than a real string, so an assertion
// can tell "read from the .resx" apart from "hardcoded in the source" — which
// would otherwise look identical in the output.
const marked = (key) => `resx:${key}`;

/*
 * The bound column every mount starts from, before its own options: its type
 * and value, and the type group the manifest declares. Empty is the rig's
 * default text column. `setup.mjs --bind` rewrites this line, so a number or a
 * yes/no control is mounted on its own kind of column throughout — the
 * teardown checks below included — rather than handed "Contoso Ltd".
 *
 * `COLUMN.inputs` are merged under each mount's own, not replaced by them: a
 * host hands over every input the manifest declares, `raw: null` where the
 * maker set none, so give the control's defaults here and let a mount name
 * only the one it is about.
 */
const COLUMN = {
    valueType: 'Decimal',
    value: 1234.5,
    typeGroup: ['Decimal', 'Whole.None', 'FP', 'Currency'],
    // Every input the manifest declares, as a form hands over a maker's blank.
    inputs: { style: 'slider', min: null, max: null, step: null, valueBox: 'show', unit: null, bands: null },
};

/**
 * Mount a fresh control in a given state and hand back everything worth
 * asserting about it.
 *
 * A new instance per state on purpose: `init` runs once per control on a real
 * form, so a suite that reused one instance would be testing a sequence the
 * platform never produces. Where the *sequence* is the point — a value arriving
 * after an edit — drive `updateView` again through the returned handle.
 */
/**
 * Every control mounted and not yet destroyed.
 *
 * A suite that mounts and walks away is testing something other than what it
 * says: an abandoned control keeps its interval and its `document` listeners,
 * so the next section's counts include them and the next event dispatched at
 * `document` reaches all of them. That is the leak the teardown assertion
 * exists to catch, and asserting it from inside one proves nothing.
 */
const live = [];

function disposeAll() {
    while (live.length > 0) {
        live.pop().destroy();
    }
}

function mount(options) {
    const container = dom.createElement('div');
    /*
     * What is the *instance's* rather than the render's: the call log, the
     * organisation URL and the rows behind the Web API. `createContext` runs
     * per render, so these are decided once here and handed to every context
     * this mount builds — `update()` included, which used to drop `calls` and
     * so could not record what a re-render made the control do.
     */
    const site = { calls: [], clientUrl: options.clientUrl || host.nextClientUrl(), fixture: options.fixture || fixture };
    // `getString` first, so a single assertion can override it — the marked key
    // proves a string came from the .resx, but it cannot prove a `{0}` was
    // substituted, because a marked key has no `{0}` in it to substitute.
    const context = host.createContext({ getString: marked, ...COLUMN, ...options, ...site, inputs: { ...COLUMN.inputs, ...options.inputs } });
    const instance = new registration.ctor();

    let notifications = 0;

    /*
     * The third argument is the state a previous mount handed to
     * `mode.setControlState`, and it was hard-coded to `{}` here — which made
     * the *return* half of that API unreachable from a suite. Pass `state` in
     * `options` to mount a control the way the platform remounts one after a
     * form tab switch. `{}` remains the default, because that is a first mount.
     */
    instance.init(context, () => {
        notifications += 1;
    }, options.state || {}, container);

    // A standard control returns nothing and has written into `container`; a
    // virtual one returns the element it wants rendered and was handed no
    // container at all.
    const element = instance.updateView(context);

    const handle = {
        instance,
        container,
        element,
        props: () => (element && element.props) || {},
        outputs: () => instance.getOutputs(),
        notifications: () => notifications,
        /** Every platform call the control made, on any pass. */
        calls: () => site.calls,
        /** The organisation URL this instance's `page.getClientUrl()` answers. */
        clientUrl: site.clientUrl,
        /** Re-render in a new state, as the platform does on every change. */
        update: (next) => instance.updateView(host.createContext({
            getString: marked, ...COLUMN, ...options, ...site, ...next, inputs: { ...COLUMN.inputs, ...options.inputs, ...(next && next.inputs) },
        })),
        /** Unmount, as the platform does when the form closes or navigates. */
        destroy: () => {
            instance.destroy();

            const at = live.indexOf(handle);

            if (at !== -1) {
                live.splice(at, 1);
            }
        },
        find: (selector) => container.querySelector(selector),
    };

    live.push(handle);

    return handle;
}

check('bundle registered a control', typeof registration.ctor === 'function');

if (typeof registration.ctor !== 'function') {
    report();
}

/* ======================================================================== *
 *  NUMBER SLIDER 0.1.0
 *
 *  Two halves. The decisions — what a column is, the scale, snapping, parsing,
 *  bands, the echo guard — are loaded on their own through `dev/modules.js`
 *  and asked directly. The control is then driven through the built bundle on
 *  the rig's typed columns, model-driven and canvas, en-US and de-DE.
 *
 *  What a pass cannot prove: that a real form hands over these shapes (SPEC.md
 *  P1–P11 measured them), that the thumb looks like Fluent's (the harness and
 *  the screenshots), or that a phone drag moves the thumb and not the page
 *  (P9, Not verified).
 * ======================================================================== */

const { createLoader } = require('./modules');
const load = createLoader({ root: path.join(root, 'NumberSlider'), forbid: [[/^react/, 'stay free of React'], [/generated/, 'stay free of the manifest types']] });
const N = load('number');
const B = load('bands');
const { EchoGuard } = load('echo');

const EN = { numberDecimalSeparator: '.', numberGroupSeparator: ',', negativeSign: '-', currencySymbol: '$' };
const DE = { numberDecimalSeparator: ',', numberGroupSeparator: '.', negativeSign: '-', currencySymbol: '$' };
const NBSP = String.fromCharCode(0xa0);

/* ------------------------------------------------- number.ts: the column */

{
    const whole = N.readColumn({ Type: 'integer', Precision: 0, Format: '0', MinValue: 0, MaxValue: 500 }, 'Whole.None');
    const decimal = N.readColumn({ Type: 'decimal', Precision: 2, MinValue: 0, MaxValue: 100 }, 'Decimal');

    check('a column with Precision 0 is whole (P1: every number column carries Precision)', whole.kind === 'whole' && whole.precision === 0);
    check('Precision above 0 is fractional', decimal.kind === 'fractional' && decimal.precision === 2);
    check('a declared range is kept', decimal.declared && decimal.declared.min === 0 && decimal.declared.max === 100);
    check(
        "the platform's default range for each type is no range at all",
        [['integer', -2147483648, 2147483647], ['decimal', -100000000000, 100000000000], ['double', 0, 1000000000], ['money', -922337203685477, 922337203685477]]
            .every(([Type, MinValue, MaxValue]) => N.readColumn({ Type, Precision: 2, MinValue, MaxValue }, null).declared === null),
    );
    check('a money column is shown as currency', N.readColumn({ Type: 'money', Precision: 2 }, 'Currency').currency === true);
    check('canvas, no attributes: an exact Whole.None is still whole', N.readColumn(undefined, 'Whole.None').kind === 'whole');
    check('canvas: Decimal says nothing either way', N.readColumn(undefined, 'Decimal').kind === 'unknown');
    check(
        'a group string is not evidence of anything',
        N.readColumn(undefined, 'Whole.None,Decimal,FP,Currency').kind === 'unknown',
    );

    const merged = N.mergeColumns(
        N.readColumn({ Type: 'integer', Precision: 0, MinValue: 0, MaxValue: 500 }, null),
        N.readColumn({ Type: 'decimal', Precision: 2, MinValue: 100, MaxValue: 1000 }, null),
    );
    check('a range of two columns holds what both can', merged.kind === 'whole' && merged.precision === 0 && merged.declared.min === 100 && merged.declared.max === 500);
}

/* -------------------------------------------------- number.ts: the scale */

{
    const decimal = N.readColumn({ Type: 'decimal', Precision: 2, MinValue: 0, MaxValue: 100 }, null);
    const whole = N.readColumn({ Type: 'integer', Precision: 0, MinValue: 0, MaxValue: 500 }, null);
    const open = N.readColumn({ Type: 'decimal', Precision: 2, MinValue: -100000000000, MaxValue: 100000000000 }, null);
    const tenths = N.readColumn({ Type: 'decimal', Precision: 1, MinValue: 0, MaxValue: 10 }, null);

    const same = (scale, min, max, step) => scale.min === min && scale.max === max && scale.step === step;

    check('blank min and max: the column\'s own range', same(N.resolveScale(decimal, null, null, null), 0, 100, 1));
    check('no range declared: 0 to 100', same(N.resolveScale(open, null, null, null), 0, 100, 1));
    check('a maker range inside the column\'s is kept', same(N.resolveScale(decimal, 10, 50, 0.5), 10, 50, 0.5));
    check('a maker range wider than the column\'s is cut to it', same(N.resolveScale(decimal, -50, 1000, null), 0, 100, 1));
    check('a maker range with nothing between its ends falls back to the column\'s', same(N.resolveScale(decimal, 60, 40, null), 0, 100, 1));
    check('a whole column\'s step is whole', N.resolveScale(whole, null, null, 0.5).step === 1 && N.resolveScale(whole, null, null, 2.6).step === 3);
    check('a step finer than the column stores is raised to it', N.resolveScale(tenths, null, null, 0.01).step === 0.1);
    check('a step longer than the scale is cut to it', N.resolveScale(decimal, 0, 10, 50).step === 10);
    check('a zero or negative step is the default', N.resolveScale(decimal, null, null, 0).step === 1 && N.resolveScale(decimal, null, null, -2).step === 1);

    const halves = N.resolveScale(decimal, 0, 100, 0.5);
    check('snap: onto the step grid', N.snap(37.3, halves) === 37.5 && N.snap(37.2, halves) === 37);
    check('snap: inside the scale', N.snap(-5, halves) === 0 && N.snap(250, halves) === 100);
    check('snap: 0.1 + 0.2 does not leak through', N.snap(0.30000000000000004, N.resolveScale(decimal, 0, 1, 0.1)) === 0.3);
    check('snap: the grid starts at min, not at 0', N.snap(10, N.resolveScale(decimal, 3, 100, 5)) === 8);
    check('snap: a grid that misses max stops on its last step, as the native range does', N.snap(100, N.resolveScale(decimal, 0, 100, 7)) === 98);
    check('storable: rounded as the column keeps it (P3: 1.23456 came back 1.23)', N.storable(1.23456, decimal) === 1.23);
    check('percent: clamped to the rail', N.percent(150, halves) === 100 && N.percent(-1, halves) === 0 && N.percent(25, halves) === 25);
}

/* ------------------------------------------------- number.ts: the text */

{
    check('parse: en-US grouping', N.parseNumber('1,234.5', EN) === 1234.5);
    check('parse: de-DE grouping', N.parseNumber('1.234,5', DE) === 1234.5);
    check('parse: de-DE 1.5 is not fifteen and not one and a half', N.parseNumber('1.5', DE) === undefined);
    check('parse: an empty box is null, a clear', N.parseNumber('  ', EN) === null);
    check('parse: not a number is undefined', N.parseNumber('abc', EN) === undefined && N.parseNumber('1.2.3', EN) === undefined);
    check('parse: the currency symbol is dropped', N.parseNumber('$1,500.00', EN) === 1500);
    check('parse: bracketed is negative, as formatCurrency writes it', N.parseNumber('($1,234.50)', EN) === -1234.5);
    check('parse: the unit is dropped', N.parseNumber('45 km', EN, 'km') === 45 && N.parseNumber('72.5%', EN, '%') === 72.5);
    check('parse: a minus sign', N.parseNumber('-3', EN) === -3);
    check('plain: the user\'s decimal separator, no grouping', N.plain(1234.5, DE) === '1234,5');
    check('unit: none before %', N.withUnit('72.50', '%') === '72.50%');
    check('unit: a no-break space before a word', N.withUnit('45', 'km') === `45${NBSP}km`);
    check('unit: blank is nothing', N.withUnit('45', '  ') === '45' && N.withUnit('45', null) === '45');
    check('an input\'s number: the demo hands a default over as a string', N.toNumber('1000') === 1000 && N.toNumber(' ') === null && N.toNumber(null) === null && N.toNumber('x') === null && N.toNumber(7) === 7);
}

/* ------------------------------------------------------------- bands.ts */

{
    const accepts = (c) => /^#[0-9a-f]{3,8}$/i.test(c);
    const bands = B.parseBands('80 warning; 50 danger;100 success', accepts);

    check('bands: sorted, lowest first', bands.map((b) => b.upTo).join() === '50,80,100');
    check('bands: a role name is its Fluent token, with a fallback', bands[0].color.startsWith('var(--colorStatusDangerBackground3,'));
    check('bands: a colour the browser accepts is kept', B.parseBands('10 #ff0000', accepts)[0].color === '#ff0000');
    check('bands: anything else is dropped, url() included', B.parseBands('10 url(x); 20 nonsense; thirty red', accepts).length === 0);
    check('bands: a value up to a threshold takes its colour', B.bandFor(bands, 50) === bands[0].color && B.bandFor(bands, 50.01) === bands[1].color);
    check('bands: above the last threshold, the last colour', B.bandFor(bands, 500) === bands[2].color);
    check('bands: no value, no colour', B.bandFor(bands, null) === null && B.bandFor([], 5) === null);
}

/* -------------------------------------------------------------- echo.ts */

{
    const guard = new EchoGuard();

    guard.take(10, null);
    guard.wrote(30);
    guard.wrote(40);
    check('echo: an older write arriving late is not taken', guard.take(30, 40) === false);
    check('echo: nor the newest', guard.take(40, 40) === false);
    check('echo: a value nobody here wrote is the form\'s', guard.take(55, 40) === true);
    check('echo: the same value twice is not news (the demo re-renders its preset)', guard.take(55, 70) === false);
}

/* ------------------------------------------------------- the control */

// `CSS.supports` for the bands' custom colours: what a browser would accept.
global.CSS = { supports: (_property, value) => /^(#[0-9a-f]{3,8}|rgb\([\d\s,]+\))$/i.test(value) };

const fire = (target, type, extra) => target.dispatchEvent(Object.assign({ type, target, preventDefault() {} }, extra));
const q = (handle, selector) => handle.find(selector);
const box = (handle, which = 'lower') => q(handle, `.NumberSlider-input--${which}`);
const rangeOf = (handle, which = 'lower') => q(handle, `.NumberSlider-range--${which}`);
const has = (handle, name) => handle.container.classList.contains(name);

/** Drag a thumb to `value` and let go: `input` while it moves, `change` once. */
function drag(handle, value, which = 'lower') {
    const input = rangeOf(handle, which);

    input.value = String(value);
    fire(input, 'input');
    fire(input, 'change');
}

/** Type into a box and press Enter. */
function type(handle, text, which = 'lower') {
    const input = box(handle, which);

    input.focus();
    input.value = text;
    fire(input, 'keydown', { key: 'Enter' });
}

const SCORE = { column: 'cll_score', valueType: 'Decimal', value: 72.5, minValue: 0, maxValue: 100, precision: 2, label: 'Score' };
const SEATS = {
    column: 'cll_minseats', valueType: 'Whole.None', value: 10, minValue: 0, maxValue: 500, label: 'Seats',
    inputs: { style: 'range' },
    bound: { upperValue: { type: 'Whole.None', raw: 400, column: 'cll_maxseats', minValue: 0, maxValue: 500 } },
};

/* The slider */
{
    const score = mount({ ...SCORE, inputs: { step: 0.5 } });
    const thumb = rangeOf(score);

    check(
        'slider: the native range carries the column\'s scale and the value',
        thumb.min === '0' && thumb.max === '100' && thumb.step === '0.5' && thumb.value === '72.5',
        `${thumb.min}..${thumb.max} step ${thumb.step} = ${thumb.value}`,
    );
    check('slider: the box shows the platform\'s own formatted value at rest', box(score).value === '72.50', box(score).value);
    check('slider: the fill reaches the value', q(score, '.NumberSlider-fill').style.width === '72.5%', q(score, '.NumberSlider-fill').style.width);
    check('slider: aria-valuetext reads the value as shown', thumb.getAttribute('aria-valuetext') === '72.50' && thumb.getAttribute('aria-label') === 'Score');

    thumb.value = '80';
    fire(thumb, 'input');

    check('a drag (input) writes nothing', score.notifications() === 0);
    check('but the box and the fill follow it', box(score).value === '80.00' && q(score, '.NumberSlider-fill').style.width === '80%', box(score).value);

    fire(thumb, 'change');

    check('letting go (change) writes once', score.notifications() === 1 && score.outputs().value === 80, JSON.stringify(score.outputs()));

    drag(score, 81);
    drag(score, 81.5);
    check('each key press — input and change (P8) — writes once', score.notifications() === 3 && score.outputs().value === 81.5);

    score.update({ value: 81 });
    check('a late echo of an older write does not move the thumb back', score.outputs().value === 81.5 && thumb.value === '81.5' && box(score).value === '81.50', box(score).value);

    score.update({ value: 30 });
    check('a value nobody here wrote is the form\'s, and is taken', thumb.value === '30' && box(score).value === '30.00' && score.notifications() === 3);

    check(
        'the value is shown through context.formatting while it is not the platform\'s',
        score.calls().some((call) => call.startsWith('formatting.formatDecimal([80,2]')),
        score.calls().filter((c) => c.startsWith('formatting')).slice(0, 3).join(' '),
    );
}

{
    const preset = mount({ ...SCORE, value: 50 });

    drag(preset, 70);
    preset.update({ value: 50 });
    check('the demo re-rendering its preset value does not wipe what was chosen', preset.outputs().value === 70 && rangeOf(preset).value === '70');
}

{
    const seats = mount({ column: 'cll_minseats', valueType: 'Whole.None', value: 10, minValue: 0, maxValue: 500, inputs: { step: 0.5 } });

    check('a whole column\'s step is whole', rangeOf(seats).step === '1');
    drag(seats, 3.6);
    check('and what it writes is whole', seats.outputs().value === 4);
}

{
    const open = mount({ column: 'cll_open', valueType: 'Decimal', value: 12 });
    check('the platform\'s default range is ignored: 0 to 100', rangeOf(open).min === '0' && rangeOf(open).max === '100');

    const maker = mount({ ...SCORE, inputs: { min: 10, max: 50 } });
    check('a maker range inside the column\'s is the scale', rangeOf(maker).min === '10' && rangeOf(maker).max === '50');

    const wide = mount({ ...SCORE, inputs: { min: -10, max: 1000 } });
    check('one wider is cut to the column\'s', rangeOf(wide).min === '0' && rangeOf(wide).max === '100');

    const demo = mount({ column: 'revenue', valueType: 'Currency', value: 1500000, inputs: { min: '0', max: '1000000', step: '1000' } });
    check('inputs handed over as strings (PCFHub\'s demo) are numbers', rangeOf(demo).max === '1000000' && rangeOf(demo).step === '1000', rangeOf(demo).max);
}

/* Outside the range, empty, and the box */
{
    const outside = mount({ ...SCORE, value: 150, maxValue: 500, inputs: { max: 100 } });
    const note = q(outside, '.NumberSlider-note');

    check('a stored value outside the scale is said, neutrally', !note.hidden && note.textContent === marked('NumberSlider_Outside'), note.textContent);
    check('and shown as it is', box(outside).value === '150.00');
    check('and never rewritten', outside.notifications() === 0);

    const empty = mount({ ...SCORE, value: null });
    check('empty: the thumb waits at the minimum, muted', has(empty, 'NumberSlider--empty') && rangeOf(empty).value === '0');
    check('empty: the box is empty, and says so to a screen reader', box(empty).value === '' && rangeOf(empty).getAttribute('aria-valuetext') === marked('NumberSlider_Empty'));
    check('empty: nothing is written by showing it', empty.notifications() === 0);
}

{
    const typed = mount(SCORE);

    box(typed).focus();
    check('focus: the box holds the plain number to edit', box(typed).value === '72.5', box(typed).value);

    type(typed, '12.5');
    check('Enter writes a typed value', typed.outputs().value === 12.5 && typed.notifications() === 1);

    type(typed, '1.23456');
    check('rounded as the column keeps it before it is written', typed.outputs().value === 1.23);

    const message = q(typed, '.NumberSlider-message');

    type(typed, 'abc');
    check('not a number: refused, with the reason, and nothing written', message.textContent === marked('NumberSlider_NotANumber') && typed.notifications() === 2 && box(typed).value === 'abc');
    check('the box is marked invalid', box(typed).getAttribute('aria-invalid') === 'true' && has(typed, 'NumberSlider--invalid'));

    type(typed, '150');
    check('outside the range: refused at the box, not at Save (P3)', message.textContent === marked('NumberSlider_OutOfRange') && typed.notifications() === 2);

    fire(box(typed), 'keydown', { key: 'Escape' });
    check('Escape puts the column\'s value back and drops the refusal', box(typed).value === '1.23' && message.hidden && !has(typed, 'NumberSlider--invalid'));

    type(typed, '');
    check('an empty box clears the column: null, not "no change"', 'value' in typed.outputs() && typed.outputs().value === null && typed.notifications() === 3);

    box(typed).value = '40';
    box(typed).blur();
    check('leaving the box writes too', typed.outputs().value === 40 && typed.notifications() === 4);

    const whole = mount({ column: 'cll_minseats', valueType: 'Whole.None', value: 10, minValue: 0, maxValue: 500 });
    type(whole, '3.5');
    check('a fraction in a whole column is refused, not rounded', q(whole, '.NumberSlider-message').textContent === marked('NumberSlider_WholeOnly') && whole.notifications() === 0);

    const outsideText = mount({ ...SCORE, getString: (key) => (key === 'NumberSlider_OutOfRange' ? 'Enter a number from {0} to {1}.' : marked(key)) });
    type(outsideText, '500');
    check('the refusal names the range in the user\'s format', q(outsideText, '.NumberSlider-message').textContent === 'Enter a number from 0.00 to 100.00.', q(outsideText, '.NumberSlider-message').textContent);
}

{
    const german = mount({ ...SCORE, locale: 'de-DE' });

    box(german).focus();
    check('de-DE: the box edits with a comma', box(german).value === '72,5', box(german).value);
    type(german, '1.5');
    check('de-DE: 1.5 is refused rather than read as fifteen', german.notifications() === 0);
    type(german, '12,5');
    check('de-DE: 12,5 is twelve and a half', german.outputs().value === 12.5);
}

{
    const money = mount({ column: 'revenue', valueType: 'Currency', value: 250000, minValue: 0, maxValue: 1000000, precision: 2, inputs: { step: 1000 } });

    check('currency at rest: the platform\'s formatted, symbol and all', box(money).value.startsWith('$'), box(money).value);

    const thumb = rangeOf(money);
    thumb.value = '300000';
    fire(thumb, 'input');
    check('currency while dragging: formatCurrency, not formatDecimal', money.calls().some((c) => c.startsWith('formatting.formatCurrency([300000')) && box(money).value.startsWith('$'), box(money).value);

    // The rig formats `formatted` with the same formatter the control has, so
    // the two agree; a form's carries the record's own currency, which only
    // the platform knows. Hand over one only the platform could have made.
    const recordCurrency = host.createContext({
        getString: marked, ...COLUMN, column: 'revenue', valueType: 'Currency', value: 250000, minValue: 0, maxValue: 1000000, precision: 2,
        inputs: { ...COLUMN.inputs },
    });
    recordCurrency.parameters.value.formatted = '€250,000.00';
    const atRest = mount({ column: 'revenue', valueType: 'Currency', value: 250000, minValue: 0, maxValue: 1000000, precision: 2 });

    atRest.instance.updateView(recordCurrency);
    check('at rest the box shows the platform\'s formatted text, whatever currency it carries', box(atRest).value === '€250,000.00', box(atRest).value);

    const percent = mount({ ...SCORE, inputs: { unit: '%' } });
    check('a unit follows the value', box(percent).value === '72.50%', box(percent).value);
}

/* Read-only, access, errors */
{
    const disabled = mount({ ...SCORE, disabled: true });
    check('a read-only form disables the thumb and the box (P7)', rangeOf(disabled).disabled && box(disabled).disabled && has(disabled, 'NumberSlider--disabled'));

    const secured = mount({ ...SCORE, security: 'read-only' });
    check('so does a column the user may not edit', rangeOf(secured).disabled && box(secured).disabled);

    const denied = mount({ ...SCORE, security: 'no-access' });
    check(
        'no read access: the control is replaced by the reason, not by an empty slider',
        q(denied, '.NumberSlider-body').hidden && q(denied, '.NumberSlider-note').textContent === marked('NumberSlider_NoAccess'),
    );

    const modelDriven = mount({ ...SCORE, error: true });
    check(
        'a platform error on a form: marked, not printed — the form prints it under the field',
        has(modelDriven, 'NumberSlider--invalid') && q(modelDriven, '.NumberSlider-message').hidden,
    );

    const canvas = mount({ ...SCORE, host: 'canvas', error: true });
    check(
        'in a canvas app, which prints nothing: printed',
        !q(canvas, '.NumberSlider-message').hidden && q(canvas, '.NumberSlider-message').textContent === 'Enter a value with at least three characters.',
    );
}

/* Canvas */
{
    const canvas = mount({ column: 'Quantity', valueType: 'Whole.None', value: 3, host: 'canvas', inputs: { step: 0.5 } });
    check('canvas: no column, so the default scale', rangeOf(canvas).max === '100');
    check('canvas: an exact Whole.None still forbids a fraction', rangeOf(canvas).step === '1');

    const group = mount({ column: 'Quantity', valueType: 'Whole.None', value: 3, host: 'canvas', typeReport: 'group', inputs: { step: 0.5 } });
    check('canvas, a group string for a type: the maker\'s step stands', rangeOf(group).step === '0.5');

    /*
     * A canvas app hands the property an `attributes` that describes no
     * column, and for this control's number group it carries the Decimal
     * type's `Precision: 2`. Through 0.1.1 that was read as the column's
     * (a published canvas app, 2026-10-07): a step of 0.001 was drawn as
     * 0.01, and 0.12345 typed into the box was written as 0.12.
     */
    const fine = mount({ column: 'Rate', valueType: 'Decimal', value: 0.125, host: 'canvas', inputs: { min: 0, max: 1, step: 0.001 } });
    check('canvas: a step finer than two places stands', rangeOf(fine).step === '0.001', rangeOf(fine).step);
    check('canvas: and a value with three places is drawn where it is', rangeOf(fine).value === '0.125', rangeOf(fine).value);

    type(fine, '0.12345');
    check('canvas: a typed value is written as typed, not rounded to two places', fine.outputs().value === 0.12345, JSON.stringify(fine.outputs()));

    const onForm = mount({ column: 'cll_rate', valueType: 'Decimal', value: 0.125, precision: 2, minValue: 0, maxValue: 1, inputs: { step: 0.001 } });
    check('on a form a two-place column still floors the step at 0.01', rangeOf(onForm).step === '0.01', rangeOf(onForm).step);

    type(onForm, '0.12345');
    check('and still rounds what is typed to what the column keeps', onForm.outputs().value === 0.12, JSON.stringify(onForm.outputs()));
}

/* The range */
{
    const seats = mount(SEATS);
    const lower = rangeOf(seats);
    const upper = rangeOf(seats, 'upper');
    const fill = q(seats, '.NumberSlider-fill');

    check('range: two thumbs and two boxes', !upper.hidden && !q(seats, '.NumberSlider-field--upper').hidden && box(seats, 'upper').value === '400');
    check('range: the fill runs between the thumbs', fill.style.insetInlineStart === '2%' && fill.style.width === '78%', `${fill.style.insetInlineStart} + ${fill.style.width}`);
    check('range: each thumb is named for its end', lower.getAttribute('aria-label') === `Seats, ${marked('NumberSlider_From')}` && upper.getAttribute('aria-label') === `Seats, ${marked('NumberSlider_To')}`);

    lower.value = '450';
    fire(lower, 'input');
    check('range: a thumb dragged past the other stops at it', lower.value === '400');
    fire(lower, 'change');
    check('range: and writes where it stopped', seats.outputs().value === 400);

    const before = seats.notifications();

    drag(seats, 5, 'upper');
    check('range: the upper thumb cannot pass below the lower — it stops where it was, and writes nothing', upper.value === '400' && seats.notifications() === before);

    drag(seats, 20);
    drag(seats, 450, 'upper');
    check('range: both columns in one getOutputs (P5)', seats.outputs().value === 20 && seats.outputs().upperValue === 450, JSON.stringify(seats.outputs()));

    type(seats, '460');
    check('range: a typed lower above the upper is refused', q(seats, '.NumberSlider-message').textContent === marked('NumberSlider_Order') && seats.outputs().value === 20);

    seats.update({ bound: { upperValue: { type: 'Whole.None', raw: 300, column: 'cll_maxseats', minValue: 0, maxValue: 500 } } });
    check('range: the form\'s change to the upper column is taken', box(seats, 'upper').value === '300' && upper.value === '300');

    drag(seats, 320, 'upper');
    drag(seats, 340, 'upper');
    seats.update({ bound: { upperValue: { type: 'Whole.None', raw: 320, column: 'cll_maxseats', minValue: 0, maxValue: 500 } } });
    check('range: a late echo of an older upper write does not move that thumb back', seats.outputs().upperValue === 340 && upper.value === '340', upper.value);

    // A key press on a focused thumb can arrive as `change` alone; the order is kept there too.
    lower.value = '480';
    fire(lower, 'change');
    check('range: a change with no input before it still stops at the other thumb', seats.outputs().value === 340, JSON.stringify(seats.outputs()));

    const unmapped = mount({ ...SEATS, bound: { upperValue: 'unmapped' } });
    check('range with no second column: the reason, and nothing to drag', q(unmapped, '.NumberSlider-note').textContent === marked('NumberSlider_Unmapped') && rangeOf(unmapped).disabled);
    check('and an unmapped column is never handed back', !('upperValue' in unmapped.outputs()));

    const lockedUpper = mount({ ...SEATS, bound: { upperValue: { ...SEATS.bound.upperValue, security: 'read-only' } } });
    check('range: one column the user cannot edit locks both thumbs', rangeOf(lockedUpper).disabled && rangeOf(lockedUpper, 'upper').disabled);

    // PCFHub's demo switches presets on a mounted control (live demo, 3 Oct 2026).
    const switched = mount(SEATS);
    drag(switched, 450, 'upper');
    switched.update({ inputs: { style: 'stepper' } });
    fire(q(switched, '.NumberSlider-step--up'), 'click');
    check(
        'a style changed away from Range no longer hands the upper column back',
        switched.outputs().value === 11 && !('upperValue' in switched.outputs()),
        JSON.stringify(switched.outputs()),
    );

    const single = mount(SCORE);
    check('every other style: one thumb, one box', rangeOf(single, 'upper').hidden && q(single, '.NumberSlider-field--upper').hidden);
}

/* The stepper */
{
    const stepper = mount({ column: 'cll_minseats', valueType: 'Whole.None', value: 5, minValue: 0, maxValue: 10, label: 'Quantity', inputs: { style: 'stepper' } });
    const up = q(stepper, '.NumberSlider-step--up');
    const down = q(stepper, '.NumberSlider-step--down');

    fire(up, 'click');
    check('stepper: + writes one step up', stepper.outputs().value === 6 && stepper.notifications() === 1);
    fire(down, 'click');
    fire(down, 'click');
    check('stepper: − writes one step down, each press', stepper.outputs().value === 4 && stepper.notifications() === 3);
    check('stepper: the buttons are named for the field', up.getAttribute('aria-label') === marked('NumberSlider_Increase'));

    const input = box(stepper);
    check('stepper: the box is a spinbutton', input.getAttribute('role') === 'spinbutton' && input.getAttribute('aria-valuenow') === '4' && input.getAttribute('aria-valuemax') === '10');
    input.focus();
    fire(input, 'keydown', { key: 'ArrowUp' });
    check('stepper: ArrowUp in the box steps', stepper.outputs().value === 5 && input.value === '5');

    const atMin = mount({ column: 'cll_minseats', valueType: 'Whole.None', value: 0, minValue: 0, maxValue: 10, inputs: { style: 'stepper' } });
    check('stepper: − is off at the minimum', q(atMin, '.NumberSlider-step--down').disabled && !q(atMin, '.NumberSlider-step--up').disabled);

    const fromEmpty = mount({ column: 'cll_minseats', valueType: 'Whole.None', value: null, minValue: 0, maxValue: 10, inputs: { style: 'stepper' } });
    fire(q(fromEmpty, '.NumberSlider-step--up'), 'click');
    check('stepper: an empty column starts at the minimum', fromEmpty.outputs().value === 0);

    check('a slider has no role on its box', box(mount(SCORE)).getAttribute('role') === null);
}

/* The gauges */
{
    const bar = mount({ ...SCORE, inputs: { style: 'bar', bands: '50 danger; 80 warning; 100 success' } });
    const meter = q(bar, '.NumberSlider-meter');

    check('bar: a meter, with its value and range', meter.getAttribute('role') === 'meter' && meter.getAttribute('aria-valuenow') === '72.5' && meter.getAttribute('aria-valuemax') === '100');
    check('bar: the fill and the value text', q(bar, '.NumberSlider-meter-fill').style.width === '72.5%' && q(bar, '.NumberSlider-meter-text').textContent === '72.50');
    check('bar: the band colour for the value', bar.container.style.getPropertyValue('--NumberSlider-band').startsWith('var(--colorStatusWarningBackground3'));
    check('bar: nothing to drag or type', rangeOf(bar).disabled && box(bar).disabled && bar.notifications() === 0);
    check('bar: a gauge is not a disabled control, so it is not drawn as one', !has(bar, 'NumberSlider--disabled'));

    const arc = mount({ ...SCORE, inputs: { style: 'arc' } });
    check('arc: the value is the dash length', q(arc, '.NumberSlider-arc-value').getAttribute('stroke-dasharray') === '72.5 100');

    const zero = mount({ ...SCORE, value: 0, inputs: { style: 'arc' } });
    check('arc: at zero no dot is drawn', q(zero, '.NumberSlider-arc-value').getAttribute('visibility') === 'hidden');

    const over = mount({ ...SCORE, value: 150, maxValue: 500, inputs: { style: 'bar', max: 100 } });
    check('a gauge over its maximum is full, and says nothing', q(over, '.NumberSlider-meter-fill').style.width === '100%' && q(over, '.NumberSlider-note').hidden);

    const emptyBar = mount({ ...SCORE, value: null, inputs: { style: 'bar' } });
    check('an empty gauge reads as empty', q(emptyBar, '.NumberSlider-meter-text').textContent === '—' && q(emptyBar, '.NumberSlider-meter').getAttribute('aria-valuetext') === marked('NumberSlider_Empty'));
}

/* Bands, the box switch, theme, direction, visibility */
{
    const banded = mount({ ...SCORE, value: 30, inputs: { bands: '50 #ff0000; 100 url(x)' } });
    check('a custom colour is used', banded.container.style.getPropertyValue('--NumberSlider-band') === '#ff0000');
    banded.update({ value: 90 });
    check('a band the browser would not accept is dropped: the last good one carries on', banded.container.style.getPropertyValue('--NumberSlider-band') === '#ff0000');

    const plainSlider = mount(SCORE);
    check('no bands: no colour is set, so the accent and its hover apply', plainSlider.container.style.getPropertyValue('--NumberSlider-band') === '');

    const ranged = mount({ ...SEATS, inputs: { style: 'range', bands: '50 danger' } });
    check('a range is not coloured by a band', ranged.container.style.getPropertyValue('--NumberSlider-band') === '');

    check('valueBox hide', has(mount({ ...SCORE, inputs: { valueBox: 'hide' } }), 'NumberSlider--no-box'));
    check('valueBox blank is show', !has(mount({ ...SCORE, inputs: { valueBox: null } }), 'NumberSlider--no-box'));
    check('style blank is slider', has(mount({ ...SCORE, inputs: { style: null } }), 'NumberSlider--slider'));
    check('dark theme', has(mount({ ...SCORE, dark: true }), 'NumberSlider--dark'));
    check('right to left', mount({ ...SCORE, rtl: true }).container.dir === 'rtl');
    check('not visible', has(mount({ ...SCORE, visible: false }), 'NumberSlider--hidden'));
}

disposeAll();

/* ---------------------------------------------------- what destroy owes */

/*
 * **Keep this when the worked example above goes.** It is written against no
 * particular control and needs no knowledge of what yours takes.
 *
 * `destroy` is the lifecycle method with nothing visible riding on it, so it is
 * the one that quietly does nothing. A control that takes an interval, a
 * `requestAnimationFrame` loop, or a listener on `document` or `window` owes
 * each of them back — and none of the three shows up on a form. The interval
 * keeps firing against a container the platform has already thrown away; the
 * document listener keeps the whole control reachable, so nothing about it is
 * ever collected. On a form somebody leaves open all afternoon, or a subgrid
 * that re-renders its rows, they accumulate.
 *
 * Counting before and after is the whole trick. The scaffolded control takes
 * neither, so both numbers are zero and this passes trivially — which is the
 * point: it starts passing for a real reason the moment somebody adds a timer,
 * and fails the moment they forget the other half.
 */
disposeAll();

const timersBefore = time.pending();
const listenersBefore = Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0);

const disposable = mount({});

disposable.destroy();

check(
    'destroy() releases every timer the control took',
    time.pending() === timersBefore,
    `${timersBefore} → ${time.pending()}`,
);

check(
    'and every document-level listener',
    Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0) === listenersBefore,
    `${listenersBefore} → ${Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0)}`,
);

/*
 * The other half, and the leak this shape is famous for. `updateView` runs on
 * every change to any bound value, so a `setInterval` reached from the render
 * path adds a timer per render rather than replacing one.
 */
const rerendered = mount({});
const afterFirst = time.pending();

rerendered.update({});
rerendered.update({});
rerendered.update({});

check(
    'and re-rendering does not add another one',
    time.pending() === afterFirst,
    `${afterFirst} → ${time.pending()}`,
);

disposeAll();

/* ======================================================================== *
 *  THE RIG'S OWN CLAIMS — keep these. They are about `dev/host.js`, not about
 *  the control, and they exist because a rig that silently answers the wrong
 *  host's question certifies whatever it is handed. Each one was a real bug in
 *  a sibling repository's rig before it was an assertion here.
 * ======================================================================== */

/*
 * The table-definition reads, in the shapes a form gave them
 * (pcf-code-editor SPEC.md, the 1.4.9 probe, 2026-10-01). A control that
 * completes or validates names leans on each of these; the rig is proven
 * here before any control relies on it.
 */
async function metadataSelfCheck() {
    const ctx = host.createContext({ fixture, clientUrl: host.nextClientUrl() });
    const api = `${ctx.page.getClientUrl()}/api/data/v9.2/`;
    const get = async (path, context = ctx) => {
        const r = await fetch(`${context.page.getClientUrl()}/api/data/v9.2/${path}`);
        return { status: r.status, body: await r.json() };
    };

    const list = await get("EntityDefinitions?$select=LogicalName,DisplayName,PrimaryIdAttribute,IsIntersect&$filter=IsPrivate eq false&LabelLanguages=1033");
    const names = list.body.value.map((t) => t.LogicalName);
    check(
        'rig: the table list is every non-private table, sorted, with only what $select named beside MetadataId',
        list.status === 200 && names.join(',') === 'account,cll_account_tag,cll_tag,contact'
            && list.body.value.every((t) => typeof t.MetadataId === 'string' && t.EntitySetName === undefined),
        names.join(','),
    );
    const account = list.body.value.find((t) => t.LogicalName === 'account');
    const intersect = list.body.value.find((t) => t.LogicalName === 'cll_account_tag');
    check(
        "rig: LabelLanguages narrows a Label to that language; a table with no label has UserLocalizedLabel null (1.4.9 P5)",
        account.DisplayName.UserLocalizedLabel.Label === 'Account' && account.DisplayName.LocalizedLabels.length === 1
            && intersect.DisplayName.UserLocalizedLabel === null && intersect.IsIntersect === true,
    );
    const everyLanguage = await get('EntityDefinitions?$select=LogicalName,DisplayName&$filter=IsPrivate eq false');
    check('rig: …and without it every language comes back', everyLanguage.body.value.find((t) => t.LogicalName === 'account').DisplayName.LocalizedLabels.length === 2);
    const spanish = host.createContext({ fixture, clientUrl: host.nextClientUrl(), languageId: 3082 });
    const inSpanish = await get('EntityDefinitions?$select=LogicalName,DisplayName&$filter=IsPrivate eq false', spanish);
    check(
        "rig: UserLocalizedLabel is the user's language (languageId), and missing where the table has no label in it",
        spanish.userSettings.languageId === 3082
            && inSpanish.body.value.find((t) => t.LogicalName === 'account').DisplayName.UserLocalizedLabel.Label === 'Cuenta'
            && inSpanish.body.value.find((t) => t.LogicalName === 'contact').DisplayName.UserLocalizedLabel === null,
    );
    const advanced = await get('EntityDefinitions?$select=LogicalName&$filter=IsValidForAdvancedFind eq true');
    check('rig: the Advanced Find list leaves the intersect table out (1.4.9 P1: 0 of 689)', !advanced.body.value.some((t) => t.LogicalName === 'cll_account_tag'), advanced.body.value.map((t) => t.LogicalName).join(','));

    const columns = await get("EntityDefinitions(LogicalName='account')/Attributes?$select=LogicalName,AttributeType,AttributeTypeName,DisplayName,IsValidForRead,AttributeOf,IsLogical&LabelLanguages=1033");
    const column = (name) => columns.body.value.find((c) => c.LogicalName === name);
    check(
        'rig: a shadow column has AttributeOf, IsLogical and no label; one not valid for read says so; a multi-select is Virtual underneath (1.4.9 P2)',
        column('primarycontactidname').AttributeOf === 'primarycontactid' && column('primarycontactidname').IsLogical === true
            && column('primarycontactidname').DisplayName.UserLocalizedLabel === null
            && column('isprivate').IsValidForRead === false
            && column('cll_classification').AttributeType === 'Virtual' && column('cll_classification').AttributeTypeName.Value === 'MultiSelectPicklistType'
            && column('name').IsValidForUpdate === undefined,
    );

    const relationships = await get("EntityDefinitions(LogicalName='account')?$select=LogicalName,PrimaryIdAttribute&$expand=ManyToOneRelationships($select=SchemaName,ReferencedEntity,ReferencedAttribute,ReferencingAttribute),OneToManyRelationships($select=SchemaName,ReferencingEntity,ReferencingAttribute),ManyToManyRelationships($select=SchemaName,Entity1LogicalName,Entity2LogicalName,IntersectEntityName,Entity1IntersectAttribute,Entity2IntersectAttribute)");
    const m2o = relationships.body.ManyToOneRelationships.find((r) => r.ReferencingAttribute === 'primarycontactid');
    check(
        'rig: the three relationship kinds answer in one $expand, each narrowed by its own $select (1.4.9 P3)',
        relationships.status === 200 && relationships.body.PrimaryIdAttribute === 'accountid' && relationships.body.EntitySetName === undefined && m2o.ReferencedEntity === 'contact' && m2o.ReferencedAttribute === 'contactid' && m2o.ReferencingEntityNavigationPropertyName === undefined
            && relationships.body.OneToManyRelationships.some((r) => r.ReferencingAttribute === 'parentaccountid')
            && relationships.body.ManyToManyRelationships[0].IntersectEntityName === 'cll_account_tag',
    );
    const m2m = await get("EntityDefinitions(LogicalName='cll_tag')/ManyToManyRelationships");
    check('rig: …and many-to-many alone lists the relationship from either side', m2m.status === 200 && m2m.body.value[0].Entity1LogicalName === 'account');

    const cast = (columnName, type, inner = '$select=Options') => get(`EntityDefinitions(LogicalName='account')/Attributes(LogicalName='${columnName}')/Microsoft.Dynamics.CRM.${type}AttributeMetadata?$select=LogicalName&$expand=OptionSet(${inner}),GlobalOptionSet(${inner})&LabelLanguages=1033`);
    const industry = await cast('industrycode', 'Picklist');
    const state = await cast('statecode', 'State');
    const status = await cast('statuscode', 'Status');
    const yesNo = await cast('donotemail', 'Boolean', '$select=TrueOption,FalseOption');
    const multi = await cast('cll_classification', 'MultiSelectPicklist');
    check(
        "rig: a choice's options come through its cast, in the measured keys; State and Status options carry more (1.4.9 P4)",
        industry.body.OptionSet.Options.length === 3 && industry.body.GlobalOptionSet === null
            && Object.keys(industry.body.OptionSet.Options[0]).sort().join() === 'Color,Description,ExternalValue,HasChanged,IsHidden,IsManaged,Label,MetadataId,ParentValues,Tag,Value'
            && industry.body.OptionSet.Options[0].Label.UserLocalizedLabel.Label === 'Accounting'
            && state.body.OptionSet.Options[0].DefaultStatus === 1 && status.body.OptionSet.Options[1].State === 1
            && yesNo.body.OptionSet.TrueOption.Value === 1 && yesNo.body.OptionSet.FalseOption.Label.UserLocalizedLabel.Label === 'Allow'
            && multi.body.OptionSet.Options.length === 3,
    );
    const wrongCast = await cast('statecode', 'Picklist');
    check("rig: a cast that is not the column's kind is refused (unmeasured on a form)", wrongCast.status === 404);

    const refused = host.createContext({ fixture, clientUrl: host.nextClientUrl(), metadataStatus: 403 });
    const offline = host.createContext({ fixture, clientUrl: host.nextClientUrl(), metadataStatus: 0 });
    const refusal = await get('EntityDefinitions?$select=LogicalName&$filter=IsPrivate eq false', refused);
    let fault = null;
    await fetch(`${offline.page.getClientUrl()}/api/data/v9.2/EntityDefinitions(LogicalName='account')/Attributes?$select=LogicalName`).catch((e) => { fault = e; });
    check('rig: metadataStatus 403 refuses with an error body, 0 rejects with a TypeError', refusal.status === 403 && refusal.body.error && fault instanceof TypeError);
    check('rig: a canvas host has no context.page, so nothing can address the table definitions', host.createContext({ fixture, host: 'canvas' }).page === undefined && api.startsWith('https://'));
}

/*
 * A File or Image column through the Web API — `GET …/$value`, `PATCH`,
 * `DELETE` — the route Learn documents for a column no manifest can bind.
 * Measured on a form by pcf-file-preview's probe (2026-10-02); `fileAnswer`
 * in `dev/host.js` says which parts are still Learn's.
 */
const dispositionName = (header) => {
    const word = /filename="=\?utf-8\?B\?([^?]*)\?="/i.exec(header || '');

    return word ? Buffer.from(word[1], 'base64').toString('utf8') : (/filename=([^;]+)/.exec(header || '') || [])[1];
};

async function fileColumnSelfCheck() {
    const ctx = host.createContext({ fixture, clientUrl: host.nextClientUrl() });
    const base = `${ctx.page.getClientUrl()}/api/data/v9.2/`;
    const call = (path, init, context = ctx) => fetch(`${context.page.getClientUrl()}/api/data/v9.2/${path}`, init);

    const pdf = await call('accounts(c1)/cll_filenative/$value');
    const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
    const pdfBlob = await (await call('accounts(c1)/cll_filenative/$value')).blob();
    check(
        'rig: a File column downloads its bytes with x-ms-file-size, mimetype and its name — and an untyped blob, which a control types from mimetype',
        pdf.status === 200 && pdf.headers.get('mimetype') === 'application/pdf'
            && Number(pdf.headers.get('x-ms-file-size')) === pdfBytes.byteLength && String.fromCharCode(...pdfBytes.slice(0, 5)) === '%PDF-'
            && pdfBlob.type === 'application/octet-stream' && pdfBlob.size === pdfBytes.byteLength,
        `${pdf.status} ${pdf.headers.get('mimetype')} ${pdfBlob.type}`,
    );
    check(
        'rig: a name outside ASCII is mangled in x-ms-file-name and right in Content-Disposition, as measured; an ASCII one is bare in both',
        dispositionName(pdf.headers.get('content-disposition')) === 'Contoso DE — Rahmenvertrag 2026.pdf'
            // "—" as the probe saw it: Ã¢â¬â plus three invisible C1 controls.
            && pdf.headers.get('x-ms-file-name') === 'Contoso DE Ã¢â\u0082¬â\u0080\u009d Rahmenvertrag 2026.pdf',
        `${pdf.headers.get('x-ms-file-name')} | ${pdf.headers.get('content-disposition')}`,
    );

    const empty = await call('accounts(k1)/cll_filenative/$value');
    const emptyImage = await call('accounts(k1)/cll_photo/$value');
    const emptyFull = await call('accounts(k1)/cll_photo/$value?size=full');
    const nobody = await call('accounts(nosuch)/cll_filenative/$value');
    const notFile = await call('accounts(c1)/name/$value').then(() => 'answered', (e) => e.message);
    check(
        "rig: an empty File column is 404 0x80040217 and an empty Image column 204 to both requests (measured), a record that is not there 404, and a column that is not a file the stub's refusal",
        empty.status === 404 && (await empty.json()).error.code === '0x80040217' && emptyImage.status === 204 && emptyFull.status === 204
            && nobody.status === 404 && /No fetch for/.test(notFile),
        `${empty.status} ${emptyImage.status} ${emptyFull.status} ${nobody.status} ${notFile}`,
    );

    const thumb = await call('accounts(c1)/cll_photo/$value');
    const full = await call('accounts(c1)/cll_photo/$value?size=full');
    const noFull = await call('accounts(c1)/entityimage/$value?size=full');
    check(
        'rig: an Image column answers its thumbnail by default and the full copy with ?size=full — 204 where it keeps none',
        thumb.status === 200 && full.status === 200 && (await thumb.arrayBuffer()).byteLength < (await full.arrayBuffer()).byteLength
            && noFull.status === 204,
        `${thumb.status} ${full.status} ${noFull.status}`,
    );

    const limits = await (await call("EntityDefinitions(LogicalName='account')/Attributes(LogicalName='cll_photo')/Microsoft.Dynamics.CRM.ImageAttributeMetadata?$select=MaxSizeInKB,CanStoreFullImage")).json();
    const fileLimit = await (await call("EntityDefinitions(LogicalName='account')/Attributes(LogicalName='cll_filenative')/Microsoft.Dynamics.CRM.FileAttributeMetadata?$select=MaxSizeInKB")).json();
    const org = await ctx.webAPI.retrieveMultipleRecords('organization', '?$select=blockedattachments');
    const fetchedOrg = await (await call('organizations?$select=blockedattachments')).json();
    check(
        "rig: MaxSizeInKB and CanStoreFullImage come through the column's cast, and blockedattachments off the organisation row — queried or fetched",
        limits.MaxSizeInKB === 10240 && limits.CanStoreFullImage === true && fileLimit.MaxSizeInKB === 32768 && fileLimit.CanStoreFullImage === undefined
            && /(^|;)exe(;|$)/.test(org.entities[0].blockedattachments) && fetchedOrg.value[0].blockedattachments === org.entities[0].blockedattachments,
        JSON.stringify([limits, fileLimit]),
    );

    // The round trip, and the name in the query when it is not ASCII.
    const upload = new Blob(['Neue Fassung'], { type: 'text/plain' });
    const put = await call('accounts(k1)/cll_filenative', { method: 'PATCH', headers: { 'Content-Type': 'application/octet-stream', 'x-ms-file-name': 'v2.txt' }, body: upload });
    const after = await call('accounts(k1)/cll_filenative/$value');
    const nonAscii = await call(`accounts(k2)/cll_filenative?x-ms-file-name=${encodeURIComponent('Übersicht.txt')}`, { method: 'PATCH', body: 'ü' });
    const named = await call('accounts(k2)/cll_filenative/$value');
    const inHeader = await call('accounts(k2)/cll_filenative', { method: 'PATCH', headers: { 'x-ms-file-name': 'Отчёт.txt' }, body: 'x' }).then(() => 'sent', (e) => e);
    check(
        'rig: a PATCH answers 204 and the next GET has the new bytes and name; a non-ASCII name goes in the query, because a header holding one never leaves the browser',
        put.status === 204 && after.status === 200 && (await after.text()) === 'Neue Fassung' && after.headers.get('x-ms-file-name') === 'v2.txt'
            && after.headers.get('content-disposition') === 'inline; filename=v2.txt'
            && after.headers.get('mimetype') === 'text/plain' && nonAscii.status === 204
            && dispositionName(named.headers.get('content-disposition')) === 'Übersicht.txt' && inHeader instanceof TypeError,
        `${put.status} ${after.status} ${nonAscii.status} ${inHeader}`,
    );

    const big = await call('accounts(k1)/cll_photo', { method: 'PATCH', headers: { 'x-ms-file-name': 'huge.png' }, body: new Uint8Array(10240 * 1024 + 1) });
    const blocked = await call('accounts(k1)/cll_filenative', { method: 'PATCH', headers: { 'x-ms-file-name': 'setup.EXE' }, body: 'MZ' });
    const unnamed = await call('accounts(k1)/cll_filenative', { method: 'PATCH', body: 'x' });
    const notImage = await call('accounts(k1)/cll_photo', { method: 'PATCH', headers: { 'x-ms-file-name': 'notes.txt' }, body: 'text' });
    const denied = host.createContext({ fixture, clientUrl: host.nextClientUrl(), fileWrite: false });
    const deniedPut = await call('accounts(k1)/cll_filenative', { method: 'PATCH', headers: { 'x-ms-file-name': 'a.txt' }, body: 'x' }, denied);
    const deniedRead = await call('accounts(c1)/cll_filenative/$value', undefined, denied);
    check(
        "rig: a PATCH over MaxSizeInKB is 0x80044a02, a blocked extension is refused whatever its case, a nameless one 400, a non-image into an Image column 400, and without Write it is 403 while the read still answers",
        big.status === 400 && (await big.json()).error.code === '0x80044a02' && blocked.status === 400 && unnamed.status === 400 && notImage.status === 400
            && deniedPut.status === 403 && deniedRead.status === 200,
        [big.status, blocked.status, unnamed.status, deniedPut.status, deniedRead.status].join(' '),
    );

    const removed = await call('accounts(c1)/cll_filenative', { method: 'DELETE' });
    const gone = await call('accounts(c1)/cll_filenative/$value');
    const again = await call('accounts(c1)/cll_filenative', { method: 'DELETE' });
    const elsewhere = host.createContext({ fixture, clientUrl: host.nextClientUrl() });
    const untouched = await call('accounts(c1)/cll_filenative/$value', undefined, elsewhere);
    check(
        "rig: a DELETE answers 204 and empties the column; a second one finds nothing; another host's copy still has the file",
        removed.status === 204 && gone.status === 404 && again.status === 404 && untouched.status === 200 && fixture.files['account|c1|cll_filenative'] !== undefined,
        [removed.status, gone.status, again.status, untouched.status].join(' '),
    );

    const offline = host.createContext({ fixture, clientUrl: host.nextClientUrl(), filesStatus: 0 });
    const refusing = host.createContext({ fixture, clientUrl: host.nextClientUrl(), filesStatus: 503 });
    let fault = null;
    await call('accounts(c1)/cll_filenative/$value', undefined, offline).catch((e) => { fault = e; });
    const unavailable = await call('accounts(c1)/cll_filenative/$value', undefined, refusing);
    const calls = [];
    const logged = host.createContext({ fixture, clientUrl: host.nextClientUrl(), calls });
    await call('accounts(c1)/cll_filenative/$value', undefined, logged);
    await call('accounts(k1)/cll_filenative', { method: 'DELETE' }, logged);
    const opened = [];
    const opener = host.createContext({ fixture, clientUrl: host.nextClientUrl(), calls: opened });
    await opener.navigation.openFile({ fileName: 'a.pdf', fileSize: 1, mimeType: 'application/pdf', fileContent: 'JVBERg==' }, { openMode: 2 });
    let canvasThrew = false;
    try {
        host.createContext({ fixture, host: 'canvas' }).navigation.openFile({ fileName: 'a.pdf' }, { openMode: 2 });
    } catch (e) {
        canvasThrew = true;
    }
    check(
        'rig: navigation.openFile logs what describes the file, not its content; canvas publishes it and throws; openFile: false leaves it out',
        opened.join() === 'navigation.openFile({"fileName":"a.pdf","fileSize":1,"mimeType":"application/pdf","openMode":2})'
            && canvasThrew && host.createContext({ fixture, openFile: false }).navigation.openFile === undefined,
        opened.join(),
    );

    check(
        'rig: filesStatus 0 rejects with a TypeError, another number refuses; the log carries the verb of anything but a GET',
        fault instanceof TypeError && unavailable.status === 503 && base.startsWith('https://')
            && calls.join() === 'fetch("/api/data/v9.2/accounts(c1)/cll_filenative/$value"),fetch("DELETE /api/data/v9.2/accounts(k1)/cll_filenative")',
        calls.join(),
    );
}

async function rigSelfCheck() {
    const relationships = (url) => `${url}/api/data/v9.2/EntityDefinitions(LogicalName='account')/OneToManyRelationships`;

    /*
     * Two hosts, two answers. The fetch stub is one global routed by origin,
     * and before it was, the stub belonged to whichever host a suite created
     * last — so a second mount's refusal became every mount's refusal.
     */
    const open = mount({});
    const refused = mount({ relationshipsStatus: 403 });
    const [a, b] = await Promise.all([fetch(relationships(open.clientUrl)), fetch(relationships(refused.clientUrl))]);

    check('rig: each host answers its own metadata fetch', a.status === 200 && b.status === 403, `${a.status} / ${b.status}`);
    check(
        "rig: a fresh host does not inherit an earlier host's answers",
        (await a.json()).value.some((row) => row.ReferencingAttribute === 'parentaccountid' && row.IsHierarchical === true),
    );

    let foreign = 'resolved';
    await fetch('https://nowhere.invalid/api/data/v9.2/x').catch((error) => { foreign = error.constructor.name; });
    // Whatever `fetch` was there before answers — Node's own, here, which cannot
    // resolve the name — and the claim is only that the rig did not answer it.
    check("rig: a URL on no host's origin is refused, not answered", foreign !== 'resolved', foreign);

    const ctx = host.createContext({ fixture, clientUrl: host.nextClientUrl() });
    const xml = "<fetch><entity name='account'><attribute name='accountid'/><attribute name='name'/><attribute name='accountid' rowaggregate='CountChildren' alias='children'/><filter><condition attribute='accountid' operator='eq-or-above' value='c1'/></filter></entity></fetch>";
    const chain = await ctx.webAPI.retrieveMultipleRecords('account', `?fetchXml=${encodeURIComponent(xml)}`);

    check(
        'rig: eq-or-above answers the record and every ancestor, with child counts',
        chain.entities.map((row) => `${row.accountid}:${row.children}`).sort().join(',') === 'c1:2,p1:2,r1:2',
        JSON.stringify(chain.entities.map((row) => [row.accountid, row.children])),
    );

    let fault = null;
    await host.createContext({ fixture, clientUrl: host.nextClientUrl(), hierarchical: false })
        .webAPI.retrieveMultipleRecords('account', `?fetchXml=${encodeURIComponent(xml)}`)
        .catch((error) => { fault = error; });
    check(
        'rig: a hierarchical operator on a table that is not hierarchical is refused as a plain object',
        fault !== null && !(fault instanceof Error) && typeof fault.errorCode === 'number' && typeof fault.message === 'string',
        fault && fault.constructor.name,
    );

    const page = await ctx.webAPI.retrieveMultipleRecords('account', "?$select=accountid,name&$filter=_parentaccountid_value eq c1&$orderby=name asc", 1);
    check('rig: maxPageSize truncates and says there is more', page.entities.length === 1 && typeof page.nextLink === 'string', JSON.stringify(page));

    /*
     * The audit half: rows through `webAPI`, values through the two functions
     * on the fetch stub. The `nextLink` has to carry the query, because a
     * control hands it straight back — before it did, page two of a filtered
     * list answered an unfiltered one.
     */
    const auditQuery = '?$select=auditid,createdon,action,_objectid_value,_userid_value&$filter=_objectid_value eq c1&$orderby=createdon desc';
    const first = await ctx.webAPI.retrieveMultipleRecords('audit', auditQuery, 10);
    check(
        'rig: the audit table ignores maxPageSize — every row, newest first, nextLink an empty string (measured)',
        first.entities.length === 26 && first.nextLink === '' && first.entities[0].createdon > first.entities[25].createdon
            && first.entities.every((row) => row._objectid_value === 'c1'),
        `${first.entities.length} ${JSON.stringify(first.nextLink)}`,
    );
    const paged = await ctx.webAPI.retrieveMultipleRecords('account', '?$select=accountid,name&$filter=_parentaccountid_value eq r1&$orderby=name asc', 1);
    const next = await ctx.webAPI.retrieveMultipleRecords('account', paged.nextLink, 1);
    check(
        'rig: any other table pages by a nextLink that carries the filter and the order',
        paged.entities.length === 1 && next.entities.length === 1 && paged.entities[0].accountid === 'o1' && next.entities[0].accountid === 'p1',
        JSON.stringify([paged.entities, next.entities]),
    );

    const api = `${ctx.page.getClientUrl()}/api/data/v9.2`;
    const detail = await fetch(`${api}/audits(${first.entities[1].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`, { headers: { Prefer: 'odata.include-annotations="*"' } }).then((r) => r.json());
    const plain = await fetch(`${api}/audits(${first.entities[1].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`).then((r) => r.json());
    check(
        'rig: RetrieveAuditDetails answers by audit id with the AuditRecord — who, when, action — annotated only under Prefer',
        detail.AuditDetail['@odata.type'] === '#Microsoft.Dynamics.CRM.AttributeAuditDetail'
            && detail.AuditDetail.NewValue['_parentaccountid_value@Microsoft.Dynamics.CRM.lookuplogicalname'] === 'account'
            && detail.AuditDetail.AuditRecord.auditid === first.entities[1].auditid
            && detail.AuditDetail.AuditRecord['_userid_value@OData.Community.Display.V1.FormattedValue'] === 'Priya Raman'
            && plain.AuditDetail.AuditRecord.auditid === first.entities[1].auditid
            && plain.AuditDetail.AuditRecord['_userid_value@OData.Community.Display.V1.FormattedValue'] === undefined,
        JSON.stringify(Object.keys(detail.AuditDetail)),
    );
    const unknown = await fetch(`${api}/audits(00000000-0000-0000-0000-0000000000ff)/Microsoft.Dynamics.CRM.RetrieveAuditDetails`);
    check('rig: an audit id the fixture does not hold is a 404', unknown.status === 404, String(unknown.status));

    const target = encodeURIComponent("{'@odata.id':'accounts(c1)'}");
    const paging = encodeURIComponent(JSON.stringify({ PageNumber: 2, Count: 10, ReturnTotalRecordCount: true }));
    const history = await fetch(`${api}/RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)?@t=${target}&@p=${paging}`).then((r) => r.json());
    check(
        'rig: RetrieveRecordChangeHistory pages by @p, counts the whole history, and every detail carries its AuditRecord',
        history.AuditDetailCollection.AuditDetails.length === 10 && history.AuditDetailCollection.TotalRecordCount === 26
            && history.AuditDetailCollection.MoreRecords === true
            && history.AuditDetailCollection.AuditDetails.every((d) => typeof d.AuditRecord?.auditid === 'string')
            && history.AuditDetailCollection.AuditDetails[0].AuditRecord.auditid === first.entities[10].auditid,
        JSON.stringify([history.AuditDetailCollection.AuditDetails.length, history.AuditDetailCollection.TotalRecordCount]),
    );

    const definition = await fetch(`${api}/EntityDefinitions(LogicalName='account')?$select=IsAuditEnabled`).then((r) => r.json());
    const off = host.createContext({ fixture, clientUrl: host.nextClientUrl(), auditEnabled: { org: false, table: false }, auditStatus: 403, auditSummary: false });
    const offApi = `${off.page.getClientUrl()}/api/data/v9.2`;
    const offDefinition = await fetch(`${offApi}/EntityDefinitions(LogicalName='account')?$select=IsAuditEnabled`).then((r) => r.json());
    const offOrg = await off.webAPI.retrieveMultipleRecords('organization', '?$select=isauditenabled&$top=1');
    check(
        'rig: IsAuditEnabled is a managed property that follows the switch, on the table and the organisation',
        definition.IsAuditEnabled.Value === true && offDefinition.IsAuditEnabled.Value === false && offOrg.entities[0].isauditenabled === false,
        JSON.stringify([definition.IsAuditEnabled, offDefinition.IsAuditEnabled, offOrg.entities[0]]),
    );

    const refusedDetail = await fetch(`${offApi}/audits(${first.entities[1].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`);
    let summaryFault = null;
    await off.webAPI.retrieveMultipleRecords('audit', auditQuery, 10).catch((error) => { summaryFault = error; });
    check(
        'rig: the two audit privileges refuse separately — a 403 body on the function, a plain-object fault on the query',
        refusedDetail.status === 403 && summaryFault !== null && !(summaryFault instanceof Error) && typeof summaryFault.errorCode === 'number',
        `${refusedDetail.status} / ${summaryFault && summaryFault.constructor.name}`,
    );

    let offline = 'resolved';
    const dark = host.createContext({ fixture, clientUrl: host.nextClientUrl(), auditStatus: 0 });
    await fetch(`${dark.page.getClientUrl()}/api/data/v9.2/audits(${first.entities[1].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`)
        .catch((error) => { offline = error.constructor.name; });
    check('rig: auditStatus 0 is the offline shape, a TypeError', offline === 'TypeError', offline);

    /*
     * A write is applied to this host's own rows and audited, the way the
     * platform does it — so a control that writes can be shown its write on
     * the next read — and never reaches the shared fixture.
     */
    const F = '@OData.Community.Display.V1.FormattedValue';
    const writeCtx = host.createContext({ fixture, clientUrl: host.nextClientUrl() });
    const rowsBefore = (await writeCtx.webAPI.retrieveMultipleRecords('audit', auditQuery)).entities.length;
    await writeCtx.webAPI.updateRecord('account', 'c1', { name: 'Renamed', 'parentaccountid@odata.bind': '/accounts(r1)' });
    const written = await writeCtx.webAPI.retrieveRecord('account', 'c1', '?$select=name,_parentaccountid_value');
    const audited = (await writeCtx.webAPI.retrieveMultipleRecords('audit', auditQuery)).entities;
    const auditedDetail = await (await fetch(`${writeCtx.page.getClientUrl()}/api/data/v9.2/audits(${audited[0].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`, { headers: { Prefer: 'odata.include-annotations="*"' } })).json();
    check(
        "rig: updateRecord applies to this host's row — a primitive under its key, a bind as the lookup with its annotations — and audits it as the newest row by the rig user",
        written.name === 'Renamed' && written._parentaccountid_value === 'r1' && written['_parentaccountid_value' + F] === 'Contoso Holdings'
            && audited.length === rowsBefore + 1 && audited[0]['_userid_value' + F] === 'Rig User' && audited[0].action === 2
            && auditedDetail.AuditDetail.OldValue.name === 'Contoso Deutschland GmbH' && auditedDetail.AuditDetail.NewValue.name === 'Renamed'
            && auditedDetail.AuditDetail.OldValue._parentaccountid_value === 'p1' && auditedDetail.AuditDetail.NewValue['_parentaccountid_value@Microsoft.Dynamics.CRM.associatednavigationproperty'] === 'parentaccountid',
        JSON.stringify([written, audited[0], auditedDetail.AuditDetail]),
    );
    check("rig: the shared fixture is untouched by a host's write, and a fresh host starts from it", fixture.tables.account.find((r) => r.accountid === 'c1').name === 'Contoso Deutschland GmbH' && !fixture.tables.audit.some((r) => r.auditid.startsWith('ffffffff'))
        && (await host.createContext({ fixture, clientUrl: host.nextClientUrl() }).webAPI.retrieveRecord('account', 'c1', '?$select=name')).name === 'Contoso Deutschland GmbH');
    let bindFault = null;
    await writeCtx.webAPI.updateRecord('account', 'c1', { 'nosuch@odata.bind': '/accounts(r1)' }).catch((e) => { bindFault = e; });
    let refFault = null;
    await writeCtx.webAPI.updateRecord('account', 'c1', { 'parentaccountid@odata.bind': '/accounts(nosuchid)' }).catch((e) => { refFault = e; });
    check('rig: an undeclared bind and a bind to a missing record refuse the way the server does', bindFault && /undeclared property 'nosuch'/.test(bindFault.message) && refFault && refFault.title === 'Record Is Unavailable', JSON.stringify([bindFault && bindFault.errorCode, refFault && refFault.errorCode]));
    let dropped = null;
    await writeCtx.webAPI.updateRecord('account', 'c1', { address1_composite: 'probe', name: 'Kept' }).then((r) => { dropped = r; });
    const afterDrop = await writeCtx.webAPI.retrieveRecord('account', 'c1', '?$select=name,address1_composite');
    check("rig: a write to a column the metadata marks not updatable resolves and changes nothing — the server's way — while the rest of the payload lands", dropped !== null && afterDrop.name === 'Kept' && afterDrop.address1_composite === undefined, JSON.stringify(afterDrop));
    const attrs = await (await fetch(`${writeCtx.page.getClientUrl()}/api/data/v9.2/EntityDefinitions(LogicalName='account')/Attributes?$select=LogicalName,AttributeType,IsValidForUpdate`)).json();
    check("rig: EntityDefinitions/Attributes lists every labelled column as updatable and the fixture's frozen ones as not", attrs.value.some((x) => x.LogicalName === 'name' && x.IsValidForUpdate === true) && attrs.value.some((x) => x.LogicalName === 'address1_composite' && x.IsValidForUpdate === false && x.AttributeType === 'Memo'), String(attrs.value.length));
    check('rig: userSettings names the user the write is audited as', writeCtx.userSettings.userName === 'Rig User' && typeof writeCtx.userSettings.userId === 'string');
    check("rig: getEntityMetadata(target).EntitySetName is the target's, from the fixture", (await writeCtx.utils.getEntityMetadata('contact')).EntitySetName === 'contacts' && (await writeCtx.utils.getEntityMetadata('account')).EntitySetName === 'accounts');

    const metadata = await ctx.utils.getEntityMetadata('account', ['name', 'revenue', 'nosuchcolumn']);
    check(
        'rig: getEntityMetadata(table, columns).Attributes is an item collection of the columns asked for that the fixture names',
        metadata.Attributes.get('name').DisplayName === 'Account Name' && metadata.Attributes.getAll().length === 2 && metadata.Attributes.get('nosuchcolumn') === undefined,
        JSON.stringify(metadata.Attributes.getAll()),
    );

    const wrUrl = host.nextClientUrl();
    const wrCtx = host.createContext({ fixture, clientUrl: wrUrl });
    const wrFound = await fetch(`${wrCtx.page.getClientUrl()}/WebResources/new_/config/settings.json`);
    const wrMissing = await fetch(`${wrCtx.page.getClientUrl()}/WebResources/new_/config/missing.json`);
    check(
        'rig: a web resource answers 200 text/jscript with its text; a missing one 404 with an empty body — as a form did',
        wrFound.status === 200 && wrFound.headers.get('content-type') === 'text/jscript' && JSON.parse(await wrFound.text()).pageSize === 25
            && wrMissing.status === 404 && (await wrMissing.text()) === '',
        [wrFound.status, wrMissing.status].join(' / '),
    );
    const wrOffline = host.createContext({ fixture, clientUrl: host.nextClientUrl(), webResourceStatus: 0 });
    let wrFault = null;
    await fetch(`${wrOffline.page.getClientUrl()}/WebResources/new_/config/settings.json`).catch((e) => { wrFault = e; });
    const wrDenied = host.createContext({ fixture, clientUrl: host.nextClientUrl(), webResourceStatus: 403 });
    const wrDeniedReply = await fetch(`${wrDenied.page.getClientUrl()}/WebResources/new_/config/settings.json`);
    check('rig: webResourceStatus 0 rejects with a TypeError (offline), 403 refuses', wrFault instanceof TypeError && wrDeniedReply.status === 403);

    await metadataSelfCheck();
    await fileColumnSelfCheck();
    typedColumnSelfCheck();

    checkModuleLoader();
    checkDomCollections();
    checkDomCursor();

    disposeAll();
}

/*
 * Number and yes/no columns, and the formatting a control reads them with.
 * Every member here is the typings' word or a measurement named in
 * `dev/host.js`; the rig proves it hands them over before a control's suite
 * rests on them — and that a text column's shape did not move.
 */
function typedColumnSelfCheck() {
    const context = (options) => host.createContext({ calls: [], clientUrl: host.nextClientUrl(), ...options });
    const value = (options) => context(options).parameters.value;
    const keys = (object) => Object.keys(object || {}).sort().join();

    const text = value({});
    check(
        "rig: a text column's value keeps its shape — MaxLength, the table and the two names, no formatted",
        keys(text.attributes) === 'DisplayName,EntityLogicalName,LogicalName,MaxLength' && !('formatted' in text),
        keys(text.attributes),
    );

    const decimal = value({ valueType: 'Decimal', value: 1234.5, minValue: 0, maxValue: 10, precision: 1 });
    const whole = value({ valueType: 'Whole.None', value: 42 });
    const fp = value({ valueType: 'FP', value: null });
    const money = value({ valueType: 'Currency', value: 1500 });
    check(
        'rig: a number column carries its range, Type and Precision — a whole number Precision 0 and Format "0", as a form does (P1)',
        decimal.attributes.MinValue === 0 && decimal.attributes.MaxValue === 10 && decimal.attributes.Precision === 1 && !('Format' in decimal.attributes)
            && whole.attributes.Precision === 0 && whole.attributes.Format === '0' && whole.attributes.Type === 'integer'
            && fp.attributes.Type === 'double' && money.attributes.Type === 'money' && decimal.attributes.Type === 'decimal',
    );
    check(
        'rig: …and the platform default range where nobody declared one — FP from 0, not the type limit',
        whole.attributes.MinValue === -2147483648 && whole.attributes.MaxValue === 2147483647
            && fp.attributes.MinValue === 0 && fp.attributes.MaxValue === 1000000000
            && money.attributes.MaxValue === 922337203685477,
    );
    check(
        "rig: a number column's formatted is the platform's string: grouped, to its precision, currency with its symbol; empty is undefined",
        decimal.formatted === '1,234.5' && whole.formatted === '42' && money.formatted === '$1,500.00' && fp.formatted === undefined && fp.raw === null,
        [decimal.formatted, whole.formatted, money.formatted, fp.formatted].join(' | '),
    );
    const inCanvas = value({ valueType: 'Whole.None', value: 3, host: 'canvas' });
    check(
        'rig: a canvas host describes the property, not a column: no table, its own name, and the Decimal placeholder whatever is bound',
        inCanvas.attributes.EntityLogicalName === '' && inCanvas.attributes.LogicalName === 'value'
            && inCanvas.attributes.Precision === 2 && inCanvas.attributes.Type === 'decimal'
            && inCanvas.security.editable === true && inCanvas.security.secured === false,
        JSON.stringify(inCanvas.attributes),
    );
    check(
        'rig: and a form names the table the column is on',
        value({ valueType: 'Decimal', value: 3 }).attributes.EntityLogicalName === 'account',
    );
    check(
        'columnOf: a table\'s name makes a column; an empty one, an unmapped property and nothing at all do not',
        N.columnOf(value({ valueType: 'Decimal', value: 3 })) !== undefined
            && N.columnOf(inCanvas) === undefined
            && N.columnOf({ attributes: {} }) === undefined
            && N.columnOf({}) === undefined && N.columnOf(undefined) === undefined,
    );

    const group = ['Whole.None', 'Decimal', 'FP', 'Currency'];
    check(
        "rig: a type group's `type` is the member, the whole group, or another member — the three measured hosts",
        value({ valueType: 'Whole.None', value: 1, typeGroup: group }).type === 'Whole.None'
            && value({ valueType: 'Whole.None', value: 1, typeGroup: group, typeReport: 'group' }).type === group.join(',')
            && value({ valueType: 'Whole.None', value: 1, typeGroup: group, typeReport: 'wrong-member' }).type === 'Decimal'
            && value({ valueType: 'Decimal', value: 1, typeReport: 'group' }).type === 'Decimal',
    );

    const yesNo = value({ valueType: 'TwoOptions', value: false, optionLabels: ['Allow', 'Do Not Allow'] });
    check(
        "rig: a yes/no column carries its two options, false first, with the maker's labels, and formatted is the label",
        yesNo.raw === false && yesNo.attributes.Options.map((o) => `${o.Value}:${o.Label}`).join() === '0:Allow,1:Do Not Allow'
            && yesNo.attributes.DefaultValue === false && yesNo.formatted === 'Allow',
    );

    const calls = [];
    const german = host.createContext({ calls, clientUrl: host.nextClientUrl(), locale: 'de-DE' });
    const formatted = [
        german.formatting.formatDecimal(1234.5, 1),
        german.formatting.formatInteger(1234567),
        german.formatting.formatCurrency(-99.5),
    ];
    const english = host.createContext({ calls: [], clientUrl: host.nextClientUrl() }).formatting.formatCurrency(-1234.5);
    check("rig: a negative amount is bracketed in en-US, as formatCurrency(-1234.5) answered on a form (P1)", english === '($1,234.50)', english);
    check(
        "rig: context.formatting writes the user's locale, and every call is logged",
        formatted.join(' | ') === '1.234,5 | 1.234.567 | -99,50\u00a0$'
            && calls.join() === 'formatting.formatDecimal([1234.5,1]),formatting.formatInteger(1234567),formatting.formatCurrency([-99.5,null,null])',
        formatted.join(' | '),
    );
    check(
        'rig: …and the platform made the bound value\'s formatted without a logged call — the control did not ask for it',
        (() => {
            const own = [];
            host.createContext({ calls: own, clientUrl: host.nextClientUrl(), valueType: 'Currency', value: 5 });
            return own.every((call) => !call.startsWith('formatting.'));
        })(),
    );
    const info = german.userSettings.numberFormattingInfo;
    check(
        "rig: numberFormattingInfo has every member the typings declare; de-DE swaps the separators and keeps the organisation's $ (P11)",
        Object.keys(info).length === 26 && info.numberDecimalSeparator === ',' && info.numberGroupSeparator === '.'
            && info.currencySymbol === '$' && info.currencyPositivePattern === 3
            && context({}).userSettings.numberFormattingInfo.numberDecimalSeparator === '.',
        String(Object.keys(info).length),
    );

    const range = context({
        valueType: 'Whole.None',
        value: 10,
        bound: {
            upperValue: { type: 'Whole.None', raw: 400, column: 'cll_maxseats', minValue: 0, maxValue: 500 },
            spare: 'unmapped',
        },
    }).parameters;
    check(
        'rig: a second bound number column has its own range and formatted; an unmapped one is still the eight-key shape',
        range.upperValue.attributes.MaxValue === 500 && range.upperValue.attributes.LogicalName === 'cll_maxseats'
            && range.upperValue.formatted === '400' && range.spare.type === null && keys(range.spare.attributes) === '',
    );
}

/*
 * The text entry cursor and `dom.user`, proved on bare elements — every caret
 * assertion a control's suite makes rests on these being a browser's rules
 * (see *The text entry cursor* in `dev/dom.js`).
 */
function checkDomCursor() {
    const box = dom.createElement('input');
    box.type = 'text';
    box.value = 'abcdef';

    check('rig: assigning a different value moves the cursor to the end', box.selectionStart === 6 && box.selectionEnd === 6);

    box.setSelectionRange(2, 2);
    box.value = 'abcdef';
    check('rig: assigning the same value leaves the cursor where it was', box.selectionStart === 2, String(box.selectionStart));

    box.setSelectionRange(9, 4);
    check('rig: setSelectionRange clamps to the length and pulls a start past the end back to it', box.selectionStart === 4 && box.selectionEnd === 4, `${box.selectionStart}–${box.selectionEnd}`);

    box.value = 'one\ntwo';
    check('rig: a single-line input strips line breaks, as its value sanitisation does', box.value === 'onetwo', JSON.stringify(box.value));

    const email = dom.createElement('input');
    email.type = 'email';
    let refused = null;
    try {
        email.setSelectionRange(0, 0);
    } catch (error) {
        refused = error;
    }
    check('rig: an email input has no cursor — selectionStart null, setSelectionRange throws InvalidStateError', email.selectionStart === null && refused !== null && refused.name === 'InvalidStateError');

    const seen = [];
    const typed = dom.createElement('input');
    ['beforeinput', 'input', 'focus', 'paste', 'change', 'compositionstart', 'compositionupdate', 'compositionend'].forEach((type) => {
        typed.addEventListener(type, (event) => seen.push(`${type}:${event.inputType || ''}:${event.data === undefined ? '' : event.data}:${event.isComposing ? 'c' : ''}`));
    });
    typed.value = 'Contoso';
    typed.setSelectionRange(3, 3);
    dom.user.type(typed, 'xy');
    check('rig: user.type edits at the cursor and leaves it after what was typed', typed.value === 'Conxytoso' && typed.selectionStart === 5, `${typed.value} @${typed.selectionStart}`);
    check('rig: …focusing first, then beforeinput and input per character with inputType and data', seen.join(' ') === 'focus::: beforeinput:insertText:x: input:insertText:x: beforeinput:insertText:y: input:insertText:y:', seen.join(' '));

    const blocked = dom.createElement('input');
    blocked.addEventListener('beforeinput', (event) => event.preventDefault());
    blocked.value = 'ab';
    check('rig: preventDefault on beforeinput stops the edit', dom.user.type(blocked, 'c') === false && blocked.value === 'ab');

    typed.setSelectionRange(3, 3);
    dom.user.backspace(typed);
    check('rig: backspace deletes the character before the cursor', typed.value === 'Coxytoso' && typed.selectionStart === 2, `${typed.value} @${typed.selectionStart}`);
    typed.setSelectionRange(0, 0);
    check('rig: backspace at the start deletes nothing and fires nothing', dom.user.backspace(typed) === false);
    typed.setSelectionRange(2, 4);
    dom.user.del(typed);
    check('rig: delete removes a selection', typed.value === 'Cotoso', typed.value);

    const limited = dom.createElement('input');
    limited.maxLength = 3;
    dom.user.type(limited, 'abcdef');
    dom.user.paste(limited, 'zz');
    check('rig: maxLength limits what the user types and pastes', limited.value === 'abc', limited.value);

    typed.focus();
    seen.length = 0;
    typed.value = '';
    dom.user.paste(typed, 'line one\nline two');
    check('rig: paste fires paste, then beforeinput/input insertFromPaste, one line', typed.value === 'line oneline two' && seen[0].indexOf('paste:') === 0 && seen[1].indexOf('beforeinput:insertFromPaste:') === 0, seen.join(' | '));

    seen.length = 0;
    typed.value = '';
    dom.user.compose(typed, ['k', 'ka'], 'か');
    check('rig: compose replaces its own run, ending on the committed text', typed.value === 'か' && typed.selectionStart === 1, typed.value);
    check(
        'rig: …and the last input arrives, still composing, before compositionend — as in Chromium',
        seen[0].indexOf('compositionstart') === 0 && seen[seen.length - 2] === 'input:insertCompositionText:か:c' && seen[seen.length - 1].indexOf('compositionend') === 0,
        seen.join(' '),
    );

    seen.length = 0;
    dom.user.autofill(typed, '555-0100');
    check('rig: autofill replaces the value with an input that has no inputType and no beforeinput, then change', typed.value === '555-0100' && seen.join(' ') === 'input::: change:::', seen.join(' '));

    seen.length = 0;
    typed.setSelectionRange(4, 4);
    check('rig: undo not cancelled changes nothing and leaves the cursor at 0, with an input historyUndo — as measured', dom.user.undo(typed) === false && typed.value === '555-0100' && typed.selectionStart === 0 && seen.join(' ') === 'beforeinput:historyUndo:null: input:historyUndo:null:', seen.join(' '));

    const undone = dom.createElement('input');
    undone.addEventListener('beforeinput', (event) => {
        if (event.inputType === 'historyUndo') {
            event.preventDefault();
        }
    });
    check('rig: undo cancelled is reported and fires no input', dom.user.undo(undone) === true);

    const off = dom.createElement('input');
    off.disabled = true;
    check('rig: a disabled input takes no typing', dom.user.type(off, 'a') === false && off.value === '');

    const focusLog = [];
    const first = dom.createElement('input');
    const second = dom.createElement('input');
    first.addEventListener('blur', () => focusLog.push('first:blur'));
    second.addEventListener('focus', () => focusLog.push('second:focus'));
    first.focus();
    second.focus();
    second.focus();
    check('rig: moving focus blurs what had it, and focusing twice fires once', focusLog.join(' ') === 'first:blur second:focus', focusLog.join(' '));
    second.blur();
}

/*
 * `dev/dom.js` hands back what a browser hands back, and no more: a control
 * that calls `.map` on `querySelectorAll` or `.forEach` on `children` fails
 * on a form, so it has to fail here too.
 */
function checkDomCollections() {
    const root = dom.createElement('div');
    const a = root.appendChild(dom.createElement('span'));
    a.className = 'x';
    root.appendChild(dom.createElement('span')).setAttribute('id', 'second');
    a.appendChild(dom.createElement('span')).className = 'x';

    const all = root.querySelectorAll('span');
    check('rig: querySelectorAll is a NodeList — indexable, length, item, forEach, iterable', all.length === 3 && all[0] === a && typeof all.item === 'function' && all.item(5) === null
        && typeof all.forEach === 'function' && Array.from(all).length === 3 && Object.prototype.toString.call(all) === '[object NodeList]');
    check('rig: …with no Array methods, as in a browser', all.map === undefined && all.filter === undefined && all.find === undefined && !Array.isArray(all));
    check('rig: querySelectorAll walks depth-first, in document order', Array.from(root.querySelectorAll('.x')).length === 2 && root.querySelector('.x') === a);

    const kids = root.children;
    check('rig: children is an HTMLCollection — indexable, item, namedItem, iterable, no forEach', kids.length === 2 && kids[1].getAttribute('id') === 'second'
        && typeof kids.namedItem === 'function' && kids.namedItem('second') === kids[1] && [...kids].length === 2 && kids.forEach === undefined && kids.map === undefined);
}

/*
 * `dev/modules.js`, the loader for a control whose bundle cannot load here
 * (see its header). Nothing in this suite needs it, so it is proved on three
 * throwaway modules rather than left untested until the day one does: a
 * relative import is followed, a type annotation is stripped, and a package
 * the caller forbids is refused by name.
 */
function checkModuleLoader() {
    const os = require('os');
    const { createLoader } = require('./modules.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcf-modules-'));

    try {
        fs.writeFileSync(path.join(dir, 'rule.ts'), 'import { limit } from "./limit";\nexport function clamp(n: number): number { return Math.min(n, limit); }\n');
        fs.writeFileSync(path.join(dir, 'limit.ts'), 'export const limit: number = 5;\n');
        fs.writeFileSync(path.join(dir, 'leaky.ts'), 'import * as lib from "some-browser-library";\nexport const x = lib;\n');

        fs.writeFileSync(path.join(dir, 'unused.ts'), 'import * as lib from "some-browser-library";\nexport const y = 1;\n');
        fs.writeFileSync(path.join(dir, 'reach.ts'), 'import { View } from "./components/View";\nexport const z = View;\n');

        const load = createLoader({ root: dir, forbid: [/some-browser-library/, [/components\//, 'the component tree']] });
        check('rig: modules.js transpiles a decision module and follows its relative import', load('rule').clamp(9) === 5);

        let refused = null;
        try {
            load('leaky');
        } catch (error) {
            refused = error;
        }
        check('rig: modules.js refuses a forbidden import by name, rather than failing on its absence', refused !== null && /imports some-browser-library/.test(refused.message), String(refused && refused.message));

        let reached = null;
        try {
            load('reach');
        } catch (error) {
            reached = error;
        }
        check('rig: modules.js refuses a relative import into a forbidden path, naming what it is', reached !== null && /stay free of the component tree/.test(reached.message), String(reached && reached.message));
        check('rig: an import nothing uses is elided before the guard sees it — mutation-test the guard with a used import', load('unused').y === 1);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

rigSelfCheck().then(report, (error) => {
    check('rig: the self-check ran to the end', false, String(error && error.stack || error));
    report();
});

function report() {
    const failed = results.filter((result) => !result.ok);

    for (const result of results) {
        const detail = result.detail ? `  — ${result.detail}` : '';

        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${detail}`);
    }

    console.log(
        failed.length > 0
            ? `\n  ${failed.length} of ${results.length} failed\n`
            : `\n  ${results.length} passed — the control's own decisions only; see SPEC.md for what a real form still has to confirm\n`,
    );

    process.exit(failed.length > 0 ? 1 : 0);
}
