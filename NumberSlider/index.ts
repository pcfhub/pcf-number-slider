import { IInputs, IOutputs } from './generated/ManifestTypes';
import { bandFor, parseBands, Band } from './bands';
import { EchoGuard } from './echo';
import {
    Column,
    Formatter,
    Scale,
    display,
    mergeColumns,
    parseNumber,
    percent,
    plain,
    readColumn,
    resolveScale,
    snap,
    storable,
    toNumber,
    withUnit,
} from './number';

type Style = 'slider' | 'range' | 'stepper' | 'bar' | 'arc';
type Which = 'lower' | 'upper';

const STYLES: readonly Style[] = ['slider', 'range', 'stepper', 'bar', 'arc'];

/**
 * pcf-number-slider: a number column as a slider, a two-column range, a
 * stepper, or a read-only bar or arc gauge — each with a typed value box.
 *
 * Every rule below is one SPEC.md measured on the Accounts form (P1–P11,
 * 2026-10-03). The ones that shaped the code:
 *
 * - **It writes on release.** A native range fires `input` while it moves and
 *   `change` once it lets go, and one key press fires both (P8): `input`
 *   repaints, `change` writes. A form coalesces a burst of writes into one pass
 *   and one OnChange (P4), so a held arrow key needs no throttle.
 * - **What it writes is what the column will keep.** The form rounds a write to
 *   the column's precision without a word (P3), so a value is snapped and
 *   rounded here first, or its echo would not match it. A typed value outside
 *   the range is refused at the box, where the user can correct it, rather
 *   than at Save.
 * - **The column decides the range.** Its declared range — unless that is the
 *   platform's default for the type — and the maker's min and max inside it.
 * - **A value it did not write is the form's.** See `echo.ts`: every write on
 *   the form re-renders every control (P3), so `updatedProperties` says nothing.
 *
 * The decisions live in `number.ts`, `bands.ts` and `echo.ts`, which the suite
 * loads on their own; this file turns them into elements.
 */
export class NumberSlider implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private container!: HTMLDivElement;
    private body!: HTMLDivElement;
    private track!: HTMLDivElement;
    private fill!: HTMLDivElement;
    private lowerRange!: HTMLInputElement;
    private upperRange!: HTMLInputElement;
    private decrease!: HTMLButtonElement;
    private increase!: HTMLButtonElement;
    private lowerField!: HTMLDivElement;
    private upperField!: HTMLDivElement;
    private lowerBox!: HTMLInputElement;
    private upperBox!: HTMLInputElement;
    private meter!: HTMLDivElement;
    private meterFill!: HTMLDivElement;
    private arc!: SVGSVGElement;
    private arcValue!: SVGPathElement;
    private meterText!: HTMLSpanElement;
    private note!: HTMLParagraphElement;
    private message!: HTMLParagraphElement;

    private notifyOutputChanged!: () => void;
    private context!: ComponentFramework.Context<IInputs>;

    private value: number | null = null;
    private upper: number | null = null;
    private upperWritten = false;
    private readonly lowerGuard = new EchoGuard();
    private readonly upperGuard = new EchoGuard();

    /** A thumb's position while it moves, before `change` commits it. */
    private live: { lower: number | null; upper: number | null } = { lower: null, upper: null };

    private style: Style = 'slider';
    private column: Column = readColumn(undefined, null);
    private scale: Scale = resolveScale(this.column, null, null, null);
    private bands: Band[] = [];
    private unit: string | null = null;
    private disabled = false;

    /** The resx key of the control's own refusal, and the box it is about. */
    private fault: { key: string; which: Which } | null = null;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary,
        container: HTMLDivElement,
    ): void {
        this.container = container;
        this.notifyOutputChanged = notifyOutputChanged;
        this.context = context;

        this.lowerRange = this.range('lower');
        this.upperRange = this.range('upper');

        this.fill = element('div', 'NumberSlider-fill');
        const rail = element('div', 'NumberSlider-rail');
        rail.append(this.fill);
        this.track = element('div', 'NumberSlider-track');
        this.track.append(rail, this.lowerRange, this.upperRange);

        this.decrease = this.stepButton(-1);
        this.increase = this.stepButton(1);

        [this.lowerField, this.lowerBox] = this.box('lower');
        [this.upperField, this.upperBox] = this.box('upper');

        this.meterFill = element('div', 'NumberSlider-meter-fill');
        const meterRail = element('div', 'NumberSlider-meter-rail');
        meterRail.append(this.meterFill);

        this.arc = svg('svg') as SVGSVGElement;
        this.arc.setAttribute('class', 'NumberSlider-arc');
        this.arc.setAttribute('viewBox', '0 0 120 66');
        this.arc.setAttribute('aria-hidden', 'true');
        this.arc.setAttribute('focusable', 'false');
        const arcRail = svg('path');
        arcRail.setAttribute('class', 'NumberSlider-arc-rail');
        this.arcValue = svg('path') as SVGPathElement;
        this.arcValue.setAttribute('class', 'NumberSlider-arc-value');

        for (const path of [arcRail, this.arcValue]) {
            // A half circle; `pathLength` lets the value be a dash length in percent.
            path.setAttribute('d', 'M 10 60 A 50 50 0 0 1 110 60');
            path.setAttribute('pathLength', '100');
        }

        this.arc.append(arcRail, this.arcValue);

        this.meterText = element('span', 'NumberSlider-meter-text');
        this.meter = element('div', 'NumberSlider-meter');
        this.meter.setAttribute('role', 'meter');
        this.meter.append(meterRail, this.arc, this.meterText);

        const lowerSide = element('div', 'NumberSlider-side');
        lowerSide.append(this.decrease, this.lowerField, this.increase);

        this.body = element('div', 'NumberSlider-body');
        this.body.append(this.track, this.meter, lowerSide, this.upperField);

        this.note = element('p', 'NumberSlider-note');
        this.message = element('p', 'NumberSlider-message');
        this.message.setAttribute('aria-live', 'polite');

        this.container.classList.add('NumberSlider');
        this.container.append(this.body, this.note, this.message);

        this.render(context);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        this.render(context);
    }

    public getOutputs(): IOutputs {
        // `null` clears the column; `undefined` would mean "no change". The
        // generated type is narrower than the contract.
        const outputs: IOutputs = { value: this.value === null ? (null as unknown as undefined) : this.value };

        // Only while the style is Range. PCFHub's demo switches presets on a
        // mounted control, and a range written once kept handing its upper
        // column back under every other style (measured on the live demo,
        // 3 Oct 2026); a form never changes the style at runtime.
        if (this.style === 'range' && this.upperWritten && this.upperMapped()) {
            outputs.upperValue = this.upper === null ? (null as unknown as undefined) : this.upper;
        }

        return outputs;
    }

    public destroy(): void {
        // Every listener is on an element inside the container, which the
        // platform discards with it; nothing is registered on the document.
    }

    /* ----------------------------------------------------------- reading */

    private render(context: ComponentFramework.Context<IInputs>): void {
        this.context = context;

        const parameters = context.parameters;
        const lower = parameters.value;
        const upper = parameters.upperValue;

        this.applyTheme(context);
        this.container.classList.toggle('NumberSlider--hidden', !context.mode.isVisible);
        this.container.dir = context.userSettings.isRTL ? 'rtl' : 'ltr';

        if (!context.mode.isVisible) {
            return;
        }

        const style = String(parameters.style.raw ?? '') as Style;
        this.style = STYLES.includes(style) ? style : 'slider';

        for (const each of STYLES) {
            this.container.classList.toggle(`NumberSlider--${each}`, each === this.style);
        }

        const isRange = this.style === 'range';

        // Denied read arrives as `raw === null`, which is not an empty column.
        if (lower.security?.readable === false || (isRange && upper?.security?.readable === false)) {
            this.body.hidden = true;
            this.showNote(this.text('NumberSlider_NoAccess'));
            this.message.hidden = true;

            return;
        }

        this.body.hidden = false;

        const incoming = typeof lower.raw === 'number' ? lower.raw : null;

        if (this.lowerGuard.take(incoming, this.value)) {
            this.value = incoming;
            this.clearFault('lower');
        }

        if (isRange && this.upperMapped()) {
            const incomingUpper = typeof upper.raw === 'number' ? upper.raw : null;

            if (this.upperGuard.take(incomingUpper, this.upper)) {
                this.upper = incomingUpper;
                this.clearFault('upper');
            }
        }

        this.column = readColumn(lower.attributes as unknown as Record<string, unknown>, lower.type);

        if (isRange && this.upperMapped()) {
            this.column = mergeColumns(
                this.column,
                readColumn(upper.attributes as unknown as Record<string, unknown>, upper.type),
            );
        }

        // A blank input arrives as `null`, and PCFHub's demo hands a manifest
        // default over as a string: both go through `toNumber`.
        this.scale = resolveScale(
            this.column,
            toNumber(parameters.min.raw),
            toNumber(parameters.max.raw),
            toNumber(parameters.step.raw),
        );
        this.unit = parameters.unit.raw?.trim() || null;
        this.bands = parseBands(parameters.bands.raw, isColor);

        const readOnly = this.style === 'bar' || this.style === 'arc';
        const editable = (property: ComponentFramework.PropertyTypes.Property | undefined): boolean =>
            property?.security?.editable !== false;

        this.disabled =
            readOnly ||
            context.mode.isControlDisabled ||
            !editable(lower) ||
            (isRange && (!this.upperMapped() || !editable(upper)));

        this.container.classList.toggle('NumberSlider--disabled', this.disabled && !readOnly);
        this.container.classList.toggle('NumberSlider--no-box', String(parameters.valueBox.raw ?? '') === 'hide');

        this.paint();
    }

    /** `upperValue` is optional: a maker who never mapped it hands over `type: null`. */
    private upperMapped(): boolean {
        const upper = this.context.parameters.upperValue;

        return upper !== undefined && upper !== null && upper.type !== null && upper.type !== undefined;
    }

    /* ---------------------------------------------------------- painting */

    private paint(): void {
        const label = this.context.mode.label || this.text('NumberSlider_Name');
        const scale = this.scale;
        const lower = this.live.lower ?? this.value;
        const upper = this.live.upper ?? this.upper;
        const isRange = this.style === 'range';

        for (const input of [this.lowerRange, this.upperRange]) {
            input.min = String(scale.min);
            input.max = String(scale.max);
            input.step = String(scale.step);
            input.disabled = this.disabled;
        }

        this.upperRange.hidden = !isRange;
        this.upperField.hidden = !isRange;

        // A thumb being dragged is the user's; only a committed value moves it.
        if (this.live.lower === null) {
            this.lowerRange.value = String(lower ?? scale.min);
        }

        if (this.live.upper === null) {
            this.upperRange.value = String(upper ?? scale.max);
        }

        const lowerText = this.say(lower);
        const upperText = this.say(upper);

        this.lowerRange.setAttribute('aria-label', isRange ? `${label}, ${this.text('NumberSlider_From')}` : label);
        this.upperRange.setAttribute('aria-label', `${label}, ${this.text('NumberSlider_To')}`);
        this.lowerRange.setAttribute('aria-valuetext', lowerText);
        this.upperRange.setAttribute('aria-valuetext', upperText);
        this.lowerBox.setAttribute('aria-label', isRange ? `${label}, ${this.text('NumberSlider_From')}` : label);
        this.upperBox.setAttribute('aria-label', `${label}, ${this.text('NumberSlider_To')}`);

        // The fill: from the start to the value, or between the thumbs.
        const from = isRange ? percent(lower ?? scale.min, scale) : 0;
        const to = isRange ? percent(upper ?? scale.max, scale) : percent(lower ?? scale.min, scale);
        this.fill.style.insetInlineStart = `${from}%`;
        this.fill.style.width = `${Math.max(0, to - from)}%`;

        // Two thumbs at the top end: the lower one must be the one on top, or it
        // can never be dragged back down.
        this.container.classList.toggle('NumberSlider--lower-on-top', isRange && from > 50);

        const empty = isRange ? lower === null && upper === null : lower === null;
        this.container.classList.toggle('NumberSlider--empty', empty);

        // Unset without a band, so the stylesheet's accent — and its hover and
        // pressed shades — apply; a band's colour is the maker's and stays put.
        const band = isRange ? null : bandFor(this.bands, lower);

        if (band === null) {
            this.container.style.removeProperty('--NumberSlider-band');
        } else {
            this.container.style.setProperty('--NumberSlider-band', band);
        }

        this.paintBox(this.lowerBox, 'lower', lower);
        this.paintBox(this.upperBox, 'upper', upper);

        this.decrease.disabled = this.disabled || (lower !== null && lower <= scale.min);
        this.increase.disabled = this.disabled || (lower !== null && lower >= scale.max);
        this.decrease.setAttribute('aria-label', this.text('NumberSlider_Decrease').replace('{0}', label));
        this.increase.setAttribute('aria-label', this.text('NumberSlider_Increase').replace('{0}', label));

        if (this.style === 'stepper') {
            this.lowerBox.setAttribute('role', 'spinbutton');
            this.lowerBox.setAttribute('aria-valuemin', String(scale.min));
            this.lowerBox.setAttribute('aria-valuemax', String(scale.max));
            this.lowerBox.setAttribute('aria-valuetext', lowerText);

            if (lower === null) {
                this.lowerBox.removeAttribute('aria-valuenow');
            } else {
                this.lowerBox.setAttribute('aria-valuenow', String(lower));
            }
        } else {
            for (const name of ['role', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) {
                this.lowerBox.removeAttribute(name);
            }
        }

        this.paintMeter(label, lower);
        this.paintNote(lower, upper);
        this.paintMessage();
    }

    /** While the user is in the box it holds what they typed; after a refusal, the text being corrected. */
    private paintBox(box: HTMLInputElement, which: Which, value: number | null): void {
        box.disabled = this.disabled;

        if (document.activeElement === box || this.fault?.which === which) {
            return;
        }

        box.value = value === null ? '' : this.atRest(which, value);
    }

    private paintMeter(label: string, value: number | null): void {
        const scale = this.scale;
        const p = value === null ? 0 : percent(value, scale);

        this.meter.setAttribute('aria-label', label);
        this.meter.setAttribute('aria-valuemin', String(scale.min));
        this.meter.setAttribute('aria-valuemax', String(scale.max));
        // `meter` requires a current value; an empty column sits at the minimum and says so in words.
        this.meter.setAttribute('aria-valuenow', String(value === null ? scale.min : Math.min(scale.max, Math.max(scale.min, value))));
        this.meter.setAttribute('aria-valuetext', this.say(value));
        this.meterFill.style.width = `${p}%`;
        this.arcValue.setAttribute('stroke-dasharray', `${p} 100`);
        this.arcValue.setAttribute('visibility', p > 0 ? 'visible' : 'hidden');
        this.meterText.textContent = value === null ? '—' : this.atRest('lower', value);
    }

    /**
     * A neutral line under the control, not an error: the Range style with no
     * second column, or a stored value outside the slider's range — shown as it
     * is and never rewritten, because nobody asked for it to change.
     */
    private paintNote(lower: number | null, upper: number | null): void {
        if (this.style === 'range' && !this.upperMapped()) {
            this.showNote(this.text('NumberSlider_Unmapped'));

            return;
        }

        const interactive = this.style !== 'bar' && this.style !== 'arc';
        const outside = (v: number | null): boolean => v !== null && (v < this.scale.min || v > this.scale.max);

        if (interactive && (outside(lower) || (this.style === 'range' && outside(upper)))) {
            this.showNote(this.describe('NumberSlider_Outside'));

            return;
        }

        this.note.hidden = true;
        this.note.textContent = '';
    }

    private showNote(text: string): void {
        this.note.hidden = false;
        this.note.textContent = text;
    }

    /**
     * The control's own refusal first; the platform's validation otherwise. A
     * model-driven form prints the platform's message under the field itself,
     * so there the control only marks the field — printing it too says it twice.
     * A canvas app prints nothing, so there the control does.
     */
    private paintMessage(): void {
        const parameter = this.context.parameters.value;
        const modelDriven = parameter.attributes !== undefined;
        const text = this.fault !== null
            ? this.describe(this.fault.key)
            : parameter.error && !modelDriven ? parameter.errorMessage : '';
        const invalid = this.fault !== null || parameter.error === true;

        this.container.classList.toggle('NumberSlider--invalid', invalid);
        this.lowerBox.setAttribute('aria-invalid', String(invalid && this.fault?.which !== 'upper'));
        this.upperBox.setAttribute('aria-invalid', String(this.fault?.which === 'upper'));
        this.message.hidden = text === '';
        this.message.textContent = text;
    }

    /* ------------------------------------------------------------ text */

    private text(key: string): string {
        return this.context.resources.getString(key);
    }

    /** A message with the range in it, in the user's format. */
    private describe(key: string): string {
        return this.text(key)
            .replace('{0}', this.format(this.scale.min))
            .replace('{1}', this.format(this.scale.max));
    }

    /**
     * What a value reads as at rest: the platform's own `formatted` while it is
     * still the value the platform handed over — it knows the currency symbol and
     * the record's format — and the user's format through `context.formatting`
     * for a value written and not yet echoed. The unit goes after either.
     */
    private atRest(which: Which, value: number): string {
        const parameter = which === 'lower' ? this.context.parameters.value : this.context.parameters.upperValue;
        const formatted = parameter?.formatted;

        if (value === parameter?.raw && typeof formatted === 'string' && formatted !== '') {
            return withUnit(formatted, this.unit);
        }

        return this.format(value);
    }

    private format(value: number): string {
        return display(this.formatter(), value, this.column, this.scale, this.unit);
    }

    /** For a screen reader: the value as shown, or "No value". */
    private say(value: number | null): string {
        return value === null ? this.text('NumberSlider_Empty') : this.format(value);
    }

    /** `context.formatting`, or the browser's where a host leaves it out. */
    private formatter(): Formatter {
        const formatting = this.context.formatting as Partial<Formatter> | undefined;

        if (formatting?.formatInteger && formatting.formatDecimal && formatting.formatCurrency) {
            return formatting as Formatter;
        }

        return {
            formatInteger: (v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 }),
            formatDecimal: (v, p) => v.toLocaleString(undefined, { minimumFractionDigits: p, maximumFractionDigits: p }),
            formatCurrency: (v, p) => v.toLocaleString(undefined, { minimumFractionDigits: p, maximumFractionDigits: p }),
        };
    }

    /* ---------------------------------------------------------- writing */

    private write(which: Which, value: number | null): void {
        if (which === 'lower') {
            if (value === this.value) {
                return;
            }

            this.value = value;
            this.lowerGuard.wrote(value);
        } else {
            if (value === this.upper) {
                return;
            }

            this.upper = value;
            this.upperWritten = true;
            this.upperGuard.wrote(value);
        }

        this.notifyOutputChanged();
    }

    /** A thumb let go, or a key pressed on it: snapped, kept on its own side of the other thumb, written. */
    private release(which: Which, input: HTMLInputElement): void {
        let next = snap(Number(input.value), this.scale);

        if (this.style === 'range') {
            next = which === 'lower'
                ? Math.min(next, this.upper ?? this.scale.max)
                : Math.max(next, this.value ?? this.scale.min);
        }

        this.live[which] = null;
        this.clearFault(which);
        this.write(which, next);
        this.paint();
    }

    /** The typed box, on Enter or when it loses focus. */
    private commit(which: Which, box: HTMLInputElement): void {
        const info = this.context.userSettings.numberFormattingInfo;
        const parsed = parseNumber(box.value, info, this.unit);

        if (parsed === undefined) {
            this.refuse('NumberSlider_NotANumber', which);

            return;
        }

        if (parsed !== null && this.column.kind === 'whole' && !Number.isInteger(parsed)) {
            this.refuse('NumberSlider_WholeOnly', which);

            return;
        }

        if (parsed !== null && (parsed < this.scale.min || parsed > this.scale.max)) {
            this.refuse('NumberSlider_OutOfRange', which);

            return;
        }

        const next = parsed === null ? null : storable(parsed, this.column);
        const other = which === 'lower' ? this.upper : this.value;

        if (
            this.style === 'range' &&
            next !== null &&
            other !== null &&
            (which === 'lower' ? next > other : next < other)
        ) {
            this.refuse('NumberSlider_Order', which);

            return;
        }

        this.clearFault(which);
        this.write(which, next);
        this.paint();
    }

    /** A stepper press, or an arrow key in the stepper's box. An empty column starts at the minimum. */
    private stepBy(direction: 1 | -1): void {
        if (this.disabled) {
            return;
        }

        const next = this.value === null ? this.scale.min : snap(this.value + direction * this.scale.step, this.scale);

        this.clearFault('lower');
        this.write('lower', next);
        this.paint();
    }

    /** Keep what the user typed, so they can correct it, and say why it was not taken. */
    private refuse(key: string, which: Which): void {
        this.fault = { key, which };
        this.paintMessage();
    }

    private clearFault(which: Which): void {
        if (this.fault?.which === which) {
            this.fault = null;
        }
    }

    /* ---------------------------------------------------------- building */

    private range(which: Which): HTMLInputElement {
        const input = document.createElement('input');

        input.type = 'range';
        input.className = `NumberSlider-range NumberSlider-range--${which}`;

        // `input` while it moves: repaint, never write. A range keeps its two
        // thumbs apart here too, so the fill never turns inside out.
        input.addEventListener('input', () => {
            let live = Number(input.value);

            if (this.style === 'range') {
                const other = which === 'lower' ? this.upper ?? this.scale.max : this.value ?? this.scale.min;

                if (which === 'lower' ? live > other : live < other) {
                    live = other;
                    input.value = String(other);
                }
            }

            this.live[which] = live;
            this.paint();
        });

        // `change` once it lets go — and once per key press (P8).
        input.addEventListener('change', () => this.release(which, input));

        return input;
    }

    private stepButton(direction: 1 | -1): HTMLButtonElement {
        const button = document.createElement('button');

        button.type = 'button';
        button.className = `NumberSlider-step NumberSlider-step--${direction > 0 ? 'up' : 'down'}`;
        button.textContent = direction > 0 ? '+' : '−';
        button.addEventListener('click', () => this.stepBy(direction));

        return button;
    }

    private box(which: Which): [HTMLDivElement, HTMLInputElement] {
        const input = document.createElement('input');

        // `text`, not `number`: a number input refuses the user's own decimal
        // separator in half the locales a form runs in.
        input.type = 'text';
        input.inputMode = 'decimal';
        input.className = `NumberSlider-input NumberSlider-input--${which}`;
        input.placeholder = '—';
        input.autocomplete = 'off';

        input.addEventListener('focus', () => {
            if (this.fault?.which !== which) {
                const value = which === 'lower' ? this.value : this.upper;
                input.value = value === null ? '' : plain(value, this.context.userSettings.numberFormattingInfo);
            }
        });

        input.addEventListener('blur', () => {
            this.commit(which, input);
            this.paint();
        });

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                this.commit(which, input);

                if (this.fault === null) {
                    const value = which === 'lower' ? this.value : this.upper;
                    input.value = value === null ? '' : plain(value, this.context.userSettings.numberFormattingInfo);
                }
            } else if (event.key === 'Escape' && this.fault?.which === which) {
                // Back to the column's value; the refusal goes with what caused it.
                this.fault = null;
                const value = which === 'lower' ? this.value : this.upper;
                input.value = value === null ? '' : plain(value, this.context.userSettings.numberFormattingInfo);
                this.paintMessage();
            } else if (this.style === 'stepper' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                event.preventDefault();
                this.stepBy(event.key === 'ArrowUp' ? 1 : -1);
                input.value = this.value === null ? '' : plain(this.value, this.context.userSettings.numberFormattingInfo);
            }
        });

        const field = element('div', `NumberSlider-field NumberSlider-field--${which}`);
        field.append(input);

        return [field, input];
    }

    /** Only the fallbacks follow this; a host's published tokens win. */
    private applyTheme(context: ComponentFramework.Context<IInputs>): void {
        const isDarkTheme = context.fluentDesignLanguage?.isDarkTheme;

        if (isDarkTheme !== undefined) {
            this.container.classList.toggle('NumberSlider--dark', isDarkTheme);
        }
    }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);

    node.className = className;

    return node;
}

function svg(tag: string): SVGElement {
    return document.createElementNS('http://www.w3.org/2000/svg', tag) as SVGElement;
}

/** A maker's band colour must be one the browser accepts as a colour, or the entry is dropped. */
function isColor(candidate: string): boolean {
    return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('color', candidate);
}
