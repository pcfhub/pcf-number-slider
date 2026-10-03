/*
 * Colour bands: `50 danger; 80 warning; 100 success` — each value up to a
 * threshold takes that colour, lowest threshold first. Pure, so the suite loads
 * it on its own.
 *
 * A name is one of Fluent's status roles, read through its design token so a
 * model-driven form's theme applies, with the token's own light value as the
 * fallback where no theme is published. Anything else must be a colour the
 * browser accepts — the caller passes `CSS.supports` — or the entry is dropped:
 * a custom property accepts any string, so `url(...)` would otherwise become a
 * paint server the moment a style substitutes it.
 */

export interface Band {
    /** The highest value this colour covers. */
    upTo: number;
    color: string;
}

export const ROLES: Record<string, string> = {
    danger: 'var(--colorStatusDangerBackground3, #c50f1f)',
    warning: 'var(--colorStatusWarningBackground3, #f7630c)',
    success: 'var(--colorStatusSuccessBackground3, #107c10)',
    brand: 'var(--colorCompoundBrandBackground, #0f6cbd)',
    neutral: 'var(--colorNeutralForeground3, #616161)',
};

/**
 * The bands a maker wrote, sorted, with every entry that is not "number colour"
 * dropped. The number is written with a dot whatever the user's format: it is
 * configuration, typed once by a maker, not data.
 */
export function parseBands(text: string | null | undefined, isColor: (candidate: string) => boolean): Band[] {
    const bands: Band[] = [];

    for (const entry of (text ?? '').split(/[;\n]/)) {
        const match = /^\s*(-?\d+(?:\.\d+)?)\s+(.+?)\s*$/.exec(entry);

        if (!match) {
            continue;
        }

        const name = match[2].toLowerCase();
        const color = ROLES[name] ?? (isColor(match[2]) ? match[2] : null);

        if (color !== null) {
            bands.push({ upTo: Number(match[1]), color });
        }
    }

    return bands.sort((a, b) => a.upTo - b.upTo);
}

/** The colour for a value: the first band whose threshold it does not pass, else the last band; null with none. */
export function bandFor(bands: readonly Band[], value: number | null): string | null {
    if (bands.length === 0 || value === null) {
        return null;
    }

    return (bands.find((band) => value <= band.upTo) ?? bands[bands.length - 1]).color;
}
