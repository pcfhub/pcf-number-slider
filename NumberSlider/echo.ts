/**
 * Tells the echo of this control's own write from a change made by the form.
 *
 * Each write comes back as an `updateView` carrying it — late, and possibly
 * out of order — and **every write anywhere re-renders every control** with
 * `updatedProperties: ["value", …]` (P3), so neither the flag nor the order can
 * say whose change it is. Two rules can:
 *
 * - a value among the recent writes is an echo, in any order;
 * - a value equal to the host's last one is not news: PCFHub's demo re-renders
 *   with its preset's value, which taken as a change wipes what was chosen.
 *
 * A form coalesces a burst of writes into one pass of the last value (P4), so
 * the list stays short in practice; it is bounded anyway.
 */
export class EchoGuard {
    private written: (number | null)[] = [];
    private last: number | null | undefined = undefined;

    /** Note a value handed to the platform. */
    public wrote(value: number | null): void {
        this.written.push(value);

        if (this.written.length > 32) {
            this.written.shift();
        }
    }

    /**
     * Whether `incoming` is the form's own value, to be taken. `current` is what
     * the control holds now.
     */
    public take(incoming: number | null, current: number | null): boolean {
        const repeated = incoming === this.last;

        this.last = incoming;

        if (repeated || incoming === current || this.written.includes(incoming)) {
            return false;
        }

        this.written = [];

        return true;
    }
}
