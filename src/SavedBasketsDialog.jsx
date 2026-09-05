import { useEffect, useState } from "react";
import { Bookmark, FolderOpen, Info, RefreshCw, Save, Trash2, X } from "lucide-react";
import { usePreferences } from "./appContexts";

export default function SavedBasketsDialog({
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

function formatProductCount(count, t, number = String) {
  return count === 1 ? t("oneProduct") : t("productsCount", { count: number(count) });
}

function formatStopLimit(count, t) {
  return count === 1 ? t("upToOneStop") : t("upToStops", { count });
}
