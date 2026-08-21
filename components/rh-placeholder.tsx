/**
 * Shared scaffold for the Regional Head pages that exist in the nav but have
 * no data behind them yet. Keeps the page header identical to the real
 * Branches Overview so swapping in content is a body-only change.
 */
export default function RHPlaceholder({
  eyebrow,
  title,
  description,
  icon,
  planned,
}: {
  eyebrow: string;
  title: string;
  description: string;
  /** Material Symbols ligature name. */
  icon: string;
  /** Bullets describing what this page will hold once it's wired. */
  planned: string[];
}) {
  return (
    <div className="flex flex-col w-full max-w-[1440px] mx-auto px-margin-desktop pb-xl">
      <div className="flex flex-col mb-lg mt-lg">
        <div className="flex items-center gap-xs mb-xxs text-primary">
          <span className="material-symbols-outlined text-[18px]">{icon}</span>
          <span className="font-label-uppercase tracking-wider">{eyebrow}</span>
        </div>
        <h1 className="font-display-lg text-on-surface">{title}</h1>
        <p className="font-body-lg text-on-surface-variant max-w-2xl mt-xs">
          {description}
        </p>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-md p-xl flex flex-col items-center text-center gap-md">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container">
          <span className="material-symbols-outlined text-[28px] text-on-surface-variant">
            {icon}
          </span>
        </div>
        <div className="flex flex-col gap-xxs">
          <h2 className="font-headline-sm text-on-surface">Not wired up yet</h2>
          <p className="font-body-md text-on-surface-variant max-w-md">
            This page is a placeholder. The layout and navigation are in place
            so the rest can drop in without touching the shell.
          </p>
        </div>

        <ul className="flex flex-col gap-xs mt-xs text-left">
          {planned.map((item) => (
            <li
              key={item}
              className="flex items-start gap-xs font-body-md text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-[18px] text-outline mt-0.5">
                pending
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
