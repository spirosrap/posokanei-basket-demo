import {
  AlertCircle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CheckCheck,
  FolderOpen,
  PackageSearch,
  RefreshCw,
  Store,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePreferences } from "./appContexts";
import { runtimeAppUrl } from "./appConfig";
import { coverageDelta, coverageRows, normalizeCatalogHealth } from "./catalogHealth";
import { catalogHealthText } from "./catalogHealthMessages";
import { fetchUpdateStatus } from "./posokaneiApi";

const CATALOG_HEALTH_URL = runtimeAppUrl("data/catalog-health.json");
const PROTECTED_FAILURE_CODES = new Set([
  "catalog_coverage_degraded",
  "catalog_contraction_blocked",
]);

export default function CatalogHealthPage({ appBasePath, ui }) {
  const { AppLink, Header, formatDataTime } = ui;
  const { language, locale, number, t: appText } = usePreferences();
  const t = (key, values) => catalogHealthText(language, key, values, appText);
  const [state, setState] = useState({ status: "loading", health: null, updateStatus: null });
  const [requestVersion, setRequestVersion] = useState(0);

  const load = useCallback(async () => {
    const [rawHealth, updateStatus] = await Promise.all([
      fetch(CATALOG_HEALTH_URL, {
        cache: requestVersion ? "reload" : "default",
        headers: { Accept: "application/json" },
      }).then((response) => {
        if (!response.ok) throw new Error(`catalog_health_${response.status}`);
        return response.json();
      }),
      fetchUpdateStatus().catch(() => null),
    ]);
    if (!rawHealth) throw new Error("catalog_health_unavailable");
    return { health: normalizeCatalogHealth(rawHealth), updateStatus };
  }, [requestVersion]);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, status: "loading" }));
    load()
      .then(({ health, updateStatus }) => {
        if (active) setState({ status: "ready", health, updateStatus });
      })
      .catch(() => {
        if (active) setState({ status: "error", health: null, updateStatus: null });
      });
    return () => {
      active = false;
    };
  }, [load]);

  const health = state.health;
  const current = health?.current;
  const previous = health?.previous;
  const rootRows = useMemo(
    () => coverageRows(current?.rootCategories, previous?.rootCategories),
    [current?.rootCategories, previous?.rootCategories],
  );
  const retailerRows = useMemo(
    () => coverageRows(current?.retailers, previous?.retailers)
      .sort((left, right) => right.productCount - left.productCount),
    [current?.retailers, previous?.retailers],
  );
  const productDelta = coverageDelta(current?.productCount, previous?.productCount);
  const offerDelta = coverageDelta(current?.totalOffers, previous?.totalOffers);
  const updateFailed = state.updateStatus?.refreshStatus === "failed";
  const protectedCatalogue = updateFailed
    && PROTECTED_FAILURE_CODES.has(state.updateStatus?.refreshErrorCode);
  const statusKind = protectedCatalogue ? "protected" : updateFailed ? "delayed" : "healthy";
  const activeProducts = current?.productCount || 0;
  const headerHealth = activeProducts
    ? { state: "cached", source: "snapshot", activeProducts }
    : { state: state.status === "error" ? "offline" : "checking", activeProducts: 0 };
  const anomalies = Array.isArray(state.updateStatus?.refreshDiagnostics?.anomalies)
    ? state.updateStatus.refreshDiagnostics.anomalies
    : [];

  return (
    <div className="app-shell health-shell">
      <Header health={headerHealth} basketCount={0} showBasket={false} />
      <main className="catalog-health-page">
        <AppLink className="bargains-back" href={appBasePath}>
          <ArrowLeft size={17} aria-hidden="true" />
          {t("backToBasket")}
        </AppLink>

        <header className="health-heading">
          <div>
            <span className="changes-eyebrow">
              <CheckCheck size={16} aria-hidden="true" />
              {t("catalogHealthEyebrow")}
            </span>
            <h1>{t("catalogHealthTitle")}</h1>
            <p>{t("catalogHealthDescription")}</p>
          </div>
          {health ? (
            <div className="health-heading-time">
              <strong>{t("catalogHealthCurrentSync")}</strong>
              <span>{formatDataTime(health.generatedAt, locale, t)}</span>
              {previous ? (
                <small>{t("catalogHealthComparedWith", {
                  time: formatDataTime(previous.generatedAt, locale, t),
                })}</small>
              ) : null}
            </div>
          ) : null}
        </header>

        {state.status === "loading" && !health ? (
          <div className="changes-status" role="status">
            <RefreshCw size={20} className="spin" aria-hidden="true" />
            {t("catalogHealthLoading")}
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="changes-status error" role="alert">
            <AlertCircle size={20} aria-hidden="true" />
            <span>{t("catalogHealthUnavailable")}</span>
            <button type="button" className="text-button" onClick={() => setRequestVersion((value) => value + 1)}>
              <RefreshCw size={15} aria-hidden="true" />
              {t("retryPriceChanges")}
            </button>
          </div>
        ) : null}

        {health ? (
          <>
            <section className={`health-status-banner ${statusKind}`} aria-label={t("catalogHealthSyncStatus")}>
              <span className="health-status-icon">
                {statusKind === "healthy"
                  ? <CheckCheck size={22} aria-hidden="true" />
                  : <AlertCircle size={22} aria-hidden="true" />}
              </span>
              <div>
                <strong>{t(`catalogHealthStatus${capitalize(statusKind)}`)}</strong>
                <p>{t(`catalogHealthStatus${capitalize(statusKind)}Body`)}</p>
                {updateFailed && state.updateStatus?.refreshCheckedAt ? (
                  <small>{t("catalogHealthLastAttempt", {
                    time: formatDataTime(state.updateStatus.refreshCheckedAt, locale, t),
                  })}</small>
                ) : null}
              </div>
            </section>

            <section className="health-summary" aria-label={t("catalogHealthSummary")}>
              <HealthMetric
                icon={<PackageSearch size={20} aria-hidden="true" />}
                label={t("catalogHealthProducts")}
                value={number(current.productCount)}
                delta={productDelta}
                hasPrevious={Boolean(previous)}
                t={t}
                number={number}
              />
              <HealthMetric
                icon={<Store size={20} aria-hidden="true" />}
                label={t("catalogHealthOffers")}
                value={number(current.totalOffers)}
                delta={offerDelta}
                hasPrevious={Boolean(previous)}
                t={t}
                number={number}
              />
              <HealthMetric
                icon={<FolderOpen size={20} aria-hidden="true" />}
                label={t("catalogHealthCategories")}
                value={number(current.categoryCount)}
                delta={coverageDelta(current.categoryCount, previous?.categoryCount)}
                hasPrevious={Boolean(previous)}
                t={t}
                number={number}
              />
              <HealthMetric
                icon={<Store size={20} aria-hidden="true" />}
                label={t("catalogHealthChains")}
                value={number(current.retailers.length)}
                delta={coverageDelta(current.retailers.length, previous?.retailers.length)}
                hasPrevious={Boolean(previous)}
                t={t}
                number={number}
              />
            </section>

            <div className="health-grid">
              <CoverageSection
                title={t("catalogHealthRootCoverage")}
                description={t("catalogHealthRootCoverageDescription")}
                rows={rootRows}
                hasPrevious={Boolean(previous)}
                maximum={current.productCount}
                label={(row) => rootCategoryLabel(row.name, language, t)}
                t={t}
                number={number}
                locale={locale}
              />
              <CoverageSection
                title={t("catalogHealthRetailerCoverage")}
                description={t("catalogHealthRetailerCoverageDescription")}
                rows={retailerRows}
                hasPrevious={Boolean(previous)}
                maximum={current.productCount}
                label={(row) => row.name}
                t={t}
                number={number}
                locale={locale}
              />
            </div>

            {anomalies.length ? (
              <section className="health-anomalies" aria-label={t("catalogHealthRejectedCandidate")}>
                <div>
                  <AlertCircle size={19} aria-hidden="true" />
                  <span>
                    <strong>{t("catalogHealthRejectedCandidate")}</strong>
                    <small>{t("catalogHealthRejectedCandidateDescription")}</small>
                  </span>
                </div>
                <ul>
                  {anomalies.map((anomaly) => (
                    <li key={`${anomaly.scope}-${anomaly.id}`}>
                      <span>{anomaly.name || anomaly.id}</span>
                      <strong>{number(anomaly.previous_count)} → {number(anomaly.next_count)}</strong>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <p className="health-footnote">
              {t("catalogHealthFootnote")}
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}

function HealthMetric({ delta, hasPrevious, icon, label, number, t, value }) {
  return (
    <div className="health-metric">
      <span className="health-metric-icon">{icon}</span>
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
      <DeltaBadge delta={delta} hasPrevious={hasPrevious} number={number} t={t} />
    </div>
  );
}

function CoverageSection({ description, hasPrevious, label, locale, maximum, number, rows, t, title }) {
  return (
    <section className="health-coverage-section">
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <div className="health-coverage-list">
        {rows.map((row) => {
          const percentage = maximum ? row.productCount / maximum : 0;
          return (
            <div className="health-coverage-row" key={row.id}>
              <div className="health-coverage-row-head">
                <strong>{label(row)}</strong>
                <span>{number(row.productCount)}</span>
              </div>
              <div className="health-coverage-track" aria-hidden="true">
                <span style={{ width: `${percentage ? Math.max(1, percentage * 100) : 0}%` }} />
              </div>
              <div className="health-coverage-row-meta">
                <span>{t("catalogHealthCoveragePercent", {
                  percent: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(percentage * 100),
                })}</span>
                <DeltaBadge delta={row.delta} hasPrevious={hasPrevious} number={number} t={t} compact />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DeltaBadge({ compact = false, delta, hasPrevious, number, t }) {
  if (!hasPrevious) return <span className="health-delta neutral">{t("catalogHealthNoComparison")}</span>;
  const value = delta?.value || 0;
  if (!value) return <span className="health-delta neutral">{t("catalogHealthUnchanged")}</span>;
  const positive = value > 0;
  return (
    <span className={`health-delta ${positive ? "positive" : "negative"}`}>
      {positive ? <ArrowUpRight size={compact ? 12 : 14} /> : <ArrowDownRight size={compact ? 12 : 14} />}
      {positive ? "+" : ""}{number(value)}
    </span>
  );
}

function rootCategoryLabel(name, language, t) {
  if (language !== "en") return name;
  const keyByName = {
    "Καθαριότητα": "catalogRootCleaning",
    "Ποτά": "catalogRootDrinks",
    "Προσωπική Φροντίδα": "catalogRootPersonalCare",
    "Είδη για Κατοικίδια": "catalogRootPets",
    "Βρεφικά": "catalogRootBaby",
    "Τρόφιμα": "catalogRootFood",
  };
  return keyByName[name] ? t(keyByName[name]) : name;
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
