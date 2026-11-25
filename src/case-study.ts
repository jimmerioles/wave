import "./case-study.css";

/**
 * The case study is a static editorial page. Two small behaviours make it
 * easier to read: a signal line that follows the scroll position, and shot
 * list links that move focus to the list rather than only moving the page.
 */

const progress = document.querySelector<HTMLElement>("[data-read-progress]");

function paintProgress(): void {
  if (!progress) return;
  const max = Math.max(
    1,
    document.documentElement.scrollHeight - window.innerHeight,
  );
  const value = Math.min(1, Math.max(0, window.scrollY / max));
  progress.style.transform = `scaleX(${value.toFixed(4)})`;
}

paintProgress();
window.addEventListener("scroll", paintProgress, { passive: true });
window.addEventListener("resize", paintProgress);
window.addEventListener("load", paintProgress);

const skipLink = document.querySelector<HTMLAnchorElement>(".cs-skip");
const main = document.getElementById("case-study-main");

skipLink?.addEventListener("click", (event) => {
  if (!main) return;
  event.preventDefault();
  main.focus();
});

const shotTitle = document.getElementById("shot-list-title");

if (shotTitle) {
  for (const link of document.querySelectorAll<HTMLAnchorElement>(
    "[data-shot-link]",
  )) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      shotTitle.scrollIntoView({ block: "start" });
      shotTitle.focus({ preventScroll: true });
      window.history.replaceState(null, "", "#shot-list");
    });
  }
}
