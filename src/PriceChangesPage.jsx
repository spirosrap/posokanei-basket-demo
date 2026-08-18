import {
  AlertCircle,
  ArrowDownRight,
  ArrowDownUp,
  ArrowLeft,
  ArrowUpRight,
  ChartLine,
  ChevronRight,
  Download,
  Info,
  Maximize2,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  createElement,
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePreferences } from "./appContexts";
import { runtimeAppUrl } from "./appConfig";
import { fetchProductsByIds } from "./posokaneiApi";
import { createPriceHistoryChart } from "./priceHistoryChart";
import {
  filterPriceChanges,
  normalizePriceChangesPayload,
  priceHistoryForProduct,
} from "./priceChangesView";

const PRICE_CHANGES_PREVIEW_URL = runtimeAppUrl("data/price-changes-preview.json");
const PRICE_CHANGES_FULL_URL = runtimeAppUrl("data/price-changes.json");
const INITIAL_PRICE_CHANGE_ROWS = 80;
const PRICE_CHANGE_ROW_BATCH = 80;
const PRICE_CHANGES_CACHE_TTL_MS = 5 * 60 * 1000;

let priceChangesPreviewPromise = null;
let priceChangesFullPromise = null;
let priceChangesPreviewRequestedAt = 0;
let priceChangesFullRequestedAt = 0;

const LazyCatalogHealthPage = lazy(() => import("./CatalogHealthPage.jsx"));

export default function SecondaryDataPage({ appBasePath, ui }) {
  const { language } = usePreferences();
  const isCatalogHealthRoute = /\/health\/?$/u.test(window.location.pathname);
  const healthCopy = language === "en"
    ? {
        title: "Catalogue health · Price Basket",
        description: "See the completeness, freshness, and coverage changes of the synchronized PosoKanei catalogue.",
        loading: "Loading catalogue status",
      }
    : {
        title: "Υγεία καταλόγου · Καλάθι Τιμών",
        description: "Δες την πληρότητα, τη φρεσκάδα και τις μεταβολές κάλυψης του συγχρονισμένου καταλόγου PosoKanei.",
        loading: "Φόρτωση κατάστασης καταλόγου",
      };
  useEffect(() => {
    if (!isCatalogHealthRoute) return;
    let active = true;
    const updateMetadata = () => {
      if (!active) return;
      document.title = healthCopy.title;
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", healthCopy.description);
    };
    updateMetadata();
    queueMicrotask(updateMetadata);
    return () => {
      active = false;
    };
  }, [healthCopy.description, healthCopy.title, isCatalogHealthRoute]);

  if (isCatalogHealthRoute) {
    return (
      <Suspense fallback={<div className="changes-status" role="status">{healthCopy.loading}</div>}>
        <LazyCatalogHealthPage appBasePath={appBasePath} ui={ui} />
      </Suspense>
    );
  }
  return <PriceChangesPage appBasePath={appBasePath} ui={ui} />;
}

function PriceChangesPage({ appBasePath, ui }) {
  const {
    AppLink,
    Header,
    ProductPreviewImage,
    ProductThumb,
    formatDataTime,
    formatDateTime,
  } = ui;
  const { locale, money, number, t } = usePreferences();
  const [state, setState] = useState({ status: "loading", data: null });
  const [requestVersion, setRequestVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [retailerId, setRetailerId] = useState("all");
  const [direction, setDirection] = useState("all");
  const [sort, setSort] = useState("recent");
  const [selectedHistoryProductId, setSelectedHistoryProductId] = useState("");
  const [visibleChangeLimit, setVisibleChangeLimit] = useState(INITIAL_PRICE_CHANGE_ROWS);
  const [productDetailsById, setProductDetailsById] = useState({});
  const productDetailsCacheRef = useRef(new Map());
  const completeFeedRequestedRef = useRef(false);

  const loadProductDetails = useCallback((productId) => {
    const cached = productDetailsCacheRef.current.get(productId);
    if (cached && cached.status !== "error") return;

    const loadingEntry = { status: "loading", product: null };
    productDetailsCacheRef.current.set(productId, loadingEntry);
    setProductDetailsById((current) => ({
      ...current,
      [productId]: loadingEntry,
    }));

    fetchProductsByIds([productId], { includeDetails: true })
      .then(([product]) => {
        const nextEntry = {
          status: product ? "ready" : "error",
          product: product || null,
        };
        productDetailsCacheRef.current.set(productId, nextEntry);
        setProductDetailsById((current) => ({
          ...current,
          [productId]: nextEntry,
        }));
      })
      .catch(() => {
        const errorEntry = { status: "error", product: null };
        productDetailsCacheRef.current.set(productId, errorEntry);
        setProductDetailsById((current) => ({
          ...current,
          [productId]: errorEntry,
        }));
      });
  }, []);

  const openPriceHistory = useCallback((productId) => {
    setSelectedHistoryProductId(productId);
    loadProductDetails(productId);
  }, [loadProductDetails]);

  const closePriceHistory = useCallback(() => {
    setSelectedHistoryProductId("");
  }, []);

  const loadCompleteFeed = useCallback(() => {
    if (completeFeedRequestedRef.current) return;
    completeFeedRequestedRef.current = true;
    setState((current) => current.data?.partial
      ? { ...current, status: "loading-more" }
      : current);
    fetchPriceChangesFeed("full")
      .then((raw) => {
        setState({ status: "ready", data: preparePriceChangesData(raw) });
      })
      .catch(() => {
        setState((current) => current.data
          ? { ...current, status: "ready" }
          : { ...current, status: "error" });
      })
      .finally(() => {
        completeFeedRequestedRef.current = false;
      });
  }, []);

  useEffect(() => {
    let active = true;
    if (requestVersion) resetPriceChangesFeedCache();
    setState((current) => ({ ...current, status: "loading" }));
    fetchPriceChangesFeed("preview")
      .then((raw) => {
        if (active) setState({ status: "ready", data: preparePriceChangesData(raw) });
      })
      .catch(() => {
        if (active) setState((current) => ({ ...current, status: "error" }));
      });
    return () => {
      active = false;
    };
  }, [requestVersion]);

  const data = state.data;
  const retailers = data?.retailers || [];
  const usingDefaultFilters = !query.trim()
    && retailerId === "all"
    && direction === "all"
    && sort === "recent";
  const visibleChanges = useMemo(
    () => filterPriceChanges(data?.changes || [], {
      query,
      retailerId,
      direction,
      sort,
    }),
    [data?.changes, direction, query, retailerId, sort],
  );
  const renderedChanges = useMemo(
    () => visibleChanges.slice(0, visibleChangeLimit),
    [visibleChangeLimit, visibleChanges],
  );
  const matchingChangeCount = data?.partial && usingDefaultFilters
    ? data.stats.changes
    : visibleChanges.length;
  const remainingChangeCount = Math.max(0, matchingChangeCount - renderedChanges.length);

  useEffect(() => {
    if (data?.partial && !usingDefaultFilters) loadCompleteFeed();
  }, [data?.partial, loadCompleteFeed, usingDefaultFilters]);

  useEffect(() => {
    setVisibleChangeLimit(INITIAL_PRICE_CHANGE_ROWS);
  }, [data?.generatedAt, direction, query, retailerId, sort]);

  const health = data
    ? {
        state: "cached",
        source: "snapshot",
        activeProducts: data.catalogProducts,
      }
    : {
        state: state.status === "error" ? "offline" : "checking",
        activeProducts: 0,
      };
  const updatedAt = data ? formatDataTime(data.generatedAt, locale, t) : "";
  const selectedHistoryFallbackProduct = useMemo(
    () => data?.changes.find((change) => change.productId === selectedHistoryProductId)?.product || null,
    [data?.changes, selectedHistoryProductId],
  );
  const selectedProductDetail = selectedHistoryProductId
    ? productDetailsById[selectedHistoryProductId]
    : null;
  const selectedHistoryProduct = selectedProductDetail?.product || selectedHistoryFallbackProduct;
  const selectedProductHistory = selectedProductDetail?.product?.priceHistory;
  const selectedHistory = useMemo(() => {
    if (!selectedHistoryProductId || !data) return null;
    if (selectedProductHistory?.retailers?.length) return selectedProductHistory;
    return priceHistoryForProduct(
      data.histories,
      data.changes,
      selectedHistoryProductId,
    );
  }, [data, selectedHistoryProductId, selectedProductHistory]);

  return (
    <div className="app-shell changes-shell">
      <Header health={health} basketCount={0} showBasket={false} />
      <main className="price-changes-page">
        <AppLink className="bargains-back" href={appBasePath}>
          <ArrowLeft size={17} aria-hidden="true" />
          {t("backToBasket")}
        </AppLink>

        <header className="changes-heading">
          <div>
            <span className="changes-eyebrow">
              <ArrowDownUp size={16} aria-hidden="true" />
              {t("priceChangesEyebrow")}
            </span>
            <h1>{t("priceChangesTitle")}</h1>
            <p>{t("priceChangesDescription", { days: number(data?.retentionDays || 7) })}</p>
          </div>
          <div className="changes-heading-actions">
            {updatedAt ? (
              <span className="changes-updated">
                {t("priceChangesUpdated", {
                  time: updatedAt,
                  retailers: number(data?.stats.retailers || 0),
                })}
              </span>
            ) : null}
            <a
              className="text-button changes-download"
              href={runtimeAppUrl("data/price-changes.csv")}
              download="kalathi-timon-price-changes.csv"
            >
              <Download size={16} aria-hidden="true" />
              {t("downloadPriceChanges")}
            </a>
          </div>
        </header>

        {state.status === "loading" && !data ? (
          <div className="changes-status" role="status">
            <RefreshCw size={20} className="spin" aria-hidden="true" />
            {t("priceChangesLoading")}
          </div>
        ) : null}

        {state.status === "error" && !data ? (
          <div className="changes-status error" role="alert">
            <AlertCircle size={20} aria-hidden="true" />
            <span>{t("priceChangesUnavailable")}</span>
            <button type="button" className="text-button" onClick={() => setRequestVersion((value) => value + 1)}>
              <RefreshCw size={15} aria-hidden="true" />
              {t("retryPriceChanges")}
            </button>
          </div>
        ) : null}

        {data ? (
          <>
            <section className="changes-summary" aria-label={t("priceChangesSummary")}>
              <PriceChangeSummary
                icon={<ArrowDownUp size={18} />}
                label={t("recordedChanges")}
                value={number(data.stats.changes)}
              />
              <PriceChangeSummary
                icon={<PackageSearch size={18} />}
                label={t("changedProducts")}
                value={number(data.stats.products)}
              />
              <PriceChangeSummary
                direction="decrease"
                icon={<ArrowDownRight size={18} />}
                label={t("priceDrops")}
                value={number(data.stats.decreases)}
              />
              <PriceChangeSummary
                direction="increase"
                icon={<ArrowUpRight size={18} />}
                label={t("priceRises")}
                value={number(data.stats.increases)}
              />
            </section>

            <section className="changes-controls" aria-label={t("priceChangeFilters")}>
              <label className="changes-field changes-search-field">
                <span>{t("searchChanges")}</span>
                <span className="changes-input">
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    placeholder={t("searchChangesPlaceholder")}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </span>
              </label>

              <label className="changes-field">
                <span>{t("chainColumn")}</span>
                <select value={retailerId} onChange={(event) => setRetailerId(event.target.value)}>
                  <option value="all">{t("allChains")}</option>
                  {retailers.map((retailer) => (
                    <option key={retailer.id} value={retailer.id}>{retailer.name}</option>
                  ))}
                </select>
              </label>

              <div className="changes-field changes-direction-field">
                <span>{t("directionFilter")}</span>
                <div className="changes-segmented" role="group" aria-label={t("directionFilter")}>
                  {[
                    ["all", t("allChanges")],
                    ["decrease", t("priceDrops")],
                    ["increase", t("priceRises")],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={direction === value ? "active" : ""}
                      aria-pressed={direction === value}
                      onClick={() => setDirection(value)}
                    >
                      {value === "decrease" ? <ArrowDownRight size={14} /> : null}
                      {value === "increase" ? <ArrowUpRight size={14} /> : null}
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="changes-field">
                <span>{t("sortChanges")}</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="recent">{t("sortRecentChanges")}</option>
                  <option value="percentage">{t("sortLargestPercentage")}</option>
                  <option value="amount">{t("sortLargestAmount")}</option>
                  <option value="name">{t("sortChangeName")}</option>
                </select>
              </label>
            </section>

            <div className="changes-results-summary" aria-live="polite">
              <strong>{t("visiblePriceChanges", {
                visible: number(visibleChanges.length),
                total: number(data.stats.changes),
              })}</strong>
              <span>{t("priceChangesRetention", { days: number(data.retentionDays || 7) })}</span>
            </div>

            {state.status === "loading-more" ? (
              <div className="changes-progress" role="status">
                <RefreshCw size={15} className="spin" aria-hidden="true" />
                {t("priceChangesLoadingAll")}
              </div>
            ) : null}

            {visibleChanges.length ? (
              <section className="changes-table" aria-label={t("priceChangesTitle")}>
                <div className="changes-table-head" aria-hidden="true">
                  <span>{t("productColumn")}</span>
                  <span>{t("chainColumn")}</span>
                  <span>{t("priceColumn")}</span>
                  <span>{t("movementColumn")}</span>
                  <span>{t("changedColumn")}</span>
                </div>
                <div className="changes-list">
                  {renderedChanges.map((change) => (
                    <PriceChangeRow
                      key={`${change.productId}:${change.retailerId}:${change.changedAt}`}
                      change={change}
                      formatDateTime={formatDateTime}
                      locale={locale}
                      money={money}
                      onOpenHistory={openPriceHistory}
                      ProductThumbComponent={ProductThumb}
                      t={t}
                    />
                  ))}
                </div>
                {remainingChangeCount ? (
                  <button
                    type="button"
                    className="text-button changes-load-more"
                    onClick={() => {
                      setVisibleChangeLimit((current) => current + PRICE_CHANGE_ROW_BATCH);
                      if (data.partial) loadCompleteFeed();
                    }}
                  >
                    <Plus size={16} aria-hidden="true" />
                    {t("loadMorePriceChanges", {
                      count: number(Math.min(PRICE_CHANGE_ROW_BATCH, remainingChangeCount)),
                    })}
                  </button>
                ) : null}
              </section>
            ) : (
              <div className="changes-empty">
                <PackageSearch size={26} aria-hidden="true" />
                <strong>{t("noMatchingPriceChanges")}</strong>
                <span>{t("noMatchingPriceChangesDescription")}</span>
              </div>
            )}
          </>
        ) : null}
      </main>
      {selectedHistory ? (
        <PriceHistoryDialog
          formatDateTime={formatDateTime}
          history={selectedHistory}
          observedUntil={data?.generatedAt}
          ProductPreviewImageComponent={ProductPreviewImage}
          ProductThumbComponent={ProductThumb}
          product={selectedHistoryProduct}
          productLoading={selectedProductDetail?.status === "loading"}
          retentionDays={data?.retentionDays || 7}
          onClose={closePriceHistory}
        />
      ) : null}
    </div>
  );
}

function preparePriceChangesData(raw) {
  const normalized = normalizePriceChangesPayload(raw);
  return {
    ...normalized,
    changes: normalized.changes.map((change) => ({
      ...change,
      product: priceChangeProduct(change),
    })),
  };
}

function resetPriceChangesFeedCache() {
  priceChangesPreviewPromise = null;
  priceChangesFullPromise = null;
  priceChangesPreviewRequestedAt = 0;
  priceChangesFullRequestedAt = 0;
}

function prefetchPriceChangesPreview() {
  return fetchPriceChangesFeed("preview").catch(() => null);
}

function fetchPriceChangesFeed(kind = "preview") {
  const isFull = kind === "full";
  const requestedAt = isFull ? priceChangesFullRequestedAt : priceChangesPreviewRequestedAt;
  const cached = isFull ? priceChangesFullPromise : priceChangesPreviewPromise;
  if (cached && Date.now() - requestedAt < PRICE_CHANGES_CACHE_TTL_MS) return cached;
  if (isFull) priceChangesFullPromise = null;
  else priceChangesPreviewPromise = null;

  const urls = isFull
    ? [PRICE_CHANGES_FULL_URL, runtimeAppUrl("api/price-changes.php")]
    : [PRICE_CHANGES_PREVIEW_URL, PRICE_CHANGES_FULL_URL, runtimeAppUrl("api/price-changes.php")];
  const earlyPreview = !isFull ? window.__priceChangesPreviewPromise : null;
  const promise = (earlyPreview
    ? Promise.resolve(earlyPreview).then((raw) => raw || fetchFirstPriceChangesFeed(urls))
    : fetchFirstPriceChangesFeed(urls))
    .then((raw) => {
      if (!isFull && raw?.partial !== true) {
        priceChangesFullPromise = Promise.resolve(raw);
        priceChangesFullRequestedAt = Date.now();
      }
      return raw;
    })
    .catch((error) => {
      if (isFull) {
        priceChangesFullPromise = null;
        priceChangesFullRequestedAt = 0;
      } else {
        priceChangesPreviewPromise = null;
        priceChangesPreviewRequestedAt = 0;
      }
      throw error;
    });
  if (isFull) {
    priceChangesFullPromise = promise;
    priceChangesFullRequestedAt = Date.now();
  } else {
    priceChangesPreviewPromise = promise;
    priceChangesPreviewRequestedAt = Date.now();
  }
  return promise;
}

async function fetchFirstPriceChangesFeed(urls) {
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "default",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("price_changes_unavailable");
}

function PriceChangeSummary({ direction = "", icon, label, value }) {
  return (
    <div className={`changes-summary-item ${direction}`}>
      <span className="changes-summary-icon" aria-hidden="true">{icon}</span>
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </div>
  );
}

const PriceChangeRow = memo(function PriceChangeRow({
  change,
  formatDateTime,
  locale,
  money,
  onOpenHistory,
  ProductThumbComponent,
  t,
}) {
  const decreased = change.direction === "decrease";
  const exactTime = formatDateTime(new Date(change.changedAt), locale);
  const relativeTime = formatRelativeTime(change.changedAt, locale, t, formatDateTime);
  const signedAmount = `${decreased ? "-" : "+"}${money(Math.abs(change.amount))}`;
  const signedPercentage = `${decreased ? "-" : "+"}${Math.abs(change.percentage).toLocaleString(locale)}%`;

  return (
    <article className={`change-row ${change.direction}`}>
      <button
        type="button"
        className="change-product-cell change-product-button"
        aria-label={t("openPriceHistory", { name: change.productName })}
        onClick={() => onOpenHistory(change.productId)}
      >
        {createElement(ProductThumbComponent, { product: change.product, compact: true })}
        <span>
          <strong>{change.productName}</strong>
          <small>{[change.brand, change.category].filter(Boolean).join(" · ") || t("noBrand")}</small>
          <span className="change-history-hint">
            <ChartLine size={13} aria-hidden="true" />
            {t("viewPriceHistory")}
          </span>
        </span>
      </button>
      <div className="change-cell change-retailer-cell">
        <small className="change-cell-label">{t("chainColumn")}</small>
        <strong>{change.retailerName}</strong>
      </div>
      <div className="change-cell change-price-cell">
        <small className="change-cell-label">{t("priceColumn")}</small>
        <span className="change-price-flow">
          <del>{money(change.previousPrice)}</del>
          <ChevronRight size={15} aria-hidden="true" />
          <strong>{money(change.currentPrice)}</strong>
        </span>
      </div>
      <div className="change-cell change-movement-cell">
        <small className="change-cell-label">{t("movementColumn")}</small>
        <strong>
          {decreased ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
          {signedAmount}
        </strong>
        <span>{signedPercentage}</span>
      </div>
      <time className="change-cell change-time-cell" dateTime={change.changedAt} title={exactTime}>
        <small className="change-cell-label">{t("changedColumn")}</small>
        <strong>{relativeTime}</strong>
        <small>{exactTime}</small>
      </time>
    </article>
  );
});

function PriceHistoryDialog({
  formatDateTime,
  history,
  observedUntil,
  ProductPreviewImageComponent,
  ProductThumbComponent,
  product,
  productLoading,
  retentionDays,
  onClose,
}) {
  const { locale, money, number, t } = usePreferences();
  const closeButtonRef = useRef(null);
  const chartContainerRef = useRef(null);
  const imageCloseButtonRef = useRef(null);
  const imageExpandedRef = useRef(false);
  const imageSurfaceRef = useRef(null);
  const imageTriggerRef = useRef(null);
  const panelRef = useRef(null);
  const [chartDimensions, setChartDimensions] = useState({ width: 900, height: 330 });
  const [imageExpanded, setImageExpanded] = useState(false);
  const chart = useMemo(
    () => createPriceHistoryChart(history, {
      ...chartDimensions,
      observedUntilMs: observedUntil,
    }),
    [chartDimensions, history, observedUntil],
  );
  const displayProduct = useMemo(() => (
    product
      ? { ...product, imageUrl: product.imageUrl || history.imageUrl }
      : {
          id: history.productId,
          name: history.productName,
          imageUrl: history.imageUrl,
        }
  ), [history.imageUrl, history.productId, history.productName, product]);
  const canExpandImage = Boolean(displayProduct.imageUrl && ProductPreviewImageComponent);

  const closeExpandedImage = useCallback(() => {
    setImageExpanded(false);
    window.requestAnimationFrame(() => imageTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    imageExpandedRef.current = imageExpanded;
    if (imageExpanded) imageCloseButtonRef.current?.focus();
  }, [imageExpanded]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return undefined;
    const updateDimensions = () => {
      const width = Math.max(280, Math.round(container.clientWidth || 900));
      const height = width < 620 ? 250 : 330;
      setChartDimensions((current) => (
        current.width === width && current.height === height
          ? current
          : { width, height }
      ));
    };
    const observer = typeof ResizeObserver === "function"
      ? new ResizeObserver(updateDimensions)
      : null;
    updateDimensions();
    observer?.observe(container);
    window.addEventListener("resize", updateDimensions);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateDimensions);
    };
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (imageExpandedRef.current) closeExpandedImage();
        else onClose();
      }
      if (event.key === "Tab") {
        trapDialogFocus(
          imageExpandedRef.current ? imageSurfaceRef.current : panelRef.current,
          event,
        );
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (typeof previousFocus?.focus === "function") previousFocus.focus();
    };
  }, [closeExpandedImage, onClose]);

  const titleId = `price-history-${history.productId}`;
  const chartLabel = t("priceHistoryChartLabel", { name: history.productName });

  return (
    <aside
      className="drawer price-history-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="drawer-backdrop" onClick={onClose} />
      <div ref={panelRef} className="drawer-panel price-history-panel">
        <header className="price-history-head">
          {canExpandImage ? (
            <button
              ref={imageTriggerRef}
              type="button"
              className="price-history-image-trigger"
              aria-label={t("openProductImage", { name: history.productName })}
              title={t("openProductImage", { name: history.productName })}
              onClick={() => setImageExpanded(true)}
            >
              {createElement(ProductThumbComponent, { product: displayProduct })}
              <span className="price-history-image-trigger-icon" aria-hidden="true">
                <Maximize2 size={12} />
              </span>
            </button>
          ) : createElement(ProductThumbComponent, { product: displayProduct })}
          <div className="price-history-heading-copy">
            <span className="changes-eyebrow">
              <ChartLine size={16} aria-hidden="true" />
              {t("priceHistoryTitle")}
            </span>
            <h2 id={titleId}>{history.productName}</h2>
            <p>{t("priceHistoryDescription", { days: number(retentionDays) })}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-button"
            aria-label={t("close")}
            title={t("close")}
            onClick={onClose}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <section
          className={`price-history-product-description${productLoading ? " loading" : ""}`}
          aria-label={t("productDescription")}
        >
          <strong>{t("productDescription")}</strong>
          <p aria-live="polite">
            {productLoading
              ? t("loadingProductDescription")
              : product?.description || t("catalogProduct")}
          </p>
        </section>

        {chart ? (
          <>
            <section
              ref={chartContainerRef}
              className="price-history-chart"
              aria-label={chartLabel}
            >
              <header className="price-history-chart-head">
                <strong>{t("priceHistoryChartHeading")}</strong>
                <time dateTime={observedUntil || undefined}>
                  {t("priceHistoryThrough", {
                    time: formatDateTime(new Date(chart.observedUntilMs), locale),
                  })}
                </time>
              </header>
              <svg
                viewBox={`0 0 ${chart.width} ${chart.height}`}
                role="img"
                aria-label={chartLabel}
                preserveAspectRatio="xMidYMid meet"
              >
                <title>{chartLabel}</title>
                {chart.yTicks.map((tick) => (
                  <g key={tick.y}>
                    <line
                      className="history-grid-line"
                      x1={chart.plot.left}
                      x2={chart.plot.right}
                      y1={tick.y}
                      y2={tick.y}
                    />
                    <text
                      className="history-axis-label"
                      x={chart.plot.left - 10}
                      y={tick.y + 4}
                      textAnchor="end"
                    >
                      {money(tick.price)}
                    </text>
                  </g>
                ))}
                {chart.xTicks.map((tick, index) => (
                  <g key={tick.observedAtMs}>
                    <line
                      className="history-grid-line vertical"
                      x1={tick.x}
                      x2={tick.x}
                      y1={chart.plot.top}
                      y2={chart.plot.bottom}
                    />
                    <text
                      className="history-axis-label"
                      x={tick.x}
                      y={chart.height - 10}
                      textAnchor={index === 0
                        ? "start"
                        : index === chart.xTicks.length - 1
                          ? "end"
                          : "middle"}
                    >
                      {formatHistoryAxisDate(tick.observedAtMs, locale, chart.timeSpanMs)}
                    </text>
                  </g>
                ))}
                {chart.series.map((series) => (
                  <g key={series.retailerId}>
                    <path
                      className="history-series-line"
                      d={series.path}
                      stroke={series.color}
                    />
                    {series.continuationPath ? (
                      <path
                        className="history-series-line current"
                        d={series.continuationPath}
                        stroke={series.color}
                      />
                    ) : null}
                    {series.points.map((point) => (
                      <circle
                        key={`${point.observedAt}:${point.price}`}
                        className="history-series-point"
                        cx={point.x}
                        cy={point.y}
                        r="4"
                        fill={series.color}
                      >
                        <title>
                          {`${series.retailerName}: ${money(point.price)} · ${formatDateTime(new Date(point.observedAtMs), locale)}`}
                        </title>
                      </circle>
                    ))}
                    {series.hasContinuation ? (
                      <circle
                        className="history-series-current-point"
                        cx={series.currentPoint.x}
                        cy={series.currentPoint.y}
                        r="5"
                        fill={series.color}
                      >
                        <title>
                          {`${series.retailerName}: ${money(series.summary.latestPrice)} · ${formatDateTime(new Date(series.currentPoint.observedAtMs), locale)}`}
                        </title>
                      </circle>
                    ) : null}
                  </g>
                ))}
              </svg>
            </section>

            <section className="price-history-series" aria-label={t("priceHistoryChains")}>
              {chart.series.map((series) => (
                <article className="price-history-series-row" key={series.retailerId}>
                  <span
                    className="price-history-swatch"
                    style={{ backgroundColor: series.color }}
                    aria-hidden="true"
                  />
                  <span className="price-history-series-name">
                    <strong>{series.retailerName}</strong>
                    <small>
                      {t("priceHistoryObservations", {
                        count: number(series.summary.observations),
                      })}
                    </small>
                  </span>
                  <span className="price-history-series-values">
                    <strong className="price-history-flow">
                      <span>{money(series.summary.firstPrice)}</span>
                      <ChevronRight size={13} aria-hidden="true" />
                      <span>{money(series.summary.latestPrice)}</span>
                    </strong>
                    <HistoryChangeSummary
                      locale={locale}
                      money={money}
                      summary={series.summary}
                      t={t}
                    />
                  </span>
                </article>
              ))}
            </section>
          </>
        ) : (
          <div className="changes-empty price-history-empty">
            <ChartLine size={28} aria-hidden="true" />
            <strong>{t("priceHistoryUnavailable")}</strong>
          </div>
        )}

        <p className="price-history-footnote">
          <Info size={15} aria-hidden="true" />
          <span>{t("priceHistoryFootnote")}</span>
        </p>
      </div>

      {imageExpanded && canExpandImage ? (
        <div className="price-history-image-preview" role="group" aria-label={t("expandedProductImage", { name: history.productName })}>
          <div className="price-history-image-backdrop" onClick={closeExpandedImage} />
          <section ref={imageSurfaceRef} className="price-history-image-surface">
            <header>
              <strong>{history.productName}</strong>
              <button
                ref={imageCloseButtonRef}
                type="button"
                className="icon-button"
                aria-label={t("close")}
                title={t("close")}
                onClick={closeExpandedImage}
              >
                <X size={19} aria-hidden="true" />
              </button>
            </header>
            {createElement(ProductPreviewImageComponent, {
              product: displayProduct,
              size: 960,
              className: "price-history-large-image",
            })}
          </section>
        </div>
      ) : null}
    </aside>
  );
}

function trapDialogFocus(container, event) {
  if (!container) return;
  const focusable = [...container.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function HistoryChangeSummary({ locale, money, summary, t }) {
  if (summary.direction === "same") {
    return <small className="price-history-change same">{t("priceHistoryUnchanged")}</small>;
  }
  const decreased = summary.direction === "decrease";
  const Icon = decreased ? ArrowDownRight : ArrowUpRight;
  const amount = `${decreased ? "−" : "+"}${money(Math.abs(summary.delta))}`;
  const percentage = `${decreased ? "−" : "+"}${formatHistoryPercentage(Math.abs(summary.percentage), locale)}%`;
  return (
    <small className={`price-history-change ${summary.direction}`}>
      <Icon size={12} aria-hidden="true" />
      {t("priceHistoryTotalChange", { amount, percentage })}
    </small>
  );
}

function formatHistoryAxisDate(timestamp, locale, timeSpanMs) {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      ...(timeSpanMs < 48 * 60 * 60 * 1000
        ? { hour: "2-digit", minute: "2-digit" }
        : {}),
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

function formatHistoryPercentage(value, locale) {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  } catch {
    return String(Math.round(value * 10) / 10);
  }
}

function priceChangeProduct(change) {
  const words = change.productName.split(/\s+/).filter(Boolean).slice(0, 2);
  const tile = words.map((word) => word[0]).join("").toLocaleLowerCase("el-GR") || "?";
  return {
    id: change.productId,
    name: change.productName,
    brand: change.brand,
    imageUrl: change.imageUrl,
    tile,
    tint: change.direction === "decrease" ? "#d1fae5" : "#fee2e2",
  };
}

function formatRelativeTime(value, locale, t, formatDateTime) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return t("unknown");
  const difference = timestamp - Date.now();
  const absolute = Math.abs(difference);
  const units = absolute >= 24 * 60 * 60 * 1000
    ? ["day", 24 * 60 * 60 * 1000]
    : absolute >= 60 * 60 * 1000
      ? ["hour", 60 * 60 * 1000]
      : ["minute", 60 * 1000];
  const amount = Math.round(difference / units[1]);
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(amount, units[0]);
  } catch {
    return formatDateTime(new Date(timestamp), locale);
  }
}

PriceChangesPage.preload = prefetchPriceChangesPreview;
SecondaryDataPage.preload = prefetchPriceChangesPreview;
