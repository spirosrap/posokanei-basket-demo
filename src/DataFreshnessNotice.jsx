import { AlertCircle, ChevronRight } from "lucide-react";
import { usePreferences } from "./appContexts";
import { friendlyRefreshError, resolveCatalogUpdatedAt } from "./updateStatus";
import { otherUnavailableChains } from "./kritikosTransition";
import KritikosTransition from "./KritikosTransition.jsx";
import { coverageCopy } from "./catalogAvailabilityCopy";

export default function DataFreshnessNotice({ transition, ...props }) {
  return (
    <>
      <CatalogueWarning {...props} />
      {transition && <KritikosTransition />}
    </>
  );
}

function CatalogueWarning({ health, updateStatus, formatDataTime, coverageDegraded }) {
  const { language, locale, t } = usePreferences();
  if (health.source !== "snapshot") return null;
  const snapshotTime = formatDataTime(
    resolveCatalogUpdatedAt(health, updateStatus),
    locale,
    t,
  );
  const refreshAttemptTime = formatDataTime(updateStatus?.refreshCheckedAt, locale, t);
  const unavailable = otherUnavailableChains(updateStatus?.unavailableRetailers);
  const refreshFailed = updateStatus?.refreshStatus === "failed";
  if (!unavailable && !coverageDegraded && !refreshFailed) return null;

  return (
    <details
      className="data-warning"
      aria-label={t("freshnessWarning")}
      open={refreshFailed || Boolean(unavailable) || undefined}
    >
      <summary>
        <span className="freshness-icon" aria-hidden="true">
          <AlertCircle size={17} />
        </span>
        <span className="freshness-summary">
          <strong>
          {unavailable
            ? t("unavailablePrices", { chains: unavailable })
            : coverageDegraded
            ? t("refreshCoverageDegradedTitle")
            : t("refreshFailedTitle")}
          </strong>
          <small>{t("lastCatalogueUpdate", { time: snapshotTime })}</small>
        </span>
        <ChevronRight size={17} className="freshness-chevron" aria-hidden="true" />
      </summary>
      <div className="freshness-details">
        <p>
          {unavailable ? coverageCopy[language].unavailablePricesBody : t("refreshSnapshotExplanation")}
          {refreshFailed
            ? t("refreshAttempt", {
                time: refreshAttemptTime,
                error: friendlyRefreshError(
                  updateStatus?.refreshError,
                  t,
                  updateStatus?.refreshErrorCode,
                ),
              })
            : ""}
        </p>
      </div>
    </details>
  );
}
