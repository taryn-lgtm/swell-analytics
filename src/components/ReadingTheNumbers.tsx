/**
 * "How to read the numbers" -- the plain-language strip at the top of `/`.
 *
 * The wording is Taryn's, approved verbatim on 2 October 2026; edit it only
 * with her sign-off. It carries three literal figures, an exception to the
 * home route's no-literals rule made deliberately so the copy reads as prose.
 * Checked against v2 on 2 October: Opening Round Datum 10.7226 and Final
 * 14.4876 (datum_round_effects), half-life 15.00 heats and prior 0
 * (trim_model_runs, run 1). If either model is refitted, re-check them.
 */
export default function ReadingTheNumbers() {
  const term = "font-semibold text-fg";
  return (
    <section
      aria-labelledby="reading-the-numbers"
      className="border border-hairline bg-paper-raised px-4 py-4 sm:px-5 sm:py-5"
    >
      <p
        id="reading-the-numbers"
        className="text-caption font-semibold uppercase tracking-[0.18em] text-structure"
      >
        How to read the numbers
      </p>
      <p className="mt-2 max-w-3xl text-heading leading-snug text-fg">
        <strong className={term}>Datum</strong> is the score a typical CT surfer posts in
        that round. <strong className={term}>Trim</strong> is how far above or below Datum a
        surfer has been scoring lately. Plus means beating the bar, minus means falling
        short.
      </p>
      <div className="mt-3 max-w-3xl space-y-2 border-t border-hairline pt-3 text-body-sm text-fg-muted">
        <p>
          Every heat score on this site is measured against{" "}
          <strong className={term}>Datum</strong>: the heat total a typical Championship Tour
          surfer puts up at that stage of an event. Scores rise as an event goes on (about
          10.7 in an Opening Round heat, about 14.5 in a Final), so a 13 in a Final and a 13
          in the Opening Round mean different things.
        </p>
        <p>
          <strong className={term}>Trim</strong>{" "}
          is a surfer&apos;s running score against Datum. Every heat moves it up or down,
          and recent heats count most: a heat from 15 heats ago counts half as much as the latest one. A Trim of +0.5 means a surfer has
          recently been beating the typical score for their round by about half a point a
          heat. Everyone starts at zero, so surfers with only a few heats stay close to zero
          until their record builds up.
        </p>
      </div>
    </section>
  );
}
