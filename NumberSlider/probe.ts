/*
 * THROWAWAY — the 0.0.1 probe. Deleted, with its import, before 0.1.0.
 *
 * It asks the form the questions SPEC.md lists as P1–P11 and keeps the
 * answers for the console:
 *
 *   Object.keys(__pcfNumberSliderProbe)                 // one entry per column
 *   copy(__pcfNumberSliderProbe['numberofemployees'].dump())
 *
 * Keyed by the bound column's logical name, because a single global is
 * last-mounted-wins and the probe form carries five of these at once
 * (pcf-input-mask's lesson). A canvas app has no logical name; it registers
 * as 'value'.
 */
import { IInputs } from './generated/ManifestTypes';

type Context = ComponentFramework.Context<IInputs>;

interface Writer {
    write: (value: number | null) => void;
    writeUpper: (value: number | null) => void;
}

interface Pass {
    t: number;
    raw: unknown;
    upperRaw: unknown;
    formatted: unknown;
    upperFormatted: unknown;
    updated: string[];
    disabled: boolean;
    error: boolean;
    errorMessage: unknown;
    inputs: Record<string, unknown>;
}

const started = Date.now();
const now = (): number => Date.now() - started;

/** Every own key of a bag, `undefined`-valued ones included, as JSON keeps them. */
function bag(value: unknown): unknown {
    if (value === null || typeof value !== 'object') {
        return value === undefined ? '(undefined)' : value;
    }

    const out: Record<string, unknown> = {};

    for (const key of Object.keys(value as object)) {
        const member = (value as Record<string, unknown>)[key];

        out[key] = typeof member === 'function' ? '(function)' : member === undefined ? '(undefined)' : member;
    }

    return out;
}

function propertyShape(property: unknown): unknown {
    const p = property as Record<string, unknown> | undefined;

    if (p === undefined) {
        return '(no such parameter)';
    }

    return {
        keys: Object.keys(p),
        type: p.type === undefined ? '(undefined)' : p.type,
        raw: p.raw === undefined ? '(undefined)' : p.raw,
        rawType: typeof p.raw,
        formatted: p.formatted === undefined ? '(undefined)' : p.formatted,
        attributes: bag(p.attributes),
        security: bag(p.security),
        error: p.error,
        errorMessage: p.errorMessage,
        isPropertyLoading: p.isPropertyLoading,
    };
}

function sampleFormatting(context: Context): Record<string, unknown> {
    const f = context.formatting as unknown as Record<string, unknown> | undefined;
    const out: Record<string, unknown> = { present: f !== undefined };

    const attempt = (name: string, run: () => unknown): void => {
        try {
            out[name] = run();
        } catch (error) {
            out[name] = `(threw) ${String(error)}`;
        }
    };

    if (f !== undefined) {
        attempt('formatInteger(1234567)', () => context.formatting.formatInteger(1234567));
        attempt('formatDecimal(1234.5)', () => context.formatting.formatDecimal(1234.5));
        attempt('formatDecimal(1234.5, 1)', () => context.formatting.formatDecimal(1234.5, 1));
        attempt('formatDecimal(1234.5678, 4)', () => context.formatting.formatDecimal(1234.5678, 4));
        attempt('formatCurrency(1234.5)', () => context.formatting.formatCurrency(1234.5));
        attempt('formatCurrency(1234.5, 2)', () => context.formatting.formatCurrency(1234.5, 2));
        attempt("formatCurrency(1234.5, 2, '€')", () => context.formatting.formatCurrency(1234.5, 2, '€'));
        attempt("formatCurrency(1234.5, 2, 'EUR')", () => context.formatting.formatCurrency(1234.5, 2, 'EUR'));
        attempt('formatCurrency(-1234.5)', () => context.formatting.formatCurrency(-1234.5));
    }

    return out;
}

export function installProbe(read: () => Context, writer: Writer): { pass: (context: Context) => void; event: (kind: string, detail: Record<string, unknown>) => void } {
    const passes: Pass[] = [];
    const events: unknown[] = [];
    const bursts: unknown[] = [];
    const onChange: { attribute: string; t: number; value: unknown }[] = [];
    let first: unknown = null;
    let key = 'value';

    const columnOf = (context: Context, name: 'value' | 'upperValue'): string | undefined => {
        const attributes = context.parameters[name]?.attributes as { LogicalName?: string } | undefined;

        return attributes?.LogicalName;
    };

    const host = window as unknown as Record<string, unknown>;
    const registry = (host.__pcfNumberSliderProbe ??= {}) as Record<string, unknown>;

    const xrmAttribute = (name: string): { addOnChange?: (handler: () => void) => void; getValue?: () => unknown; getIsDirty?: () => boolean } | null => {
        const xrm = host.Xrm as { Page?: { getAttribute?: (n: string) => unknown } } | undefined;

        return (xrm?.Page?.getAttribute?.(name) as never) ?? null;
    };

    const clientUrl = (): string | null => {
        const page = (read() as unknown as { page?: { getClientUrl?: () => string } }).page;

        return page?.getClientUrl?.() ?? null;
    };

    async function getJson(path: string): Promise<unknown> {
        const base = clientUrl();

        if (base === null) {
            return '(no page.getClientUrl — canvas?)';
        }

        const response = await fetch(`${base}/api/data/v9.2/${path}`, {
            headers: { Accept: 'application/json', Prefer: 'odata.include-annotations="*"' },
            credentials: 'same-origin',
        });

        return { status: response.status, body: await response.json().catch(() => null) };
    }

    const api = {
        dump(): string {
            const context = read();
            const lower = columnOf(context, 'value');
            const upper = columnOf(context, 'upperValue');

            return JSON.stringify({
                probe: '0.0.1',
                column: lower,
                upperColumn: upper,
                first,
                passes: passes.slice(-200),
                passCount: passes.length,
                events: events.slice(-300),
                eventCount: events.length,
                bursts,
                onChange,
                dirty: lower ? xrmAttribute(lower)?.getIsDirty?.() ?? '(no Xrm)' : '(no column)',
                xrmValue: lower ? xrmAttribute(lower)?.getValue?.() ?? '(no Xrm)' : '(no column)',
            }, null, 1);
        },
        /** P3, P5: write exactly this (3.5, 150, 1.23456, null …), untouched. */
        write(value: number | null): string {
            events.push({ t: now(), kind: 'probe.write', value });
            writer.write(value);
            return 'written — dump() after the echo';
        },
        writeUpper(value: number | null): string {
            events.push({ t: now(), kind: 'probe.writeUpper', value });
            writer.writeUpper(value);
            return 'written';
        },
        /** P5: both columns in one notify. */
        writeBoth(lower: number | null, upper: number | null): string {
            events.push({ t: now(), kind: 'probe.writeBoth', lower, upper });
            writer.write(lower);
            writer.writeUpper(upper);
            return 'written';
        },
        /**
         * P4: `count` writes, `every` ms apart, from `from + 1` up — a held
         * arrow key's rate is about 33 ms. Resolves two seconds after the last
         * write with what went out and what came back, in order.
         */
        burst(count = 30, every = 33, from = 0): Promise<unknown> {
            const out: { t: number; value: number }[] = [];
            const startPass = passes.length;
            const startChange = onChange.length;

            return new Promise((resolve) => {
                let i = 0;
                const tick = (): void => {
                    i += 1;
                    const value = from + i;

                    out.push({ t: now(), value });
                    writer.write(value);

                    if (i < count) {
                        window.setTimeout(tick, every);
                    } else {
                        window.setTimeout(() => {
                            const back = passes.slice(startPass).map((p) => ({ t: p.t, raw: p.raw }));
                            const values = back.map((p) => p.raw as number);
                            const reordered = values.some((v, n) => n > 0 && v < values[n - 1]);
                            const summary = {
                                count,
                                every,
                                written: out,
                                passes: back,
                                passCount: back.length,
                                reordered,
                                lastPassValue: values[values.length - 1],
                                onChangeDuring: onChange.length - startChange,
                            };

                            bursts.push(summary);
                            resolve(summary);
                        }, 2000);
                    }
                };

                tick();
            });
        },
        /** P1, P2: what the server says the column is, through each cast. */
        async metadata(): Promise<unknown> {
            const context = read();
            const info = (context.mode as unknown as { contextInfo?: { entityTypeName?: string } }).contextInfo;
            const table = info?.entityTypeName;
            const answer: Record<string, unknown> = { table };

            for (const name of ['value', 'upperValue'] as const) {
                const column = columnOf(context, name);

                if (!table || !column) {
                    continue;
                }

                const base = `EntityDefinitions(LogicalName='${table}')/Attributes(LogicalName='${column}')`;
                const kind = await getJson(`${base}?$select=AttributeType,AttributeTypeName,RequiredLevel`);
                const typed: Record<string, unknown> = {};

                for (const cast of ['IntegerAttributeMetadata', 'DecimalAttributeMetadata', 'DoubleAttributeMetadata', 'MoneyAttributeMetadata']) {
                    typed[cast] = await getJson(`${base}/Microsoft.Dynamics.CRM.${cast}`);
                }

                answer[name] = { column, kind, typed };
            }

            return answer;
        },
        /** P2, P3, P5: the record as the server holds it, formatted values included. */
        async readBack(): Promise<unknown> {
            const context = read();
            const info = (context.mode as unknown as { contextInfo?: { entityTypeName?: string; entityId?: string } }).contextInfo;
            const table = info?.entityTypeName;
            const id = info?.entityId;
            const columns = [columnOf(context, 'value'), columnOf(context, 'upperValue')].filter(Boolean);

            if (!table || !id || columns.length === 0) {
                return { table, id, columns };
            }

            const set = (await getJson(`EntityDefinitions(LogicalName='${table}')?$select=EntitySetName`)) as { body?: { EntitySetName?: string } };
            const entitySet = set.body?.EntitySetName;

            return getJson(`${entitySet}(${id.replace(/[{}]/g, '')})?$select=${columns.join(',')},transactioncurrencyid`);
        },
        /** P4, P11: the form's own OnChange, counted. Call once, then drag or type. */
        watchOnChange(): string {
            const context = read();
            const names = [columnOf(context, 'value'), columnOf(context, 'upperValue')].filter((n): n is string => Boolean(n));

            for (const name of names) {
                const attribute = xrmAttribute(name);

                if (!attribute?.addOnChange) {
                    return '(no Xrm.Page — run this from the form, not a canvas app)';
                }

                attribute.addOnChange(() => onChange.push({ attribute: name, t: now(), value: attribute.getValue?.() }));
            }

            return `watching ${names.join(', ')}`;
        },
        /** The UI's own events, for P8 (keys) and P9 (touch). */
        event(kind: string, detail: Record<string, unknown>): void {
            events.push({ t: now(), kind, ...detail });
        },
    };

    const pass = (context: Context): void => {
        const lower = context.parameters.value;
        const upper = context.parameters.upperValue;
        const inputs: Record<string, unknown> = {};

        for (const name of ['style', 'min', 'max', 'step', 'valueBox', 'unit', 'bands'] as const) {
            const parameter = context.parameters[name] as unknown as Record<string, unknown> | undefined;

            inputs[name] = parameter === undefined ? '(absent)' : { raw: parameter.raw, type: parameter.type, attributes: bag(parameter.attributes) };
        }

        if (first === null) {
            const settings = context.userSettings as unknown as Record<string, unknown>;

            first = {
                t: now(),
                value: propertyShape(lower),
                upperValue: propertyShape(upper),
                inputs,
                label: context.mode.label,
                client: context.client.getClient(),
                formFactor: context.client.getFormFactor(),
                contextInfo: bag((context.mode as unknown as { contextInfo?: unknown }).contextInfo),
                languageId: settings.languageId,
                numberFormattingInfo: settings.numberFormattingInfo,
                formatting: sampleFormatting(context),
                parameterNames: Object.keys(context.parameters),
            };
        }

        passes.push({
            t: now(),
            raw: lower.raw,
            upperRaw: upper?.raw,
            formatted: lower.formatted,
            upperFormatted: upper?.formatted,
            updated: context.updatedProperties ?? [],
            disabled: context.mode.isControlDisabled,
            error: lower.error,
            errorMessage: lower.errorMessage,
            inputs: Object.fromEntries(Object.entries(inputs).map(([n, v]) => [n, (v as { raw?: unknown }).raw])),
        });

        const column = columnOf(context, 'value') ?? 'value';

        if (column !== key) {
            delete registry[key];
            key = column;
        }

        registry[key] = api;
    };

    return { pass, event: api.event };
}
