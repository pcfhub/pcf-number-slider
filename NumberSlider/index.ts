import { IInputs, IOutputs } from './generated/ManifestTypes';
// THROWAWAY: the 0.0.1 probe. This import, probe.ts and every `this.probe`
// line go before 0.1.0, which replaces this file.
import { installProbe } from './probe';

/**
 * pcf-number-slider 0.0.1 — a probe build.
 *
 * Its only job is to ask the form the questions in SPEC.md (P1–P11) before
 * the control exists: what a bound number column hands over, what a write
 * does to it, how echoes and OnChange behave at key-repeat speed, and what a
 * native range does on a form under keys and touch. So the UI here is the
 * least that can be dragged — one native range, or two for Range — writing
 * on `change`, the way 0.1.0 will. Nothing in it is the design.
 */
export class NumberSlider implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private container!: HTMLDivElement;
    private lowerInput!: HTMLInputElement;
    private upperInput!: HTMLInputElement;
    private readout!: HTMLSpanElement;
    private notifyOutputChanged!: () => void;
    private context!: ComponentFramework.Context<IInputs>;

    private value: number | null = null;
    private upper: number | null = null;
    private upperTouched = false;
    private written: (number | null)[] = [];
    private lastIncoming: number | null | undefined = undefined;

    private probe!: ReturnType<typeof installProbe>;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary,
        container: HTMLDivElement,
    ): void {
        this.container = container;
        this.notifyOutputChanged = notifyOutputChanged;
        this.context = context;

        this.probe = installProbe(() => this.context, {
            write: (value) => this.write(value),
            writeUpper: (value) => this.writeUpper(value),
        });

        this.lowerInput = this.range('lower');
        this.upperInput = this.range('upper');
        this.readout = document.createElement('span');
        this.readout.style.font = '14px "Segoe UI", sans-serif';

        this.container.classList.add('NumberSlider');
        this.container.style.display = 'grid';
        this.container.style.gap = '4px';
        this.container.append(this.lowerInput, this.upperInput, this.readout);

        this.render(context);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        this.context = context;
        this.probe.pass(context);
        this.render(context);
    }

    public getOutputs(): IOutputs {
        const outputs: IOutputs = { value: this.value === null ? (null as unknown as undefined) : this.value };

        // Never an unmapped column.
        if (this.upperTouched && this.context.parameters.upperValue?.type !== null) {
            outputs.upperValue = this.upper === null ? (null as unknown as undefined) : this.upper;
        }

        return outputs;
    }

    public destroy(): void {
        // The listeners live on elements the platform discards with the container.
    }

    private range(which: 'lower' | 'upper'): HTMLInputElement {
        const input = document.createElement('input');

        input.type = 'range';
        input.style.width = '100%';
        input.setAttribute('aria-label', which === 'lower' ? 'Value' : 'Upper value');

        input.addEventListener('input', () => {
            this.probe.event('input', { which, value: input.value });
            this.readout.textContent = `${input.value} (dragging)`;
        });
        input.addEventListener('change', () => {
            this.probe.event('change', { which, value: input.value });

            if (which === 'lower') {
                this.write(Number(input.value));
            } else {
                this.writeUpper(Number(input.value));
            }
        });
        input.addEventListener('keydown', (event) => {
            this.probe.event('keydown', { which, key: event.key, defaultPrevented: event.defaultPrevented, before: input.value });
            window.setTimeout(() => this.probe.event('keydown.after', { which, key: event.key, after: input.value }), 0);
        });

        for (const kind of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'focus', 'blur']) {
            input.addEventListener(kind, (event) => {
                this.probe.event(kind, {
                    which,
                    pointerType: (event as PointerEvent).pointerType,
                    value: input.value,
                    scrollY: window.scrollY,
                });
            });
        }

        let moves = 0;

        input.addEventListener('pointermove', () => {
            moves += 1;

            if (moves % 10 === 1) {
                this.probe.event('pointermove', { which, moves, value: input.value, scrollY: window.scrollY });
            }
        });

        return input;
    }

    private write(value: number | null): void {
        this.value = value;
        this.written.push(value);

        if (this.written.length > 32) {
            this.written.shift();
        }

        this.notifyOutputChanged();
    }

    private writeUpper(value: number | null): void {
        this.upper = value;
        this.upperTouched = true;
        this.notifyOutputChanged();
    }

    private render(context: ComponentFramework.Context<IInputs>): void {
        const incoming = typeof context.parameters.value.raw === 'number' ? context.parameters.value.raw : null;
        const repeated = incoming === this.lastIncoming;

        this.lastIncoming = incoming;

        if (!repeated && incoming !== this.value && !this.written.includes(incoming)) {
            this.written = [];
            this.value = incoming;
        }

        const upperRaw = context.parameters.upperValue?.raw;

        if (!this.upperTouched) {
            this.upper = typeof upperRaw === 'number' ? upperRaw : null;
        }

        const min = context.parameters.min.raw ?? 0;
        const max = context.parameters.max.raw ?? 100;
        const step = context.parameters.step.raw ?? 1;
        const isRange = context.parameters.style.raw === 'range';
        const disabled = context.mode.isControlDisabled || context.parameters.value.security?.editable === false;

        for (const input of [this.lowerInput, this.upperInput]) {
            input.min = String(min);
            input.max = String(max);
            input.step = String(step);
            input.disabled = disabled;
        }

        if (document.activeElement !== this.lowerInput) {
            this.lowerInput.value = String(this.value ?? min);
        }

        if (document.activeElement !== this.upperInput) {
            this.upperInput.value = String(this.upper ?? max);
        }

        this.upperInput.hidden = !isRange;
        this.readout.textContent = isRange
            ? `${this.value ?? '—'} to ${this.upper ?? '—'}`
            : String(this.value ?? '—');
    }
}
