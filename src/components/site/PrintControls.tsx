"use client";

/**
 * Download / print the consent resource with no PDF library: the browser's
 * own print-to-PDF (desktop) or Share → Save PDF (phones). "Only" buttons
 * print one section, by setting data-print-only on <html> for the duration
 * of the print (see globals.css, @media print).
 */
export default function PrintControls() {
  function print(only?: string) {
    const html = document.documentElement;
    if (only) html.dataset.printOnly = only;
    else delete html.dataset.printOnly;
    const clear = () => { delete html.dataset.printOnly; window.removeEventListener("afterprint", clear); };
    window.addEventListener("afterprint", clear);
    window.print();
  }
  const btn = "rounded-lg border border-rule-2 px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-ink";
  return (
    <div className="no-print flex flex-wrap gap-2">
      <button type="button" onClick={() => print()} className="rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-paper">
        Download PDF
      </button>
      <button type="button" onClick={() => print("parents")} className={btn}>Print parent form only</button>
      <button type="button" onClick={() => print("young-people")} className={btn}>Print for young people</button>
      <button type="button" onClick={() => print("script")} className={btn}>Print the script</button>
    </div>
  );
}
