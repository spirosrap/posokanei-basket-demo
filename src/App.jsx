import {
  AlertCircle,
  ArrowLeft,
  ArrowDownUp,
  Barcode,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Copy,
  Github,
  Info,
  Link2,
  MapPin,
  Minus,
  Navigation,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Store,
  Tag,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCategories,
  fetchDailyBargain,
  fetchHealth,
  fetchProducts,
  fetchProductsByIds,
  fetchRetailers,
  fetchUpdateStatus,
} from "./posokaneiApi";
import {
  DEFAULT_DEMO_BASKET,
  DEFAULT_DEMO_PRODUCT_IDS,
  DEFAULT_DEMO_PRODUCTS,
  LEGACY_DEMO_BASKETS,
} from "./demoBasket";
import {
  calculateRankings,
  calculateVisitPlan,
  formatEuro,
  getBestProductPrice,
  getProductPrice,
} from "./pricing";
import {
  buildRetailerProximity,
  fetchNearbySupermarkets,
  formatDistance,
  getBrowserLocation,
  mapsSearchUrl,
} from "./locationStores";
import { formatPlanText } from "./planText";
import { buildSharedBasketUrl, readSharedBasketUrl, SHARED_BASKET_PARAM } from "./shareBasket";

const BASKET_KEY = "posokanei-basket";
const LIVE_BASKET_PRODUCTS_KEY = "posokanei-live-basket-products";
const RETAILER_FILTER_KEY = "posokanei-retailer-filter";
const REPOSITORY_URL = "https://github.com/spirosrap/posokanei-basket-demo";
const APP_VERSION = import.meta.env.PACKAGE_VERSION || "dev";
const APP_BASE_PATH = import.meta.env.BASE_URL;
const BARGAINS_PATH = `${APP_BASE_PATH}bargains/`;
const IS_BARGAINS_PAGE = window.location.pathname.replace(/\/+$/, "").endsWith("/bargains");
const INITIAL_SHARED_BASKET = IS_BARGAINS_PAGE
  ? null
  : readSharedBasketUrl(window.location.href);
const IMAGE_PROXY_BASE = import.meta.env.DEV
  ? "https://agenticspiros.com/demo/posokanei-basket/api/posokanei.php"
  : `${APP_BASE_PATH}api/posokanei.php`;

const RETAILER_LOGO_FALLBACKS = {
  ab_vasilopoulos: ["https://static.ab.gr/static/next/images/logo_header_ab_gr.svg"],
  galaxias: ["https://el.wikipedia.org/wiki/Special:Redirect/file/Galaxias_Logo.png"],
  kritikos: ["https://www.kritikos-sm.gr/assets/kritikos/logo.svg"],
  sklavenitis: ["https://upload.wikimedia.org/wikipedia/commons/c/c8/Sklavenitis_Logo.svg"],
  synka: ["https://www.synka-sm.gr/wp-content/uploads/2026/02/logopng.png"],
};

const basketsMatch = (basket, referenceBasket) => {
  if (!Array.isArray(basket) || basket.length !== referenceBasket.length) return false;
  const quantities = new Map(basket.map((entry) => [entry.productId, entry.quantity]));
  return referenceBasket.every((entry) => quantities.get(entry.productId) === entry.quantity);
};

const isKnownDemoBasket = (basket) =>
  basketsMatch(basket, DEFAULT_DEMO_BASKET) ||
  LEGACY_DEMO_BASKETS.some((legacyBasket) => basketsMatch(basket, legacyBasket));

const shouldStartWithDemoBasket = () => {
  try {
    const stored = localStorage.getItem(BASKET_KEY);
    if (stored === null) return true;
    const parsed = JSON.parse(stored);
    return !Array.isArray(parsed) || parsed.length === 0 || isKnownDemoBasket(parsed);
  } catch {
    return true;
  }
};

const mergeDefaultProducts = (products) => {
  const byId = new Map(DEFAULT_DEMO_PRODUCTS.map((product) => [product.id, product]));
  products.forEach((product) => {
    if (product?.id) byId.set(product.id, product);
  });
  return [...byId.values()];
};

const saveLocalJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Safari private/strict storage modes can throw on writes. Keep the app usable.
  }
};

const savedBasket = () => {
  try {
    const stored = localStorage.getItem(BASKET_KEY);
    if (stored === null) return DEFAULT_DEMO_BASKET;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_DEMO_BASKET;
    if (isKnownDemoBasket(parsed)) return DEFAULT_DEMO_BASKET;
    return parsed;
  } catch {
    return DEFAULT_DEMO_BASKET;
  }
};

const savedLiveBasketProducts = () => {
  try {
    const stored = localStorage.getItem(LIVE_BASKET_PRODUCTS_KEY);
    const parsed = JSON.parse(stored || "[]");
    const products = Array.isArray(parsed) ? parsed.filter((product) => product?.id) : [];
    return shouldStartWithDemoBasket() ? mergeDefaultProducts(products) : products;
  } catch {
    return DEFAULT_DEMO_PRODUCTS;
  }
};

const savedRetailerFilter = () => {
  try {
    const stored = localStorage.getItem(RETAILER_FILTER_KEY);
    if (stored === null) return null;
    const parsed = JSON.parse(stored);
    if (parsed === null) return null;
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 30) return null;
    const retailerIds = [...new Set(parsed.map((id) => String(id).trim()))].filter((id) =>
      /^[a-zA-Z0-9_-]{1,120}$/.test(id),
    );
    return retailerIds.length ? retailerIds : null;
  } catch {
    return null;
  }
};

const removeSharedBasketParam = () => {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SHARED_BASKET_PARAM)) return;
  url.searchParams.delete(SHARED_BASKET_PARAM);
  window.history.replaceState({}, "", url.toString());
};

const copyText = async (value) => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("copy_failed");
  }
};

function App() {
  const [basket, setBasket] = useState(() =>
    INITIAL_SHARED_BASKET?.status === "valid"
      ? INITIAL_SHARED_BASKET.basket
      : savedBasket(),
  );
  const [liveBasketProducts, setLiveBasketProducts] = useState(savedLiveBasketProducts);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [health, setHealth] = useState({ state: "checking", label: "Σύνδεση με κατάλογο" });
  const [updateStatus, setUpdateStatus] = useState(null);
  const [dailyBargain, setDailyBargain] = useState(null);
  const [dailyBargainState, setDailyBargainState] = useState("loading");
  const [liveProducts, setLiveProducts] = useState([]);
  const [liveRetailers, setLiveRetailers] = useState([]);
  const [liveCategories, setLiveCategories] = useState([]);
  const [liveMeta, setLiveMeta] = useState({
    total: 0,
    page: 1,
    totalPages: 1,
    hasNext: false,
    activeProducts: 0,
  });
  const [liveState, setLiveState] = useState("idle");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [maxChains, setMaxChains] = useState(() =>
    INITIAL_SHARED_BASKET?.status === "valid"
      ? INITIAL_SHARED_BASKET.maxChains
      : shouldStartWithDemoBasket()
        ? 4
        : 1,
  );
  const [sharedBasketHydrating, setSharedBasketHydrating] = useState(
    INITIAL_SHARED_BASKET?.status === "valid",
  );
  const [sharedBasketStatus, setSharedBasketStatus] = useState(() => {
    if (INITIAL_SHARED_BASKET?.status === "invalid") return { status: "error" };
    if (INITIAL_SHARED_BASKET?.status === "valid") return { status: "loading" };
    return null;
  });
  const [shareUrl, setShareUrl] = useState("");
  const [retailerFilterIds, setRetailerFilterIds] = useState(() =>
    INITIAL_SHARED_BASKET?.status === "valid"
      ? INITIAL_SHARED_BASKET.retailerIds
      : savedRetailerFilter(),
  );
  const [locationRadiusKm, setLocationRadiusKm] = useState(2);
  const [locationState, setLocationState] = useState({
    status: "idle",
    position: null,
    stores: [],
    checkedAt: "",
    error: "",
  });
  const refreshedDemoProducts = useRef(false);

  useEffect(() => {
    if (!sharedBasketHydrating) saveLocalJson(BASKET_KEY, basket);
  }, [basket, sharedBasketHydrating]);

  useEffect(() => {
    saveLocalJson(LIVE_BASKET_PRODUCTS_KEY, liveBasketProducts);
  }, [liveBasketProducts]);

  useEffect(() => {
    saveLocalJson(RETAILER_FILTER_KEY, retailerFilterIds);
  }, [retailerFilterIds]);

  useEffect(() => {
    if (!INITIAL_SHARED_BASKET) return undefined;
    if (INITIAL_SHARED_BASKET.status === "invalid") {
      removeSharedBasketParam();
      return undefined;
    }

    let cancelled = false;
    const requestedBasket = INITIAL_SHARED_BASKET.basket;
    fetchProductsByIds(requestedBasket.map((entry) => entry.productId))
      .then((products) => {
        if (cancelled) return;
        const foundIds = new Set(products.map((product) => product.id));
        const availableBasket = requestedBasket.filter((entry) => foundIds.has(entry.productId));
        const missingCount = requestedBasket.length - availableBasket.length;

        if (!availableBasket.length) {
          setBasket(savedBasket());
          setSharedBasketStatus({ status: "error" });
        } else {
          setLiveBasketProducts((current) => mergeCatalogProducts(current, products));
          setBasket(availableBasket);
          setSharedBasketStatus({
            status: missingCount ? "partial" : "ready",
            productCount: availableBasket.length,
            missingCount,
            maxChains: INITIAL_SHARED_BASKET.maxChains,
            retailerCount: INITIAL_SHARED_BASKET.retailerIds?.length ?? null,
          });
        }

        setSharedBasketHydrating(false);
        removeSharedBasketParam();
      })
      .catch(() => {
        if (cancelled) return;
        setBasket(savedBasket());
        setSharedBasketStatus({ status: "error" });
        setSharedBasketHydrating(false);
        removeSharedBasketParam();
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setHealth({ state: "checking", label: "Έλεγχος live API" });
    Promise.all([
      fetchHealth(),
      fetchRetailers(),
      fetchCategories(),
      fetchUpdateStatus().catch(() => null),
    ])
      .then(([stats, fetchedRetailers, fetchedCategories, fetchedUpdateStatus]) => {
        if (cancelled) return;
        setLiveRetailers(fetchedRetailers);
        setLiveCategories(fetchedCategories);
        setLiveMeta((current) => ({
          ...current,
          activeProducts: stats.activeProducts,
          total: current.total || stats.activeProducts,
        }));
        setHealth({
          state: stats.source === "snapshot" ? "cached" : "online",
          source: stats.source,
          snapshotGeneratedAt: stats.snapshotGeneratedAt,
          liveError: stats.liveError,
          label:
            stats.source === "snapshot"
              ? `Κατάλογος · ${stats.activeProducts.toLocaleString("el-GR")} προϊόντα`
              : `${stats.activeProducts.toLocaleString("el-GR")} live προϊόντα`,
        });
        setUpdateStatus(fetchedUpdateStatus);
      })
      .catch(() => {
        if (!cancelled) setHealth({ state: "offline", label: "Ο κατάλογος δεν απαντά" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchDailyBargain()
      .then((pick) => {
        if (cancelled) return;
        setDailyBargain(pick);
        setDailyBargainState("ready");
        setLiveBasketProducts((current) =>
          mergeCatalogProducts(
            current,
            pick.bargains.map((item) => item.product),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setDailyBargainState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLiveState("loading");
    const timer = window.setTimeout(() => {
      fetchProducts({ query, categoryId, page: 1 })
        .then((result) => {
          if (cancelled) return;
          setLiveProducts(result.products);
          setLiveMeta((current) => ({
            ...current,
            total: result.total,
            page: result.page,
            totalPages: result.totalPages,
            hasNext: result.hasNext,
            source: result.source,
          }));
          setLiveState(result.products.length ? "ready" : "empty");
        })
        .catch(() => {
          if (cancelled) return;
          setLiveProducts([]);
          setLiveState("error");
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [categoryId, query]);

  const allProducts = useMemo(() => {
    const byId = new Map();
    liveBasketProducts.forEach((product) => byId.set(product.id, product));
    liveProducts.forEach((product) => byId.set(product.id, product));
    return [...byId.values()];
  }, [liveBasketProducts, liveProducts]);

  const displayProducts = useMemo(() => {
    return liveProducts;
  }, [liveProducts]);

  const categories = useMemo(() => {
    return [
      { id: "all", name: "Όλα", count: liveMeta.activeProducts || liveMeta.total },
      ...liveCategories.slice(0, 80),
    ];
  }, [liveCategories, liveMeta.activeProducts, liveMeta.total]);

  const activeRetailers = useMemo(() => {
    if (retailerFilterIds === null) return liveRetailers;
    const selectedIds = new Set(retailerFilterIds);
    return liveRetailers.filter((retailer) => selectedIds.has(retailer.id));
  }, [liveRetailers, retailerFilterIds]);
  const retailerProximity = useMemo(
    () => buildRetailerProximity(liveRetailers, locationState.stores),
    [liveRetailers, locationState.stores],
  );
  const nearbyRetailerIds = useMemo(
    () =>
      liveRetailers
        .filter((retailer) => retailerProximity[retailer.id]?.stores?.length)
        .map((retailer) => retailer.id),
    [liveRetailers, retailerProximity],
  );

  const productMap = useMemo(
    () => new Map(allProducts.map((product) => [product.id, product])),
    [allProducts],
  );
  const isDemoBasket = useMemo(() => basketsMatch(basket, DEFAULT_DEMO_BASKET), [basket]);

  useEffect(() => {
    if (!liveRetailers.length || retailerFilterIds === null) return;
    const availableIds = new Set(liveRetailers.map((retailer) => retailer.id));
    const validIds = retailerFilterIds.filter((id) => availableIds.has(id));
    if (!validIds.length || validIds.length === liveRetailers.length) {
      setRetailerFilterIds(null);
    } else if (validIds.length !== retailerFilterIds.length) {
      setRetailerFilterIds(validIds);
    }
  }, [liveRetailers, retailerFilterIds]);

  useEffect(() => {
    if (refreshedDemoProducts.current) return undefined;
    if (!basket.some((entry) => DEFAULT_DEMO_PRODUCT_IDS.includes(entry.productId))) {
      return undefined;
    }

    let cancelled = false;
    refreshedDemoProducts.current = true;
    fetchProductsByIds(DEFAULT_DEMO_PRODUCT_IDS)
      .then((products) => {
        if (!cancelled && products.length) {
          setLiveBasketProducts((current) => mergeCatalogProducts(current, products));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [basket]);

  useEffect(() => {
    if (sharedBasketHydrating) return;
    setBasket((current) => {
      const next = current.filter((entry) => productMap.has(entry.productId));
      return next.length === current.length ? current : next;
    });
  }, [productMap, sharedBasketHydrating]);

  const rankings = useMemo(
    () => calculateRankings(basket, allProducts, activeRetailers),
    [activeRetailers, allProducts, basket],
  );

  const bestCompleteRanking = useMemo(
    () => rankings.find((row) => row.isComplete) ?? null,
    [rankings],
  );

  const visitPlan = useMemo(
    () => calculateVisitPlan(basket, allProducts, activeRetailers, maxChains),
    [activeRetailers, allProducts, basket, maxChains],
  );

  const addToBasket = (product) => {
    rememberCatalogProduct(product, setLiveBasketProducts);
    setBasket((current) => {
      const found = current.find((entry) => entry.productId === product.id);
      if (found) {
        return current.map((entry) =>
          entry.productId === product.id
            ? { ...entry, quantity: roundQuantity(entry.quantity + quantityStep(product)) }
            : entry,
        );
      }
      return [...current, { productId: product.id, quantity: quantityStep(product) }];
    });
    setSelectedProduct(product);
  };

  const updateQuantity = (product, nextQuantity) => {
    const quantity = Math.max(0, roundQuantity(nextQuantity));
    setBasket((current) =>
      quantity === 0
        ? current.filter((entry) => entry.productId !== product.id)
        : current.map((entry) =>
            entry.productId === product.id ? { ...entry, quantity } : entry,
          ),
    );
  };

  const clearBasket = () => {
    setBasket([]);
    setMaxChains(1);
    setSharedBasketStatus(null);
  };

  const loadDemoBasket = () => {
    setLiveBasketProducts((current) => mergeCatalogProducts(current, DEFAULT_DEMO_PRODUCTS));
    setBasket(DEFAULT_DEMO_BASKET);
    setMaxChains(4);
    setSharedBasketStatus(null);
    refreshedDemoProducts.current = false;
  };

  const openShareBasket = () => {
    if (!basket.length) return;
    const baseUrl = new URL(APP_BASE_PATH, window.location.origin).toString();
    setShareUrl(buildSharedBasketUrl(baseUrl, basket, maxChains, retailerFilterIds));
  };

  const copyBasket = async () => {
    const lines = basket.map((entry) => {
      const product = productMap.get(entry.productId);
      return `${entry.quantity} x ${product?.name ?? entry.productId}`;
    });
    await copyText(lines.join("\n"));
  };

  const loadMoreLiveProducts = () => {
    if (!liveMeta.hasNext || liveState === "loading_more") return;
    const nextPage = liveMeta.page + 1;
    setLiveState("loading_more");
    fetchProducts({ query, categoryId, page: nextPage })
      .then((result) => {
        setLiveProducts((current) => {
          const byId = new Map(current.map((product) => [product.id, product]));
          result.products.forEach((product) => byId.set(product.id, product));
          return [...byId.values()];
        });
        setLiveMeta((current) => ({
          ...current,
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          hasNext: result.hasNext,
          source: result.source,
        }));
        setLiveState("ready");
      })
      .catch(() => setLiveState("error"));
  };

  const loadNearbyStores = async (radiusKm = locationRadiusKm, knownPosition = null) => {
    setLocationState((current) => ({
      ...current,
      status: knownPosition ? "loading" : "locating",
      error: "",
    }));

    try {
      const position = knownPosition || (await getBrowserLocation());
      setLocationState((current) => ({
        ...current,
        position,
        status: "loading",
        error: "",
      }));
      const stores = await fetchNearbySupermarkets(position, radiusKm);
      setLocationState({
        status: "ready",
        position,
        stores,
        checkedAt: new Date().toISOString(),
        error: "",
      });
    } catch (error) {
      const message = String(error?.message || error);
      setLocationState((current) => ({
        ...current,
        status: message === "geolocation_denied" ? "denied" : "error",
        error: message,
      }));
    }
  };

  const changeLocationRadius = (nextRadiusKm) => {
    setLocationRadiusKm(nextRadiusKm);
    if (locationState.position) {
      void loadNearbyStores(nextRadiusKm, locationState.position);
    }
  };

  const clearLocation = () => {
    setLocationState({
      status: "idle",
      position: null,
      stores: [],
      checkedAt: "",
      error: "",
    });
  };

  const toggleRetailerFilter = (retailerId) => {
    setRetailerFilterIds((current) => {
      const allIds = liveRetailers.map((retailer) => retailer.id);
      const selectedIds = new Set(current === null ? allIds : current);
      if (selectedIds.has(retailerId)) {
        if (selectedIds.size === 1) return current;
        selectedIds.delete(retailerId);
      } else {
        selectedIds.add(retailerId);
      }
      const next = allIds.filter((id) => selectedIds.has(id));
      return next.length === allIds.length ? null : next;
    });
  };

  const selectNearbyRetailers = () => {
    if (!nearbyRetailerIds.length) return;
    setRetailerFilterIds(
      nearbyRetailerIds.length === liveRetailers.length ? null : nearbyRetailerIds,
    );
  };

  if (IS_BARGAINS_PAGE) {
    return (
      <div className="app-shell bargains-shell">
        <Header health={health} basketCount={basket.length} />
        <BargainsPage
          pick={dailyBargain}
          state={dailyBargainState}
          retailers={liveRetailers}
          onSelect={setSelectedProduct}
          onAdd={addToBasket}
        />
        {selectedProduct ? (
          <ProductDrawer
            product={selectedProduct}
            retailers={liveRetailers}
            onClose={() => setSelectedProduct(null)}
            onAdd={() => addToBasket(selectedProduct)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header
        health={health}
        basketCount={basket.length}
      />

      <AppIntro health={health} updateStatus={updateStatus} />
      <DataFreshnessNotice health={health} updateStatus={updateStatus} />

      {dailyBargain ? (
        <DailyBargain
          pick={dailyBargain}
          retailers={liveRetailers}
          onSelect={() => setSelectedProduct(dailyBargain.product)}
          onAdd={() => addToBasket(dailyBargain.product)}
          moreHref={BARGAINS_PATH}
        />
      ) : null}

      <main className="workspace" aria-label="Εφαρμογή σύγκρισης καλαθιού">
        <SearchPanel
          query={query}
          setQuery={setQuery}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          categories={categories}
          products={displayProducts}
          catalogSource={liveMeta.source || health.source}
          liveState={liveState}
          liveMeta={liveMeta}
          selectedProduct={selectedProduct}
          onSelect={setSelectedProduct}
          onAdd={addToBasket}
          onLoadMore={loadMoreLiveProducts}
        />

        <BasketPanel
          basket={basket}
          productMap={productMap}
          rankings={rankings}
          bestCompleteRanking={bestCompleteRanking}
          visitPlan={visitPlan}
          maxChains={maxChains}
          isDemoBasket={isDemoBasket}
          onQuantity={updateQuantity}
          onClear={clearBasket}
          onCopy={copyBasket}
          onShare={openShareBasket}
          onLoadDemo={loadDemoBasket}
          onSelect={setSelectedProduct}
          sharedBasketStatus={sharedBasketStatus}
        />

        <RankingsPanel
          rankings={rankings}
          bestCompleteRanking={bestCompleteRanking}
          visitPlan={visitPlan}
          maxChains={maxChains}
          setMaxChains={setMaxChains}
          basketSize={basket.length}
          locationState={locationState}
          locationRadiusKm={locationRadiusKm}
          retailerProximity={retailerProximity}
          retailers={liveRetailers}
          retailerFilterIds={retailerFilterIds}
          nearbyRetailerIds={nearbyRetailerIds}
          onRequestLocation={() => loadNearbyStores()}
          onChangeLocationRadius={changeLocationRadius}
          onClearLocation={clearLocation}
          onToggleRetailer={toggleRetailerFilter}
          onSelectAllRetailers={() => setRetailerFilterIds(null)}
          onSelectNearbyRetailers={selectNearbyRetailers}
        />
      </main>

      {selectedProduct ? (
        <ProductDrawer
          product={selectedProduct}
          retailers={liveRetailers}
          onClose={() => setSelectedProduct(null)}
          onAdd={() => addToBasket(selectedProduct)}
        />
      ) : null}

      {shareUrl ? (
        <ShareBasketDialog
          url={shareUrl}
          basketCount={basket.length}
          maxChains={maxChains}
          retailerCount={activeRetailers.length}
          hasRetailerFilter={retailerFilterIds !== null}
          onClose={() => setShareUrl("")}
        />
      ) : null}
    </div>
  );
}

function DailyBargain({ pick, retailers, onSelect, onAdd, moreHref }) {
  const retailer = retailers.find((item) => item.id === pick.evidence.bestRetailerId);
  const updated = formatDataTime(pick.generatedAt);
  return (
    <section className="daily-bargain" aria-labelledby="daily-bargain-title">
      <button type="button" className="daily-bargain-product" onClick={onSelect}>
        <ProductThumb product={pick.product} />
        <span className="daily-bargain-copy">
          <small className="daily-bargain-label">
            <Sparkles size={14} aria-hidden="true" />
            Η ευκαιρία της ημέρας
          </small>
          <strong id="daily-bargain-title">{pick.headline}</strong>
          <span>{pick.product.name}</span>
        </span>
      </button>

      <div className="daily-bargain-reason">
        <p>{pick.reason}</p>
        <small>Επιλογή με AI από δημόσια στοιχεία τιμών · {updated}</small>
      </div>

      <div className="daily-bargain-price">
        {retailer ? <RetailerLogo retailer={retailer} ariaHidden /> : null}
        <span>
          <strong>{formatEuro(pick.evidence.bestPrice)}</strong>
          <small>{pick.evidence.bestRetailerName}</small>
        </span>
        <span className="daily-saving">
          <b>{Math.round(pick.evidence.savingsPercentVsHighest)}% φθηνότερα</b>
          <small>
            {formatEuro(pick.evidence.savingsVsHighest)} κάτω από την υψηλότερη τιμή
          </small>
        </span>
      </div>

      <div className="daily-bargain-actions">
        <button type="button" className="text-button" onClick={onSelect}>
          <Info size={16} />
          Λεπτομέρειες
        </button>
        <a className="text-button bargains-button" href={moreHref}>
          <Sparkles size={16} />
          Περισσότερες ευκαιρίες
          <ChevronRight size={15} />
        </a>
        <button type="button" className="text-button primary-button" onClick={onAdd}>
          <Plus size={17} />
          Στο καλάθι
        </button>
      </div>
    </section>
  );
}

function BargainsPage({ pick, state, retailers, onSelect, onAdd }) {
  const bargains = pick?.bargains || [];
  const updated = formatDataTime(pick?.generatedAt);

  return (
    <main className="bargains-page">
      <a className="bargains-back" href={APP_BASE_PATH}>
        <ArrowLeft size={17} />
        Πίσω στο καλάθι
      </a>

      <header className="bargains-heading">
        <div>
          <span className="bargains-eyebrow">
            <Sparkles size={16} />
            Καθημερινές επιλογές
          </span>
          <h1>Ευκαιρίες που ξεχωρίζουν σήμερα</h1>
          <p>Μεγάλες διαφορές τιμής για το ίδιο προϊόν ανάμεσα σε αλυσίδες supermarket.</p>
        </div>
        {updated ? (
          <span className="bargains-updated">
            {bargains.length.toLocaleString("el-GR")} επιλογές · {updated}
          </span>
        ) : null}
      </header>

      {state === "loading" ? (
        <div className="bargains-status" role="status">
          <RefreshCw size={20} className="spin" />
          Φόρτωση σημερινών επιλογών…
        </div>
      ) : null}

      {state === "error" ? (
        <div className="bargains-status error" role="alert">
          <AlertCircle size={20} />
          Οι σημερινές επιλογές δεν είναι διαθέσιμες αυτή τη στιγμή.
        </div>
      ) : null}

      {bargains.length ? (
        <section className="bargains-grid" aria-label="Σημερινές ευκαιρίες προϊόντων">
          {bargains.map((bargain, index) => {
            const retailer = retailers.find(
              (item) => item.id === bargain.evidence.bestRetailerId,
            );
            return (
              <article className="bargain-card" key={bargain.productId}>
                <button
                  type="button"
                  className="bargain-card-product"
                  onClick={() => onSelect(bargain.product)}
                >
                  <ProductThumb product={bargain.product} />
                  <span className="bargain-card-copy">
                    <small>{index === 0 ? "Επιλογή ημέρας" : `Ευκαιρία ${index + 1}`}</small>
                    <strong>{bargain.headline}</strong>
                    <span>{bargain.product.name}</span>
                  </span>
                </button>

                <div className="bargain-card-price">
                  <span className="bargain-card-chain">
                    {retailer ? <RetailerLogo retailer={retailer} ariaHidden /> : null}
                    <span>
                      <strong>{formatEuro(bargain.evidence.bestPrice)}</strong>
                      <small>{bargain.evidence.bestRetailerName}</small>
                    </span>
                  </span>
                  <span className="bargain-card-saving">
                    <strong>{Math.round(bargain.evidence.savingsPercentVsHighest)}%</strong>
                    <small>φθηνότερα</small>
                  </span>
                </div>

                <p className="bargain-card-reason">{bargain.reason}</p>

                <div className="bargain-card-meta">
                  <span>{bargain.evidence.retailerCount} αλυσίδες</span>
                  <span>
                    {formatEuro(bargain.evidence.savingsVsHighest)} κάτω από την υψηλότερη
                  </span>
                </div>

                <div className="bargain-card-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onSelect(bargain.product)}
                  >
                    <Info size={16} />
                    Λεπτομέρειες
                  </button>
                  <button
                    type="button"
                    className="text-button primary-button"
                    onClick={() => onAdd(bargain.product)}
                  >
                    <Plus size={17} />
                    Στο καλάθι
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {bargains.length ? (
        <p className="bargains-footnote">
          Οι διαφορές συγκρίνουν τρέχουσες τιμές μεταξύ αλυσίδων και δεν αποτελούν
          ιστορική έκπτωση.
        </p>
      ) : null}
    </main>
  );
}

function Header({ health, basketCount }) {
  const isOnline = health.state === "online";
  const isCached = health.state === "cached";
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Agentic Spiros home">
        <span className="brand-mark">
          <ShoppingBasket size={21} aria-hidden="true" />
        </span>
        <span>
          <strong>Καλάθι Τιμών Supermarket</strong>
          <small>Φθηνότερο πλάνο για τα ψώνια σου</small>
        </span>
      </a>

      <div className="topbar-actions">
        <a
          className="repo-link"
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          title="Άνοιγμα κώδικα στο GitHub"
          aria-label="Άνοιγμα του αποθετηρίου στο GitHub"
        >
          <Github size={16} aria-hidden="true" />
          <span>GitHub</span>
        </a>
        <span className="version-badge" title="Έκδοση εφαρμογής">
          <Tag size={14} aria-hidden="true" />
          v{APP_VERSION}
        </span>
        <div
          className={`source-status ${isOnline ? "online" : isCached ? "cached" : "offline"}`}
          title="Κατάσταση API PosoKanei"
        >
          {isOnline ? <Wifi size={16} /> : isCached ? <AlertCircle size={16} /> : <WifiOff size={16} />}
          <span>{health.label}</span>
        </div>
        <div className="basket-pill" title="Προϊόντα στο καλάθι">
          <ShoppingBasket size={16} />
          <span>{basketCount.toLocaleString("el-GR")}</span>
        </div>
      </div>
    </header>
  );
}

function AppIntro({ health, updateStatus }) {
  const refreshFailed = updateStatus?.refreshStatus === "failed";
  const showIntroTimestamp = health.source !== "snapshot";
  return (
    <section className="app-intro" aria-label="Σκοπός εφαρμογής">
      <div>
        <h1>Βρες πού σε συμφέρει να αγοράσεις το καλάθι σου</h1>
        <p>
          Πρόσθεσε τα προϊόντα σου, διάλεξε αν θέλεις 1, 2, 3 ή 4 στάσεις, και
          βλέπεις το φθηνότερο πλάνο ανά αλυσίδα supermarket.
        </p>
      </div>
      <div className="intro-facts" aria-label="Κατάσταση δεδομένων">
        <span>
          {refreshFailed
            ? "Η τελευταία προσπάθεια απέτυχε"
            : health.source === "snapshot"
            ? "Ενημέρωση κάθε ώρα"
            : health.state === "online"
              ? "Live τιμές προϊόντων"
              : "Αναμονή live τιμών"}
        </span>
        {showIntroTimestamp ? <span>{formatUpdateStatus(updateStatus)}</span> : null}
      </div>
    </section>
  );
}

function DataFreshnessNotice({ health, updateStatus }) {
  if (health.source !== "snapshot") return null;
  const snapshotTime = formatDataTime(
    updateStatus?.snapshotGeneratedAt || health.snapshotGeneratedAt || updateStatus?.lastSuccessfulRefreshAt,
  );
  const refreshAttemptTime = formatDataTime(updateStatus?.refreshCheckedAt);
  const refreshFailed = updateStatus?.refreshStatus === "failed";
  const isAutoSnapshot = updateStatus?.status === "snapshot";

  return (
    <section className="data-warning" aria-label="Προειδοποίηση φρεσκάδας δεδομένων">
      <AlertCircle size={18} />
      <div>
        <strong>
          {refreshFailed
            ? "Η τελευταία αυτόματη ενημέρωση απέτυχε."
            : isAutoSnapshot
            ? "Οι τιμές ενημερώνονται αυτόματα κάθε ώρα από το PosoKanei."
            : "Οι τιμές εμφανίζονται από τον πιο πρόσφατο κατάλογο."}
        </strong>
        <span>
          Το demo δεν ρωτά το PosoKanei σε κάθε άνοιγμα σελίδας. Χρησιμοποιεί τον
          πιο πρόσφατο αυτόματα συγχρονισμένο κατάλογο. Τελευταία ενημέρωση
          καταλόγου: {snapshotTime}.
          {refreshFailed
            ? ` Τελευταία προσπάθεια: ${refreshAttemptTime} (${friendlyRefreshError(
                updateStatus?.refreshError,
              )}).`
            : ""}
        </span>
      </div>
    </section>
  );
}

function SearchPanel({
  query,
  setQuery,
  categoryId,
  setCategoryId,
  categories,
  products,
  catalogSource,
  liveState,
  liveMeta,
  selectedProduct,
  onSelect,
  onAdd,
  onLoadMore,
}) {
  const resultAction = `${products.length.toLocaleString("el-GR")}/${liveMeta.total.toLocaleString("el-GR")}`;
  const canLoadMore = liveMeta.hasNext;
  const isLoadingMore = liveState === "loading_more";

  return (
    <section className="panel search-panel" aria-labelledby="search-title">
      <PanelTitle
        id="search-title"
        icon={<PackageSearch size={18} />}
        title="Προϊόντα"
        action={resultAction}
      />

      <label className="search-box">
        <Search size={18} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Αναζήτηση προϊόντος ή barcode"
        />
        <Barcode size={17} aria-hidden="true" />
      </label>

      <div className="chips" aria-label="Κατηγορίες">
        {categories.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === categoryId ? "chip active" : "chip"}
            onClick={() => setCategoryId(item.id)}
            title={item.count ? `${item.count.toLocaleString("el-GR")} προϊόντα` : item.name}
          >
            {item.name}
          </button>
        ))}
      </div>

      <LiveNotice
        state={liveState}
        total={liveMeta.total}
        visible={products.length}
        catalogSource={catalogSource}
      />

      <div className="product-list">
        {products.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            selected={selectedProduct?.id === product.id}
            onSelect={() => onSelect(product)}
            onAdd={() => onAdd(product)}
          />
        ))}
      </div>

      {canLoadMore ? (
        <button
          type="button"
          className="load-more"
          onClick={onLoadMore}
          disabled={isLoadingMore}
        >
          <RefreshCw size={16} />
          {isLoadingMore ? "Φόρτωση..." : "Φόρτωση περισσότερων προϊόντων"}
        </button>
      ) : null}
    </section>
  );
}

function LiveNotice({ state, total, visible, catalogSource }) {
  const labels = {
    idle: "Κατάλογος προϊόντων",
    loading: "Φόρτωση προϊόντων και τιμών",
    loading_more: "Φόρτωση επιπλέον προϊόντων",
    ready:
      catalogSource === "snapshot"
        ? `${visible.toLocaleString("el-GR")} από ${total.toLocaleString("el-GR")} προϊόντα από ενημερωμένο κατάλογο`
        : `${visible.toLocaleString("el-GR")} από ${total.toLocaleString("el-GR")} live προϊόντα`,
    empty: "Δεν βρέθηκαν αποτελέσματα",
    error: "Ο κατάλογος δεν είναι διαθέσιμος",
  };
  return (
    <div className={`inline-status ${state}`}>
      {state === "error" ? <AlertCircle size={15} /> : <RefreshCw size={15} />}
      <span>{labels[state] ?? labels.idle}</span>
    </div>
  );
}

function ProductRow({ product, selected, onSelect, onAdd }) {
  const best = getBestProductPrice(product);
  return (
    <article className={selected ? "product-row selected" : "product-row"}>
      <button type="button" className="product-main" onClick={onSelect}>
        <ProductThumb product={product} />
        <span className="product-copy">
          <strong>{product.name}</strong>
          <small>
            {product.brand || "Χωρίς brand"} · {product.unitQuantity || product.unit}
          </small>
        </span>
      </button>
      <div className="product-price">
        <span>{best ? formatEuro(best.price) : "-"}</span>
        <small>best</small>
      </div>
      <button
        type="button"
        className="icon-button add"
        onClick={onAdd}
        aria-label={`Προσθήκη: ${product.name}`}
      >
        <Plus size={18} />
      </button>
    </article>
  );
}

function BasketPanel({
  basket,
  productMap,
  rankings,
  bestCompleteRanking,
  visitPlan,
  maxChains,
  isDemoBasket,
  onQuantity,
  onClear,
  onCopy,
  onShare,
  onLoadDemo,
  onSelect,
  sharedBasketStatus,
}) {
  const availableStoreCount = rankings.filter((row) => row.isComplete).length;
  const planAssignments = useMemo(() => buildPlanAssignmentMap(visitPlan), [visitPlan]);
  const planNames = visitPlan?.groups.map((group) => group.retailer.name).join(" + ");
  const hasPartialPlan = basket.length > 0 && visitPlan?.groups.length > 0;
  const oneStopSavings =
    bestCompleteRanking && visitPlan?.isComplete
      ? Math.max(0, bestCompleteRanking.total - visitPlan.total)
      : 0;
  return (
    <section className="panel basket-panel" aria-labelledby="basket-title">
      <PanelTitle
        id="basket-title"
        icon={<ClipboardList size={18} />}
        title="Καλάθι"
        action={basket.length ? formatEuro(visitPlan?.total ?? 0) : formatEuro(0)}
      />

      <div className="basket-toolbar">
        <button type="button" className="text-button demo-button" onClick={onLoadDemo}>
          <Sparkles size={16} />
          Παράδειγμα
        </button>
        <button type="button" className="text-button" onClick={onCopy}>
          <ClipboardList size={16} />
          Αντιγραφή
        </button>
        <button
          type="button"
          className="text-button share-button"
          onClick={onShare}
          disabled={!basket.length}
        >
          <Share2 size={16} />
          Κοινή χρήση
        </button>
        <button
          type="button"
          className="text-button danger-button"
          onClick={onClear}
          aria-label="Καθαρισμός παραδείγματος και έναρξη νέου καλαθιού"
        >
          <Trash2 size={17} />
          Νέο καλάθι
        </button>
      </div>

      <SharedBasketNotice state={sharedBasketStatus} />

      {isDemoBasket && !sharedBasketStatus ? (
        <div className="demo-hint">
          <Sparkles size={15} />
          <span>
            Βλέπεις παράδειγμα. Πάτησε «Νέο καλάθι» για να το καθαρίσεις και να
            ξεκινήσεις τη δική σου λίστα.
          </span>
        </div>
      ) : null}

      <div className="basket-list">
        {basket.length === 0 ? (
          <EmptyBasket />
        ) : (
          basket.map((entry) => {
            const product = productMap.get(entry.productId);
            if (!product) return null;
            return (
              <BasketItem
                key={entry.productId}
                product={product}
                quantity={entry.quantity}
                planItem={planAssignments.get(product.id)}
                onQuantity={onQuantity}
                onSelect={() => onSelect(product)}
              />
            );
          })
        )}
      </div>

      <div className="best-strip">
        <div>
          <small>Πλάνο</small>
          <strong>
            {visitPlan?.isComplete
              ? planNames
              : hasPartialPlan
                ? `Μερικό: ${planNames}`
                : "Δεν υπάρχει διαθέσιμο προϊόν"}
          </strong>
        </div>
        <div>
          <small>Στάσεις</small>
          <strong>
            {visitPlan?.groups.length
              ? `${visitPlan.chainCount}/${maxChains}`
              : availableStoreCount}
          </strong>
        </div>
        <div>
          <small>{visitPlan?.isComplete ? "Κέρδος vs 1 στάση" : "Μερικό σύνολο"}</small>
          <strong>{formatEuro(visitPlan?.isComplete ? oneStopSavings : visitPlan?.total ?? 0)}</strong>
        </div>
      </div>
    </section>
  );
}

function SharedBasketNotice({ state }) {
  if (!state) return null;

  if (state.status === "loading") {
    return (
      <div className="shared-basket-notice loading" role="status">
        <RefreshCw size={15} className="spin" />
        <span>Φόρτωση του κοινόχρηστου καλαθιού με τις σημερινές τιμές...</span>
      </div>
    );
  }

  if (state.status === "ready" || state.status === "partial") {
    return (
      <div className={`shared-basket-notice ${state.status}`} role="status">
        {state.status === "ready" ? <Check size={15} /> : <AlertCircle size={15} />}
        <span>
          Φορτώθηκε κοινόχρηστο καλάθι με {state.productCount.toLocaleString("el-GR")} {state.productCount === 1 ? "προϊόν" : "προϊόντα"}{" "}
          και έως {state.maxChains} {state.maxChains === 1 ? "στάση" : "στάσεις"}.
          {state.missingCount
            ? ` ${state.missingCount.toLocaleString("el-GR")} ${state.missingCount === 1 ? "προϊόν δεν υπάρχει" : "προϊόντα δεν υπάρχουν"} πλέον στον κατάλογο.`
            : " Οι τιμές και το φθηνότερο πλάνο υπολογίστηκαν ξανά τώρα."}
          {state.retailerCount
            ? ` Ο υπολογισμός χρησιμοποιεί ${state.retailerCount.toLocaleString("el-GR")} επιλεγμένες αλυσίδες.`
            : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="shared-basket-notice error" role="alert">
      <AlertCircle size={15} />
      <span>Ο σύνδεσμος καλαθιού δεν ήταν έγκυρος ή δεν μπόρεσε να φορτωθεί.</span>
    </div>
  );
}

function ShareBasketDialog({
  url,
  basketCount,
  maxChains,
  retailerCount,
  hasRetailerFilter,
  onClose,
}) {
  const [copyState, setCopyState] = useState("idle");
  const inputRef = useRef(null);
  const supportsNativeShare = typeof navigator.share === "function";

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const copyLink = async () => {
    try {
      await copyText(url);
      setCopyState("copied");
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setCopyState("manual");
    }
  };

  const shareLink = async () => {
    try {
      await navigator.share({
        title: "Καλάθι Τιμών Supermarket",
        text: `Σύγκρινε αυτό το καλάθι ${basketCount} προϊόντων για έως ${maxChains} ${maxChains === 1 ? "στάση" : "στάσεις"}.`,
        url,
      });
      setCopyState("shared");
    } catch (error) {
      if (error?.name !== "AbortError") await copyLink();
    }
  };

  return (
    <aside className="drawer share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel share-panel">
        <div className="drawer-head">
          <span className="share-dialog-icon" aria-hidden="true">
            <Link2 size={20} />
          </span>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Κλείσιμο">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-title">
          <small>Κοινόχρηστη λίστα</small>
          <h2 id="share-title">Μοιράσου το καλάθι σου</h2>
          <p>
            Ο παραλήπτης θα δει τα ίδια {basketCount.toLocaleString("el-GR")} προϊόντα,
            τις ποσότητες, το όριο των {maxChains} {maxChains === 1 ? "στάσης" : "στάσεων"}
            {hasRetailerFilter
              ? ` και τις ${retailerCount.toLocaleString("el-GR")} επιλεγμένες αλυσίδες.`
              : " και όλες τις διαθέσιμες αλυσίδες."}
          </p>
        </div>

        <label className="share-link-field">
          <span>Σύνδεσμος καλαθιού</span>
          <input
            ref={inputRef}
            type="text"
            value={url}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>

        <div className="share-dialog-actions">
          <button type="button" className="primary-action" onClick={copyLink}>
            {copyState === "copied" ? <Check size={18} /> : <Copy size={18} />}
            {copyState === "copied" ? "Αντιγράφηκε" : "Αντιγραφή συνδέσμου"}
          </button>
          {supportsNativeShare ? (
            <button type="button" className="text-button" onClick={shareLink}>
              <Share2 size={17} />
              Κοινή χρήση
            </button>
          ) : null}
        </div>

        {copyState === "shared" ? (
          <p className="share-feedback success" role="status">Το καλάθι κοινοποιήθηκε.</p>
        ) : null}
        {copyState === "manual" ? (
          <p className="share-feedback" role="status">
            Ο σύνδεσμος επιλέχθηκε. Αντέγραψέ τον από το πεδίο.
          </p>
        ) : null}

        <div className="share-privacy-note">
          <Info size={16} />
          <span>
            Ο σύνδεσμος περιέχει μόνο κωδικούς προϊόντων, ποσότητες, αριθμό στάσεων και
            την επιλογή αλυσίδων. Δεν περιέχει τοποθεσία ή τιμές. Οι διαθέσιμες τιμές
            υπολογίζονται ξανά όταν ανοίξει.
          </span>
        </div>
      </div>
    </aside>
  );
}

function BasketItem({ product, quantity, planItem, onQuantity, onSelect }) {
  const step = quantityStep(product);
  const bestPrice = planItem?.price ?? null;
  return (
    <article className="basket-item">
      <button type="button" className="basket-product" onClick={onSelect}>
        <ProductThumb product={product} compact />
        <span>
          <strong>{product.name}</strong>
          <small>{product.unitQuantity || product.unit}</small>
        </span>
      </button>
      <div className="quantity-control">
        <button
          type="button"
          className="icon-button"
          onClick={() => onQuantity(product, quantity - step)}
          aria-label={`Μείωση ποσότητας: ${product.name}`}
        >
          <Minus size={15} />
        </button>
        <input
          value={quantity}
          inputMode="decimal"
          onChange={(event) => onQuantity(product, Number(event.target.value))}
          aria-label={`Ποσότητα: ${product.name}`}
        />
        <button
          type="button"
          className="icon-button"
          onClick={() => onQuantity(product, quantity + step)}
          aria-label={`Αύξηση ποσότητας: ${product.name}`}
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="line-total">
        <strong>{bestPrice == null ? "-" : formatEuro(bestPrice * quantity)}</strong>
        <small>
          {bestPrice == null
            ? "έλλειψη"
            : `${formatEuro(bestPrice)} / ${product.unit} · ${planItem.retailer.shortName}`}
        </small>
      </div>
    </article>
  );
}

function RankingsPanel({
  rankings,
  bestCompleteRanking,
  visitPlan,
  maxChains,
  setMaxChains,
  basketSize,
  locationState,
  locationRadiusKm,
  retailerProximity,
  retailers,
  retailerFilterIds,
  nearbyRetailerIds,
  onRequestLocation,
  onChangeLocationRadius,
  onClearLocation,
  onToggleRetailer,
  onSelectAllRetailers,
  onSelectNearbyRetailers,
}) {
  const completeRankings = rankings.filter((row) => row.isComplete);
  const partialRankings = rankings.filter((row) => !row.isComplete);
  const maxTotal = Math.max(...completeRankings.map((row) => row.total), 0);
  const oneStopTotal = bestCompleteRanking?.total ?? null;
  const locationReady = locationState.status === "ready";
  const [selectedRetailerId, setSelectedRetailerId] = useState("");
  const [planCopyState, setPlanCopyState] = useState("idle");
  const defaultRetailerId =
    visitPlan?.groups?.[0]?.retailer.id ||
    bestCompleteRanking?.retailer.id ||
    completeRankings[0]?.retailer.id ||
    rankings[0]?.retailer.id ||
    "";
  const selectedRetailerIsAvailable =
    rankings.some((row) => row.retailer.id === selectedRetailerId) ||
    visitPlan?.groups?.some((group) => group.retailer.id === selectedRetailerId);
  const effectiveRetailerId =
    (selectedRetailerIsAvailable ? selectedRetailerId : "") || defaultRetailerId;
  const selectedRetailer =
    rankings.find((row) => row.retailer.id === effectiveRetailerId)?.retailer ||
    visitPlan?.groups?.find((group) => group.retailer.id === effectiveRetailerId)?.retailer ||
    null;

  useEffect(() => {
    setPlanCopyState("idle");
  }, [visitPlan]);

  const copyPlan = async () => {
    try {
      await copyText(formatPlanText(visitPlan));
      setPlanCopyState("copied");
    } catch {
      setPlanCopyState("error");
    }
  };

  return (
    <section className="panel rankings-panel" aria-labelledby="ranking-title">
      <PanelTitle
        id="ranking-title"
        icon={<Store size={18} />}
        title="Πλάνο"
        action={basketSize ? formatStopLimit(maxChains) : "διάλεξε προϊόντα"}
      />

      <ChainLimitControl maxChains={maxChains} setMaxChains={setMaxChains} />

      <RetailerFilterControl
        retailers={retailers}
        selectedIds={retailerFilterIds}
        nearbyIds={nearbyRetailerIds}
        locationReady={locationReady}
        onToggle={onToggleRetailer}
        onSelectAll={onSelectAllRetailers}
        onSelectNearby={onSelectNearbyRetailers}
      />

      <LocationControl
        locationState={locationState}
        radiusKm={locationRadiusKm}
        onRequest={onRequestLocation}
        onChangeRadius={onChangeLocationRadius}
        onClear={onClearLocation}
      />

      <RecommendationCard
        plan={visitPlan}
        basketSize={basketSize}
        maxChains={maxChains}
        oneStopTotal={oneStopTotal}
      />

      {locationReady ? (
        <NearbyBranchesPanel
          retailer={selectedRetailer}
          proximity={selectedRetailer ? retailerProximity[selectedRetailer.id] : null}
          radiusKm={locationRadiusKm}
        />
      ) : null}

      {visitPlan?.isComplete ? (
        <VisitPlanBreakdown
          plan={visitPlan}
          locationReady={locationReady}
          retailerProximity={retailerProximity}
          selectedRetailerId={effectiveRetailerId}
          onSelectRetailer={setSelectedRetailerId}
          onCopyPlan={copyPlan}
          copyState={planCopyState}
        />
      ) : null}

      {completeRankings.length ? (
        <div className="rank-group">
          <div className="rank-group-title">
            <ArrowDownUp size={15} />
            <span>Μία στάση, από φθηνότερο σε ακριβότερο</span>
          </div>
          <div className="rank-list">
            {completeRankings.map((row, index) => (
              <RetailerRank
                key={row.retailer.id}
                row={row}
                maxTotal={maxTotal}
                highlighted={index === 0}
                basketSize={basketSize}
                locationReady={locationReady}
                proximity={retailerProximity[row.retailer.id]}
                selected={effectiveRetailerId === row.retailer.id}
                onSelectRetailer={() => setSelectedRetailerId(row.retailer.id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {partialRankings.length ? (
        <div className="rank-group">
          <div className="rank-group-title muted">
            <Info size={15} />
            <span>Αλυσίδες που δεν έχουν όλη τη λίστα</span>
          </div>
          <div className="rank-list partial">
            {partialRankings.map((row) => (
              <RetailerRank
                key={row.retailer.id}
                row={row}
                maxTotal={maxTotal}
                highlighted={false}
                basketSize={basketSize}
                locationReady={locationReady}
                proximity={retailerProximity[row.retailer.id]}
                selected={effectiveRetailerId === row.retailer.id}
                onSelectRetailer={() => setSelectedRetailerId(row.retailer.id)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LocationControl({ locationState, radiusKm, onRequest, onChangeRadius, onClear }) {
  const busy = locationState.status === "locating" || locationState.status === "loading";
  const hasLocation = Boolean(locationState.position);

  return (
    <div className={`location-box ${locationState.status}`}>
      <div className="location-box-top">
        <span className="rank-group-title">
          <MapPin size={15} />
          <span>Κοντινά supermarket</span>
        </span>
        {hasLocation ? (
          <button type="button" className="quiet-button" onClick={onClear}>
            Καθαρισμός
          </button>
        ) : null}
      </div>
      <div className="location-actions">
        <button type="button" className="text-button" onClick={onRequest} disabled={busy}>
          <Navigation size={16} />
          {busy ? "Εντοπισμός..." : hasLocation ? "Ανανέωση" : "Χρήση τοποθεσίας"}
        </button>
        <div className="radius-buttons" aria-label="Ακτίνα αναζήτησης">
          {[2, 5, 10].map((value) => (
            <button
              key={value}
              type="button"
              className={radiusKm === value ? "active" : ""}
              onClick={() => onChangeRadius(value)}
            >
              {value}χλμ.
            </button>
          ))}
        </div>
      </div>
      <p>{locationStatusText(locationState, radiusKm)}</p>
    </div>
  );
}

function ChainLimitControl({ maxChains, setMaxChains }) {
  return (
    <div className="chain-limit">
      <span>Στάσεις</span>
      <div className="chain-limit-buttons" aria-label="Μέγιστες αλυσίδες">
        {[1, 2, 3, 4].map((count) => (
          <button
            key={count}
            type="button"
            className={maxChains === count ? "active" : ""}
            aria-pressed={maxChains === count}
            onClick={() => setMaxChains(count)}
          >
            {count}
          </button>
        ))}
      </div>
    </div>
  );
}

function RetailerFilterControl({
  retailers,
  selectedIds,
  nearbyIds,
  locationReady,
  onToggle,
  onSelectAll,
  onSelectNearby,
}) {
  const selectedSet = new Set(selectedIds === null ? retailers.map((retailer) => retailer.id) : selectedIds);
  const selectedCount = selectedSet.size;
  const hasFilter = selectedIds !== null;

  return (
    <details className="retailer-filter-box">
      <summary>
        <span className="retailer-filter-title">
          <SlidersHorizontal size={15} />
          Αλυσίδες στον υπολογισμό
        </span>
        <span className={hasFilter ? "retailer-filter-count active" : "retailer-filter-count"}>
          {selectedCount}/{retailers.length || 0}
          <ChevronRight size={15} className="retailer-filter-chevron" />
        </span>
      </summary>

      <div className="retailer-filter-actions">
        <button type="button" className="quiet-button" onClick={onSelectAll} disabled={!hasFilter}>
          Όλες οι αλυσίδες
        </button>
        <button
          type="button"
          className="quiet-button nearby-filter-button"
          onClick={onSelectNearby}
          disabled={!locationReady || !nearbyIds.length}
        >
          <MapPin size={13} />
          Μόνο κοντινές
        </button>
      </div>

      <div className="retailer-filter-grid" role="group" aria-label="Επιλεγμένες αλυσίδες">
        {retailers.map((retailer) => {
          const checked = selectedSet.has(retailer.id);
          return (
            <label
              key={retailer.id}
              className={checked ? "checked" : ""}
              data-retailer-id={retailer.id}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={checked && selectedCount === 1}
                onChange={() => onToggle(retailer.id)}
                aria-label={retailer.name}
              />
              <RetailerLogo retailer={retailer} className="tiny" ariaHidden />
              <span>{retailer.name}</span>
            </label>
          );
        })}
      </div>
      <p>
        Το φθηνότερο πλάνο και η κατάταξη υπολογίζονται μόνο με τις επιλεγμένες αλυσίδες.
      </p>
    </details>
  );
}

function RecommendationCard({ plan, basketSize, maxChains, oneStopTotal }) {
  if (!basketSize) {
    return (
      <div className="recommendation-card empty">
        <span className="rank-badge">
          <Store size={17} />
        </span>
        <div>
          <small>Πρώτα φτιάξε τη λίστα σου</small>
          <strong>Διάλεξε προϊόντα και πόσες στάσεις θέλεις να κάνεις.</strong>
          <span>Το πλάνο θα ταξινομήσει τις αλυσίδες από τη φθηνότερη επιλογή.</span>
        </div>
      </div>
    );
  }

  if (!plan?.isComplete) {
    return (
      <div className="recommendation-card warning">
        <span className="rank-badge">
          <AlertCircle size={17} />
        </span>
        <div>
          <small>Δεν βρέθηκε πλήρες καλάθι</small>
          <strong>Δεν καλύπτεται όλη η λίστα με {formatStopLimit(maxChains)}.</strong>
          {plan?.availableCount ? (
            <span>
              Καλύπτονται {plan.availableCount}/{basketSize} προϊόντα · μερικό σύνολο{" "}
              {formatEuro(plan.total)}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  const savings = oneStopTotal == null ? 0 : Math.max(0, oneStopTotal - plan.total);
  const planName = plan.groups.map((group) => group.retailer.name).join(" + ");
  const isOneStop = plan.chainCount === 1;

  return (
    <div className="recommendation-card">
      <div className="recommendation-main">
        <RetailerStack groups={plan.groups} />
        <div>
          <small>
            {isOneStop
              ? "Καλύτερη επιλογή για μία στάση"
              : `Καλύτερο πλάνο για ${formatStopLimit(maxChains)}`}
          </small>
          <strong>{planName}</strong>
          <span>
            {isOneStop
              ? formatCoverageSentence(basketSize)
              : `Χωρίζει το καλάθι σε ${plan.chainCount} αλυσίδες.`}
          </span>
        </div>
      </div>
      <div className="recommendation-total">
        <small>Σύνολο</small>
        <strong>{formatEuro(plan.total)}</strong>
        {savings > 0 ? <span>{formatEuro(savings)} κάτω από 1 στάση</span> : null}
      </div>
    </div>
  );
}

function RetailerStack({ groups }) {
  if (groups.length === 1) {
    const group = groups[0];
    return <RetailerLogo retailer={group.retailer} className="large" />;
  }

  return (
    <span className="retailer-stack" aria-hidden="true">
      {groups.slice(0, 4).map((group) => (
        <RetailerLogo
          key={group.retailer.id}
          retailer={group.retailer}
          className="mini"
          ariaHidden
        />
      ))}
    </span>
  );
}

function VisitPlanBreakdown({
  plan,
  locationReady,
  retailerProximity,
  selectedRetailerId,
  onSelectRetailer,
  onCopyPlan,
  copyState,
}) {
  return (
    <div className="route-group">
      <div className="route-group-heading">
        <div className="rank-group-title">
          <ClipboardList size={15} />
          <span>Τι αγοράζεις σε κάθε αλυσίδα</span>
        </div>
        <button type="button" className="quiet-button copy-plan-button" onClick={onCopyPlan}>
          {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
          {copyState === "copied"
            ? "Αντιγράφηκε"
            : copyState === "error"
              ? "Δεν αντιγράφηκε"
              : "Αντιγραφή πλάνου"}
        </button>
      </div>
      <div className="route-list">
        {plan.groups.map((group) => (
          <article key={group.retailer.id} className="route-card">
            <div className="route-store-top">
              <RetailerLogo retailer={group.retailer} />
              <div>
                <strong>{group.retailer.name}</strong>
                <small>
                  {formatProductCount(group.items.length)} · {formatEuro(group.total)}
                </small>
              </div>
              {locationReady ? (
                <button
                  type="button"
                  className={
                    selectedRetailerId === group.retailer.id
                      ? "branch-select active"
                      : "branch-select"
                  }
                  onClick={() => onSelectRetailer(group.retailer.id)}
                >
                  Υποκαταστήματα
                </button>
              ) : null}
            </div>
            <StoreDistance
              locationReady={locationReady}
              proximity={retailerProximity[group.retailer.id]}
              onSelectBranches={() => onSelectRetailer(group.retailer.id)}
            />
            <div className="route-items">
              {group.items.map((item) => (
                <div key={item.product.id} className="route-item">
                  <span>
                    {item.quantity} x {item.product.name}
                  </span>
                  <strong>{formatEuro(item.lineTotal)}</strong>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function NearbyBranchesPanel({ retailer, proximity, radiusKm }) {
  if (!retailer) return null;

  return (
    <div className="branches-panel">
      <div className="rank-group-title">
        <MapPin size={15} />
        <span>Υποκαταστήματα: {retailer.name}</span>
      </div>
      {!proximity?.stores?.length ? (
        <div className="branch-empty">
          Δεν βρέθηκε κοντινό υποκατάστημα στο OpenStreetMap σε ακτίνα {radiusKm}χλμ.
        </div>
      ) : (
        <div className="branch-list">
          {proximity.stores.map((store) => (
            <article key={store.id} className="branch-row">
              <span className="branch-distance">{formatDistance(store.distanceMeters)} μακριά</span>
              <div>
                <strong>{store.name}</strong>
                <small>
                  {store.address || "Τοποθεσία από OpenStreetMap"}
                  {store.openingHours ? ` · ${store.openingHours}` : ""}
                </small>
              </div>
              <a href={mapsSearchUrl(store)} target="_blank" rel="noreferrer">
                Χάρτης
              </a>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StoreDistance({ locationReady, proximity, onSelectBranches }) {
  if (!locationReady) return null;
  const store = proximity?.nearest;
  if (!store) {
    return (
      <div className="nearby-note missing">
        <MapPin size={14} />
        <span>Δεν βρέθηκε κοντινό υποκατάστημα στο OpenStreetMap.</span>
      </div>
    );
  }

  return (
    <div className="nearby-note">
      <MapPin size={14} />
      <span>
        <strong>{formatDistance(store.distanceMeters)} μακριά</strong>
        <small>
          {store.name}
          {store.address ? ` · ${store.address}` : ""}
        </small>
      </span>
      <div className="nearby-actions">
        <a href={mapsSearchUrl(store)} target="_blank" rel="noreferrer">
          Χάρτης
        </a>
        {onSelectBranches ? (
          <button type="button" onClick={onSelectBranches}>
            Όλα
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RetailerRank({
  row,
  maxTotal,
  highlighted,
  basketSize,
  locationReady,
  proximity,
  selected,
  onSelectRetailer,
}) {
  const percentage = maxTotal ? Math.max(10, (row.total / maxTotal) * 100) : 0;
  const missingNames = row.items
    .filter((item) => item.price == null)
    .map((item) => item.product?.name)
    .filter(Boolean);
  const cardClass = [
    "rank-card",
    highlighted ? "recommended" : "",
    selected ? "selected" : "",
    row.isComplete ? "" : "incomplete",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cardClass}>
      <div className="rank-top">
        <RetailerLogo retailer={row.retailer} />
        <div>
          <strong>{row.retailer.name}</strong>
          <small>
            {row.availableCount}/{basketSize} διαθέσιμα
            {row.missingCount ? ` · ${row.missingCount} έλλειψη` : ""}
          </small>
        </div>
        {highlighted ? (
          <span className="recommended-mark">
            <Check size={14} />
            Πήγαινε εδώ
          </span>
        ) : null}
      </div>
      <div className="rank-money">
        <strong>{row.isComplete ? formatEuro(row.total) : "Δεν καλύπτει όλη τη λίστα"}</strong>
        <small>
          {row.savings != null && row.savings > 0
            ? `λιγότερα κατά ${formatEuro(row.savings)} από την ακριβότερη πλήρη αλυσίδα`
            : row.isComplete
              ? "πλήρες καλάθι για μία στάση"
              : `μερικό σύνολο ${formatEuro(row.total)}`}
        </small>
      </div>
      {missingNames.length ? (
        <div className="missing-note">
          Λείπει: {missingNames.slice(0, 2).join(", ")}
          {missingNames.length > 2 ? ` +${missingNames.length - 2}` : ""}
        </div>
      ) : null}
      <StoreDistance
        locationReady={locationReady}
        proximity={proximity}
        onSelectBranches={onSelectRetailer}
      />
      <div className="coverage-track" aria-hidden="true">
        <span style={{ width: `${row.isComplete ? percentage : 100}%` }} />
      </div>
    </article>
  );
}

function ProductDrawer({ product, retailers: retailerList, onClose, onAdd }) {
  const best = getBestProductPrice(product);
  return (
    <aside className="drawer" aria-label={`Προϊόν: ${product.name}`}>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel">
        <div className="drawer-head">
          <ProductThumb product={product} />
          <button type="button" className="icon-button" onClick={onClose} aria-label="Κλείσιμο">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-title">
          <small>{product.category}</small>
          <h2>{product.name}</h2>
          <p>{product.brand || "Χωρίς brand"} · {product.unitQuantity || product.unit}</p>
        </div>
        <ProductPreviewImage product={product} />
        <div className="drawer-stats">
          <div>
            <small>Καλύτερη τιμή</small>
            <strong>{best ? formatEuro(best.price) : "-"}</strong>
          </div>
          <div>
            <small>Barcode</small>
            <strong>{product.gtin || "-"}</strong>
          </div>
        </div>
        <p className="drawer-description">
          {product.description || "Προϊόν από τον κατάλογο PosoKanei."}
        </p>
        <div className="price-table" aria-label="Τιμές ανά αλυσίδα">
          {retailerList.map((retailer) => {
            const price = getProductPrice(product, retailer.id);
            return (
              <div key={retailer.id} className="price-row">
                <RetailerLogo retailer={retailer} className="tiny" ariaHidden />
                <span>{retailer.name}</span>
                <strong>{price == null ? "-" : formatEuro(price)}</strong>
              </div>
            );
          })}
        </div>
        <button type="button" className="primary-action" onClick={onAdd}>
          <Plus size={18} />
          Προσθήκη στο καλάθι
        </button>
      </div>
    </aside>
  );
}

function RetailerLogo({ retailer, className = "", ariaHidden = false }) {
  const sources = useMemo(() => retailerLogoSources(retailer), [retailer]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const currentSource = sources[sourceIndex] || "";
  const classes = [
    "retailer-logo",
    className,
    currentSource ? "has-logo" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    setSourceIndex(0);
  }, [retailer?.id, retailer?.logoUrl]);

  return (
    <span
      className={classes}
      style={{ "--retailer": retailer?.color }}
      title={retailer?.name}
      aria-hidden={ariaHidden ? "true" : undefined}
      aria-label={ariaHidden ? undefined : retailer?.name}
    >
      {currentSource ? (
        <img
          src={currentSource}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setSourceIndex((index) => index + 1)}
        />
      ) : (
        <span className="retailer-fallback">{retailer?.shortName}</span>
      )}
    </span>
  );
}

function ProductPreviewImage({ product }) {
  const [failedImageUrl, setFailedImageUrl] = useState("");
  const imageUrl = proxiedProductImageUrl(product);
  const showImage = imageUrl && failedImageUrl !== imageUrl;

  return (
    <div className="drawer-image-frame" aria-label={`Εικόνα προϊόντος: ${product.name}`}>
      {showImage ? (
        <img
          src={imageUrl}
          alt=""
          decoding="async"
          onError={() => setFailedImageUrl(imageUrl)}
        />
      ) : (
        <span style={{ "--thumb": product.tint }} aria-hidden="true">
          {product.tile}
        </span>
      )}
    </div>
  );
}

function ProductThumb({ product, compact = false }) {
  const [failedImageUrl, setFailedImageUrl] = useState("");
  const imageUrl = proxiedProductImageUrl(product);
  if (imageUrl && failedImageUrl !== imageUrl) {
    return (
      <span className={compact ? "product-thumb compact has-image" : "product-thumb has-image"}>
        <img
          src={imageUrl}
          alt=""
          decoding="async"
          loading="lazy"
          onError={() => setFailedImageUrl(imageUrl)}
        />
      </span>
    );
  }
  return (
    <span
      className={compact ? "product-thumb compact" : "product-thumb"}
      style={{ "--thumb": product.tint }}
      aria-hidden="true"
    >
      {product.tile}
    </span>
  );
}

function proxiedProductImageUrl(product) {
  const imageUrl = product?.imageUrl || "";
  if (!imageUrl) return "";

  const match = imageUrl.match(/\/images\/product\/([^/?#]+)/i);
  if (!match) return imageUrl;

  const proxyUrl = new URL(IMAGE_PROXY_BASE, window.location.href);
  proxyUrl.searchParams.set("resource", "image");
  proxyUrl.searchParams.set("id", decodeURIComponent(match[1]));

  try {
    const sourceUrl = new URL(imageUrl);
    const version = sourceUrl.searchParams.get("v");
    if (version) proxyUrl.searchParams.set("v", version);
  } catch {
    // Keep the image usable even if an upstream catalog emits a partial URL.
  }

  return proxyUrl.toString();
}

function proxiedRetailerLogoUrl(retailer) {
  const logoUrl = retailer?.logoUrl || "";
  if (!logoUrl) return "";

  const match = logoUrl.match(/\/images\/retailer\/([^/?#]+)/i);
  if (!match) return logoUrl;

  const proxyUrl = new URL(IMAGE_PROXY_BASE, window.location.href);
  proxyUrl.searchParams.set("resource", "retailer-image");
  proxyUrl.searchParams.set("id", decodeURIComponent(match[1]));
  return proxyUrl.toString();
}

function retailerLogoSources(retailer) {
  return [
    proxiedRetailerLogoUrl(retailer),
    ...(RETAILER_LOGO_FALLBACKS[retailer?.id] || []),
  ].filter(Boolean);
}

function PanelTitle({ id, icon, title, action }) {
  return (
    <div className="panel-title">
      <div>
        <span className="title-icon">{icon}</span>
        <h1 id={id}>{title}</h1>
      </div>
      <span>{action}</span>
    </div>
  );
}

function EmptyBasket() {
  return (
    <div className="empty-state">
      <CircleDollarSign size={32} />
      <strong>Άδειο καλάθι</strong>
      <small>Πρόσθεσε προϊόντα από τον κατάλογο για να δεις το φθηνότερο πλάνο.</small>
    </div>
  );
}

function quantityStep(product) {
  return product?.unit === "kg" ? 0.5 : 1;
}

function formatCoverageSentence(count) {
  return count === 1 ? "Έχει το προϊόν της λίστας." : `Έχει και τα ${count} προϊόντα της λίστας.`;
}

function formatProductCount(count) {
  return count === 1 ? "1 προϊόν" : `${count} προϊόντα`;
}

function formatStopLimit(count) {
  return count === 1 ? "έως 1 στάση" : `έως ${count} στάσεις`;
}

function locationStatusText(locationState, radiusKm) {
  switch (locationState.status) {
    case "locating":
      return "Ο browser ζητά άδεια τοποθεσίας.";
    case "loading":
      return "Αναζήτηση κοντινών supermarket στο OpenStreetMap.";
    case "ready": {
      const accuracy = locationState.position?.accuracyMeters
        ? ` · ακρίβεια περίπου ${formatDistance(locationState.position.accuracyMeters)}`
        : "";
      return `${locationState.stores.length.toLocaleString("el-GR")} supermarket σε ακτίνα ${radiusKm}χλμ.${accuracy}`;
    }
    case "denied":
      return "Η άδεια τοποθεσίας απορρίφθηκε από τον browser.";
    case "error":
      return "Δεν ήταν δυνατός ο εντοπισμός κοντινών supermarket.";
    default:
      return "Προαιρετικό: απόσταση κοντινών καταστημάτων μέσω browser location.";
  }
}

function formatUpdateStatus(updateStatus) {
  if (!updateStatus?.checkedAt) return "Έλεγχος ενημερώσεων: κατά τη χρήση";
  if (updateStatus.refreshStatus === "failed") {
    return `Τελευταία επιτυχής ενημέρωση: ${formatDataTime(
      updateStatus.lastSuccessfulRefreshAt || updateStatus.snapshotGeneratedAt,
    )}`;
  }
  const checkedAt = new Date(updateStatus.checkedAt);
  if (Number.isNaN(checkedAt.getTime())) return "Έλεγχος ενημερώσεων: ενεργός";
  const formatted = formatDateTime(checkedAt);
  if (updateStatus.status === "snapshot") {
    return `Τελευταία ενημέρωση: ${formatted}`;
  }
  if (updateStatus.status === "stale" || updateStatus.error) {
    return `Απέτυχε live έλεγχος: ${formatted}`;
  }
  return updateStatus.changedSinceLastCheck
    ? `Νέες αλλαγές τιμών: ${formatted}`
    : `Τελευταίος έλεγχος τιμών: ${formatted}`;
}

function formatDataTime(value) {
  if (!value) return "άγνωστη";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "άγνωστη";
  return formatDateTime(date);
}

function formatDateTime(date) {
  try {
    return new Intl.DateTimeFormat("el-GR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  } catch {
    try {
      const datePart = date.toLocaleDateString("el-GR");
      const timePart = date.toLocaleTimeString("el-GR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${datePart}, ${timePart}`;
    } catch {
      return date.toISOString().slice(0, 16).replace("T", " ");
    }
  }
}

function friendlyRefreshError(error) {
  if (!error) return "ο έλεγχος δεν ολοκληρώθηκε";
  if (String(error).includes("HTTP 403")) return "μπλοκαρίστηκε από το upstream API";
  return "ο έλεγχος δεν ολοκληρώθηκε";
}

function buildPlanAssignmentMap(plan) {
  const assignments = new Map();
  plan?.groups.forEach((group) => {
    group.items.forEach((item) => {
      assignments.set(item.product.id, { ...item, retailer: group.retailer });
    });
  });
  return assignments;
}

function roundQuantity(value) {
  return Math.round(value * 10) / 10;
}

export default App;

function rememberCatalogProduct(product, setLiveBasketProducts) {
  if (!product?.id) return;
  setLiveBasketProducts((current) => mergeCatalogProducts(current, [product]));
}

function mergeCatalogProducts(current, products) {
  const byId = new Map(current.map((item) => [item.id, item]));
  products.forEach((product) => {
    if (product?.id) byId.set(product.id, product);
  });
  return [...byId.values()].slice(-200);
}
