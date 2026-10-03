/*
 * What a number column is, the scale the control draws it on, and how a number
 * is snapped, parsed and shown. Pure: no `context`, no DOM, so the suite loads
 * this file on its own through `dev/modules.js`.
 *
 * Every rule here is one SPEC.md measured on a form (2026-10-03): which
 * `attributes` member tells whole from fractional (P1), that the form rounds a
 * write quietly (P3), and what the user's number format looks like (P11).
 */

export type Kind = 'whole' | 'fractional' | 'unknown';

/** What a bound number column says about itself, from `attributes` (model-driven) or `type` alone (canvas). */
export interface Column {
    kind: Kind;
    /** Decimal places the column stores; null where nothing says (a canvas app). */
    precision: number | null;
    /** The range the column declares, or null where it declares none worth drawing. */
    declared: { min: number; max: number } | null;
    /** A currency column: shown with the organisation's symbol. */
    currency: boolean;
}

/** The scale the control draws on, after the maker's settings meet the column's range. */
export interface Scale {
    min: number;
    max: number;
    step: number;
    /** Places a snapped value keeps. */
    decimals: number;
}

/**
 * The range a column carries when its maker set none, by `attributes.Type`.
 * Read off a real table (pcf-grid-data-bars SPEC.md); FP's floor is 0, not the
 * type's limit. A slider over one of these would move millions per pixel, so a
 * default range is "no range declared".
 */
const PLATFORM_DEFAULTS: Record<string, { min: number; max: number }> = {
    integer: { min: -2147483648, max: 2147483647 },
    decimal: { min: -100000000000, max: 100000000000 },
    double: { min: 0, max: 1000000000 },
    money: { min: -922337203685477, max: 922337203685477 },
};

const TYPE_NAMES: Record<string, string> = {
    'Whole.None': 'integer',
    Decimal: 'decimal',
    FP: 'double',
    Currency: 'money',
};

/** The scale when neither the maker nor the column says anything. */
const FALLBACK = { min: 0, max: 100 };

/**
 * Read the column.
 *
 * **Every number column carries `Precision`, and a whole number's is 0** — it
 * carries `Format: "0"` as well (P1). So `Precision === 0` means whole and more
 * means fractional; its mere presence proves nothing. Without `attributes` (a
 * canvas app) an exact `Whole.None` is still a whole number — `type` was the
 * member on every column P1 read, but a type group may report otherwise, so it
 * is only ever used to forbid a fraction.
 */
export function readColumn(attributes: Record<string, unknown> | undefined | null, type: string | null | undefined): Column {
    const a = attributes ?? {};
    const precision = typeof a.Precision === 'number' ? a.Precision : null;
    const typeName = typeof a.Type === 'string' ? a.Type.toLowerCase() : TYPE_NAMES[(type ?? '').trim()] ?? '';

    let kind: Kind;
    if (precision !== null) {
        kind = precision > 0 ? 'fractional' : 'whole';
    } else if (a.Format !== undefined || typeName === 'integer' || (type ?? '').trim() === 'Whole.None') {
        kind = 'whole';
    } else {
        kind = 'unknown';
    }

    let declared: Column['declared'] = null;
    if (typeof a.MinValue === 'number' && typeof a.MaxValue === 'number' && a.MinValue < a.MaxValue) {
        const defaults = PLATFORM_DEFAULTS[typeName];
        const isDefault = defaults !== undefined && defaults.min === a.MinValue && defaults.max === a.MaxValue;
        declared = isDefault ? null : { min: a.MinValue, max: a.MaxValue };
    }

    return { kind, precision, declared, currency: typeName === 'money' };
}

/**
 * The two columns of a range as one: a range holds what both can, so the
 * declared ranges intersect, a whole number in either makes both whole, and
 * the coarser precision wins.
 */
export function mergeColumns(a: Column, b: Column): Column {
    const kind: Kind = a.kind === 'whole' || b.kind === 'whole'
        ? 'whole'
        : a.kind === 'fractional' || b.kind === 'fractional' ? 'fractional' : 'unknown';
    const precision = a.precision === null ? b.precision : b.precision === null ? a.precision : Math.min(a.precision, b.precision);

    let declared = a.declared ?? b.declared;
    if (a.declared && b.declared) {
        const min = Math.max(a.declared.min, b.declared.min);
        const max = Math.min(a.declared.max, b.declared.max);
        declared = min < max ? { min, max } : a.declared;
    }

    return { kind, precision, declared, currency: a.currency };
}

/**
 * An input's number, or `null` for a blank one. A blank input arrives as
 * `null`, never as its manifest default (P1) — but PCFHub's demo hands a
 * default over as a string, so a numeric string is a number too.
 */
export function toNumber(raw: unknown): number | null {
    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : null;
    }

    if (typeof raw === 'string' && raw.trim() !== '') {
        const value = Number(raw.trim());

        return Number.isFinite(value) ? value : null;
    }

    return null;
}

/** Decimal places in a number as JavaScript writes it: 2 for 0.25, 0 for 3. */
export function decimalsOf(value: number): number {
    const text = String(value);
    const point = text.indexOf('.');

    return point === -1 || text.includes('e') ? 0 : text.length - point - 1;
}

/**
 * The scale: the maker's min, max and step where set — a blank one arrives as
 * `null`, its manifest default never does (P1) — kept inside the column's own
 * range, which the form refuses to save past (P3). A step is never finer than
 * the column can store, and a whole number's is whole.
 */
export function resolveScale(column: Column, makerMin: number | null, makerMax: number | null, makerStep: number | null): Scale {
    let min = makerMin ?? column.declared?.min ?? FALLBACK.min;
    let max = makerMax ?? column.declared?.max ?? FALLBACK.max;

    if (column.declared) {
        min = Math.max(min, column.declared.min);
        max = Math.min(max, column.declared.max);
    }

    if (!(min < max)) {
        // A maker range that leaves nothing between its ends: the column's, or the fallback.
        min = column.declared?.min ?? FALLBACK.min;
        max = column.declared?.max ?? FALLBACK.max;
    }

    let step = makerStep !== null && makerStep > 0 ? makerStep : 1;

    if (column.kind === 'whole') {
        step = Math.max(1, Math.round(step));
    } else if (column.precision !== null) {
        step = Math.max(step, 10 ** -column.precision);
    }

    step = Math.min(step, max - min);

    let decimals = column.kind === 'whole' ? 0 : Math.max(decimalsOf(step), decimalsOf(min));
    if (column.precision !== null) {
        decimals = Math.min(decimals, column.precision);
    }

    return { min, max, step, decimals };
}

/** Round to `places`, without 0.1 + 0.2 leaking through. */
export function roundTo(value: number, places: number): number {
    return Number(value.toFixed(Math.max(0, Math.min(places, 15))));
}

/** A value on the scale: inside it, on the step grid from `min`, rounded as the column stores it. */
export function snap(value: number, scale: Scale): number {
    const clamped = Math.min(scale.max, Math.max(scale.min, value));
    const steps = Math.round((clamped - scale.min) / scale.step);
    const onGrid = Math.min(scale.max, scale.min + steps * scale.step);

    return roundTo(onGrid, scale.decimals);
}

/**
 * A typed value as it will be stored: rounded to the column's precision —
 * which the form would otherwise do silently, so the echo would not match the
 * write (P3: 1.23456 came back 1.23). A typed value is not snapped to the
 * step: the box is where an exact value goes.
 */
export function storable(value: number, column: Column): number {
    return column.precision === null ? value : roundTo(value, column.precision);
}

/** What the user's format calls its separators: the camelCase members the typings declare. */
export interface NumberFormat {
    numberDecimalSeparator: string;
    numberGroupSeparator: string;
    negativeSign: string;
    currencySymbol?: string;
}

/**
 * A typed number in the user's format: a number, `null` for an empty box, or
 * `undefined` for text that is not one. A group separator is taken only where it
 * groups (`1.234,5` to a German user, never `1.5`); a currency symbol and the
 * unit are dropped, since the box shows them.
 */
export function parseNumber(text: string, format: NumberFormat, unit: string | null = null): number | null | undefined {
    let compact = text.replace(/[\s\u00a0\u202f]/g, '');

    for (const decoration of [format.currencySymbol, unit?.replace(/\s/g, '')]) {
        if (decoration) {
            compact = compact.split(decoration).join('');
        }
    }

    if (compact === '') {
        return null;
    }

    const bracketed = /^\(.*\)$/.test(compact);
    if (bracketed) {
        compact = compact.slice(1, -1);
    }

    const negative = bracketed || compact.startsWith('-') || compact.startsWith(format.negativeSign);
    const unsigned = compact.replace(/^[-+]/, '').replace(new RegExp(`^${literal(format.negativeSign)}`), '');
    const parts = unsigned.split(format.numberDecimalSeparator);

    if (parts.length > 2) {
        return undefined;
    }

    let whole = parts[0];
    const group = format.numberGroupSeparator;

    if (group !== '' && whole.includes(group)) {
        if (!new RegExp(`^\\d{1,3}(${literal(group)}\\d{3})+$`).test(whole)) {
            return undefined;
        }

        whole = whole.split(group).join('');
    }

    const normal = parts.length === 2 ? `${whole}.${parts[1]}` : whole;

    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(normal)) {
        return undefined;
    }

    const value = Number(normal);

    return negative ? -value : value;
}

/** The value as the box shows it while it is edited: no grouping, the user's decimal separator. */
export function plain(value: number, format: NumberFormat): string {
    return String(value).replace('.', format.numberDecimalSeparator);
}

/** `context.formatting`'s three number formatters. */
export interface Formatter {
    formatInteger(value: number): string;
    formatDecimal(value: number, precision?: number): string;
    formatCurrency(value: number, precision?: number, symbol?: string): string;
}

/**
 * A number as the form would show it, through `context.formatting` so it
 * follows the user's format (P11) — a currency with the organisation's symbol,
 * a fraction to the column's places — then the maker's unit.
 */
export function display(f: Formatter, value: number, column: Column, scale: Scale, unit: string | null): string {
    const places = column.precision ?? scale.decimals;
    const text = column.kind === 'whole'
        ? f.formatInteger(value)
        : column.currency
            ? f.formatCurrency(value, places)
            : f.formatDecimal(value, places);

    return withUnit(text, unit);
}

/** The unit after a value: no space before %, ° or ‰, a no-break space before anything else. */
export function withUnit(text: string, unit: string | null): string {
    const u = (unit ?? '').trim();

    if (u === '') {
        return text;
    }

    return /^[%°‰]/.test(u) ? `${text}${u}` : `${text}\u00a0${u}`;
}

/** Where a value sits on the scale, 0 to 100, clamped. */
export function percent(value: number, scale: Scale): number {
    const p = ((value - scale.min) / (scale.max - scale.min)) * 100;

    return Math.max(0, Math.min(100, p));
}

/** `text` as a regular expression matches it, character for character. */
function literal(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
