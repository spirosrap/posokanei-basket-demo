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
  Search,
  Share2,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Store,
  Sun,
  Tag,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  formatEuro,
  getBestProductPrice,
  getProductPrice,
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
import { buildSharedBasketUrl, readSharedBasketUrl, SHARED_BASKET_PARAM } from "./shareBasket";
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
  EXTRA_STOP_COST_OPTIONS,
  getInitialExtraStopCost,
  saveExtraStopCost,
} from "./stopComparison";
import {
  buildShoppingPlanId,
  loadShoppingProgress,
  saveShoppingProgress,
  shoppingItemId,
} from "./shoppingProgress";

const BASKET_KEY = "posokanei-basket";
const LIVE_BASKET_PRODUCTS_KEY = "posokanei-live-basket-products";
const RETAILER_FILTER_KEY = "posokanei-retailer-filter";
const MAX_CHAINS_KEY = "posokanei-max-chains";
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
    document.title = preferences.t("documentTitle");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", preferences.t("documentDescription"));
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
      <AppContent />
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
  const [liveBasketProducts, setLiveBasketProducts] = useState(savedLiveBasketProducts);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
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
    saveLocalJson(MAX_CHAINS_KEY, maxChains);
  }, [maxChains]);

  useEffect(() => {
    saveExtraStopCost(extraStopCost);
  }, [extraStopCost]);

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
    setHealth({ state: "checking", activeProducts: 0 });
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
          activeProducts: stats.activeProducts,
          snapshotGeneratedAt: stats.snapshotGeneratedAt,
          liveError: stats.liveError,
        });
        setUpdateStatus(fetchedUpdateStatus);
      })
      .catch(() => {
        if (!cancelled) setHealth({ state: "offline", activeProducts: 0 });
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

  const stopComparison = useMemo(
    () => calculateStopComparison(basket, allProducts, activeRetailers, extraStopCost),
    [activeRetailers, allProducts, basket, extraStopCost],
  );
  const visitPlan =
    stopComparison.options.find((option) => option.limit === maxChains)?.plan ?? null;

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

      {displayedDailyBargain ? (
        <DailyBargain
          pick={displayedDailyBargain}
          retailers={locationEligibleRetailers}
          onSelect={() => setSelectedProduct(displayedDailyBargain.product)}
          onAdd={() => addToBasket(displayedDailyBargain.product)}
          moreHref={BARGAINS_PATH}
        />
      ) : null}

      <main className="workspace" aria-label={t("workspace")}>
        <SearchPanel
          query={query}
          setQuery={setQuery}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          categories={categories}
          products={displayProducts}
          retailers={activeRetailers}
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
          retailers={locationEligibleRetailers}
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
  const { language, locale, money, t } = usePreferences();
  const retailer = retailers.find((item) => item.id === pick.evidence.bestRetailerId);
  const updated = formatDataTime(pick.generatedAt, locale, t);
  const headline = language === "el" ? pick.headline : t("bargainHeadline");
  const reason =
    language === "el"
      ? pick.reason
      : t("bargainReason", {
          retailer: pick.evidence.bestRetailerName,
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
          <small>{pick.evidence.bestRetailerName}</small>
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

function BargainsPage({ pick, state, retailers, onSelect, onAdd }) {
  const { language, locale, money, number, t } = usePreferences();
  const bargains = pick?.bargains || [];
  const updated = formatDataTime(pick?.generatedAt, locale, t);

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
                      <small>{bargain.evidence.bestRetailerName}</small>
                    </span>
                  </span>
                  <span className="bargain-card-saving">
                    <strong>{Math.round(bargain.evidence.savingsPercentVsHighest)}%</strong>
                    <small>{t("cheaper")}</small>
                  </span>
                </div>

                <p className="bargain-card-reason">
                  {language === "el"
                    ? bargain.reason
                    : t("bargainReason", {
                        retailer: bargain.evidence.bestRetailerName,
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

function Header({ health, basketCount }) {
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
      <a className="brand" href="/" aria-label={t("agenticSpirosHome")}>
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
        <div className="basket-pill" title={t("basketItems")}>
          <ShoppingBasket size={16} />
          <span>{number(basketCount)}</span>
        </div>
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
    <section className="data-warning" aria-label={t("freshnessWarning")}>
      <AlertCircle size={18} />
      <div>
        <strong>
          {refreshFailed
            ? t("refreshFailedTitle")
            : isAutoSnapshot
            ? t("refreshAutomaticTitle")
            : t("refreshLatestTitle")}
        </strong>
        <span>
          {t("refreshSnapshotBody", { time: snapshotTime })}
          {refreshFailed
            ? t("refreshAttempt", {
                time: refreshAttemptTime,
                error: friendlyRefreshError(updateStatus?.refreshError, t),
              })
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
  retailers,
  catalogSource,
  liveState,
  liveMeta,
  selectedProduct,
  onSelect,
  onAdd,
  onLoadMore,
}) {
  const { number, t } = usePreferences();
  const resultAction = `${number(products.length)}/${number(liveMeta.total)}`;
  const canLoadMore = liveMeta.hasNext;
  const isLoadingMore = liveState === "loading_more";

  return (
    <section className="panel search-panel" aria-labelledby="search-title">
      <PanelTitle
        id="search-title"
        icon={<PackageSearch size={18} />}
        title={t("products")}
        action={resultAction}
      />

      <label className="search-box">
        <Search size={18} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
        />
        <Barcode size={17} aria-hidden="true" />
      </label>

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
            retailers={retailers}
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
          {isLoadingMore ? t("loading") : t("loadMore")}
        </button>
      ) : null}
    </section>
  );
}

function LiveNotice({ state, total, visible, catalogSource }) {
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
    </div>
  );
}

function ProductRow({ product, retailers, selected, onSelect, onAdd }) {
  const { money, t } = usePreferences();
  const best = getBestProductPrice(
    product,
    retailers.map((retailer) => retailer.id),
  );
  return (
    <article className={selected ? "product-row selected" : "product-row"}>
      <button type="button" className="product-main" onClick={onSelect}>
        <ProductThumb product={product} />
        <span className="product-copy">
          <strong>{product.name}</strong>
          <small>
            {product.brand || t("noBrand")} · {product.unitQuantity || product.unit}
          </small>
        </span>
      </button>
      <div className="product-price">
        <span>{best ? money(best.price) : "-"}</span>
        <small>{t("best")}</small>
      </div>
      <button
        type="button"
        className="icon-button add"
        onClick={onAdd}
        aria-label={t("addProduct", { name: product.name })}
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
  const { money, t } = usePreferences();
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
        title={t("basket")}
        action={basket.length ? money(visitPlan?.total ?? 0) : money(0)}
      />

      <div className="basket-toolbar">
        <button type="button" className="text-button demo-button" onClick={onLoadDemo}>
          <Sparkles size={16} />
          {t("example")}
        </button>
        <button type="button" className="text-button" onClick={onCopy}>
          <ClipboardList size={16} />
          {t("copy")}
        </button>
        <button
          type="button"
          className="text-button share-button"
          onClick={onShare}
          disabled={!basket.length}
        >
          <Share2 size={16} />
          {t("share")}
        </button>
        <button
          type="button"
          className="text-button danger-button"
          onClick={onClear}
          aria-label={t("newBasketLabel")}
        >
          <Trash2 size={17} />
          {t("newBasket")}
        </button>
      </div>

      <SharedBasketNotice state={sharedBasketStatus} />

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
        title: t("brandName"),
        text: t("shareNativeText", {
          count: number(basketCount),
          stops: formatStopLimit(maxChains, t),
        }),
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
          <span>{t("basketLink")}</span>
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

function BasketItem({ product, quantity, planItem, onQuantity, onSelect }) {
  const { money, t } = usePreferences();
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
          aria-label={t("decreaseQuantity", { name: product.name })}
        >
          <Minus size={15} />
        </button>
        <input
          value={quantity}
          inputMode="decimal"
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
      <div className="line-total">
        <strong>{bestPrice == null ? "-" : money(bestPrice * quantity)}</strong>
        <small>
          {bestPrice == null
            ? t("missing")
            : `${money(bestPrice)} / ${product.unit} · ${planItem.retailer.shortName}`}
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
      await copyText(formatPlanText(visitPlan, language));
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
          locationPosition={locationState.position}
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

      {partialRankings.length ? (
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
    </section>
  );
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
  const { money, t } = usePreferences();
  const recommended = comparison.recommended;
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
          const detail = !option.isComplete
            ? t("notCovered")
            : option.limit === 1
              ? t("oneStopBaseline")
              : option.savingsVsOneStop > 0
                ? t("saveAgainstOneStop", { amount: money(option.savingsVsOneStop) })
                : t("sameAsOneStop");

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
          {EXTRA_STOP_COST_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              className={extraStopCost === value ? "active" : ""}
              aria-pressed={extraStopCost === value}
              onClick={() => setExtraStopCost(value)}
            >
              {money(value)}
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
                  extraStops: Math.max(0, recommended.actualStops - 1),
                  perStop: money(extraStopCost),
                  effective: money(recommended.effectiveTotal),
                })}
              </span>
            </>
          ) : (
            <strong>{t("recommendationNeedsBasket")}</strong>
          )}
        </span>
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
  const checkedItems = useMemo(() => {
    const validIds = new Set(planItemIds);
    return new Set(checkedItemIds.filter((id) => validIds.has(id)));
  }, [checkedItemIds, planItemIds]);
  const planRoute = useMemo(
    () =>
      locationReady
        ? buildPlanRoute(plan, retailerProximity, locationPosition)
        : null,
    [locationPosition, locationReady, plan, retailerProximity],
  );
  const directionsUrl = useMemo(
    () => mapsDirectionsUrl(planRoute, locationPosition),
    [locationPosition, planRoute],
  );
  const completedCount = checkedItems.size;
  const checklistComplete = completedCount === planItemIds.length;

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

  return (
    <div className="route-group">
      <div className="route-group-heading">
        <div className="rank-group-title">
          <ClipboardList size={15} />
          <span>{t("buyAtEachChain")}</span>
        </div>
        <div className="route-group-actions">
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
      {planRoute && directionsUrl ? (
        <div className="plan-route-bar">
          <Route size={17} aria-hidden="true" />
          <span>
            <strong>{t("nearbyRouteTitle")}</strong>
            <small>
              {t("nearbyRouteSummary", {
                stops: planRoute.stops.map((stop) => stop.retailer.name).join(" → "),
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
        {plan.groups.map((group) => (
          <article key={group.retailer.id} className="route-card">
            <div className="route-store-top">
              <RetailerLogo retailer={group.retailer} />
              <div>
                <strong>{group.retailer.name}</strong>
                <small>
                  {formatProductCount(group.items.length, t, number)} · {money(group.total)}
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
                  {t("branches")}
                </button>
              ) : null}
            </div>
            <StoreDistance
              locationReady={locationReady}
              proximity={retailerProximity[group.retailer.id]}
              onSelectBranches={() => onSelectRetailer(group.retailer.id)}
            />
            <div className="route-items">
              {group.items.map((item) => {
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
        ))}
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

function ProductDrawer({ product, retailers: retailerList, onClose, onAdd }) {
  const { money, t } = usePreferences();
  const best = getBestProductPrice(
    product,
    retailerList.map((retailer) => retailer.id),
  );
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
          </div>
          <div>
            <small>{t("barcode")}</small>
            <strong>{product.gtin || "-"}</strong>
          </div>
        </div>
        <p className="drawer-description">
          {product.description || t("catalogProduct")}
        </p>
        <div className="price-table" aria-label={t("pricesByChain")}>
          {retailerList.map((retailer) => {
            const price = getProductPrice(product, retailer.id);
            return (
              <div key={retailer.id} className="price-row">
                <RetailerLogo retailer={retailer} className="tiny" ariaHidden />
                <span>{retailer.name}</span>
                <strong>{price == null ? "-" : money(price)}</strong>
              </div>
            );
          })}
        </div>
        <button type="button" className="primary-action" onClick={onAdd}>
          <Plus size={18} />
          {t("addToBasket")}
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
  const { t } = usePreferences();
  const [failedImageUrl, setFailedImageUrl] = useState("");
  const imageUrl = proxiedProductImageUrl(product);
  const showImage = imageUrl && failedImageUrl !== imageUrl;

  return (
    <div className="drawer-image-frame" aria-label={t("productImage", { name: product.name })}>
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
  const { t } = usePreferences();
  return (
    <div className="empty-state">
      <CircleDollarSign size={32} />
      <strong>{t("emptyBasket")}</strong>
      <small>{t("emptyBasketHelp")}</small>
    </div>
  );
}

function quantityStep(product) {
  return product?.unit === "kg" ? 0.5 : 1;
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
