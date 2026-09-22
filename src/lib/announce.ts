/**
 * Screen-reader live region announcer.
 */
export function announce(message: string, priority: "polite" | "assertive" = "polite"): void {
  if (typeof document === "undefined") return;
  const id = priority === "assertive" ? "sr-assertive" : "sr-polite";
  const el = document.getElementById(id);
  if (el) {
    el.textContent = "";
    // Trigger DOM update cycle
    setTimeout(() => {
      el.textContent = message;
    }, 50);
  }
}
