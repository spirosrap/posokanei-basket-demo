import {
  AlertCircle,
  ArrowDownUp,
  BadgeEuro,
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
import { initialBasket, products as demoProducts, retailers } from "./demoData";
import { fetchHealth, searchProducts } from "./posokaneiApi";
import {
  basketItemCount,
  calculateRankings,
  calculateSplitBest,
  formatEuro,
  getBestProductPrice,
  getProductPrice,
} from "./pricing";

const savedBasket = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem("posokanei-basket") || "null");
    return Array.isArray(parsed) && parsed.length ? parsed : initialBasket;
  } catch {
    return initialBasket;
  }
};

function App() {
  const [basket, setBasket] = useState(savedBasket);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Όλα");
  const [dataMode, setDataMode] = useState("demo");
  const [health, setHealth] = useState({ state: "checking", label: "Έλεγχος" });
  const [liveProducts, setLiveProducts] = useState([]);
  const [liveState, setLiveState] = useState("idle");
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    localStorage.setItem("posokanei-basket", JSON.stringify(basket));
  }, [basket]);

  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then(() => {
        if (!cancelled) setHealth({ state: "online", label: "API online" });
      })
      .catch(() => {
        if (!cancelled) setHealth({ state: "offline", label: "API demo mode" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dataMode !== "live" || query.trim().length < 2) return;
    let cancelled = false;
    setLiveState("loading");
    const timer = window.setTimeout(() => {
      searchProducts(query.trim())
        .then((items) => {
          if (cancelled) return;
          setLiveProducts(items);
          setLiveState(items.length ? "ready" : "empty");
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
  }, [dataMode, query]);

  const allProducts = useMemo(() => {
    const byId = new Map(demoProducts.map((product) => [product.id, product]));
    liveProducts.forEach((product) => byId.set(product.id, product));
    return [...byId.values()];
  }, [liveProducts]);

  const displayProducts = useMemo(() => {
    const source =
      dataMode === "live" && liveProducts.length && query.trim().length >= 2
        ? liveProducts
        : demoProducts;
    const normalizedQuery = query.trim().toLowerCase();
    return source.filter((product) => {
      const matchesCategory = category === "Όλα" || product.category === category;
      const matchesQuery =
        !normalizedQuery ||
        `${product.name} ${product.brand} ${product.category}`
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, dataMode, liveProducts, query]);

  const categories = useMemo(() => {
    const values = new Set(["Όλα", ...demoProducts.map((product) => product.category)]);
    return [...values];
  }, []);

  const rankings = useMemo(
    () => calculateRankings(basket, allProducts, retailers),
    [allProducts, basket],
  );

  const splitBest = useMemo(
    () => calculateSplitBest(basket, allProducts, retailers),
    [allProducts, basket],
  );

  const productMap = useMemo(
    () => new Map(allProducts.map((product) => [product.id, product])),
    [allProducts],
  );

  const addToBasket = (product) => {
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

  const restoreBasket = () => setBasket(initialBasket);

  const copyBasket = async () => {
    const lines = basket.map((entry) => {
      const product = productMap.get(entry.productId);
      return `${entry.quantity} x ${product?.name ?? entry.productId}`;
    });
    await navigator.clipboard?.writeText(lines.join("\n"));
  };

  return (
    <div className="app-shell">
      <Header
        dataMode={dataMode}
        setDataMode={setDataMode}
        health={health}
        basketCount={basketItemCount(basket)}
      />

      <main className="workspace" aria-label="Εφαρμογή σύγκρισης καλαθιού">
        <SearchPanel
          query={query}
          setQuery={setQuery}
          category={category}
          setCategory={setCategory}
          categories={categories}
          products={displayProducts}
          dataMode={dataMode}
          liveState={liveState}
          selectedProduct={selectedProduct}
          onSelect={setSelectedProduct}
          onAdd={addToBasket}
        />

        <BasketPanel
          basket={basket}
          productMap={productMap}
          rankings={rankings}
          onQuantity={updateQuantity}
          onClear={clearBasket}
          onRestore={restoreBasket}
          onCopy={copyBasket}
          onSelect={setSelectedProduct}
        />

        <RankingsPanel
          rankings={rankings}
          splitBest={splitBest}
          basketSize={basket.length}
        />
      </main>

      {selectedProduct ? (
        <ProductDrawer
          product={selectedProduct}
          retailers={retailers}
          onClose={() => setSelectedProduct(null)}
          onAdd={() => addToBasket(selectedProduct)}
        />
      ) : null}
    </div>
  );
}

function Header({ dataMode, setDataMode, health, basketCount }) {
  const isOnline = health.state === "online";
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Agentic Spiros home">
        <span className="brand-mark">
          <ShoppingBasket size={21} aria-hidden="true" />
        </span>
        <span>
          <strong>Καλάθι Τιμών</strong>
          <small>agenticspiros / demo</small>
        </span>
      </a>

      <div className="topbar-actions">
        <div
          className={`source-status ${isOnline ? "online" : "offline"}`}
          title="Κατάσταση API PosoKanei"
        >
          {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
          <span>{health.label}</span>
        </div>
        <div className="segmented" aria-label="Πηγή δεδομένων">
          <button
            type="button"
            className={dataMode === "demo" ? "active" : ""}
            onClick={() => setDataMode("demo")}
          >
            Demo
          </button>
          <button
            type="button"
            className={dataMode === "live" ? "active" : ""}
            onClick={() => setDataMode("live")}
          >
            Live
          </button>
        </div>
        <div className="basket-pill" title="Σύνολο τεμαχίων">
          <ShoppingBasket size={16} />
          <span>{basketCount.toLocaleString("el-GR")}</span>
        </div>
      </div>
    </header>
  );
}

function SearchPanel({
  query,
  setQuery,
  category,
  setCategory,
  categories,
  products,
  dataMode,
  liveState,
  selectedProduct,
  onSelect,
  onAdd,
}) {
  return (
    <section className="panel search-panel" aria-labelledby="search-title">
      <PanelTitle
        id="search-title"
        icon={<PackageSearch size={18} />}
        title="Προϊόντα"
        action={`${products.length} αποτελέσματα`}
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
            key={item}
            type="button"
            className={item === category ? "chip active" : "chip"}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <LiveNotice mode={dataMode} state={liveState} />

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
    </section>
  );
}

function LiveNotice({ mode, state }) {
  if (mode !== "live") return null;
  const labels = {
    idle: "Live αναζήτηση έτοιμη",
    loading: "Φόρτωση live αποτελεσμάτων",
    ready: "Live αποτελέσματα",
    empty: "Δεν βρέθηκαν live αποτελέσματα",
    error: "Live API μη διαθέσιμο",
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
  onQuantity,
  onClear,
  onRestore,
  onCopy,
  onSelect,
}) {
  const best = rankings[0];
  return (
    <section className="panel basket-panel" aria-labelledby="basket-title">
      <PanelTitle
        id="basket-title"
        icon={<ClipboardList size={18} />}
        title="Καλάθι"
        action={best ? formatEuro(best.total) : formatEuro(0)}
      />

      <div className="basket-toolbar">
        <button type="button" className="text-button" onClick={onRestore}>
          <RefreshCw size={16} />
          Πρότυπο
        </button>
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
                bestRetailer={best?.retailer.id}
                onQuantity={onQuantity}
                onSelect={() => onSelect(product)}
              />
            );
          })
        )}
      </div>

      <div className="best-strip">
        <div>
          <small>Πρώτη επιλογή</small>
          <strong>{best?.retailer.name ?? "Καμία"}</strong>
        </div>
        <div>
          <small>Κάλυψη</small>
          <strong>
            {best ? `${best.availableCount}/${basket.length}` : "0/0"}
          </strong>
        </div>
        <div>
          <small>Διαφορά</small>
          <strong>{best?.savings ? formatEuro(best.savings) : formatEuro(0)}</strong>
        </div>
      </div>
    </section>
  );
}

function BasketItem({ product, quantity, bestRetailer, onQuantity, onSelect }) {
  const step = quantityStep(product);
  const bestPrice = bestRetailer ? getProductPrice(product, bestRetailer) : null;
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
        <small>{bestPrice == null ? "έλλειψη" : `${formatEuro(bestPrice)} / ${product.unit}`}</small>
      </div>
    </article>
  );
}

function RankingsPanel({ rankings, splitBest, basketSize }) {
  const complete = rankings.filter((row) => row.isComplete);
  const maxTotal = Math.max(...complete.map((row) => row.total), 0);
  return (
    <section className="panel rankings-panel" aria-labelledby="ranking-title">
      <PanelTitle
        id="ranking-title"
        icon={<ArrowDownUp size={18} />}
        title="Αλυσίδες"
        action="φθηνότερα πρώτα"
      />

      <div className="rank-list">
        {rankings.map((row, index) => (
          <RetailerRank
            key={row.retailer.id}
            row={row}
            maxTotal={maxTotal}
            highlighted={index === 0 && row.isComplete}
            basketSize={basketSize}
          />
        ))}
      </div>

      <div className="split-card">
        <div className="split-heading">
          <span className="rank-badge">
            <BadgeEuro size={16} />
          </span>
          <div>
            <strong>Split καλάθι</strong>
            <small>χαμηλότερη τιμή ανά προϊόν</small>
          </div>
        </div>
        <strong className="split-total">{formatEuro(splitBest.total)}</strong>
        <div className="split-lines">
          {splitBest.items.slice(0, 5).map((item) => (
            <span key={item.product.id}>
              {item.product.name.split(" ").slice(0, 2).join(" ")} · {item.retailer?.shortName}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function RetailerRank({ row, maxTotal, highlighted, basketSize }) {
  const percentage = maxTotal ? Math.max(10, (row.total / maxTotal) * 100) : 0;
  return (
    <article className={highlighted ? "rank-card recommended" : "rank-card"}>
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
            Best
          </span>
        ) : null}
      </div>
      <div className="rank-money">
        <strong>{formatEuro(row.total)}</strong>
        <small>
          {row.savings != null && row.savings > 0
            ? `κερδίζεις ${formatEuro(row.savings)}`
            : row.isComplete
              ? "πλήρες καλάθι"
              : "μερική κάλυψη"}
        </small>
      </div>
      <div className="coverage-track" aria-hidden="true">
        <span style={{ width: `${percentage}%` }} />
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
          {product.description || "Live προϊόν από τον κατάλογο PosoKanei."}
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
      <small>Προσθέστε προϊόντα από την αναζήτηση.</small>
    </div>
  );
}

function quantityStep(product) {
  return product?.unit === "kg" ? 0.5 : 1;
}

function roundQuantity(value) {
  return Math.round(value * 10) / 10;
}

export default App;
