/** The name, set in Doto: the brand is the word itself. */
export function Wordmark({ size }: { size?: "large" }) {
  return (
    <span className={size === "large" ? "wordmark large" : "wordmark"}>
      Torrently
    </span>
  );
}
