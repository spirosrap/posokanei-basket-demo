import {
  AlertCircle,
  ArrowLeft,
  ArrowDownUp,
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Barcode,
  Bell,
  BellRing,
  Bookmark,
  Check,
  CheckCheck,
  ChartLine,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Copy,
  Download,
  FileJson2,
  FileText,
  Github,
  FolderOpen,
  Info,
  Languages,
  Link2,
  ListChecks,
  MapPin,
  Minus,
  Monitor,
  Moon,
  Navigation,
  PackageSearch,
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  Save,
  Search,
  Share2,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Store,
  Sun,
  Tag,
  Target,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  createContext,
  memo,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchCatalogBootstrap,
  fetchDailyBargain,
  fetchProductAlternatives,
  fetchProducts,
  fetchProductsByIds,
  fetchUpdateStatus,
  warmCatalogSearch,
} from "./posokaneiApi";
import {
  DEFAULT_DEMO_BASKET,
  DEFAULT_DEMO_PRODUCT_IDS,
  LEGACY_DEMO_BASKETS,
} from "./demoBasket";
import {
  calculateRankings,
  formatEuro,
  getBestProductPrice,
  getBestProductUnitPrice,
  getProductPrice,
  getProductPriceChange,
  sortProducts,
} from "./pricing";
import {
  buildPlanRoute,
  buildRetailerProximity,
  fetchNearbySupermarkets,
  filterRetailersByProximity,
  formatDistance,
  getBrowserLocation,
  mapsDirectionsUrl,
  mapsSearchUrl,
} from "./locationStores";
import { formatPlanText } from "./planText";
import { formatBasketText, formatPortableTextFile } from "./basketText";
import { formatBasketData, parseBasketData } from "./basketData";
import { calculateSavingsBreakdown } from "./savingsBreakdown";
import { buildSharedBasketUrl, readSharedBasketUrl, SHARED_BASKET_PARAM } from "./shareBasket";
import { shortenBasketUrl } from "./shortLinks";
import { runtimeAppUrl } from "./appConfig";
import {
  getInitialProductSort,
  PRODUCT_SORT_MODES,
  saveProductSort,
} from "./productSort";
import {
  getInitialLanguage,
  localeForLanguage,
  saveLanguage,
  SUPPORTED_LANGUAGES,
  translate,
} from "./i18n";
import {
  applyTheme,
  getInitialTheme,
  saveTheme,
  SUPPORTED_THEMES,
} from "./theme";
import {
  calculateStopComparison,
  getInitialExtraStopCost,
  getStopOptionDetailKind,
  saveExtraStopCost,
} from "./stopComparison";
import {
  buildRemainingShoppingPlan,
  buildShoppingPlanId,
  loadShoppingProgress,
  saveShoppingProgress,
  shoppingItemId,
  summarizeShoppingPlan,
} from "./shoppingProgress";
import {
  loadSavedBaskets,
  persistSavedBaskets,
  removeSavedBasket,
  upsertSavedBasket,
} from "./savedBaskets";
import {
  loadPriceWatches,
  persistPriceWatches,
  priceWatchTargetStatus,
  removePriceWatch,
  upsertPriceWatch,
} from "./priceWatch";
import { buildCatalogImageSources } from "./imageSources";
import {
  filterPriceChanges,
  normalizePriceChangesPayload,
  priceHistoryForProduct,
  priceChangeRetailers,
} from "./priceChangesView";
import { createPriceHistoryChart } from "./priceHistoryChart";

const BASKET_KEY = "posokanei-basket";
const LIVE_BASKET_PRODUCTS_KEY = "posokanei-live-basket-products";
const RETAILER_FILTER_KEY = "posokanei-retailer-filter";
const MAX_CHAINS_KEY = "posokanei-max-chains";
const REPOSITORY_URL = "https://github.com/spirosrap/posokanei-basket-demo";
const APP_VERSION = import.meta.env.PACKAGE_VERSION || "dev";
const APP_BASE_PATH = import.meta.env.BASE_URL;
const BARGAINS_PATH = `${APP_BASE_PATH}bargains/`;
const PRICE_CHANGES_PATH = `${APP_BASE_PATH}changes/`;
const INITIAL_PRICE_CHANGE_ROWS = 120;
const PRICE_CHANGE_ROW_BATCH = 120;
const IS_BARGAINS_PAGE = window.location.pathname.replace(/\/+$/, "").endsWith("/bargains");
const IS_PRICE_CHANGES_PAGE = window.location.pathname.replace(/\/+$/, "").endsWith("/changes");
const INITIAL_SHARED_BASKET = IS_BARGAINS_PAGE || IS_PRICE_CHANGES_PAGE
  ? null
  : readSharedBasketUrl(window.location.href);
const IMAGE_PROXY_BASE = runtimeAppUrl("api/posokanei.php");
const SHOPPING_PRIORITY_OPTIONS = [
  { value: 0, labelKey: "priorityLowestPrice" },
  { value: 2, labelKey: "prioritySmallDetour" },
  { value: 5, labelKey: "priorityBalanced" },
  { value: 10, labelKey: "priorityFewerStops" },
];

const RETAILER_LOGO_FALLBACKS = {
  ab_vasilopoulos: ["https://static.ab.gr/static/next/images/logo_header_ab_gr.svg"],
  galaxias: ["https://el.wikipedia.org/wiki/Special:Redirect/file/Galaxias_Logo.png"],
  kritikos: ["https://www.kritikos-sm.gr/assets/kritikos/logo.svg"],
  sklavenitis: ["https://upload.wikimedia.org/wikipedia/commons/c/c8/Sklavenitis_Logo.svg"],
  synka: ["https://www.synka-sm.gr/wp-content/uploads/2026/02/logopng.png"],
};

const PreferencesContext = createContext(null);

function usePreferences() {
  const preferences = useContext(PreferencesContext);
  if (!preferences) throw new Error("PreferencesContext is unavailable");
  return preferences;
}

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
    const normalized = parsed.flatMap((entry) => {
      const productId = String(entry?.productId ?? "").trim();
      const quantity = roundQuantity(entry?.quantity);
      return productId && quantity > 0 && quantity <= 999
        ? [{ productId, quantity }]
        : [];
    });
    return normalized.length ? normalized : DEFAULT_DEMO_BASKET;
  } catch {
    return DEFAULT_DEMO_BASKET;
  }
};

const savedLiveBasketProducts = () => {
  try {
    const stored = localStorage.getItem(LIVE_BASKET_PRODUCTS_KEY);
    const parsed = JSON.parse(stored || "[]");
    return Array.isArray(parsed) ? parsed.filter((product) => product?.id) : [];
  } catch {
    return [];
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

const savedMaxChains = () => {
  try {
    const value = Number(JSON.parse(localStorage.getItem(MAX_CHAINS_KEY) || "null"));
    return [1, 2, 3, 4].includes(value) ? value : null;
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

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const downloadTextFile = (value, filename) => {
  const windowsCompatibleText = formatPortableTextFile(value);
  const blob = new Blob([windowsCompatibleText], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, filename);
};

const downloadJsonFile = (value, filename) => {
  const blob = new Blob([value], { type: "application/json;charset=utf-8" });
  downloadBlob(blob, filename);
};

const scheduleIdleWork = (work, { delay = 0, timeout = 2500 } = {}) => {
  let cancelled = false;
  let idleId = null;
  const run = () => {
    if (!cancelled) work();
  };
  const timer = window.setTimeout(() => {
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(run, { timeout });
    } else {
      run();
    }
  }, delay);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (idleId !== null && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idleId);
    }
  };
};

function useShortBasketLink(longUrl) {
  const [state, setState] = useState(() => ({
    status: longUrl ? "loading" : "idle",
    url: longUrl,
  }));

  useEffect(() => {
    if (!longUrl) {
      setState({ status: "idle", url: "" });
      return undefined;
    }
    let active = true;
    setState({ status: "loading", url: longUrl });
    shortenBasketUrl(longUrl)
      .then((url) => {
        if (active) setState({ status: "ready", url });
      })
      .catch(() => {
        if (active) setState({ status: "error", url: longUrl });
      });
    return () => {
      active = false;
    };
  }, [longUrl]);

  return state;
}

function App() {
  const [language, setLanguage] = useState(getInitialLanguage);
  const [theme, setTheme] = useState(getInitialTheme);
  const locale = localeForLanguage(language);

  const preferences = useMemo(() => {
    const t = (key, values) => translate(language, key, values);
    return {
      language,
      locale,
      setLanguage,
      setTheme,
      theme,
      t,
      number: (value) => Number(value || 0).toLocaleString(locale),
      money: (value) => formatEuro(value, locale),
    };
  }, [language, locale, theme]);

  useEffect(() => {
    saveLanguage(language);
    document.documentElement.lang = language;
    document.title = preferences.t(
      IS_PRICE_CHANGES_PAGE ? "priceChangesDocumentTitle" : "documentTitle",
    );
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        preferences.t(
          IS_PRICE_CHANGES_PAGE ? "priceChangesDocumentDescription" : "documentDescription",
        ),
      );
  }, [language, preferences]);

  useEffect(() => {
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const updateResolvedTheme = () => applyTheme(theme, colorScheme.matches);
    saveTheme(theme);
    updateResolvedTheme();

    if (theme !== "system") return undefined;
    if (colorScheme.addEventListener) {
      colorScheme.addEventListener("change", updateResolvedTheme);
      return () => colorScheme.removeEventListener("change", updateResolvedTheme);
    }

    colorScheme.addListener?.(updateResolvedTheme);
    return () => colorScheme.removeListener?.(updateResolvedTheme);
  }, [theme]);

  return (
    <PreferencesContext.Provider value={preferences}>
      {IS_PRICE_CHANGES_PAGE ? <PriceChangesApp /> : <AppContent />}
    </PreferencesContext.Provider>
  );
}

function AppContent() {
  const { t } = usePreferences();
  const [basket, setBasket] = useState(() =>
    INITIAL_SHARED_BASKET?.status === "valid"
      ? INITIAL_SHARED_BASKET.basket
      : savedBasket(),
  );
  const [mobileView, setMobileView] = useState(() => (basket.length ? "plan" : "products"));
  const [liveBasketProducts, setLiveBasketProducts] = useState(savedLiveBasketProducts);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [productSort, setProductSort] = useState(getInitialProductSort);
  const [health, setHealth] = useState({ state: "checking", activeProducts: 0 });
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
  const [catalogBootstrapped, setCatalogBootstrapped] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [maxChains, setMaxChains] = useState(() =>
    INITIAL_SHARED_BASKET?.status === "valid"
      ? INITIAL_SHARED_BASKET.maxChains
      : savedMaxChains() ?? (shouldStartWithDemoBasket() ? 4 : 1),
  );
  const [extraStopCost, setExtraStopCost] = useState(getInitialExtraStopCost);
  const [sharedBasketHydrating, setSharedBasketHydrating] = useState(
    INITIAL_SHARED_BASKET?.status === "valid",
  );
  const [sharedBasketStatus, setSharedBasketStatus] = useState(() => {
    if (INITIAL_SHARED_BASKET?.status === "invalid") return { status: "error" };
    if (INITIAL_SHARED_BASKET?.status === "valid") return { status: "loading" };
    return null;
  });
  const [shareUrl, setShareUrl] = useState("");
  const [basketExportOpen, setBasketExportOpen] = useState(false);
  const [savedBaskets, setSavedBaskets] = useState(loadSavedBaskets);
  const [savedBasketsOpen, setSavedBasketsOpen] = useState(false);
  const [savedBasketNotice, setSavedBasketNotice] = useState(null);
  const [priceWatches, setPriceWatches] = useState(loadPriceWatches);
  const [priceWatchOpen, setPriceWatchOpen] = useState(false);
  const [priceWatchProducts, setPriceWatchProducts] = useState([]);
  const [priceWatchState, setPriceWatchState] = useState("idle");
  const [priceWatchRefreshVersion, setPriceWatchRefreshVersion] = useState(0);
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
  const initialBasketProductIds = useRef(
    INITIAL_SHARED_BASKET?.status === "valid"
      ? basket.map((entry) => entry.productId)
      : [...new Set([
          ...basket.map((entry) => entry.productId),
          ...DEFAULT_DEMO_PRODUCT_IDS,
        ])],
  );
  const initialProductSort = useRef(productSort);
  const skipSeededCatalogFetch = useRef(false);
  const catalogRequestId = useRef(0);
  const mobileWorkspaceNav = useRef(null);

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
    saveLocalJson(MAX_CHAINS_KEY, maxChains);
  }, [maxChains]);

  useEffect(() => {
    saveExtraStopCost(extraStopCost);
  }, [extraStopCost]);

  useEffect(() => {
    if (!INITIAL_SHARED_BASKET) return undefined;
    if (INITIAL_SHARED_BASKET.status === "invalid") {
      removeSharedBasketParam();
    }
    return undefined;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setHealth({ state: "checking", activeProducts: 0 });
    setLiveState("loading");
    fetchCatalogBootstrap({
      productIds: initialBasketProductIds.current,
      sortMode: initialProductSort.current,
      preferStatic: INITIAL_SHARED_BASKET?.status !== "valid",
    })
      .then(({
        health: stats,
        retailers,
        categories,
        productResult,
        basketProducts,
        missingBasketProductIds = [],
      }) => {
        if (cancelled) return;
        skipSeededCatalogFetch.current = true;
        if (basketProducts.length) {
          setLiveBasketProducts((current) => mergeCatalogProducts(current, basketProducts));
        }
        if (basketProducts.some((product) => DEFAULT_DEMO_PRODUCT_IDS.includes(product.id))) {
          refreshedDemoProducts.current = true;
        }
        if (missingBasketProductIds.length) {
          fetchProductsByIds(missingBasketProductIds)
            .then((products) => {
              if (!cancelled && products.length) {
                setLiveBasketProducts((current) => mergeCatalogProducts(current, products));
              }
            })
            .catch(() => {});
        }
        if (INITIAL_SHARED_BASKET?.status === "valid") {
          const requestedBasket = INITIAL_SHARED_BASKET.basket;
          const foundIds = new Set(basketProducts.map((product) => product.id));
          const availableBasket = requestedBasket.filter((entry) => foundIds.has(entry.productId));
          const missingCount = requestedBasket.length - availableBasket.length;

          if (!availableBasket.length) {
            setBasket(savedBasket());
            setSharedBasketStatus({ status: "error" });
          } else {
            setBasket(availableBasket);
            setMobileView("plan");
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
        }
        startTransition(() => {
          setLiveRetailers(retailers);
          setLiveCategories(categories);
          setLiveProducts(productResult.products);
          setLiveMeta({
            total: productResult.total || stats.activeProducts,
            page: productResult.page,
            totalPages: productResult.totalPages,
            hasNext: productResult.hasNext,
            activeProducts: stats.activeProducts,
            source: productResult.source,
          });
          setHealth({
            state: stats.source === "snapshot" ? "cached" : "online",
            source: stats.source,
            activeProducts: stats.activeProducts,
            snapshotGeneratedAt: stats.snapshotGeneratedAt,
            liveError: stats.liveError,
          });
          setLiveState(productResult.products.length ? "ready" : "empty");
          setCatalogBootstrapped(true);
        });
      })
      .catch(() => {
        if (cancelled) return;
        if (INITIAL_SHARED_BASKET?.status === "valid") {
          setBasket(savedBasket());
          setSharedBasketStatus({ status: "error" });
          setSharedBasketHydrating(false);
          removeSharedBasketParam();
        }
        setHealth({ state: "offline", activeProducts: 0 });
        setLiveState("error");
        setCatalogBootstrapped(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (IS_BARGAINS_PAGE || !catalogBootstrapped) return undefined;
    return scheduleIdleWork(() => {
      void warmCatalogSearch(health.snapshotGeneratedAt);
    }, { delay: 900, timeout: 2800 });
  }, [catalogBootstrapped, health.snapshotGeneratedAt]);

  useEffect(() => {
    if (IS_BARGAINS_PAGE || !catalogBootstrapped) return undefined;
    let cancelled = false;
    const cancelScheduledWork = scheduleIdleWork(() => {
      fetchUpdateStatus()
        .then((status) => {
          if (!cancelled) setUpdateStatus(status);
        })
        .catch(() => {});
    }, { delay: 650, timeout: 2200 });
    return () => {
      cancelled = true;
      cancelScheduledWork();
    };
  }, [catalogBootstrapped]);

  useEffect(() => {
    if (!IS_BARGAINS_PAGE && !catalogBootstrapped) return undefined;
    let cancelled = false;
    const loadDailyBargain = () => {
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
    };
    const cancelScheduledWork = IS_BARGAINS_PAGE
      ? () => {}
      : scheduleIdleWork(loadDailyBargain, { delay: 180, timeout: 1800 });
    if (IS_BARGAINS_PAGE) loadDailyBargain();
    return () => {
      cancelled = true;
      cancelScheduledWork();
    };
  }, [catalogBootstrapped]);

  useEffect(() => {
    if (!catalogBootstrapped) return undefined;
    if (skipSeededCatalogFetch.current) {
      skipSeededCatalogFetch.current = false;
      return undefined;
    }

    let cancelled = false;
    const requestId = catalogRequestId.current + 1;
    catalogRequestId.current = requestId;
    setLiveState("loading");
    fetchProducts({ query, categoryId, page: 1, sortMode: productSort })
      .then((result) => {
        if (cancelled || requestId !== catalogRequestId.current) return;
        startTransition(() => {
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
        });
      })
      .catch(() => {
        if (cancelled || requestId !== catalogRequestId.current) return;
        startTransition(() => {
          setLiveProducts([]);
          setLiveState("error");
        });
      });
    return () => {
      cancelled = true;
    };
  }, [catalogBootstrapped, categoryId, productSort, query]);

  useEffect(() => {
    saveProductSort(productSort);
  }, [productSort]);

  const allProducts = useMemo(() => {
    const byId = new Map();
    liveBasketProducts.forEach((product) => byId.set(product.id, product));
    liveProducts.forEach((product) => byId.set(product.id, product));
    return [...byId.values()];
  }, [liveBasketProducts, liveProducts]);

  const categories = useMemo(() => {
    return [
      { id: "all", name: t("all"), count: liveMeta.activeProducts || liveMeta.total },
      ...liveCategories.slice(0, 80),
    ];
  }, [liveCategories, liveMeta.activeProducts, liveMeta.total, t]);

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
  const locationFiltersRetailers =
    locationState.status === "ready" ||
    (locationState.status === "loading" && locationState.stores.length > 0);
  const locationEligibleRetailers = useMemo(
    () =>
      filterRetailersByProximity(
        liveRetailers,
        retailerProximity,
        locationFiltersRetailers,
      ),
    [liveRetailers, locationFiltersRetailers, retailerProximity],
  );
  const activeRetailers = useMemo(() => {
    if (retailerFilterIds === null) return locationEligibleRetailers;
    const selectedIds = new Set(retailerFilterIds);
    return locationEligibleRetailers.filter((retailer) => selectedIds.has(retailer.id));
  }, [locationEligibleRetailers, retailerFilterIds]);
  const displayProducts = useMemo(() => {
    return sortProducts(
      liveProducts,
      productSort,
      activeRetailers.map((retailer) => retailer.id),
    );
  }, [activeRetailers, liveProducts, productSort]);
  const basketQuantities = useMemo(
    () => new Map(basket.map((entry) => [entry.productId, entry.quantity])),
    [basket],
  );
  const displayedDailyBargain = useMemo(() => {
    if (!dailyBargain || !locationFiltersRetailers) return dailyBargain;
    const eligibleIds = new Set(locationEligibleRetailers.map((retailer) => retailer.id));
    if (eligibleIds.has(dailyBargain.evidence.bestRetailerId)) return dailyBargain;
    const localPick = dailyBargain.bargains.find((pick) =>
      eligibleIds.has(pick.evidence.bestRetailerId),
    );
    return localPick
      ? {
          ...localPick,
          generatedAt: dailyBargain.generatedAt,
          bargains: dailyBargain.bargains,
        }
      : null;
  }, [dailyBargain, locationEligibleRetailers, locationFiltersRetailers]);

  const productMap = useMemo(
    () => new Map(allProducts.map((product) => [product.id, product])),
    [allProducts],
  );
  const priceWatchByProductId = useMemo(
    () => new Map(priceWatches.map((watch) => [watch.productId, watch])),
    [priceWatches],
  );
  const priceWatchProductIdsKey = useMemo(
    () => priceWatches.map((watch) => watch.productId).sort().join("|"),
    [priceWatches],
  );
  const isDemoBasket = useMemo(() => basketsMatch(basket, DEFAULT_DEMO_BASKET), [basket]);

  useEffect(() => {
    if (!priceWatchOpen) return undefined;
    const productIds = priceWatchProductIdsKey ? priceWatchProductIdsKey.split("|") : [];
    if (!productIds.length) {
      setPriceWatchProducts([]);
      setPriceWatchState("ready");
      return undefined;
    }

    let cancelled = false;
    setPriceWatchState("loading");
    fetchProductsByIds(productIds)
      .then((products) => {
        if (cancelled) return;
        setPriceWatchProducts(products);
        setPriceWatchState("ready");
      })
      .catch(() => {
        if (!cancelled) setPriceWatchState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [priceWatchOpen, priceWatchProductIdsKey, priceWatchRefreshVersion]);

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
    if (!catalogBootstrapped) return undefined;
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
  }, [basket, catalogBootstrapped]);

  useEffect(() => {
    if (!catalogBootstrapped || sharedBasketHydrating) return;
    setBasket((current) => {
      const next = current.filter((entry) => productMap.has(entry.productId));
      return next.length === current.length ? current : next;
    });
  }, [catalogBootstrapped, productMap, sharedBasketHydrating]);

  const rankings = useMemo(
    () => calculateRankings(basket, allProducts, activeRetailers),
    [activeRetailers, allProducts, basket],
  );

  const bestCompleteRanking = useMemo(
    () => rankings.find((row) => row.isComplete) ?? null,
    [rankings],
  );

  const stopComparison = useMemo(
    () => calculateStopComparison(basket, allProducts, activeRetailers, extraStopCost),
    [activeRetailers, allProducts, basket, extraStopCost],
  );
  const visitPlan =
    stopComparison.options.find((option) => option.limit === maxChains)?.plan ?? null;
  const firstCompleteStopOption =
    stopComparison.options.find((option) => option.plan?.isComplete) ?? null;
  const textExportPlan = visitPlan?.isComplete ? visitPlan : firstCompleteStopOption?.plan ?? null;
  const textExportPlanLimit = visitPlan?.isComplete
    ? maxChains
    : firstCompleteStopOption?.limit ?? null;

  const addToBasket = (product) => {
    setSavedBasketNotice(null);
    rememberCatalogProduct(product, setLiveBasketProducts);
    setBasket((current) => {
      const found = current.find((entry) => entry.productId === product.id);
      if (found) {
        return current.map((entry) =>
          entry.productId === product.id
            ? { ...entry, quantity: roundQuantity(entry.quantity + quantityStep()) }
            : entry,
        );
      }
      return [...current, { productId: product.id, quantity: quantityStep() }];
    });
  };

  const replaceBasketProduct = (sourceProduct, replacementProduct) => {
    if (!sourceProduct || !replacementProduct || sourceProduct.id === replacementProduct.id) return;
    setSavedBasketNotice(null);
    rememberCatalogProduct(replacementProduct, setLiveBasketProducts);
    setBasket((current) => {
      const sourceEntry = current.find((entry) => entry.productId === sourceProduct.id);
      if (!sourceEntry) return current;
      const replacementEntry = current.find(
        (entry) => entry.productId === replacementProduct.id,
      );
      const withoutSource = current.filter((entry) => entry.productId !== sourceProduct.id);
      if (replacementEntry) {
        return withoutSource.map((entry) =>
          entry.productId === replacementProduct.id
            ? {
                ...entry,
                quantity: Math.min(
                  999,
                  roundQuantity(entry.quantity + sourceEntry.quantity),
                ),
              }
            : entry,
        );
      }
      return [
        ...withoutSource,
        { productId: replacementProduct.id, quantity: sourceEntry.quantity },
      ];
    });
    setSelectedProduct(replacementProduct);
  };

  const updateQuantity = (product, nextQuantity) => {
    setSavedBasketNotice(null);
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
    setSavedBasketNotice(null);
    setBasket([]);
    setMaxChains(1);
    setSharedBasketStatus(null);
    setBasketExportOpen(false);
    setMobileView("products");
  };

  const loadDemoBasket = () => {
    setSavedBasketNotice(null);
    setBasket(DEFAULT_DEMO_BASKET);
    setMaxChains(4);
    setSharedBasketStatus(null);
    setMobileView("plan");
    refreshedDemoProducts.current = false;
  };

  const currentBasketUrl = () => {
    const baseUrl = new URL(APP_BASE_PATH, window.location.origin).toString();
    return buildSharedBasketUrl(baseUrl, basket, maxChains, retailerFilterIds);
  };

  const openShareBasket = () => {
    if (!basket.length) return;
    setBasketExportOpen(false);
    setShareUrl(currentBasketUrl());
  };

  const openBasketExport = () => {
    if (!basket.length) return;
    setShareUrl("");
    setBasketExportOpen(true);
  };

  const saveCurrentBasket = (name) => {
    if (!basket.length) throw new Error("empty_saved_basket");
    const next = upsertSavedBasket(savedBaskets, {
      name,
      basket,
      maxChains,
      retailerIds: retailerFilterIds,
      extraStopCost,
    });
    const persisted = persistSavedBaskets(next);
    setSavedBaskets(persisted);
    setSavedBasketNotice({ status: "saved", name: persisted[0].name });
    return persisted[0];
  };

  const deleteSavedBasket = (id) => {
    const next = persistSavedBaskets(removeSavedBasket(savedBaskets, id));
    setSavedBaskets(next);
  };

  const saveProductWatch = (product, targetPrice = null) => {
    const next = persistPriceWatches(
      upsertPriceWatch(priceWatches, { productId: product.id, targetPrice }),
    );
    setPriceWatches(next);
    setPriceWatchProducts((current) => mergeCatalogProducts(current, [product]));
    return next.find((watch) => watch.productId === product.id) ?? null;
  };

  const updateProductWatchTarget = (productId, targetPrice = null) => {
    const next = persistPriceWatches(
      upsertPriceWatch(priceWatches, { productId, targetPrice }),
    );
    setPriceWatches(next);
    return next.find((watch) => watch.productId === productId) ?? null;
  };

  const deleteProductWatch = (productId) => {
    const next = persistPriceWatches(removePriceWatch(priceWatches, productId));
    setPriceWatches(next);
    setPriceWatchProducts((current) =>
      current.filter((product) => product.id !== productId),
    );
  };

  const restoreSavedBasket = async (saved) => {
    const products = await fetchProductsByIds(saved.basket.map((entry) => entry.productId));
    const foundIds = new Set(products.map((product) => product.id));
    const availableBasket = saved.basket.filter((entry) => foundIds.has(entry.productId));
    if (!availableBasket.length) throw new Error("saved_basket_products_unavailable");
    const missingCount = saved.basket.length - availableBasket.length;

    setLiveBasketProducts((current) => mergeCatalogProducts(current, products));
    setBasket(availableBasket);
    setMaxChains(saved.maxChains);
    setRetailerFilterIds(saved.retailerIds);
    setExtraStopCost(saved.extraStopCost);
    setSharedBasketStatus(null);
    setSelectedProduct(null);
    setMobileView("plan");
    setSavedBasketNotice({
      status: "loaded",
      name: saved.name,
      productCount: availableBasket.length,
      missingCount,
    });
    refreshedDemoProducts.current = false;
  };

  const importBasketData = async (data) => {
    const products = await fetchProductsByIds(data.basket.map((entry) => entry.productId));
    const foundIds = new Set(products.map((product) => product.id));
    const availableBasket = data.basket.filter((entry) => foundIds.has(entry.productId));
    if (!availableBasket.length) throw new Error("basket_data_products_unavailable");
    const missingCount = data.basket.length - availableBasket.length;

    setLiveBasketProducts((current) => mergeCatalogProducts(current, products));
    setBasket(availableBasket);
    setMaxChains(data.maxChains);
    setRetailerFilterIds(data.retailerIds);
    setExtraStopCost(data.extraStopCost);
    setSharedBasketStatus(null);
    setSelectedProduct(null);
    setMobileView("plan");
    setBasketExportOpen(false);
    setSavedBasketNotice({
      status: "imported",
      productCount: availableBasket.length,
      missingCount,
    });
    refreshedDemoProducts.current = false;
  };

  const loadMoreLiveProducts = () => {
    if (!liveMeta.hasNext || liveState === "loading_more") return;
    const nextPage = liveMeta.page + 1;
    setLiveState("loading_more");
    fetchProducts({ query, categoryId, page: nextPage, sortMode: productSort })
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
      setRetailerFilterIds(null);
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
    setRetailerFilterIds(null);
  };

  const toggleRetailerFilter = (retailerId) => {
    setRetailerFilterIds((current) => {
      const allIds = locationEligibleRetailers.map((retailer) => retailer.id);
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

  const changeMobileView = (nextView) => {
    setMobileView(nextView);
    window.requestAnimationFrame(() => {
      mobileWorkspaceNav.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  if (IS_BARGAINS_PAGE) {
    return (
      <div className="app-shell bargains-shell">
        <Header
          health={health}
          basketCount={basket.length}
          priceWatchCount={priceWatches.length}
          onOpenPriceWatch={() => setPriceWatchOpen(true)}
        />
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
            basketQuantity={basketQuantities.get(selectedProduct.id) || 0}
            onSelectAlternative={setSelectedProduct}
            onAddAlternative={addToBasket}
            onReplaceAlternative={(replacement) =>
              replaceBasketProduct(selectedProduct, replacement)}
            watch={priceWatchByProductId.get(selectedProduct.id) ?? null}
            onSaveWatch={(targetPrice) => saveProductWatch(selectedProduct, targetPrice)}
            onRemoveWatch={() => deleteProductWatch(selectedProduct.id)}
          />
        ) : null}
        {priceWatchOpen ? (
          <PriceWatchDialog
            watches={priceWatches}
            products={priceWatchProducts}
            retailers={liveRetailers}
            state={priceWatchState}
            onRefresh={() => setPriceWatchRefreshVersion((value) => value + 1)}
            onUpdateTarget={updateProductWatchTarget}
            onRemove={deleteProductWatch}
            onSelect={(product) => {
              setPriceWatchOpen(false);
              setSelectedProduct(product);
            }}
            onAdd={addToBasket}
            onClose={() => setPriceWatchOpen(false)}
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
        priceWatchCount={priceWatches.length}
        onOpenPriceWatch={() => setPriceWatchOpen(true)}
      />

      <AppIntro health={health} updateStatus={updateStatus} />
      <DataFreshnessNotice health={health} updateStatus={updateStatus} />

      {displayedDailyBargain ? (
        <DailyBargain
          pick={displayedDailyBargain}
          retailers={locationEligibleRetailers}
          onSelect={() => setSelectedProduct(displayedDailyBargain.product)}
          onAdd={() => {
            addToBasket(displayedDailyBargain.product);
            setMobileView("basket");
          }}
          moreHref={BARGAINS_PATH}
        />
      ) : dailyBargainState === "loading" ? (
        <DailyBargainSkeleton />
      ) : null}

      <MobileWorkspaceNav
        navRef={mobileWorkspaceNav}
        activeView={mobileView}
        productCount={displayProducts.length}
        basketCount={basket.length}
        planStopCount={visitPlan?.isComplete ? visitPlan.chainCount : 0}
        onChange={changeMobileView}
      />

      <main className="workspace" aria-label={t("workspace")}>
        <SearchPanel
          mobileActive={mobileView === "products"}
          query={query}
          setQuery={setQuery}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          productSort={productSort}
          setProductSort={setProductSort}
          categories={categories}
          products={displayProducts}
          basketQuantities={basketQuantities}
          retailers={activeRetailers}
          catalogSource={liveMeta.source || health.source}
          liveState={liveState}
          liveMeta={liveMeta}
          selectedProduct={selectedProduct}
          onSearchFocus={() => warmCatalogSearch(health.snapshotGeneratedAt)}
          onSelect={setSelectedProduct}
          onAdd={addToBasket}
          onLoadMore={loadMoreLiveProducts}
        />

        <BasketPanel
          mobileActive={mobileView === "basket"}
          basket={basket}
          productMap={productMap}
          rankings={rankings}
          bestCompleteRanking={bestCompleteRanking}
          visitPlan={visitPlan}
          stopComparison={stopComparison}
          maxChains={maxChains}
          isDemoBasket={isDemoBasket}
          onQuantity={updateQuantity}
          onClear={clearBasket}
          onExport={openBasketExport}
          onShare={openShareBasket}
          onOpenSavedBaskets={() => setSavedBasketsOpen(true)}
          onLoadDemo={loadDemoBasket}
          onSelect={setSelectedProduct}
          sharedBasketStatus={sharedBasketStatus}
          savedBasketCount={savedBaskets.length}
          savedBasketNotice={savedBasketNotice}
          onDismissSavedBasketNotice={() => setSavedBasketNotice(null)}
        />

        <RankingsPanel
          mobileActive={mobileView === "plan"}
          rankings={rankings}
          bestCompleteRanking={bestCompleteRanking}
          visitPlan={visitPlan}
          maxChains={maxChains}
          setMaxChains={setMaxChains}
          stopComparison={stopComparison}
          extraStopCost={extraStopCost}
          setExtraStopCost={setExtraStopCost}
          basketSize={basket.length}
          locationState={locationState}
          locationRadiusKm={locationRadiusKm}
          retailerProximity={retailerProximity}
          retailers={locationEligibleRetailers}
          retailerFilterIds={retailerFilterIds}
          nearbyRetailerCount={nearbyRetailerIds.length}
          onRequestLocation={() => loadNearbyStores()}
          onChangeLocationRadius={changeLocationRadius}
          onClearLocation={clearLocation}
          onToggleRetailer={toggleRetailerFilter}
          onSelectAllRetailers={() => setRetailerFilterIds(null)}
        />
      </main>

      {selectedProduct ? (
        <ProductDrawer
          product={selectedProduct}
          retailers={activeRetailers}
          onClose={() => setSelectedProduct(null)}
          onAdd={() => addToBasket(selectedProduct)}
          basketQuantity={basketQuantities.get(selectedProduct.id) || 0}
          onSelectAlternative={setSelectedProduct}
          onAddAlternative={addToBasket}
          onReplaceAlternative={(replacement) =>
            replaceBasketProduct(selectedProduct, replacement)}
          watch={priceWatchByProductId.get(selectedProduct.id) ?? null}
          onSaveWatch={(targetPrice) => saveProductWatch(selectedProduct, targetPrice)}
          onRemoveWatch={() => deleteProductWatch(selectedProduct.id)}
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

      {basketExportOpen && basket.length ? (
        <BasketExportDialog
          basket={basket}
          productMap={productMap}
          maxChains={maxChains}
          retailerIds={retailerFilterIds}
          extraStopCost={extraStopCost}
          selectedStopLimit={maxChains}
          selectedPlanComplete={Boolean(visitPlan?.isComplete)}
          plan={textExportPlan}
          planStopLimit={textExportPlanLimit}
          shareUrl={currentBasketUrl()}
          onImport={importBasketData}
          onClose={() => setBasketExportOpen(false)}
        />
      ) : null}

      {savedBasketsOpen ? (
        <SavedBasketsDialog
          baskets={savedBaskets}
          currentBasketCount={basket.length}
          onSave={saveCurrentBasket}
          onLoad={restoreSavedBasket}
          onDelete={deleteSavedBasket}
          onClose={() => setSavedBasketsOpen(false)}
        />
      ) : null}

      {priceWatchOpen ? (
        <PriceWatchDialog
          watches={priceWatches}
          products={priceWatchProducts}
          retailers={activeRetailers}
          state={priceWatchState}
          onRefresh={() => setPriceWatchRefreshVersion((value) => value + 1)}
          onUpdateTarget={updateProductWatchTarget}
          onRemove={deleteProductWatch}
          onSelect={(product) => {
            setPriceWatchOpen(false);
            setSelectedProduct(product);
          }}
          onAdd={addToBasket}
          onClose={() => setPriceWatchOpen(false)}
        />
      ) : null}
    </div>
  );
}

function DailyBargain({ pick, retailers, onSelect, onAdd, moreHref }) {
  const { language, locale, money, t } = usePreferences();
  const retailer = retailers.find((item) => item.id === pick.evidence.bestRetailerId);
  const retailerName = retailer?.name || pick.evidence.bestRetailerName;
  const updated = formatDataTime(pick.catalogGeneratedAt || pick.generatedAt, locale, t);
  const headline = language === "el" ? pick.headline : t("bargainHeadline");
  const reason = t("bargainReason", {
    retailer: retailerName,
    amount: money(pick.evidence.savingsVsHighest),
  });
  return (
    <section className="daily-bargain" aria-labelledby="daily-bargain-title">
      <button type="button" className="daily-bargain-product" onClick={onSelect}>
        <ProductThumb product={pick.product} />
        <span className="daily-bargain-copy">
          <small className="daily-bargain-label">
            <Sparkles size={14} aria-hidden="true" />
            {t("dailyBargain")}
          </small>
          <strong id="daily-bargain-title">{headline}</strong>
          <span>{pick.product.name}</span>
        </span>
      </button>

      <div className="daily-bargain-reason">
        <p>{reason}</p>
        <small>{t("aiPublicData", { time: updated })}</small>
      </div>

      <div className="daily-bargain-price">
        {retailer ? <RetailerLogo retailer={retailer} ariaHidden /> : null}
        <span>
          <strong>{money(pick.evidence.bestPrice)}</strong>
          <small>{retailerName}</small>
        </span>
        <span className="daily-saving">
          <b>{t("percentCheaper", { percent: Math.round(pick.evidence.savingsPercentVsHighest) })}</b>
          <small>{t("belowHighest", { amount: money(pick.evidence.savingsVsHighest) })}</small>
        </span>
      </div>

      <div className="daily-bargain-actions">
        <button type="button" className="text-button" onClick={onSelect}>
          <Info size={16} />
          {t("details")}
        </button>
        <a className="text-button bargains-button" href={moreHref}>
          <Sparkles size={16} />
          {t("moreBargains")}
          <ChevronRight size={15} />
        </a>
        <button type="button" className="text-button primary-button" onClick={onAdd}>
          <Plus size={17} />
          {t("toBasket")}
        </button>
      </div>
    </section>
  );
}

function DailyBargainSkeleton() {
  const { t } = usePreferences();
  return (
    <section className="daily-bargain daily-bargain-skeleton" aria-label={t("loading")}>
      <span className="skeleton-block skeleton-thumb" aria-hidden="true" />
      <span className="skeleton-copy" aria-hidden="true">
        <span className="skeleton-block skeleton-line short" />
        <span className="skeleton-block skeleton-line" />
        <span className="skeleton-block skeleton-line medium" />
      </span>
      <span className="skeleton-copy daily-bargain-skeleton-reason" aria-hidden="true">
        <span className="skeleton-block skeleton-line" />
        <span className="skeleton-block skeleton-line medium" />
      </span>
      <span className="skeleton-copy daily-bargain-skeleton-price" aria-hidden="true">
        <span className="skeleton-block skeleton-line short" />
        <span className="skeleton-block skeleton-line medium" />
      </span>
      <span className="skeleton-block daily-bargain-skeleton-action" aria-hidden="true" />
    </section>
  );
}

function PriceChangesApp() {
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

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, status: "loading" }));
    fetchPriceChangesFeed(controller.signal)
      .then((raw) => {
        const normalized = normalizePriceChangesPayload(raw);
        setState({
          status: "ready",
          data: {
            ...normalized,
            changes: normalized.changes.map((change) => ({
              ...change,
              product: priceChangeProduct(change),
            })),
          },
        });
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          setState((current) => ({ ...current, status: "error" }));
        }
      });
    return () => controller.abort();
  }, [requestVersion]);

  const data = state.data;
  const retailers = useMemo(
    () => priceChangeRetailers(data?.changes || []),
    [data?.changes],
  );
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
  const remainingChangeCount = Math.max(0, visibleChanges.length - renderedChanges.length);

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
    if (selectedProductHistory?.retailers?.length) {
      return selectedProductHistory;
    }
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
        <a className="bargains-back" href={APP_BASE_PATH}>
          <ArrowLeft size={17} aria-hidden="true" />
          {t("backToBasket")}
        </a>

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
                      locale={locale}
                      money={money}
                      onOpenHistory={openPriceHistory}
                      t={t}
                    />
                  ))}
                </div>
                {remainingChangeCount ? (
                  <button
                    type="button"
                    className="text-button changes-load-more"
                    onClick={() => setVisibleChangeLimit((current) => (
                      current + PRICE_CHANGE_ROW_BATCH
                    ))}
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
          history={selectedHistory}
          product={selectedHistoryProduct}
          productLoading={selectedProductDetail?.status === "loading"}
          retentionDays={data?.retentionDays || 7}
          onClose={closePriceHistory}
        />
      ) : null}
    </div>
  );
}

async function fetchPriceChangesFeed(signal) {
  let lastError;
  const urls = [
    runtimeAppUrl("data/price-changes.json"),
    runtimeAppUrl("api/price-changes.php"),
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "default",
        signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (error?.name === "AbortError") throw error;
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
  locale,
  money,
  onOpenHistory,
  t,
}) {
  const decreased = change.direction === "decrease";
  const exactTime = formatDateTime(new Date(change.changedAt), locale);
  const relativeTime = formatRelativeTime(change.changedAt, locale, t);
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
        <ProductThumb product={change.product} compact />
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
  history,
  product,
  productLoading,
  retentionDays,
  onClose,
}) {
  const { locale, money, number, t } = usePreferences();
  const closeButtonRef = useRef(null);
  const chartContainerRef = useRef(null);
  const [chartDimensions, setChartDimensions] = useState({ width: 900, height: 330 });
  const chart = useMemo(
    () => createPriceHistoryChart(history, chartDimensions),
    [chartDimensions, history],
  );

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
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
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
  }, [onClose]);

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
      <div className="drawer-panel price-history-panel">
        <header className="price-history-head">
          <ProductThumb
            product={product || {
              id: history.productId,
              name: history.productName,
              imageUrl: history.imageUrl,
            }}
          />
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
                      {formatHistoryDate(tick.observedAtMs, locale)}
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
                    <strong>{money(series.summary.latestPrice)}</strong>
                    <small>
                      {t("priceHistoryStartedAt", {
                        price: money(series.summary.firstPrice),
                      })}
                    </small>
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
    </aside>
  );
}

function formatHistoryDate(timestamp, locale) {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "";
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

function formatRelativeTime(value, locale, t) {
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

function BargainsPage({ pick, state, retailers, onSelect, onAdd }) {
  const { language, locale, money, number, t } = usePreferences();
  const bargains = pick?.bargains || [];
  const updated = formatDataTime(
    pick?.catalogGeneratedAt || pick?.generatedAt,
    locale,
    t,
  );

  return (
    <main className="bargains-page">
      <a className="bargains-back" href={APP_BASE_PATH}>
        <ArrowLeft size={17} />
        {t("backToBasket")}
      </a>

      <header className="bargains-heading">
        <div>
          <span className="bargains-eyebrow">
            <Sparkles size={16} />
            {t("dailyPicks")}
          </span>
          <h1>{t("bargainsTitle")}</h1>
          <p>{t("bargainsDescription")}</p>
        </div>
        {updated ? (
          <span className="bargains-updated">
            {t("bargainChoices", { count: number(bargains.length), time: updated })}
          </span>
        ) : null}
      </header>

      {state === "loading" ? (
        <div className="bargains-status" role="status">
          <RefreshCw size={20} className="spin" />
          {t("loadingBargains")}
        </div>
      ) : null}

      {state === "error" ? (
        <div className="bargains-status error" role="alert">
          <AlertCircle size={20} />
          {t("bargainsUnavailable")}
        </div>
      ) : null}

      {bargains.length ? (
        <section className="bargains-grid" aria-label={t("todaysBargains")}>
          {bargains.map((bargain, index) => {
            const retailer = retailers.find(
              (item) => item.id === bargain.evidence.bestRetailerId,
            );
            const retailerName = retailer?.name || bargain.evidence.bestRetailerName;
            return (
              <article className="bargain-card" key={bargain.productId}>
                <button
                  type="button"
                  className="bargain-card-product"
                  onClick={() => onSelect(bargain.product)}
                >
                  <ProductThumb product={bargain.product} />
                  <span className="bargain-card-copy">
                    <small>{index === 0 ? t("dailyPick") : t("bargainNumber", { number: index + 1 })}</small>
                    <strong>{language === "el" ? bargain.headline : t("bargainHeadline")}</strong>
                    <span>{bargain.product.name}</span>
                  </span>
                </button>

                <div className="bargain-card-price">
                  <span className="bargain-card-chain">
                    {retailer ? <RetailerLogo retailer={retailer} ariaHidden /> : null}
                    <span>
                      <strong>{money(bargain.evidence.bestPrice)}</strong>
                      <small>{retailerName}</small>
                    </span>
                  </span>
                  <span className="bargain-card-saving">
                    <strong>{Math.round(bargain.evidence.savingsPercentVsHighest)}%</strong>
                    <small>{t("cheaper")}</small>
                  </span>
                </div>

                <p className="bargain-card-reason">
                  {t("bargainReason", {
                    retailer: retailerName,
                    amount: money(bargain.evidence.savingsVsHighest),
                  })}
                </p>

                <div className="bargain-card-meta">
                  <span>{t("chainCount", { count: number(bargain.evidence.retailerCount) })}</span>
                  <span>{t("belowHighestShort", { amount: money(bargain.evidence.savingsVsHighest) })}</span>
                </div>

                <div className="bargain-card-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onSelect(bargain.product)}
                  >
                    <Info size={16} />
                    {t("details")}
                  </button>
                  <button
                    type="button"
                    className="text-button primary-button"
                    onClick={() => onAdd(bargain.product)}
                  >
                    <Plus size={17} />
                    {t("toBasket")}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {bargains.length ? (
        <p className="bargains-footnote">
          {t("bargainsFootnote")}
        </p>
      ) : null}
    </main>
  );
}

function Header({
  health,
  basketCount,
  showBasket = true,
  priceWatchCount = 0,
  onOpenPriceWatch = null,
}) {
  const { language, number, setLanguage, setTheme, t, theme } = usePreferences();
  const isOnline = health.state === "online";
  const isCached = health.state === "cached";
  const healthLabel = healthStatusLabel(health, t, number);
  const themeIcons = {
    system: <Monitor size={14} aria-hidden="true" />,
    light: <Sun size={14} aria-hidden="true" />,
    dark: <Moon size={14} aria-hidden="true" />,
  };
  const themeLabels = {
    system: t("systemTheme"),
    light: t("lightTheme"),
    dark: t("darkTheme"),
  };
  return (
    <header className="topbar">
      <a className="brand" href={APP_BASE_PATH} aria-label={t("agenticSpirosHome")}>
        <span className="brand-mark">
          <ShoppingBasket size={21} aria-hidden="true" />
        </span>
        <span>
          <strong>{t("brandName")}</strong>
          <small>{t("brandTagline")}</small>
        </span>
      </a>

      <div className="topbar-actions">
        <div className="preference-switch language-switch" role="group" aria-label={t("languageSelector")}>
          <Languages size={14} aria-hidden="true" />
          {SUPPORTED_LANGUAGES.map((option) => (
            <button
              key={option}
              type="button"
              className={language === option ? "active" : ""}
              aria-pressed={language === option}
              title={option === "el" ? t("greek") : t("english")}
              onClick={() => setLanguage(option)}
            >
              {option === "el" ? "ΕΛ" : "EN"}
            </button>
          ))}
        </div>
        <div className="preference-switch theme-switch" role="group" aria-label={t("themeSelector")}>
          {SUPPORTED_THEMES.map((option) => (
            <button
              key={option}
              type="button"
              className={theme === option ? "active" : ""}
              aria-pressed={theme === option}
              aria-label={themeLabels[option]}
              title={themeLabels[option]}
              onClick={() => setTheme(option)}
            >
              {themeIcons[option]}
            </button>
          ))}
        </div>
        <a
          className="repo-link"
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          title={t("openGithub")}
          aria-label={t("openGithub")}
        >
          <Github size={16} aria-hidden="true" />
          <span>GitHub</span>
        </a>
        <span className="version-badge" title={t("appVersion")}>
          <Tag size={14} aria-hidden="true" />
          v{APP_VERSION}
        </span>
        <div
          className={`source-status ${isOnline ? "online" : isCached ? "cached" : "offline"}`}
          title={t("apiStatus")}
        >
          {isOnline ? <Wifi size={16} /> : isCached ? <AlertCircle size={16} /> : <WifiOff size={16} />}
          <span>{healthLabel}</span>
        </div>
        {onOpenPriceWatch ? (
          <button
            type="button"
            className="price-watch-pill"
            title={t("openPriceWatch", { count: number(priceWatchCount) })}
            aria-label={t("openPriceWatch", { count: number(priceWatchCount) })}
            onClick={onOpenPriceWatch}
          >
            <Bell size={16} aria-hidden="true" />
            <span>{number(priceWatchCount)}</span>
          </button>
        ) : null}
        {showBasket ? (
          <div className="basket-pill" title={t("basketItems")}>
            <ShoppingBasket size={16} />
            <span>{number(basketCount)}</span>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function AppIntro({ health, updateStatus }) {
  const { locale, t } = usePreferences();
  const refreshFailed = updateStatus?.refreshStatus === "failed";
  const showIntroTimestamp = health.source !== "snapshot";
  return (
    <section className="app-intro" aria-label={t("appPurpose")}>
      <div>
        <h1>{t("introTitle")}</h1>
        <p>{t("introDescription")}</p>
      </div>
      <div className="intro-side">
        <a className="price-changes-nav" href={PRICE_CHANGES_PATH}>
          <ArrowDownUp size={17} aria-hidden="true" />
          <span>
            <strong>{t("priceChangesTitle")}</strong>
            <small>{t("priceChangesPageDescription")}</small>
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </a>
        <div className="intro-facts" aria-label={t("dataStatus")}>
          <span>
            {refreshFailed
              ? t("lastAttemptFailed")
              : health.source === "snapshot"
              ? t("hourlyUpdates")
              : health.state === "online"
                ? t("liveProductPrices")
                : t("waitingLivePrices")}
          </span>
          {showIntroTimestamp ? <span>{formatUpdateStatus(updateStatus, t, locale)}</span> : null}
        </div>
      </div>
    </section>
  );
}

function DataFreshnessNotice({ health, updateStatus }) {
  const { locale, t } = usePreferences();
  if (health.source !== "snapshot") return null;
  const snapshotTime = formatDataTime(
    updateStatus?.snapshotGeneratedAt || health.snapshotGeneratedAt || updateStatus?.lastSuccessfulRefreshAt,
    locale,
    t,
  );
  const refreshAttemptTime = formatDataTime(updateStatus?.refreshCheckedAt, locale, t);
  const refreshFailed = updateStatus?.refreshStatus === "failed";
  const isAutoSnapshot = updateStatus?.status === "snapshot";

  return (
    <details
      className="data-warning"
      aria-label={t("freshnessWarning")}
      open={refreshFailed || undefined}
    >
      <summary>
        <span className="freshness-icon" aria-hidden="true">
          <AlertCircle size={17} />
        </span>
        <span className="freshness-summary">
          <strong>
          {refreshFailed
            ? t("refreshFailedTitle")
            : isAutoSnapshot
            ? t("refreshAutomaticTitle")
            : t("refreshLatestTitle")}
          </strong>
          <small>{t("lastCatalogueUpdate", { time: snapshotTime })}</small>
        </span>
        <ChevronRight size={17} className="freshness-chevron" aria-hidden="true" />
      </summary>
      <div className="freshness-details">
        <p>
          {t("refreshSnapshotExplanation")}
          {refreshFailed
            ? t("refreshAttempt", {
                time: refreshAttemptTime,
                error: friendlyRefreshError(updateStatus?.refreshError, t),
              })
            : ""}
        </p>
      </div>
    </details>
  );
}

function MobileWorkspaceNav({
  navRef,
  activeView,
  productCount,
  basketCount,
  planStopCount,
  onChange,
}) {
  const { number, t } = usePreferences();
  const items = [
    { id: "products", label: t("products"), icon: <PackageSearch size={17} />, count: productCount },
    { id: "basket", label: t("basket"), icon: <ClipboardList size={17} />, count: basketCount },
    { id: "plan", label: t("plan"), icon: <Store size={17} />, count: planStopCount || "-" },
  ];
  return (
    <nav
      ref={navRef}
      className="mobile-workspace-nav"
      aria-label={t("mobileWorkspaceNavigation")}
      role="tablist"
    >
      {items.map((item) => {
        const active = activeView === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={active ? "active" : ""}
            aria-selected={active}
            aria-controls={`${item.id}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
            <small>{typeof item.count === "number" ? number(item.count) : item.count}</small>
          </button>
        );
      })}
    </nav>
  );
}

function SearchPanel({
  mobileActive,
  query,
  setQuery,
  categoryId,
  setCategoryId,
  productSort,
  setProductSort,
  categories,
  products,
  basketQuantities,
  retailers,
  catalogSource,
  liveState,
  liveMeta,
  selectedProduct,
  onSearchFocus,
  onSelect,
  onAdd,
  onLoadMore,
}) {
  const { number, t } = usePreferences();
  const resultAction = `${number(products.length)}/${number(liveMeta.total)}`;
  const canLoadMore = liveMeta.hasNext;
  const isLoadingMore = liveState === "loading_more";

  return (
    <section
      id="products-panel"
      className={`panel search-panel${mobileActive ? " mobile-active" : ""}${liveState === "loading" ? " is-refreshing" : ""}`}
      aria-labelledby="search-title"
      aria-busy={liveState === "loading" || isLoadingMore}
    >
      <PanelTitle
        id="search-title"
        icon={<PackageSearch size={18} />}
        title={t("products")}
        action={resultAction}
      />

      <ProductSearchInput
        value={query}
        onChange={setQuery}
        onFocus={onSearchFocus}
        placeholder={t("searchPlaceholder")}
      />

      <div className="chips" aria-label={t("categories")}>
        {categories.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === categoryId ? "chip active" : "chip"}
            onClick={() => setCategoryId(item.id)}
            title={item.count ? t("productCountTitle", { count: number(item.count) }) : item.name}
          >
            {item.name}
          </button>
        ))}
      </div>

      <label className="sort-control">
        <ArrowDownUp size={15} aria-hidden="true" />
        <span>{t("sortProducts")}</span>
        <select
          value={productSort}
          aria-label={t("sortProducts")}
          onChange={(event) => setProductSort(event.target.value)}
        >
          {PRODUCT_SORT_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`productSort_${mode}`)}
            </option>
          ))}
        </select>
      </label>

      <LiveNotice
        state={liveState}
        total={liveMeta.total}
        visible={products.length}
        catalogSource={catalogSource}
        sortMode={productSort}
      />

      {liveState === "loading" && !products.length ? (
        <ProductListSkeleton />
      ) : (
        <div className="product-list">
          {products.map((product, index) => (
            <ProductRow
              key={product.id}
              product={product}
              retailers={retailers}
              basketQuantity={basketQuantities.get(product.id) || 0}
              imagePriority={index < 4}
              selected={selectedProduct?.id === product.id}
              onSelect={() => onSelect(product)}
              onAdd={() => onAdd(product)}
            />
          ))}
        </div>
      )}

      {canLoadMore ? (
        <button
          type="button"
          className="load-more"
          onClick={onLoadMore}
          disabled={isLoadingMore}
        >
          <RefreshCw size={16} />
          {isLoadingMore ? t("loading") : t("loadMore")}
        </button>
      ) : null}
    </section>
  );
}

function ProductSearchInput({ value, onChange, onFocus, placeholder }) {
  const { t } = usePreferences();
  const [draft, setDraft] = useState(value);
  const isComposing = useRef(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (isComposing.current || draft === value) return undefined;
    const timer = window.setTimeout(() => onChange(draft), 180);
    return () => window.clearTimeout(timer);
  }, [draft, onChange, value]);

  const clear = () => {
    setDraft("");
    onChange("");
  };

  return (
    <label className="search-box">
      <Search size={18} aria-hidden="true" />
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={onFocus}
        onCompositionStart={() => {
          isComposing.current = true;
        }}
        onCompositionEnd={(event) => {
          isComposing.current = false;
          setDraft(event.currentTarget.value);
        }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck="false"
      />
      {draft ? (
        <button type="button" className="search-clear" onClick={clear} aria-label={t("clear")}>
          <X size={16} />
        </button>
      ) : (
        <Barcode size={17} aria-hidden="true" />
      )}
    </label>
  );
}

function ProductListSkeleton() {
  return (
    <div className="product-list product-list-skeleton" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="product-row product-row-skeleton" key={index}>
          <span className="skeleton-block skeleton-product-thumb" />
          <span className="skeleton-copy">
            <span className="skeleton-block skeleton-line" />
            <span className="skeleton-block skeleton-line medium" />
          </span>
          <span className="skeleton-copy skeleton-price">
            <span className="skeleton-block skeleton-line short" />
            <span className="skeleton-block skeleton-line short" />
          </span>
          <span className="skeleton-block skeleton-button" />
        </div>
      ))}
    </div>
  );
}

function LiveNotice({ state, total, visible, catalogSource, sortMode }) {
  const { number, t } = usePreferences();
  const labels = {
    idle: t("catalogProducts"),
    loading: t("loadingProducts"),
    loading_more: t("loadingMoreProducts"),
    ready:
      catalogSource === "snapshot"
        ? t("catalogResults", { visible: number(visible), total: number(total) })
        : t("liveResults", { visible: number(visible), total: number(total) }),
    empty: t("noResults"),
    error: t("catalogUnavailable"),
  };
  return (
    <div className={`inline-status ${state}`}>
      {state === "error" ? <AlertCircle size={15} /> : <RefreshCw size={15} />}
      <span>{labels[state] ?? labels.idle}</span>
      {state === "ready" || state === "loading_more" ? (
        <small>{t(`productSortStatus_${sortMode}`)}</small>
      ) : null}
    </div>
  );
}

function ProductRow({
  product,
  retailers,
  basketQuantity,
  imagePriority,
  selected,
  onSelect,
  onAdd,
}) {
  const { money, number, t } = usePreferences();
  const retailerIds = retailers.map((retailer) => retailer.id);
  const best = getBestProductPrice(
    product,
    retailerIds,
  );
  const bestUnit = getBestProductUnitPrice(product, retailerIds);
  const addLabel = basketQuantity
    ? t("addAnotherProduct", { count: number(basketQuantity), name: product.name })
    : t("addProduct", { name: product.name });
  return (
    <article className={`${selected ? "product-row selected" : "product-row"}${basketQuantity ? " in-basket" : ""}`}>
      <button type="button" className="product-main" onClick={onSelect}>
        <ProductThumb product={product} priority={imagePriority} />
        <span className="product-copy">
          <strong>{product.name}</strong>
          <small>
            {product.brand || t("noBrand")} · {product.unitQuantity || product.unit}
          </small>
        </span>
      </button>
      <div className="product-price">
        <span>{best ? money(best.price) : "-"}</span>
        {best ? (
          <PriceChangeBadge product={product} retailerId={best.retailerId} compact />
        ) : null}
        <small>
          {bestUnit
            ? t("unitPrice", { amount: money(bestUnit.unitPrice), unit: product.unit })
            : t("best")}
        </small>
      </div>
      <button
        type="button"
        className={`icon-button add${basketQuantity ? " in-basket" : ""}`}
        onClick={onAdd}
        aria-label={addLabel}
        title={addLabel}
      >
        {basketQuantity ? (
          <span className="add-count">{number(basketQuantity)}</span>
        ) : (
          <Plus size={18} />
        )}
      </button>
    </article>
  );
}

function BasketPanel({
  mobileActive,
  basket,
  productMap,
  rankings,
  bestCompleteRanking,
  visitPlan,
  stopComparison,
  maxChains,
  isDemoBasket,
  onQuantity,
  onClear,
  onExport,
  onShare,
  onOpenSavedBaskets,
  onLoadDemo,
  onSelect,
  sharedBasketStatus,
  savedBasketCount,
  savedBasketNotice,
  onDismissSavedBasketNotice,
}) {
  const { money, number, t } = usePreferences();
  const availableStoreCount = rankings.filter((row) => row.isComplete).length;
  const planAssignments = useMemo(() => buildPlanAssignmentMap(visitPlan), [visitPlan]);
  const bestAvailableByProduct = useMemo(() => {
    const retailersById = new Map(rankings.map((row) => [row.retailer.id, row.retailer]));
    const retailerIds = [...retailersById.keys()];
    return new Map(
      basket.flatMap((entry) => {
        const product = productMap.get(entry.productId);
        const best = product ? getBestProductPrice(product, retailerIds) : null;
        const retailer = best ? retailersById.get(best.retailerId) : null;
        return product && best && retailer
          ? [[product.id, { price: best.price, retailer }]]
          : [];
      }),
    );
  }, [basket, productMap, rankings]);
  const firstCompleteStopLimit =
    stopComparison.options.find((option) => option.plan?.isComplete)?.limit ?? null;
  const planNames = visitPlan?.groups.map((group) => group.retailer.name).join(" + ");
  const hasPartialPlan = basket.length > 0 && visitPlan?.groups.length > 0;
  const oneStopSavings =
    bestCompleteRanking && visitPlan?.isComplete
      ? Math.max(0, bestCompleteRanking.total - visitPlan.total)
      : 0;
  return (
    <section
      id="basket-panel"
      className={`panel basket-panel${mobileActive ? " mobile-active" : ""}`}
      aria-labelledby="basket-title"
    >
      <PanelTitle
        id="basket-title"
        icon={<ClipboardList size={18} />}
        title={t("basket")}
        action={basket.length ? money(visitPlan?.total ?? 0) : money(0)}
      />

      <div className="basket-toolbar">
        <button type="button" className="text-button demo-button" onClick={onLoadDemo}>
          <Sparkles size={16} />
          <span className="button-label">{t("example")}</span>
        </button>
        <button
          type="button"
          className="text-button saved-baskets-button"
          onClick={onOpenSavedBaskets}
        >
          <Bookmark size={16} />
          <span className="button-label">{t("savedBaskets")}</span>
          {savedBasketCount ? (
            <span className="saved-basket-count">{number(savedBasketCount)}</span>
          ) : null}
        </button>
        <button
          type="button"
          className="text-button compact-action"
          onClick={onExport}
          disabled={!basket.length}
          title={t("basketExportTitle")}
        >
          <FileJson2 size={16} />
          <span className="button-label">{t("basketExport")}</span>
        </button>
        <button
          type="button"
          className="text-button share-button compact-action"
          onClick={onShare}
          disabled={!basket.length}
          title={t("share")}
        >
          <Share2 size={16} />
          <span className="button-label">{t("share")}</span>
        </button>
        <button
          type="button"
          className="text-button danger-button"
          onClick={onClear}
          aria-label={t("newBasketLabel")}
        >
          <Trash2 size={17} />
          <span className="button-label">{t("newBasket")}</span>
        </button>
      </div>

      <SharedBasketNotice state={sharedBasketStatus} />
      <SavedBasketNotice
        state={savedBasketNotice}
        onDismiss={onDismissSavedBasketNotice}
      />

      {isDemoBasket && !sharedBasketStatus ? (
        <div className="demo-hint">
          <Sparkles size={15} />
          <span>{t("demoHint")}</span>
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
                alternativeOffer={bestAvailableByProduct.get(product.id)}
                completeStopLimit={firstCompleteStopLimit}
                onQuantity={onQuantity}
                onSelect={() => onSelect(product)}
              />
            );
          })
        )}
      </div>

      <div className="best-strip">
        <div>
          <small>{t("plan")}</small>
          <strong>
            {visitPlan?.isComplete
              ? planNames
              : hasPartialPlan
                ? t("partialPlan", { names: planNames })
                : t("noAvailableProduct")}
          </strong>
        </div>
        <div>
          <small>{t("stops")}</small>
          <strong>
            {visitPlan?.groups.length
              ? `${visitPlan.chainCount}/${maxChains}`
              : availableStoreCount}
          </strong>
        </div>
        <div>
          <small>{visitPlan?.isComplete ? t("savingsVsOneStop") : t("partialTotal")}</small>
          <strong>{money(visitPlan?.isComplete ? oneStopSavings : visitPlan?.total ?? 0)}</strong>
        </div>
      </div>
    </section>
  );
}

function SavedBasketNotice({ state, onDismiss }) {
  const { number, t } = usePreferences();
  if (!state) return null;
  const isImported = state.status === "imported";
  return (
    <div className="saved-basket-notice" role="status">
      {isImported ? <FileJson2 size={15} /> : <Bookmark size={15} />}
      <span>
        {state.status === "saved"
          ? t("savedBasketSaved", { name: state.name })
          : isImported
            ? t("basketDataImported", {
                products: formatProductCount(state.productCount, t, number),
                missing: number(state.missingCount),
              })
            : t("savedBasketLoaded", {
                name: state.name,
                products: formatProductCount(state.productCount, t, number),
                missing: number(state.missingCount),
              })}
      </span>
      <button
        type="button"
        className="icon-button"
        onClick={onDismiss}
        aria-label={t("dismiss")}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function SharedBasketNotice({ state }) {
  const { number, t } = usePreferences();
  if (!state) return null;

  if (state.status === "loading") {
    return (
      <div className="shared-basket-notice loading" role="status">
        <RefreshCw size={15} className="spin" />
        <span>{t("sharedLoading")}</span>
      </div>
    );
  }

  if (state.status === "ready" || state.status === "partial") {
    return (
      <div className={`shared-basket-notice ${state.status}`} role="status">
        {state.status === "ready" ? <Check size={15} /> : <AlertCircle size={15} />}
        <span>
          {t("sharedLoaded", {
            products: formatProductCount(state.productCount, t, number),
            stops: formatStopLimit(state.maxChains, t),
          })}
          {state.missingCount
            ? t("sharedMissing", { count: number(state.missingCount) })
            : t("sharedRecalculated")}
          {state.retailerCount
            ? t("sharedRetailers", { count: number(state.retailerCount) })
            : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="shared-basket-notice error" role="alert">
      <AlertCircle size={15} />
      <span>{t("sharedError")}</span>
    </div>
  );
}

function BasketExportDialog({
  basket,
  productMap,
  maxChains,
  retailerIds,
  extraStopCost,
  selectedStopLimit,
  selectedPlanComplete,
  plan,
  planStopLimit,
  shareUrl,
  onImport,
  onClose,
}) {
  const { language, t } = usePreferences();
  const [format, setFormat] = useState("text");
  const [actionState, setActionState] = useState("idle");
  const [exportedAt] = useState(() => new Date().toISOString());
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const supportsNativeShare = typeof navigator.share === "function";
  const basketLink = useShortBasketLink(shareUrl);
  const text = useMemo(
    () =>
      formatBasketText({
        basket,
        productMap,
        selectedStopLimit,
        selectedPlanComplete,
        plan,
        planStopLimit,
        shareUrl: basketLink.url,
        language,
      }),
    [
      basket,
      language,
      plan,
      planStopLimit,
      productMap,
      selectedPlanComplete,
      selectedStopLimit,
      basketLink.url,
    ],
  );
  const json = useMemo(
    () =>
      formatBasketData({
        basket,
        productMap,
        maxChains,
        retailerIds,
        extraStopCost,
        exportedAt,
      }),
    [basket, exportedAt, extraStopCost, maxChains, productMap, retailerIds],
  );
  const preview = format === "json" ? json : text;

  useEffect(() => {
    setActionState("idle");
  }, [format, json, text]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const selectPreview = () => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  };

  const copyExport = async () => {
    try {
      await copyText(preview);
      setActionState("copied");
    } catch {
      selectPreview();
      setActionState("manual");
    }
  };

  const shareExport = async () => {
    try {
      await navigator.share({ title: t("shoppingPlanTitle"), text });
      setActionState("shared");
    } catch (error) {
      if (error?.name !== "AbortError") await copyExport();
    }
  };

  const downloadExport = () => {
    if (format === "json") {
      downloadJsonFile(json, "posokanei-basket.json");
    } else {
      const filename = language === "el" ? "kalathi-timon.txt" : "supermarket-basket.txt";
      downloadTextFile(text, filename);
    }
    setActionState("downloaded");
  };

  const loadJson = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setActionState("importing");
    try {
      if (file.size > 256 * 1024) throw new Error("invalid_file_size");
      const data = parseBasketData(await file.text());
      await onImport(data);
    } catch {
      setActionState("import-error");
    }
  };

  const feedback = {
    copied: format === "json" ? t("jsonExportCopied") : t("copied"),
    shared: t("textExportShared"),
    downloaded: format === "json" ? t("jsonExportDownloaded") : t("textExportDownloaded"),
    manual: format === "json" ? t("jsonExportManual") : t("textExportManual"),
    importing: t("jsonImporting"),
    "import-error": t("jsonImportError"),
  }[actionState];
  const feedbackIsError = actionState === "import-error";

  return (
    <aside
      className="drawer text-export-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="basket-export-title"
    >
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel share-panel text-export-panel">
        <div className="drawer-head">
          <span className="text-export-dialog-icon" aria-hidden="true">
            {format === "json" ? <FileJson2 size={20} /> : <FileText size={20} />}
          </span>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("close")}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-title">
          <small>{t("basketExportEyebrow")}</small>
          <h2 id="basket-export-title">{t("basketExportTitle")}</h2>
        </div>

        <div className="export-format-tabs" role="tablist" aria-label={t("basketExportFormat")}>
          <button
            type="button"
            role="tab"
            aria-selected={format === "text"}
            className={format === "text" ? "active" : ""}
            onClick={() => setFormat("text")}
          >
            <FileText size={16} />
            {t("textExportFormat")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={format === "json"}
            className={format === "json" ? "active" : ""}
            onClick={() => setFormat("json")}
          >
            <FileJson2 size={16} />
            JSON
          </button>
        </div>

        {format === "json" ? (
          <p className="json-export-note">
            <Info size={16} />
            <span>{t("jsonExportNote")}</span>
          </p>
        ) : null}

        {format === "text" ? <ShortLinkStatus state={basketLink} /> : null}

        <label className="text-export-preview">
          <span>{format === "json" ? t("jsonExportPreview") : t("textExportPreview")}</span>
          <textarea
            ref={textareaRef}
            value={preview}
            readOnly
            spellCheck="false"
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>

        <div className="share-dialog-actions text-export-actions">
          <button type="button" className="primary-action" onClick={copyExport}>
            {actionState === "copied" ? <Check size={18} /> : <Copy size={18} />}
            {actionState === "copied"
              ? format === "json"
                ? t("jsonExportCopied")
                : t("copied")
              : format === "json"
                ? t("copyJsonExport")
                : t("copyTextExport")}
          </button>
          {format === "text" && supportsNativeShare ? (
            <button type="button" className="text-button" onClick={shareExport}>
              <Share2 size={17} />
              {t("share")}
            </button>
          ) : null}
          <button type="button" className="text-button" onClick={downloadExport}>
            <Download size={17} />
            {format === "json" ? t("downloadJsonExport") : t("downloadTextExport")}
          </button>
          {format === "json" ? (
            <button
              type="button"
              className="text-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={actionState === "importing"}
            >
              {actionState === "importing" ? (
                <RefreshCw size={17} className="spin" />
              ) : (
                <Upload size={17} />
              )}
              {t("loadJsonExport")}
            </button>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          hidden
          type="file"
          accept=".json,application/json"
          onChange={loadJson}
        />

        {feedback ? (
          <p
            className={`share-feedback${feedbackIsError ? " error" : actionState === "manual" ? "" : " success"}`}
            role={feedbackIsError ? "alert" : "status"}
          >
            {feedback}
          </p>
        ) : null}
      </div>
    </aside>
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
  const { number, t } = usePreferences();
  const [copyState, setCopyState] = useState("idle");
  const inputRef = useRef(null);
  const supportsNativeShare = typeof navigator.share === "function";
  const basketLink = useShortBasketLink(url);
  const basketUrl = basketLink.url || url;

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const copyLink = async () => {
    try {
      await copyText(basketUrl);
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
        title: t("brandName"),
        text: t("shareNativeText", {
          count: number(basketCount),
          stops: formatStopLimit(maxChains, t),
        }),
        url: basketUrl,
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
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("close")}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-title">
          <small>{t("sharedList")}</small>
          <h2 id="share-title">{t("shareTitle")}</h2>
          <p>
            {t("shareSummary", {
              count: number(basketCount),
              stops: formatStopLimit(maxChains, t),
            })}
            {hasRetailerFilter
              ? t("shareSelectedRetailers", { count: number(retailerCount) })
              : t("shareAllRetailers")}
          </p>
        </div>

        <label className="share-link-field">
          <span>{basketLink.status === "ready" ? t("shortBasketLink") : t("basketLink")}</span>
          <input
            ref={inputRef}
            type="text"
            value={basketUrl}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>

        <ShortLinkStatus state={basketLink} />

        <div className="share-dialog-actions">
          <button type="button" className="primary-action" onClick={copyLink}>
            {copyState === "copied" ? <Check size={18} /> : <Copy size={18} />}
            {copyState === "copied" ? t("copied") : t("copyLink")}
          </button>
          {supportsNativeShare ? (
            <button type="button" className="text-button" onClick={shareLink}>
              <Share2 size={17} />
              {t("share")}
            </button>
          ) : null}
        </div>

        {copyState === "shared" ? (
          <p className="share-feedback success" role="status">{t("sharedSuccess")}</p>
        ) : null}
        {copyState === "manual" ? (
          <p className="share-feedback" role="status">
            {t("manualCopy")}
          </p>
        ) : null}

        <div className="share-privacy-note">
          <Info size={16} />
          <span>{t("sharePrivacy")}</span>
        </div>
      </div>
    </aside>
  );
}

function ShortLinkStatus({ state }) {
  const { t } = usePreferences();
  if (!state || state.status === "idle") return null;
  const isLoading = state.status === "loading";
  const isError = state.status === "error";
  return (
    <p
      className={`short-link-status ${state.status}`}
      role={isError ? "alert" : "status"}
    >
      {isLoading ? (
        <RefreshCw size={15} className="spin" />
      ) : isError ? (
        <AlertCircle size={15} />
      ) : (
        <Link2 size={15} />
      )}
      <span>
        {isLoading
          ? t("shortLinkLoading")
          : isError
            ? t("shortLinkFallback")
            : t("shortLinkReady")}
      </span>
    </p>
  );
}

function SavedBasketsDialog({
  baskets,
  currentBasketCount,
  onSave,
  onLoad,
  onDelete,
  onClose,
}) {
  const { locale, number, t } = usePreferences();
  const [name, setName] = useState("");
  const [loadingId, setLoadingId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [actionStatus, setActionStatus] = useState(null);
  const normalizedName = name.replace(/\s+/gu, " ").trim();
  const updatesExisting = baskets.some(
    (saved) =>
      saved.name.toLocaleLowerCase("el-GR") === normalizedName.toLocaleLowerCase("el-GR"),
  );

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const saveBasket = (event) => {
    event.preventDefault();
    try {
      const saved = onSave(normalizedName);
      setName("");
      setActionStatus({ status: "saved", name: saved.name });
    } catch {
      setActionStatus({ status: "error" });
    }
  };

  const loadBasket = async (saved) => {
    setLoadingId(saved.id);
    setActionStatus(null);
    try {
      await onLoad(saved);
      onClose();
    } catch {
      setLoadingId("");
      setActionStatus({ status: "load_error" });
    }
  };

  const deleteBasket = (id) => {
    try {
      onDelete(id);
      setConfirmDeleteId("");
      setActionStatus(null);
    } catch {
      setActionStatus({ status: "delete_error" });
    }
  };

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <aside
      className="drawer saved-baskets-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-baskets-title"
    >
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel saved-baskets-panel">
        <div className="drawer-head">
          <span className="saved-baskets-dialog-icon" aria-hidden="true">
            <Bookmark size={20} />
          </span>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("close")}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-title">
          <small>{t("savedBaskets")}</small>
          <h2 id="saved-baskets-title">{t("savedBasketsTitle")}</h2>
          <p>{t("savedBasketsDescription")}</p>
        </div>

        <form className="save-basket-form" onSubmit={saveBasket}>
          <label>
            <span>{t("savedBasketName")}</span>
            <input
              type="text"
              value={name}
              maxLength={48}
              placeholder={t("savedBasketNamePlaceholder")}
              disabled={!currentBasketCount}
              onChange={(event) => {
                setName(event.target.value);
                setActionStatus(null);
              }}
            />
          </label>
          <button
            type="submit"
            className="primary-action"
            disabled={!currentBasketCount || !normalizedName}
          >
            <Save size={17} />
            {updatesExisting ? t("updateSavedBasket") : t("saveCurrentBasket")}
          </button>
          <small>
            {currentBasketCount ? t("savedBasketLimit") : t("addProductsBeforeSaving")}
          </small>
        </form>

        {actionStatus ? (
          <p
            className={actionStatus.status === "saved" ? "saved-dialog-status success" : "saved-dialog-status error"}
            role="status"
          >
            {actionStatus.status === "saved"
              ? t("savedBasketSaved", { name: actionStatus.name })
              : actionStatus.status === "load_error"
                ? t("savedBasketLoadError")
                : actionStatus.status === "delete_error"
                  ? t("savedBasketDeleteError")
                : t("savedBasketSaveError")}
          </p>
        ) : null}

        <div className="saved-baskets-heading">
          <strong>{t("savedBasketsLibrary")}</strong>
          <span>{number(baskets.length)}/12</span>
        </div>

        <div className="saved-baskets-list">
          {baskets.length ? (
            baskets.map((saved) => (
              <article key={saved.id} className="saved-basket-row">
                <div className="saved-basket-copy">
                  <strong>{saved.name}</strong>
                  <small>
                    {formatProductCount(saved.basket.length, t, number)} · {formatStopLimit(saved.maxChains, t)} · {dateFormatter.format(new Date(saved.updatedAt))}
                  </small>
                  <span>
                    {saved.retailerIds
                      ? t("savedBasketRetailers", { count: number(saved.retailerIds.length) })
                      : t("allRetailers")}
                  </span>
                </div>
                <div className="saved-basket-actions">
                  <button
                    type="button"
                    className="text-button"
                    disabled={Boolean(loadingId)}
                    onClick={() => loadBasket(saved)}
                  >
                    {loadingId === saved.id ? (
                      <RefreshCw size={15} className="spin" />
                    ) : (
                      <FolderOpen size={15} />
                    )}
                    {t("openSavedBasket")}
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => setConfirmDeleteId(saved.id)}
                    title={t("deleteSavedBasket", { name: saved.name })}
                    aria-label={t("deleteSavedBasket", { name: saved.name })}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {confirmDeleteId === saved.id ? (
                  <div className="saved-delete-confirm">
                    <span>{t("deleteSavedBasketPrompt", { name: saved.name })}</span>
                    <button
                      type="button"
                      className="text-button danger-button"
                      onClick={() => deleteBasket(saved.id)}
                    >
                      {t("delete")}
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setConfirmDeleteId("")}
                    >
                      {t("cancel")}
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="saved-baskets-empty">
              <Bookmark size={20} />
              <strong>{t("noSavedBaskets")}</strong>
              <span>{t("noSavedBasketsHelp")}</span>
            </div>
          )}
        </div>

        <div className="saved-baskets-privacy">
          <Info size={16} />
          <span>{t("savedBasketsPrivacy")}</span>
        </div>
      </div>
    </aside>
  );
}

function BasketItem({
  product,
  quantity,
  planItem,
  alternativeOffer,
  completeStopLimit,
  onQuantity,
  onSelect,
}) {
  const { money, t } = usePreferences();
  const step = quantityStep();
  const bestPrice = planItem?.price ?? null;
  const isOutsidePlan = bestPrice == null && alternativeOffer?.price != null;
  const displayedTotal = isOutsidePlan
    ? alternativeOffer.price * quantity
    : bestPrice == null
      ? null
      : bestPrice * quantity;
  const displayAmount =
    displayedTotal == null
      ? "-"
      : isOutsidePlan
        ? t("availableFrom", { amount: money(displayedTotal) })
        : money(displayedTotal);
  const priceContext = isOutsidePlan
    ? t("availableOutsidePlan", {
        retailer: alternativeOffer.retailer.name || alternativeOffer.retailer.shortName,
        stops: completeStopLimit,
      })
    : bestPrice == null
      ? t("noPriceInSelectedChains")
      : `${money(bestPrice)} / ${product.unit} · ${planItem.retailer.shortName}`;
  const displayedRetailerId = isOutsidePlan
    ? alternativeOffer.retailer.id
    : planItem?.retailer?.id;
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
          aria-label={t("decreaseQuantity", { name: product.name })}
        >
          <Minus size={15} />
        </button>
        <input
          value={quantity}
          type="number"
          inputMode="numeric"
          min="1"
          max="999"
          step="1"
          onChange={(event) => onQuantity(product, Number(event.target.value))}
          aria-label={t("quantity", { name: product.name })}
        />
        <button
          type="button"
          className="icon-button"
          onClick={() => onQuantity(product, quantity + step)}
          aria-label={t("increaseQuantity", { name: product.name })}
        >
          <Plus size={15} />
        </button>
      </div>
      <div className={`line-total${isOutsidePlan ? " outside-plan" : ""}`}>
        <strong>{displayAmount}</strong>
        <small>{priceContext}</small>
        <PriceChangeBadge product={product} retailerId={displayedRetailerId} />
      </div>
    </article>
  );
}

function RankingsPanel({
  mobileActive,
  rankings,
  bestCompleteRanking,
  visitPlan,
  maxChains,
  setMaxChains,
  stopComparison,
  extraStopCost,
  setExtraStopCost,
  basketSize,
  locationState,
  locationRadiusKm,
  retailerProximity,
  retailers,
  retailerFilterIds,
  nearbyRetailerCount,
  onRequestLocation,
  onChangeLocationRadius,
  onClearLocation,
  onToggleRetailer,
  onSelectAllRetailers,
}) {
  const { language, t } = usePreferences();
  const showDeferredDetails = useIdleReveal();
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
  const savingsBreakdown = useMemo(
    () => calculateSavingsBreakdown(visitPlan, bestCompleteRanking, 3),
    [bestCompleteRanking, visitPlan],
  );

  useEffect(() => {
    setPlanCopyState("idle");
  }, [visitPlan]);

  const copyPlan = async () => {
    try {
      await copyText(formatPlanText(visitPlan, language));
      setPlanCopyState("copied");
    } catch {
      setPlanCopyState("error");
    }
  };

  return (
    <section
      id="plan-panel"
      className={`panel rankings-panel${mobileActive ? " mobile-active" : ""}`}
      aria-labelledby="ranking-title"
    >
      <PanelTitle
        id="ranking-title"
        icon={<Store size={18} />}
        title={t("plan")}
        action={basketSize ? formatStopLimit(maxChains, t) : t("chooseProducts")}
      />

      <StopComparisonControl
        comparison={stopComparison}
        maxChains={maxChains}
        setMaxChains={setMaxChains}
        extraStopCost={extraStopCost}
        setExtraStopCost={setExtraStopCost}
      />

      <RecommendationCard
        plan={visitPlan}
        basketSize={basketSize}
        maxChains={maxChains}
        oneStopTotal={oneStopTotal}
      />

      <SavingsBreakdownCard breakdown={savingsBreakdown} />

      <LocationControl
        locationState={locationState}
        radiusKm={locationRadiusKm}
        nearbyRetailerCount={nearbyRetailerCount}
        onRequest={onRequestLocation}
        onChangeRadius={onChangeLocationRadius}
        onClear={onClearLocation}
      />

      <RetailerFilterControl
        retailers={retailers}
        selectedIds={retailerFilterIds}
        locationReady={locationReady}
        onToggle={onToggleRetailer}
        onSelectAll={onSelectAllRetailers}
      />

      {locationReady ? (
        <NearbyBranchesPanel
          retailer={selectedRetailer}
          proximity={selectedRetailer ? retailerProximity[selectedRetailer.id] : null}
          radiusKm={locationRadiusKm}
        />
      ) : null}

      {showDeferredDetails && visitPlan?.isComplete ? (
        <VisitPlanBreakdown
          plan={visitPlan}
          locationReady={locationReady}
          locationPosition={locationState.position}
          retailerProximity={retailerProximity}
          selectedRetailerId={effectiveRetailerId}
          onSelectRetailer={setSelectedRetailerId}
          onCopyPlan={copyPlan}
          copyState={planCopyState}
        />
      ) : null}

      {showDeferredDetails && completeRankings.length ? (
        <div className="rank-group">
          <div className="rank-group-title">
            <ArrowDownUp size={15} />
            <span>{t("oneStopRanking")}</span>
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

      {showDeferredDetails && partialRankings.length ? (
        <div className="rank-group">
          <div className="rank-group-title muted">
            <Info size={15} />
            <span>{t("incompleteChains")}</span>
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

      {!showDeferredDetails && basketSize ? (
        <div className="plan-detail-loading" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}
    </section>
  );
}

function useIdleReveal(delay = 450) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let idleId = null;
    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(() => setRevealed(true), { timeout: 1200 });
      } else {
        setRevealed(true);
      }
    }, delay);
    return () => {
      window.clearTimeout(timer);
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [delay]);

  return revealed;
}

function LocationControl({
  locationState,
  radiusKm,
  nearbyRetailerCount,
  onRequest,
  onChangeRadius,
  onClear,
}) {
  const { locale, number, t } = usePreferences();
  const busy = locationState.status === "locating" || locationState.status === "loading";
  const hasLocation = Boolean(locationState.position);

  return (
    <div className={`location-box ${locationState.status}`}>
      <div className="location-box-top">
        <span className="rank-group-title">
          <MapPin size={15} />
          <span>{t("nearbySupermarkets")}</span>
        </span>
        {hasLocation ? (
          <button type="button" className="quiet-button" onClick={onClear}>
            {t("clear")}
          </button>
        ) : null}
      </div>
      <div className="location-actions">
        <button type="button" className="text-button" onClick={onRequest} disabled={busy}>
          <Navigation size={16} />
          {busy ? t("locating") : hasLocation ? t("refresh") : t("useLocation")}
        </button>
        <div className="radius-buttons" aria-label={t("searchRadius")}>
          {[2, 5, 10].map((value) => (
            <button
              key={value}
              type="button"
              className={radiusKm === value ? "active" : ""}
              onClick={() => onChangeRadius(value)}
            >
              {t("kilometers", { value })}
            </button>
          ))}
        </div>
      </div>
      <p>{locationStatusText(locationState, radiusKm, t, locale, number)}</p>
      {locationState.status === "ready" ? (
        <div
          className={`location-filter-status ${nearbyRetailerCount ? "active" : "empty"}`}
          role="status"
        >
          {nearbyRetailerCount ? <Check size={15} /> : <AlertCircle size={15} />}
          <span>
            {nearbyRetailerCount
              ? t("locationFilterActive", {
                  count: number(nearbyRetailerCount),
                  radius: t("kilometers", { value: radiusKm }),
                })
              : t("locationFilterEmpty", {
                  radius: t("kilometers", { value: radiusKm }),
                })}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function StopComparisonControl({
  comparison,
  maxChains,
  setMaxChains,
  extraStopCost,
  setExtraStopCost,
}) {
  const { money, number, t } = usePreferences();
  const recommended = comparison.recommended;
  const recommendedIsSelected = recommended?.limit === maxChains;
  const recommendedSavingsPercent =
    recommended?.savingsVsOneStop != null && comparison.oneStopTotal
      ? Math.round((recommended.savingsVsOneStop / comparison.oneStopTotal) * 100)
      : null;
  const recommendationInsight = !recommended
    ? null
    : comparison.oneStopTotal == null
      ? t("recommendationCoverageInsight", {
          stops: number(recommended.actualStops),
        })
      : recommended.extraStops === 0
        ? t("recommendationOneStopInsight")
        : t("recommendationSavingsInsight", {
            amount: money(recommended.savingsVsOneStop),
            percent: number(recommendedSavingsPercent),
            perStop: money(recommended.savingsPerExtraStop),
          });
  return (
    <section className="stop-comparison" aria-labelledby="stop-comparison-title">
      <div className="stop-comparison-heading">
        <span>
          <Route size={16} aria-hidden="true" />
          <strong id="stop-comparison-title">{t("stopComparisonTitle")}</strong>
        </span>
        <small>{t("stopComparisonHelp")}</small>
      </div>

      <div className="stop-option-grid" role="group" aria-label={t("maximumChains")}>
        {comparison.options.map((option) => {
          const isRecommended = recommended?.limit === option.limit;
          const classes = [
            "stop-option",
            maxChains === option.limit ? "active" : "",
            isRecommended ? "recommended" : "",
            option.isComplete ? "" : "incomplete",
          ].filter(Boolean).join(" ");
          const detailKind = getStopOptionDetailKind(comparison, option);
          let detail = t("notCovered");
          if (detailKind === "one-stop-baseline") {
            detail = t("oneStopBaseline");
          } else if (detailKind === "first-complete") {
            detail = t("firstCompletePlan");
          } else if (detailKind === "covered-with-stops") {
            detail = t("coveredWithStops", {
              stops: option.actualStops === 1
                ? t("oneStopLabel")
                : t("stopsLabel", { count: number(option.actualStops) }),
            });
          } else if (detailKind === "saves-vs-one-stop") {
            detail = t("saveAgainstOneStop", { amount: money(option.savingsVsOneStop) });
          } else if (detailKind === "same-as-one-stop") {
            detail = t("sameAsOneStop");
          }

          return (
          <button
            key={option.limit}
            type="button"
            className={classes}
            aria-pressed={maxChains === option.limit}
            aria-label={t("selectStopPlan", {
              stops: formatStopLimit(option.limit, t),
              total: option.isComplete ? money(option.groceryTotal) : t("notCovered"),
            })}
            onClick={() => setMaxChains(option.limit)}
          >
            <span className="stop-option-top">
              <span>{formatStopLimit(option.limit, t)}</span>
              {isRecommended ? (
                <span className="stop-recommended-mark">
                  <Check size={11} aria-hidden="true" />
                  {t("recommended")}
                </span>
              ) : null}
            </span>
            <strong>{option.isComplete ? money(option.groceryTotal) : "-"}</strong>
            <small>{detail}</small>
          </button>
          );
        })}
      </div>

      <div className="extra-stop-estimate">
        <div className="extra-stop-copy">
          <CircleDollarSign size={17} aria-hidden="true" />
          <span>
            <strong>{t("extraStopEstimate")}</strong>
            <small>{t("extraStopEstimateHelp")}</small>
          </span>
        </div>
        <div className="extra-stop-buttons" role="group" aria-label={t("extraStopCostOptions")}>
          {SHOPPING_PRIORITY_OPTIONS.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              className={extraStopCost === value ? "active" : ""}
              aria-pressed={extraStopCost === value}
              onClick={() => setExtraStopCost(value)}
            >
              <span>{t(labelKey)}</span>
              <small>
                {t("priorityThreshold", {
                  amount: money(value),
                  isFree: value === 0,
                })}
              </small>
            </button>
          ))}
        </div>
        <p>
          {t("extraStopEstimateNote", {
            amount: money(extraStopCost),
            isFree: extraStopCost === 0,
          })}
        </p>
      </div>

      <div className={recommended ? "practical-recommendation" : "practical-recommendation empty"}>
        <Sparkles size={16} aria-hidden="true" />
        <span>
          <small>{t("practicalChoice")}</small>
          {recommended ? (
            <>
              <strong>
                {t("recommendStopLimit", {
                  stops: formatStopLimit(recommended.limit, t),
                })}
              </strong>
              <span>
                {t("recommendationMath", {
                  groceries: money(recommended.groceryTotal),
                  extraStops: recommended.extraStops,
                  perStop: money(extraStopCost),
                  effective: money(recommended.effectiveTotal),
                })}
              </span>
              {recommendationInsight ? (
                <span className="recommendation-insight">{recommendationInsight}</span>
              ) : null}
            </>
          ) : (
            <strong>{t("recommendationNeedsBasket")}</strong>
          )}
        </span>
        {recommended ? (
          recommendedIsSelected ? (
            <span className="recommendation-selected">
              <Check size={13} aria-hidden="true" />
              {t("recommendationSelected")}
            </span>
          ) : (
            <button
              type="button"
              className="recommendation-action"
              onClick={() => setMaxChains(recommended.limit)}
            >
              <Check size={14} aria-hidden="true" />
              {t("applyRecommendation")}
            </button>
          )
        ) : null}
      </div>
    </section>
  );
}

function RetailerFilterControl({
  retailers,
  selectedIds,
  locationReady,
  onToggle,
  onSelectAll,
}) {
  const { t } = usePreferences();
  const selectedSet = new Set(selectedIds === null ? retailers.map((retailer) => retailer.id) : selectedIds);
  const selectedCount = selectedSet.size;
  const hasFilter = selectedIds !== null;

  return (
    <details className="retailer-filter-box">
      <summary>
        <span className="retailer-filter-title">
          <SlidersHorizontal size={15} />
          {locationReady ? t("nearbyRetailersInCalculation") : t("retailersInCalculation")}
        </span>
        <span className={hasFilter ? "retailer-filter-count active" : "retailer-filter-count"}>
          {selectedCount}/{retailers.length || 0}
          <ChevronRight size={15} className="retailer-filter-chevron" />
        </span>
      </summary>

      <div className="retailer-filter-actions">
        <button type="button" className="quiet-button" onClick={onSelectAll} disabled={!hasFilter}>
          {locationReady ? t("allNearbyRetailers") : t("allRetailers")}
        </button>
      </div>

      <div className="retailer-filter-grid" role="group" aria-label={t("selectedRetailers")}>
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
        {locationReady ? t("locationRetailerFilterHelp") : t("retailerFilterHelp")}
      </p>
    </details>
  );
}

function RecommendationCard({ plan, basketSize, maxChains, oneStopTotal }) {
  const { money, number, t } = usePreferences();
  if (!basketSize) {
    return (
      <div className="recommendation-card empty">
        <span className="rank-badge">
          <Store size={17} />
        </span>
        <div>
          <small>{t("buildListFirst")}</small>
          <strong>{t("chooseListAndStops")}</strong>
          <span>{t("rankingExplanation")}</span>
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
          <small>{t("noCompleteBasket")}</small>
          <strong>{t("listNotCovered", { stops: formatStopLimit(maxChains, t) })}</strong>
          {plan?.availableCount ? (
            <span>{t("partialCoverage", {
              available: number(plan.availableCount),
              total: number(basketSize),
              amount: money(plan.total),
            })}</span>
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
              ? t("bestOneStop")
              : t("bestPlan", { stops: formatStopLimit(maxChains, t) })}
          </small>
          <strong>{planName}</strong>
          <span>
            {isOneStop
              ? formatCoverageSentence(basketSize, t)
              : t("splitAcrossChains", { count: number(plan.chainCount) })}
          </span>
        </div>
      </div>
      <div className="recommendation-total">
        <small>{t("total")}</small>
        <strong>{money(plan.total)}</strong>
        {savings > 0 ? <span>{t("belowOneStop", { amount: money(savings) })}</span> : null}
      </div>
    </div>
  );
}

function SavingsBreakdownCard({ breakdown }) {
  const { money, t } = usePreferences();
  if (!breakdown) return null;

  return (
    <section className="savings-breakdown" aria-labelledby="savings-breakdown-title">
      <div className="savings-breakdown-heading">
        <span className="savings-breakdown-icon" aria-hidden="true">
          <CircleDollarSign size={17} />
        </span>
        <span>
          <small>{t("savingsBreakdownEyebrow")}</small>
          <strong id="savings-breakdown-title">
            {t("savingsBreakdownTitle", { amount: money(breakdown.totalSavings) })}
          </strong>
          <span>
            {t("savingsComparedWith", { retailer: breakdown.baselineRetailer.name })}
          </span>
        </span>
      </div>

      <div className="savings-breakdown-list">
        {breakdown.visibleItems.map((item) => (
          <article className="savings-breakdown-row" key={item.product.id}>
            <ProductThumb product={item.product} compact />
            <span className="savings-breakdown-product">
              <strong>{item.product.name}</strong>
              <small>
                {t("savingsPricePath", {
                  baselineRetailer: item.baselineRetailer.name,
                  baseline: money(item.baselineLineTotal),
                  plannedRetailer: item.plannedRetailer.name,
                  planned: money(item.plannedLineTotal),
                })}
              </small>
            </span>
            <strong className="savings-breakdown-amount">
              {t("savedOnProduct", { amount: money(item.savings) })}
            </strong>
          </article>
        ))}
      </div>

      {breakdown.remainingItemCount ? (
        <div className="savings-breakdown-more">
          <span>
            {t("savingsMoreProducts", {
              count: breakdown.remainingItemCount,
              amount: money(breakdown.remainingSavings),
            })}
          </span>
        </div>
      ) : null}

      {breakdown.tradeoffItemCount ? (
        <div className="savings-breakdown-tradeoff">
          <Info size={14} aria-hidden="true" />
          <span>
            {t("savingsTradeoff", {
              count: breakdown.tradeoffItemCount,
              amount: money(breakdown.tradeoffCost),
            })}
          </span>
        </div>
      ) : null}

      <p>{t("savingsBreakdownNote")}</p>
    </section>
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
  locationPosition,
  retailerProximity,
  selectedRetailerId,
  onSelectRetailer,
  onCopyPlan,
  copyState,
}) {
  const { money, number, t } = usePreferences();
  const planId = useMemo(() => buildShoppingPlanId(plan), [plan]);
  const planItemIds = useMemo(
    () =>
      plan.groups.flatMap((group) =>
        group.items.map((item) => shoppingItemId(group.retailer.id, item.product.id)),
      ),
    [plan],
  );
  const [checkedItemIds, setCheckedItemIds] = useState(() =>
    loadShoppingProgress(planId),
  );
  const [shoppingView, setShoppingView] = useState("all");
  const checkedItems = useMemo(() => {
    const validIds = new Set(planItemIds);
    return new Set(checkedItemIds.filter((id) => validIds.has(id)));
  }, [checkedItemIds, planItemIds]);
  const shoppingSummary = useMemo(
    () => summarizeShoppingPlan(plan, checkedItemIds),
    [checkedItemIds, plan],
  );
  const groupProgress = useMemo(
    () => new Map(shoppingSummary.groups.map((group) => [group.retailerId, group])),
    [shoppingSummary.groups],
  );
  const remainingShoppingPlan = useMemo(
    () => buildRemainingShoppingPlan(plan, shoppingSummary),
    [plan, shoppingSummary],
  );
  const planRoute = useMemo(
    () =>
      locationReady && remainingShoppingPlan
        ? buildPlanRoute(remainingShoppingPlan, retailerProximity, locationPosition)
        : null,
    [locationPosition, locationReady, remainingShoppingPlan, retailerProximity],
  );
  const directionsUrl = useMemo(
    () => mapsDirectionsUrl(planRoute, locationPosition),
    [locationPosition, planRoute],
  );
  const completedCount = shoppingSummary.completedCount;
  const checklistComplete = shoppingSummary.isComplete;
  const visibleGroups =
    shoppingView === "remaining"
      ? plan.groups.filter((group) => !groupProgress.get(group.retailer.id)?.isComplete)
      : plan.groups;

  useEffect(() => {
    setCheckedItemIds(loadShoppingProgress(planId));
  }, [planId]);

  const toggleShoppingItem = (itemId) => {
    setCheckedItemIds((current) => {
      const next = new Set(current.filter((id) => planItemIds.includes(id)));
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      const nextIds = [...next];
      saveShoppingProgress(planId, nextIds);
      return nextIds;
    });
  };

  const resetShoppingProgress = () => {
    setCheckedItemIds([]);
    saveShoppingProgress(planId, []);
  };

  const setGroupCompletion = (group, complete) => {
    const groupItemIds = group.items.map((item) =>
      shoppingItemId(group.retailer.id, item.product.id),
    );
    setCheckedItemIds((current) => {
      const next = new Set(current.filter((id) => planItemIds.includes(id)));
      groupItemIds.forEach((itemId) => {
        if (complete) next.add(itemId);
        else next.delete(itemId);
      });
      const nextIds = [...next];
      saveShoppingProgress(planId, nextIds);
      return nextIds;
    });
  };

  return (
    <div className="route-group">
      <div className="route-group-heading">
        <div className="rank-group-title">
          <ClipboardList size={15} />
          <span>{t("buyAtEachChain")}</span>
        </div>
        <div className="route-group-actions">
          <button type="button" className="quiet-button copy-plan-button" onClick={onCopyPlan}>
            {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
            {copyState === "copied"
              ? t("copied")
              : copyState === "error"
                ? t("copyFailed")
                : t("copyPlan")}
          </button>
        </div>
      </div>
      <div className="shopping-toolbar">
        <div className="shopping-metrics">
          <span
            className={checklistComplete ? "shopping-progress complete" : "shopping-progress"}
            title={t("shoppingProgressSaved")}
          >
            <ListChecks size={14} />
            {checklistComplete
              ? t("shoppingComplete")
              : t("shoppingProgress", {
                  checked: number(completedCount),
                  total: number(planItemIds.length),
                })}
          </span>
          <span className="remaining-spend">
            <CircleDollarSign size={14} />
            {t("remainingSpend", { amount: money(shoppingSummary.remainingTotal) })}
          </span>
        </div>
        <div className="shopping-toolbar-actions">
          <div className="shopping-view-control" role="group" aria-label={t("shoppingViewLabel")}>
            <button
              type="button"
              className={shoppingView === "all" ? "active" : ""}
              aria-pressed={shoppingView === "all"}
              onClick={() => setShoppingView("all")}
            >
              {t("showAllItems")}
            </button>
            <button
              type="button"
              className={shoppingView === "remaining" ? "active" : ""}
              aria-pressed={shoppingView === "remaining"}
              onClick={() => setShoppingView("remaining")}
            >
              {t("showRemainingItems")}
            </button>
          </div>
          {completedCount ? (
            <button
              type="button"
              className="quiet-button reset-progress-button"
              onClick={resetShoppingProgress}
              title={t("resetShoppingProgress")}
              aria-label={t("resetShoppingProgress")}
            >
              <RotateCcw size={14} />
            </button>
          ) : null}
        </div>
      </div>
      {checklistComplete ? (
        <div className="shopping-complete-banner" role="status">
          <CheckCheck size={18} aria-hidden="true" />
          <span>
            <strong>{t("shoppingDoneTitle")}</strong>
            <small>{t("shoppingDoneBody")}</small>
          </span>
        </div>
      ) : planRoute && directionsUrl ? (
        <div className="plan-route-bar">
          <Route size={17} aria-hidden="true" />
          <span>
            <strong>{t("remainingRouteTitle")}</strong>
            <small>
              {t("remainingRouteSummary", {
                next: planRoute.stops[0].retailer.name,
                later: planRoute.stops
                  .slice(1)
                  .map((stop) => stop.retailer.name)
                  .join(" → "),
              })}
            </small>
          </span>
          <a href={directionsUrl} target="_blank" rel="noreferrer">
            <Navigation size={15} />
            {t("openRoute")}
          </a>
        </div>
      ) : null}
      <div className="route-list">
        {visibleGroups.map((group) => {
          const progress = groupProgress.get(group.retailer.id);
          const visibleItems =
            shoppingView === "remaining"
              ? group.items.filter(
                  (item) =>
                    !checkedItems.has(shoppingItemId(group.retailer.id, item.product.id)),
                )
              : group.items;
          return (
            <article
              key={group.retailer.id}
              className={progress?.isComplete ? "route-card completed" : "route-card"}
            >
            <div className="route-store-top">
              <RetailerLogo retailer={group.retailer} />
              <div>
                <strong>{group.retailer.name}</strong>
                <small>
                  {formatProductCount(group.items.length, t, number)} · {money(group.total)}
                </small>
              </div>
              <div className="route-store-actions">
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
                    {t("branches")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={
                    progress?.isComplete
                      ? "store-check-button complete"
                      : "store-check-button"
                  }
                  onClick={() => setGroupCompletion(group, !progress?.isComplete)}
                  title={t(
                    progress?.isComplete ? "resetStoreProgress" : "markStorePurchased",
                    { name: group.retailer.name },
                  )}
                  aria-label={t(
                    progress?.isComplete ? "resetStoreProgress" : "markStorePurchased",
                    { name: group.retailer.name },
                  )}
                >
                  {progress?.isComplete ? <RotateCcw size={14} /> : <CheckCheck size={14} />}
                </button>
              </div>
            </div>
            <div
              className={
                progress?.isComplete
                  ? "route-store-progress complete"
                  : "route-store-progress"
              }
              aria-label={t("storeProgress", {
                checked: number(progress?.completedCount || 0),
                total: number(progress?.totalCount || 0),
              })}
            >
              <span>
                <i
                  style={{
                    width: `${progress?.totalCount
                      ? (progress.completedCount / progress.totalCount) * 100
                      : 0}%`,
                  }}
                />
              </span>
              <small>
                {progress?.isComplete
                  ? t("storeComplete")
                  : t("storeProgress", {
                      checked: number(progress?.completedCount || 0),
                      total: number(progress?.totalCount || 0),
                    })}
              </small>
            </div>
            <StoreDistance
              locationReady={locationReady}
              proximity={retailerProximity[group.retailer.id]}
              onSelectBranches={() => onSelectRetailer(group.retailer.id)}
            />
            <div className="route-items">
              {visibleItems.map((item) => {
                const itemId = shoppingItemId(group.retailer.id, item.product.id);
                const checked = checkedItems.has(itemId);
                return (
                  <label
                    key={item.product.id}
                    className={checked ? "route-item checked" : "route-item"}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleShoppingItem(itemId)}
                      aria-label={t(checked ? "markNotPurchased" : "markPurchased", {
                        name: item.product.name,
                      })}
                    />
                    <span>
                      {item.quantity} x {item.product.name}
                    </span>
                    <strong>{money(item.lineTotal)}</strong>
                  </label>
                );
              })}
            </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function NearbyBranchesPanel({ retailer, proximity, radiusKm }) {
  const { locale, t } = usePreferences();
  if (!retailer) return null;

  return (
    <div className="branches-panel">
      <div className="rank-group-title">
        <MapPin size={15} />
        <span>{t("branchesFor", { name: retailer.name })}</span>
      </div>
      {!proximity?.stores?.length ? (
        <div className="branch-empty">
          {t("noBranchRadius", { radius: t("kilometers", { value: radiusKm }) })}
        </div>
      ) : (
        <div className="branch-list">
          {proximity.stores.map((store) => (
            <article key={store.id} className="branch-row">
              <span className="branch-distance">
                {t("away", { distance: formatDistance(store.distanceMeters, locale) })}
              </span>
              <div>
                <strong>{store.name}</strong>
                <small>
                  {store.address || t("openStreetMapLocation")}
                  {store.openingHours ? ` · ${store.openingHours}` : ""}
                </small>
              </div>
              <a href={mapsSearchUrl(store)} target="_blank" rel="noreferrer">
                {t("map")}
              </a>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StoreDistance({ locationReady, proximity, onSelectBranches }) {
  const { locale, t } = usePreferences();
  if (!locationReady) return null;
  const store = proximity?.nearest;
  if (!store) {
    return (
      <div className="nearby-note missing">
        <MapPin size={14} />
        <span>{t("noNearbyBranch")}</span>
      </div>
    );
  }

  return (
    <div className="nearby-note">
      <MapPin size={14} />
      <span>
        <strong>{t("away", { distance: formatDistance(store.distanceMeters, locale) })}</strong>
        <small>
          {store.name}
          {store.address ? ` · ${store.address}` : ""}
        </small>
      </span>
      <div className="nearby-actions">
        <a href={mapsSearchUrl(store)} target="_blank" rel="noreferrer">
          {t("map")}
        </a>
        {onSelectBranches ? (
          <button type="button" onClick={onSelectBranches}>
            {t("all")}
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
  const { money, number, t } = usePreferences();
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
            {t("availableCoverage", {
              available: number(row.availableCount),
              total: number(basketSize),
              missing: row.missingCount ? number(row.missingCount) : "",
            })}
          </small>
        </div>
        {highlighted ? (
          <span className="recommended-mark">
            <Check size={14} />
            {t("goHere")}
          </span>
        ) : null}
      </div>
      <div className="rank-money">
        <strong>{row.isComplete ? money(row.total) : t("doesNotCoverList")}</strong>
        <small>
          {row.savings != null && row.savings > 0
            ? t("savingsFromHighest", { amount: money(row.savings) })
            : row.isComplete
              ? t("completeOneStop")
              : t("partialAmount", { amount: money(row.total) })}
        </small>
      </div>
      {missingNames.length ? (
        <div className="missing-note">
          {t("missingProducts", {
            names: missingNames.slice(0, 2).join(", "),
            extra: missingNames.length > 2 ? ` +${missingNames.length - 2}` : "",
          })}
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

function PriceWatchDialog({
  watches,
  products,
  retailers,
  state,
  onRefresh,
  onUpdateTarget,
  onRemove,
  onSelect,
  onAdd,
  onClose,
}) {
  const { money, number, t } = usePreferences();
  const retailerIds = useMemo(
    () => retailers.map((retailer) => retailer.id),
    [retailers],
  );
  const retailerById = useMemo(
    () => new Map(retailers.map((retailer) => [retailer.id, retailer])),
    [retailers],
  );
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const rows = useMemo(
    () =>
      watches
        .map((watch) => {
          const product = productById.get(watch.productId) ?? null;
          const best = product ? getBestProductPrice(product, retailerIds) : null;
          const target = priceWatchTargetStatus(watch, best?.price ?? null);
          return {
            watch,
            product,
            best,
            target,
            retailer: best ? retailerById.get(best.retailerId) ?? null : null,
          };
        })
        .sort((a, b) => {
          const targetRank = { met: 0, above: 1, "no-target": 2, unavailable: 3 };
          const rankDifference = targetRank[a.target.status] - targetRank[b.target.status];
          if (rankDifference) return rankDifference;
          return b.watch.updatedAt.localeCompare(a.watch.updatedAt);
        }),
    [productById, retailerById, retailerIds, watches],
  );
  const reachedCount = rows.filter((row) => row.target.status === "met").length;

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <aside
      className="drawer price-watch-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="price-watch-title"
    >
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel price-watch-panel">
        <div className="drawer-head">
          <span className="price-watch-dialog-icon" aria-hidden="true">
            <BellRing size={20} />
          </span>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("close")}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-title">
          <small>{t("priceWatchEyebrow")}</small>
          <h2 id="price-watch-title">{t("priceWatchTitle")}</h2>
          <p>{t("priceWatchDescription")}</p>
        </div>

        <div className="price-watch-summary" aria-label={t("priceWatchSummary")}>
          <span>
            <Bell size={16} aria-hidden="true" />
            <strong>{number(watches.length)}</strong>
            <small>{t("watchedProducts", { count: watches.length })}</small>
          </span>
          <span className={reachedCount ? "target-met" : ""}>
            <Target size={16} aria-hidden="true" />
            <strong>{number(reachedCount)}</strong>
            <small>{t("targetsReached", { count: reachedCount })}</small>
          </span>
        </div>

        {state === "loading" && watches.length ? (
          <div className="price-watch-loading" role="status">
            <RefreshCw size={17} className="spin" aria-hidden="true" />
            <span>{t("loadingPriceWatches")}</span>
          </div>
        ) : null}

        {state === "error" ? (
          <div className="price-watch-error" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{t("priceWatchLoadError")}</span>
            <button type="button" className="text-button" onClick={onRefresh}>
              <RefreshCw size={15} aria-hidden="true" />
              {t("refresh")}
            </button>
          </div>
        ) : null}

        {!watches.length ? (
          <div className="empty-state price-watch-empty">
            <Bell size={24} aria-hidden="true" />
            <strong>{t("noPriceWatches")}</strong>
            <span>{t("noPriceWatchesHelp")}</span>
          </div>
        ) : state === "ready" || products.length ? (
          <div className="price-watch-list">
            {rows.map((row) => (
              <PriceWatchRow
                key={row.watch.productId}
                row={row}
                money={money}
                onUpdateTarget={onUpdateTarget}
                onRemove={onRemove}
                onSelect={onSelect}
                onAdd={onAdd}
              />
            ))}
          </div>
        ) : null}

        <p className="price-watch-privacy">
          <Info size={15} aria-hidden="true" />
          <span>{t("priceWatchPrivacy")}</span>
        </p>
      </div>
    </aside>
  );
}

function PriceWatchRow({
  row,
  money,
  onUpdateTarget,
  onRemove,
  onSelect,
  onAdd,
}) {
  const { t } = usePreferences();
  const { watch, product, best, retailer, target } = row;
  const [targetDraft, setTargetDraft] = useState(
    watch.targetPrice == null ? "" : String(watch.targetPrice),
  );
  const [actionState, setActionState] = useState("");

  useEffect(() => {
    setTargetDraft(watch.targetPrice == null ? "" : String(watch.targetPrice));
  }, [watch.targetPrice]);

  const saveTarget = (event) => {
    event.preventDefault();
    try {
      onUpdateTarget(watch.productId, targetDraft === "" ? null : Number(targetDraft));
      setActionState("saved");
    } catch {
      setActionState("error");
    }
  };

  const removeWatch = () => {
    try {
      onRemove(watch.productId);
    } catch {
      setActionState("error");
    }
  };

  const targetLabel = target.status === "met"
    ? target.difference > 0
      ? t("priceWatchTargetMetBelow", { amount: money(target.difference) })
      : t("priceWatchTargetMet")
    : target.status === "above"
      ? t("priceWatchAboveTarget", { amount: money(target.difference) })
      : target.status === "unavailable"
        ? t("priceWatchPriceUnavailable")
        : t("priceWatchNoTarget");

  return (
    <article className={`price-watch-row ${target.status}`}>
      <button
        type="button"
        className="price-watch-product"
        disabled={!product}
        onClick={() => product && onSelect(product)}
      >
        {product ? (
          <ProductThumb product={product} compact />
        ) : (
          <span className="price-watch-missing-thumb" aria-hidden="true">
            <PackageSearch size={20} />
          </span>
        )}
        <span>
          <strong>{product?.name || t("priceWatchProductUnavailable")}</strong>
          <small>
            {product
              ? `${product.brand || t("noBrand")} · ${product.unitQuantity || product.unit}`
              : watch.productId}
          </small>
        </span>
      </button>

      <div className="price-watch-current">
        <small>{t("currentBestPrice")}</small>
        <strong>{best ? money(best.price) : "-"}</strong>
        {retailer ? (
          <span>
            <RetailerLogo retailer={retailer} className="tiny" ariaHidden />
            {retailer.name}
          </span>
        ) : (
          <span>{t("noPriceInSelectedChains")}</span>
        )}
        {product && best ? (
          <PriceChangeBadge product={product} retailerId={best.retailerId} compact />
        ) : null}
      </div>

      <div className="price-watch-target">
        <span className={`price-watch-target-status ${target.status}`}>
          {target.status === "met"
            ? <BellRing size={14} aria-hidden="true" />
            : <Target size={14} aria-hidden="true" />}
          {targetLabel}
        </span>
        <form onSubmit={saveTarget}>
          <label>
            <span>{t("priceWatchTarget")}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              max="100000"
              step="0.01"
              value={targetDraft}
              placeholder={t("priceWatchTargetPlaceholder")}
              aria-label={t("priceWatchTargetFor", { name: product?.name || watch.productId })}
              onChange={(event) => {
                setTargetDraft(event.target.value);
                setActionState("");
              }}
            />
          </label>
          <button
            type="submit"
            className="icon-button"
            title={t("savePriceWatchTarget")}
            aria-label={t("savePriceWatchTarget")}
          >
            <Save size={16} aria-hidden="true" />
          </button>
        </form>
        {actionState ? (
          <small className={actionState === "error" ? "price-watch-action-error" : ""}>
            {actionState === "saved" ? t("priceWatchTargetSaved") : t("priceWatchSaveError")}
          </small>
        ) : null}
      </div>

      <div className="price-watch-actions">
        <button
          type="button"
          className="text-button"
          disabled={!product}
          onClick={() => product && onSelect(product)}
        >
          <Info size={15} aria-hidden="true" />
          {t("details")}
        </button>
        <button
          type="button"
          className="text-button primary-button"
          disabled={!product}
          onClick={() => product && onAdd(product)}
        >
          <Plus size={16} aria-hidden="true" />
          {t("toBasket")}
        </button>
        <button
          type="button"
          className="icon-button price-watch-remove"
          title={t("removePriceWatch", { name: product?.name || watch.productId })}
          aria-label={t("removePriceWatch", { name: product?.name || watch.productId })}
          onClick={removeWatch}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function ProductDrawer({
  product,
  retailers: retailerList,
  onClose,
  onAdd,
  basketQuantity = 0,
  onSelectAlternative,
  onAddAlternative,
  onReplaceAlternative,
  watch = null,
  onSaveWatch,
  onRemoveWatch,
}) {
  const { money, t } = usePreferences();
  const [targetDraft, setTargetDraft] = useState(
    watch?.targetPrice == null ? "" : String(watch.targetPrice),
  );
  const [watchActionState, setWatchActionState] = useState("");
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const [alternativesState, setAlternativesState] = useState({
    status: "idle",
    suggestions: [],
  });
  const alternativeRetailerIds = useMemo(
    () => retailerList.map((retailer) => retailer.id),
    [retailerList],
  );
  const best = getBestProductPrice(
    product,
    alternativeRetailerIds,
  );

  useEffect(() => {
    setTargetDraft(watch?.targetPrice == null ? "" : String(watch.targetPrice));
    setWatchActionState("");
  }, [product.id, watch?.targetPrice]);

  useEffect(() => {
    if (!alternativesOpen) return undefined;
    let cancelled = false;
    setAlternativesState({ status: "loading", suggestions: [] });
    fetchProductAlternatives(product.id, {
      retailerIds: alternativeRetailerIds,
      limit: 6,
    })
      .then((suggestions) => {
        if (cancelled) return;
        setAlternativesState({
          status: suggestions.length ? "ready" : "empty",
          suggestions,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAlternativesState({ status: "error", suggestions: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [alternativeRetailerIds, alternativesOpen, product.id]);

  const toggleWatch = () => {
    try {
      if (watch) {
        onRemoveWatch();
      } else {
        onSaveWatch(null);
      }
      setWatchActionState("");
    } catch {
      setWatchActionState("error");
    }
  };

  const saveWatchTarget = (event) => {
    event.preventDefault();
    try {
      onSaveWatch(targetDraft === "" ? null : Number(targetDraft));
      setWatchActionState("saved");
    } catch {
      setWatchActionState("error");
    }
  };

  return (
    <aside className="drawer" aria-label={t("productLabel", { name: product.name })}>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel">
        <div className="drawer-head">
          <ProductThumb product={product} />
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("close")}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-title">
          <small>{product.category}</small>
          <h2>{product.name}</h2>
          <p>{product.brand || t("noBrand")} · {product.unitQuantity || product.unit}</p>
        </div>
        <ProductPreviewImage product={product} />
        <div className="drawer-stats">
          <div>
            <small>{t("bestPrice")}</small>
            <strong>{best ? money(best.price) : "-"}</strong>
            {best ? (
              <PriceChangeBadge product={product} retailerId={best.retailerId} />
            ) : null}
          </div>
          <div>
            <small>{t("barcode")}</small>
            <strong>{product.gtin || "-"}</strong>
          </div>
        </div>
        <p className="drawer-description">
          {product.description || t("catalogProduct")}
        </p>
        <button
          type="button"
          className={`alternative-discovery-button${alternativesOpen ? " active" : ""}`}
          onClick={() => setAlternativesOpen((open) => !open)}
          aria-expanded={alternativesOpen}
          aria-controls="product-alternatives"
        >
          <PackageSearch size={18} aria-hidden="true" />
          <span>
            <strong>{t("findSimilarProducts")}</strong>
            <small>{t("findSimilarProductsHelp")}</small>
          </span>
          <ChevronRight size={17} aria-hidden="true" />
        </button>
        {alternativesOpen ? (
          <ProductAlternatives
            id="product-alternatives"
            sourceProduct={product}
            suggestions={alternativesState.suggestions}
            state={alternativesState.status}
            retailers={retailerList}
            canReplace={basketQuantity > 0}
            onSelect={onSelectAlternative}
            onAdd={onAddAlternative}
            onReplace={onReplaceAlternative}
            onRetry={() => {
              setAlternativesOpen(false);
              window.requestAnimationFrame(() => setAlternativesOpen(true));
            }}
          />
        ) : null}
        {watch ? (
          <form className="drawer-watch-target" onSubmit={saveWatchTarget}>
            <label>
              <Target size={15} aria-hidden="true" />
              <span>{t("priceWatchTargetOptional")}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                max="100000"
                step="0.01"
                value={targetDraft}
                placeholder={t("priceWatchTargetPlaceholder")}
                onChange={(event) => {
                  setTargetDraft(event.target.value);
                  setWatchActionState("");
                }}
              />
            </label>
            <button
              type="submit"
              className="icon-button"
              title={t("savePriceWatchTarget")}
              aria-label={t("savePriceWatchTarget")}
            >
              <Save size={16} aria-hidden="true" />
            </button>
          </form>
        ) : null}
        {watchActionState ? (
          <p className={`drawer-watch-status ${watchActionState}`}>
            {watchActionState === "saved" ? t("priceWatchTargetSaved") : t("priceWatchSaveError")}
          </p>
        ) : null}
        <div className="price-table" aria-label={t("pricesByChain")}>
          {retailerList.map((retailer) => {
            const price = getProductPrice(product, retailer.id);
            return (
              <div key={retailer.id} className="price-row">
                <RetailerLogo retailer={retailer} className="tiny" ariaHidden />
                <span>{retailer.name}</span>
                <div className="price-row-value">
                  <strong>{price == null ? "-" : money(price)}</strong>
                  <PriceChangeBadge product={product} retailerId={retailer.id} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="drawer-product-actions">
          <button type="button" className="primary-action" onClick={onAdd}>
            <Plus size={18} />
            {t("addToBasket")}
          </button>
          <button
            type="button"
            className={`text-button price-watch-toggle${watch ? " active" : ""}`}
            onClick={toggleWatch}
          >
            {watch
              ? <BellRing size={17} aria-hidden="true" />
              : <Bell size={17} aria-hidden="true" />}
            {watch ? t("stopPriceWatch") : t("startPriceWatch")}
          </button>
        </div>
      </div>
    </aside>
  );
}

function ProductAlternatives({
  id,
  sourceProduct,
  suggestions,
  state,
  retailers,
  canReplace,
  onSelect,
  onAdd,
  onReplace,
  onRetry,
}) {
  const { locale, money, t } = usePreferences();
  const retailerById = useMemo(
    () => new Map(retailers.map((retailer) => [retailer.id, retailer])),
    [retailers],
  );
  const percent = (value) => new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(Math.abs(value));

  return (
    <section id={id} className="product-alternatives" aria-live="polite">
      <div className="product-alternatives-heading">
        <div>
          <strong>{t("similarProductsTitle")}</strong>
          <small>{t("similarProductsDescription")}</small>
        </div>
        {state === "ready" ? (
          <span>{t("similarProductsCount", { count: suggestions.length })}</span>
        ) : null}
      </div>

      {state === "loading" ? (
        <div className="alternative-list alternative-list-loading" aria-label={t("loadingSimilarProducts")}>
          {Array.from({ length: 3 }, (_, index) => (
            <span className="alternative-skeleton" key={index} />
          ))}
        </div>
      ) : null}

      {state === "empty" ? (
        <div className="alternative-empty">
          <Info size={17} aria-hidden="true" />
          <span>
            <strong>{t("noSimilarProducts")}</strong>
            <small>{t("noSimilarProductsHelp")}</small>
          </span>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="alternative-empty error">
          <AlertCircle size={17} aria-hidden="true" />
          <span>
            <strong>{t("similarProductsUnavailable")}</strong>
            <button type="button" className="text-button" onClick={onRetry}>
              <RefreshCw size={14} aria-hidden="true" />
              {t("tryAgain")}
            </button>
          </span>
        </div>
      ) : null}

      {state === "ready" ? (
        <div className="alternative-list">
          {suggestions.map((suggestion) => {
            const alternative = suggestion.product;
            const retailer = retailerById.get(suggestion.bestRetailerId);
            const savingsIsMeaningful = suggestion.savingsPercent >= 1;
            const premiumIsMeaningful = suggestion.savingsPercent <= -1;
            const valueLabel = savingsIsMeaningful
              ? t(
                  suggestion.savingsBasis === "unit"
                    ? "similarProductUnitSaving"
                    : "similarProductPackageSaving",
                  {
                    amount: money(Math.abs(suggestion.savingsAmount)),
                    percent: percent(suggestion.savingsPercent),
                    unit: sourceProduct.unit,
                  },
                )
              : premiumIsMeaningful
                ? t("similarProductPremium", { percent: percent(suggestion.savingsPercent) })
                : t("similarProductComparablePrice");
            return (
              <article className="alternative-row" key={alternative.id}>
                <button
                  type="button"
                  className="alternative-main"
                  onClick={() => onSelect(alternative)}
                  aria-label={t("openSimilarProduct", { name: alternative.name })}
                >
                  <ProductThumb product={alternative} compact />
                  <span className="alternative-copy">
                    <strong>{alternative.name}</strong>
                    <small>{alternative.unitQuantity}</small>
                    <span className="alternative-tags">
                      <em>{t(suggestion.matchKind === "specific" ? "sameSpecificType" : "sameProductCategory")}</em>
                      {suggestion.traits.map((trait) => (
                        <em key={trait}>{t(`similarTrait_${trait}`)}</em>
                      ))}
                    </span>
                  </span>
                </button>
                <div className="alternative-price">
                  <strong>{money(suggestion.bestPrice)}</strong>
                  <small>
                    {suggestion.bestUnitPrice
                      ? t("unitPrice", {
                          amount: money(suggestion.bestUnitPrice),
                          unit: alternative.unit,
                        })
                      : retailer?.shortName || ""}
                  </small>
                  <span className={savingsIsMeaningful ? "saving" : premiumIsMeaningful ? "premium" : ""}>
                    {valueLabel}
                  </span>
                </div>
                <button
                  type="button"
                  className={canReplace ? "text-button alternative-action" : "icon-button add alternative-action"}
                  onClick={() => (canReplace ? onReplace(alternative) : onAdd(alternative))}
                  title={canReplace
                    ? t("replaceBasketProduct", { name: alternative.name })
                    : t("addProduct", { name: alternative.name })}
                  aria-label={canReplace
                    ? t("replaceBasketProduct", { name: alternative.name })
                    : t("addProduct", { name: alternative.name })}
                >
                  {canReplace ? (
                    <>
                      <ArrowRightLeft size={15} aria-hidden="true" />
                      <span>{t("replace")}</span>
                    </>
                  ) : (
                    <Plus size={17} aria-hidden="true" />
                  )}
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function PriceChangeBadge({ product, retailerId, compact = false }) {
  const { locale, money, t } = usePreferences();
  const change = retailerId ? getProductPriceChange(product, retailerId) : null;
  if (!change) return null;
  const decrease = change.amount < 0;
  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
    .format(Math.abs(change.percentage));
  const currentPrice = getProductPrice(product, retailerId);
  const values = {
    percent,
    previous: money(change.previousPrice),
    current: money(currentPrice),
    time: formatDataTime(change.changedAt, locale, t),
  };
  const directionKey = decrease ? "Dropped" : "Increased";
  const labelKey = `price${directionKey}${compact ? "Compact" : ""}`;
  const label = t(labelKey, values);
  const details = t("priceChangeDetails", values);
  const Icon = decrease ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={`price-change${compact ? " compact" : ""} ${decrease ? "decrease" : "increase"}`}
      title={details}
      aria-label={details}
    >
      <Icon size={12} strokeWidth={2.5} aria-hidden="true" />
      {label}
    </span>
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
  const { t } = usePreferences();
  const imageSources = useMemo(() => productImageSources(product, 640), [product]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const imageUrl = imageSources[sourceIndex] || "";

  useEffect(() => {
    setSourceIndex(0);
  }, [imageSources]);

  return (
    <div className="drawer-image-frame" aria-label={t("productImage", { name: product.name })}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          decoding="async"
          loading="eager"
          fetchPriority="high"
          onError={() => setSourceIndex((index) => index + 1)}
        />
      ) : (
        <span style={{ "--thumb": product.tint }} aria-hidden="true">
          {product.tile}
        </span>
      )}
    </div>
  );
}

function useNearViewport(priority) {
  const elementRef = useRef(null);
  const [nearViewport, setNearViewport] = useState(false);

  useEffect(() => {
    if (priority || nearViewport) return undefined;
    const element = elementRef.current;
    if (!element) return undefined;
    if (typeof IntersectionObserver !== "function") {
      setNearViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [nearViewport, priority]);

  return { elementRef, shouldLoad: priority || nearViewport };
}

function ProductThumb({ product, compact = false, priority = false }) {
  const imageSources = useMemo(
    () => productImageSources(product, compact ? 72 : 96),
    [compact, product],
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loadedImageUrl, setLoadedImageUrl] = useState("");
  const imageRef = useRef(null);
  const { elementRef, shouldLoad } = useNearViewport(priority);
  const imageUrl = imageSources[sourceIndex] || "";
  // Price refreshes replace product objects; reset only when an image URL changes.
  const imageSourceKey = imageSources.join("\n");

  useEffect(() => {
    setSourceIndex(0);
    setLoadedImageUrl("");
  }, [imageSourceKey]);

  useEffect(() => {
    const image = imageRef.current;
    if (shouldLoad && image?.complete && image.naturalWidth > 0) {
      setLoadedImageUrl(imageUrl);
    }
  }, [imageUrl, shouldLoad]);

  if (imageUrl) {
    const isLoaded = loadedImageUrl === imageUrl;
    return (
      <span
        ref={elementRef}
        className={[
          "product-thumb",
          compact ? "compact" : "",
          "has-image",
          isLoaded ? "image-loaded" : "image-loading",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ "--thumb": product.tint }}
        aria-hidden="true"
      >
        <span className="product-thumb-fallback">{product.tile}</span>
        {shouldLoad ? (
          <img
            ref={imageRef}
            src={imageUrl}
            alt=""
            decoding="async"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "low"}
            onLoad={() => setLoadedImageUrl(imageUrl)}
            onError={() => setSourceIndex((index) => index + 1)}
          />
        ) : null}
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

function productImageSources(product, size = 96) {
  return buildCatalogImageSources(product?.imageUrl || "", {
    kind: "product",
    size,
    proxyBase: IMAGE_PROXY_BASE,
    baseUrl: window.location.href,
  });
}

function retailerLogoSources(retailer) {
  return [
    ...buildCatalogImageSources(retailer?.logoUrl || "", {
      kind: "retailer",
      size: 240,
      proxyBase: IMAGE_PROXY_BASE,
      baseUrl: window.location.href,
    }),
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
  const { t } = usePreferences();
  return (
    <div className="empty-state">
      <CircleDollarSign size={32} />
      <strong>{t("emptyBasket")}</strong>
      <small>{t("emptyBasketHelp")}</small>
    </div>
  );
}

function quantityStep() {
  return 1;
}

function formatCoverageSentence(count, t) {
  return count === 1 ? t("listHasOneProduct") : t("listHasProducts", { count });
}

function formatProductCount(count, t, number = String) {
  return count === 1 ? t("oneProduct") : t("productsCount", { count: number(count) });
}

function formatStopLimit(count, t) {
  return count === 1 ? t("upToOneStop") : t("upToStops", { count });
}

function locationStatusText(locationState, radiusKm, t, locale, number) {
  switch (locationState.status) {
    case "locating":
      return t("locationPermission");
    case "loading":
      return t("searchingNearby");
    case "ready": {
      const accuracy = locationState.position?.accuracyMeters
        ? t("approximateAccuracy", {
            distance: formatDistance(locationState.position.accuracyMeters, locale),
          })
        : "";
      return t("nearbyResult", {
        count: number(locationState.stores.length),
        radius: t("kilometers", { value: radiusKm }),
        accuracy,
      });
    }
    case "denied":
      return t("locationDenied");
    case "error":
      return t("locationError");
    default:
      return t("locationOptional");
  }
}

function formatUpdateStatus(updateStatus, t, locale) {
  if (!updateStatus?.checkedAt) return t("updateOnUse");
  if (updateStatus.refreshStatus === "failed") {
    return t("lastSuccessfulUpdate", {
      time: formatDataTime(
        updateStatus.lastSuccessfulRefreshAt || updateStatus.snapshotGeneratedAt,
        locale,
        t,
      ),
    });
  }
  const checkedAt = new Date(updateStatus.checkedAt);
  if (Number.isNaN(checkedAt.getTime())) return t("updateActive");
  const formatted = formatDateTime(checkedAt, locale);
  if (updateStatus.status === "snapshot") {
    return t("lastUpdate", { time: formatted });
  }
  if (updateStatus.status === "stale" || updateStatus.error) {
    return t("liveCheckFailed", { time: formatted });
  }
  return updateStatus.changedSinceLastCheck
    ? t("newPriceChanges", { time: formatted })
    : t("lastPriceCheck", { time: formatted });
}

function formatDataTime(value, locale, t) {
  if (!value) return t("unknown");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("unknown");
  return formatDateTime(date, locale);
}

function formatDateTime(date, locale) {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  } catch {
    try {
      const datePart = date.toLocaleDateString(locale);
      const timePart = date.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${datePart}, ${timePart}`;
    } catch {
      return date.toISOString().slice(0, 16).replace("T", " ");
    }
  }
}

function friendlyRefreshError(error, t) {
  if (!error) return t("checkIncomplete");
  if (String(error).includes("HTTP 403")) return t("upstreamBlocked");
  return t("checkIncomplete");
}

function healthStatusLabel(health, t, number) {
  if (health.state === "checking") return t("healthChecking");
  if (health.state === "offline") return t("healthOffline");
  const count = number(health.activeProducts);
  return health.source === "snapshot"
    ? t("healthCatalog", { count })
    : t("healthLive", { count });
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
  return Math.round(Number(value) || 0);
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
