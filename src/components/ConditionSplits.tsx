import { MeasureBar } from "@/components/ui/StatLine";
import { formatDerived, formatDerivedSigned, formatScore, plural } from "@/lib/format";
import type { ConditionSplit } from "@/lib/queries/surfer";

/**
 * Condition splits -- the third module the M3 cap names, and the one that
 * needs its label more than its numbers.
 *
 * DECISION 26 MEASURED CONDITIONS AS HURTING OUT OF SAMPLE. Datum V1 is a
 * ridge on ROUND ALONE: break, wave type and field size were tested and
 * dropped because they made the leave-one-event-out error worse. So the
 * expected score behind every residual on this page is the round's, and
 * these splits are DESCRIPTION -- what this surfer scored when the page
 * said 4-6' and offshore -- not a model input and not an effect.
 *
 * DESIGN_BRIEF 5 requires exactly this framing: "Ready as description, and
 * it must be labelled as description: a split shown next to Trim will be
 * read as a model input it is not." The heading, the note and the column
 * header all say so, because only one of the three survives a screenshot.
 *
 * Coverage is stated per split, not once: conditions are published for 700
 * of 800 heats, and which of THIS surfer's heats fall in the covered set is
 * a different number for every surfer (trap 23).
 */
export default function ConditionSplits({
  wind,
  waveHeight,
  heatsWithConditions,
  totalHeats,
}: {
  wind: ConditionSplit[];
  waveHeight: ConditionSplit[];
  heatsWithConditions: number;
  totalHeats: number;
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <SplitTable
        title="By published wave height"
        splits={waveHeight}
        unitLabel="Height"
      />
      <SplitTable title="By published wind" splits={wind} unitLabel="Wind" />
      <p className="text-caption leading-relaxed text-fg-subtle lg:col-span-2">
        <span className="font-semibold tracking-[0.04em]">What these are not</span>{" "}
        Conditions are <strong className="font-semibold text-fg-muted">not in the model</strong>.
        Datum V1 is a ridge on the round alone: break, wave type and field size were tested on
        27 August and dropped, because adding them made the leave-one-event-out error worse rather
        than better. The &ldquo;vs Datum&rdquo; column in each split is therefore this surfer&apos;s
        deviation from what that <em>round</em>{" "}usually yields, averaged over the heats that fall in
        the split. It is a description of where he scored, not a measurement of conditions he
        favours, and a difference between two rows here is not evidence that either caused
        anything. Computed over the{" "}
        <span className="figures">{heatsWithConditions}</span>{" "}of his{" "}
        <span className="figures">{totalHeats}</span>{" "}{plural(totalHeats, "heat")} whose popup was retained and publishes
        both figures; the remainder are absent from these tables rather than pooled into an
        &ldquo;unknown&rdquo; row.
      </p>
    </div>
  );
}

function SplitTable({
  title,
  splits,
  unitLabel,
}: {
  title: string;
  splits: ConditionSplit[];
  unitLabel: string;
}) {
  if (splits.length === 0) {
    return (
      <div>
        <h3 className="mb-3 border-t border-hairline-strong pt-2 font-display text-heading font-bold text-fg">
          {title}
        </h3>
        <p className="border border-dashed border-hairline-strong bg-paper-sunken px-4 py-6 text-body-sm text-fg-subtle">
          None of this surfer&apos;s heats carry published conditions.
        </p>
      </div>
    );
  }
  const maxHeats = Math.max(...splits.map((s) => s.heats));
  return (
    <div>
      <h3 className="mb-3 border-t border-hairline-strong pt-2 font-display text-heading font-bold text-fg">
        {title}
      </h3>
      <div className="overflow-x-auto border-t border-fg">
        <table className="w-full border-collapse text-stat">
          <caption className="sr-only">
            {title}: heats, mean heat total, best heat total and mean deviation from the round&apos;s
            expected total, for each published condition
          </caption>
          <thead className="border-b border-hairline-strong text-caption tracking-[0.04em] text-fg-subtle">
            <tr>
              <th scope="col" className="px-2.5 py-2 text-left font-semibold">
                {unitLabel}
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">
                Heats
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">
                Mean
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">
                Best
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">
                vs Datum
              </th>
            </tr>
          </thead>
          <tbody>
            {splits.map((s) => (
              <tr
                key={s.label}
                className="border-b border-table-hairline last:border-b-0 odd:bg-paper even:bg-table-stripe"
              >
                <th scope="row" className="px-2.5 py-1.5 text-left font-medium text-fg">
                  <span className="figures">{s.label}</span>
                </th>
                <td className="figures px-2.5 py-1.5 text-right text-fg-muted">
                  <span className="flex flex-col items-end gap-1">
                    <span>
                      {s.rated}
                      {s.rated !== s.heats && (
                        <span className="text-fg-subtle"> of {s.heats}</span>
                      )}
                    </span>
                    <span className="w-16">
                      <MeasureBar
                        fraction={maxHeats > 0 ? s.heats / maxHeats : 0}
                        label={`${s.heats} heats of a most-frequent ${maxHeats}`}
                      />
                    </span>
                  </span>
                </td>
                <td className="figures px-2.5 py-1.5 text-right text-fg">
                  {formatDerived(s.meanHeatTotal)}
                </td>
                <td className="figures px-2.5 py-1.5 text-right text-fg-muted">
                  {formatScore(s.bestHeatTotal)}
                </td>
                <td className="figures px-2.5 py-1.5 text-right text-fg-muted">
                  {formatDerivedSigned(s.meanResidual)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-caption text-fg-subtle">
        &ldquo;Heats&rdquo; counts the rated heats in the split; where a heat carries no published
        total it is shown as <span className="figures">rated of total</span>{" "}and left out of the
        means.
      </p>
    </div>
  );
}
