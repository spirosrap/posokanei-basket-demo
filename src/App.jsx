import {
  AlertCircle,
  ArrowDownUp,
  Barcode,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Info,
  Minus,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  ShoppingBasket,
  Store,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  fetchCategories,
  fetchHealth,
  fetchProducts,
  fetchRetailers,
  fetchUpdateStatus,
} from "./posokaneiApi";
import {
  calculateRankings,
  calculateVisitPlan,
  formatEuro,
  getBestProductPrice,
  getProductPrice,
} from "./pricing";

const BASKET_KEY = "posokanei-basket";
const LIVE_BASKET_PRODUCTS_KEY = "posokanei-live-basket-products";

const savedBasket = () => {
  try {
    const stored = localStorage.getItem(BASKET_KEY);
    if (stored === null) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const savedLiveBasketProducts = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIVE_BASKET_PRODUCTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((product) => product?.id) : [];
  } catch {
    return [];
  }
};

function App() {
  const [basket, setBasket] = useState(savedBasket);
  const [liveBasketProducts, setLiveBasketProducts] = useState(savedLiveBasketProducts);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [health, setHealth] = useState({ state: "checking", label: "Σύνδεση με κατάλογο" });
  const [updateStatus, setUpdateStatus] = useState(null);
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
  const [maxChains, setMaxChains] = useState(1);

  useEffect(() => {
    localStorage.setItem(BASKET_KEY, JSON.stringify(basket));
  }, [basket]);

  useEffect(() => {
    localStorage.setItem(LIVE_BASKET_PRODUCTS_KEY, JSON.stringify(liveBasketProducts));
  }, [liveBasketProducts]);

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

  const activeRetailers = liveRetailers;

  const productMap = useMemo(
    () => new Map(allProducts.map((product) => [product.id, product])),
    [allProducts],
  );

  useEffect(() => {
    setBasket((current) => {
      const next = current.filter((entry) => productMap.has(entry.productId));
      return next.length === current.length ? current : next;
    });
  }, [productMap]);

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

  const clearBasket = () => setBasket([]);

  const copyBasket = async () => {
    const lines = basket.map((entry) => {
      const product = productMap.get(entry.productId);
      return `${entry.quantity} x ${product?.name ?? entry.productId}`;
    });
    await navigator.clipboard?.writeText(lines.join("\n"));
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

  return (
    <div className="app-shell">
      <Header
        health={health}
        basketCount={basket.length}
      />

      <AppIntro health={health} updateStatus={updateStatus} />
      <DataFreshnessNotice health={health} updateStatus={updateStatus} />

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
          onQuantity={updateQuantity}
          onClear={clearBasket}
          onCopy={copyBasket}
          onSelect={setSelectedProduct}
        />

        <RankingsPanel
          rankings={rankings}
          bestCompleteRanking={bestCompleteRanking}
          visitPlan={visitPlan}
          maxChains={maxChains}
          setMaxChains={setMaxChains}
          basketSize={basket.length}
        />
      </main>

      {selectedProduct ? (
        <ProductDrawer
          product={selectedProduct}
          retailers={activeRetailers}
          onClose={() => setSelectedProduct(null)}
          onAdd={() => addToBasket(selectedProduct)}
        />
      ) : null}
    </div>
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
          {health.source === "snapshot"
            ? "Ενημέρωση κάθε ώρα"
            : health.state === "online"
              ? "Live τιμές προϊόντων"
              : "Αναμονή live τιμών"}
        </span>
        <span>{formatUpdateStatus(updateStatus)}</span>
      </div>
    </section>
  );
}

function DataFreshnessNotice({ health, updateStatus }) {
  if (health.source !== "snapshot") return null;
  const snapshotTime = formatDataTime(updateStatus?.snapshotGeneratedAt || health.snapshotGeneratedAt);
  const isAutoSnapshot = updateStatus?.status === "snapshot";

  return (
    <section className="data-warning" aria-label="Προειδοποίηση φρεσκάδας δεδομένων">
      <AlertCircle size={18} />
      <div>
        <strong>
          {isAutoSnapshot
            ? "Οι τιμές ενημερώνονται αυτόματα κάθε ώρα από το PosoKanei."
            : "Οι τιμές εμφανίζονται από τον πιο πρόσφατο κατάλογο."}
        </strong>
        <span>
          Το demo δεν ρωτά το PosoKanei σε κάθε άνοιγμα σελίδας. Χρησιμοποιεί τον
          πιο πρόσφατο αυτόματα συγχρονισμένο κατάλογο. Τελευταία ενημέρωση:
          {" "}{snapshotTime}.
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
  onQuantity,
  onClear,
  onCopy,
  onSelect,
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
        <button type="button" className="text-button" onClick={onCopy}>
          <ClipboardList size={16} />
          Αντιγραφή
        </button>
        <button type="button" className="icon-button danger" onClick={onClear} aria-label="Άδειασμα καλαθιού">
          <Trash2 size={17} />
        </button>
      </div>

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
}) {
  const completeRankings = rankings.filter((row) => row.isComplete);
  const partialRankings = rankings.filter((row) => !row.isComplete);
  const maxTotal = Math.max(...completeRankings.map((row) => row.total), 0);
  const oneStopTotal = bestCompleteRanking?.total ?? null;
  return (
    <section className="panel rankings-panel" aria-labelledby="ranking-title">
      <PanelTitle
        id="ranking-title"
        icon={<Store size={18} />}
        title="Πλάνο"
        action={basketSize ? formatStopLimit(maxChains) : "διάλεξε προϊόντα"}
      />

      <ChainLimitControl maxChains={maxChains} setMaxChains={setMaxChains} />

      <RecommendationCard
        plan={visitPlan}
        basketSize={basketSize}
        maxChains={maxChains}
        oneStopTotal={oneStopTotal}
      />

      {visitPlan?.isComplete ? <VisitPlanBreakdown plan={visitPlan} /> : null}

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
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
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
    return (
      <span className="retailer-logo large" style={{ "--retailer": group.retailer.color }}>
        {group.retailer.shortName}
      </span>
    );
  }

  return (
    <span className="retailer-stack" aria-hidden="true">
      {groups.slice(0, 4).map((group) => (
        <span
          key={group.retailer.id}
          className="retailer-logo mini"
          style={{ "--retailer": group.retailer.color }}
        >
          {group.retailer.shortName}
        </span>
      ))}
    </span>
  );
}

function VisitPlanBreakdown({ plan }) {
  return (
    <div className="route-group">
      <div className="rank-group-title">
        <ClipboardList size={15} />
        <span>Τι αγοράζεις σε κάθε αλυσίδα</span>
      </div>
      <div className="route-list">
        {plan.groups.map((group) => (
          <article key={group.retailer.id} className="route-card">
            <div className="route-store-top">
              <span className="retailer-logo" style={{ "--retailer": group.retailer.color }}>
                {group.retailer.shortName}
              </span>
              <div>
                <strong>{group.retailer.name}</strong>
                <small>
                  {formatProductCount(group.items.length)} · {formatEuro(group.total)}
                </small>
              </div>
            </div>
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

function RetailerRank({ row, maxTotal, highlighted, basketSize }) {
  const percentage = maxTotal ? Math.max(10, (row.total / maxTotal) * 100) : 0;
  const missingNames = row.items
    .filter((item) => item.price == null)
    .map((item) => item.product?.name)
    .filter(Boolean);
  const cardClass = [
    "rank-card",
    highlighted ? "recommended" : "",
    row.isComplete ? "" : "incomplete",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cardClass}>
      <div className="rank-top">
        <span className="retailer-logo" style={{ "--retailer": row.retailer.color }}>
          {row.retailer.shortName}
        </span>
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
                <span className="retailer-dot" style={{ "--retailer": retailer.color }} />
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

function ProductThumb({ product, compact = false }) {
  if (product.imageUrl) {
    return (
      <span className={compact ? "product-thumb compact" : "product-thumb"}>
        <img src={product.imageUrl} alt="" loading="lazy" />
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

function formatUpdateStatus(updateStatus) {
  if (!updateStatus?.checkedAt) return "Έλεγχος ενημερώσεων: κατά τη χρήση";
  const checkedAt = new Date(updateStatus.checkedAt);
  if (Number.isNaN(checkedAt.getTime())) return "Έλεγχος ενημερώσεων: ενεργός";
  const formatted = new Intl.DateTimeFormat("el-GR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(checkedAt);
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
  return new Intl.DateTimeFormat("el-GR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
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
  setLiveBasketProducts((current) => {
    const byId = new Map(current.map((item) => [item.id, item]));
    byId.set(product.id, product);
    return [...byId.values()].slice(-200);
  });
}
