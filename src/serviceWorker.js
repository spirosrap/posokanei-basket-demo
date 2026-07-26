import { APP_BASE_URL } from "./appConfig.js";

export function registerAppServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register(`${APP_BASE_URL}sw.js`, {
      scope: APP_BASE_URL,
      updateViaCache: "none",
    }).catch(() => {});
  };

  const schedule = () => {
    window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(register, { timeout: 5000 });
      } else {
        register();
      }
    }, 1800);
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}
