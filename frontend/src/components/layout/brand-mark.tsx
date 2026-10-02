/**
 * SmartCampus AI brand mark, from the command-center design.
 *
 * `currentColor` throughout, so it inherits the colour of whatever surface it
 * sits on instead of hard-coding a palette.
 */
type BrandMarkProps = {
  compact?: boolean;
};

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <div className={`brand-lockup${compact ? " brand-lockup--compact" : ""}`}>
      <svg
        className="brand-mark"
        viewBox="0 0 48 48"
        fill="none"
        role="img"
        aria-label={compact ? "SmartCampus AI" : undefined}
        aria-hidden={compact ? undefined : true}
      >
        <path d="M4 14.1 24 7l20 7.1-20 7.1L4 14.1Z" fill="currentColor" />
        <path d="M12 18.4v8.1c6.8 5.1 17.2 5.1 24 0v-8.1l-12 4.2-12-4.2Z" fill="currentColor" opacity=".58" />
        <path d="M44 14.2v12.1" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="44" cy="28.8" r="2.1" fill="currentColor" />
        <circle cx="24" cy="36.5" r="2.5" fill="currentColor" opacity=".76" />
        <path
          d="M14.5 33.4c2.8 2.2 6.1 3.4 9.5 3.4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity=".46"
        />
      </svg>
      {!compact && (
        <span className="brand-wordmark" aria-label="SmartCampus AI">
          <span>Smart</span>
          <span className="brand-wordmark__accent">Campus</span>
          <span className="brand-wordmark__ai">AI</span>
        </span>
      )}
    </div>
  );
}
