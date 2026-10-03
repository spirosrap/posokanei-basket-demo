import { ShoppingBasket } from "lucide-react";
import { useAppNavigation, usePreferences } from "./appContexts";
import { isUnmodifiedPrimaryClick } from "./appRoute";

const REPOSITORY_URL = "https://github.com/spirosrap/posokanei-basket-demo";

const COPY = {
  el: {
    brand: "Καλάθι Τιμών Supermarket",
    about:
      "Σύγκρινε ολόκληρο το καλάθι σου ανάμεσα στις αλυσίδες supermarket και βρες το φθηνότερο πλάνο αγορών.",
    app: "Εφαρμογή",
    home: "Το καλάθι μου",
    bargains: "Ευκαιρίες της ημέρας",
    changes: "Αλλαγές τιμών",
    info: "Πληροφορίες",
    guide: "Πώς λειτουργεί",
    health: "Κατάσταση καταλόγου",
    source: "Ανοιχτός κώδικας στο GitHub",
    disclaimer:
      "Ανεπίσημη εφαρμογή. Δεν συνδέεται με το PosoKanei ή με κάποια αλυσίδα supermarket. Οι τιμές προέρχονται από τον δημόσιο κατάλογο PosoKanei, είναι ενδεικτικές και μπορεί να διαφέρουν από την τιμή στο ράφι.",
    version: "Έκδοση",
  },
  en: {
    brand: "Supermarket Price Basket",
    about:
      "Compare your whole basket across supermarket chains and find the cheapest shopping plan.",
    app: "App",
    home: "My basket",
    bargains: "Today’s bargains",
    changes: "Price changes",
    info: "Information",
    guide: "How it works",
    health: "Catalogue status",
    source: "Open source on GitHub",
    disclaimer:
      "Unofficial app. Not affiliated with PosoKanei or any supermarket chain. Prices come from the public PosoKanei catalogue, are indicative and may differ from the shelf price.",
    version: "Version",
  },
};

export default function SiteFooter({ version, links, onOpenGuide }) {
  const { language } = usePreferences();
  const { navigate } = useAppNavigation();
  const copy = COPY[language] || COPY.el;
  const go = (event) => {
    if (!isUnmodifiedPrimaryClick(event)) return;
    event.preventDefault();
    navigate(new URL(event.currentTarget.href));
  };

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <strong>
            <ShoppingBasket size={17} aria-hidden="true" />
            {copy.brand}
          </strong>
          <p>{copy.about}</p>
        </div>
        <nav aria-label={copy.app}>
          <h2>{copy.app}</h2>
          <a href={links.home} onClick={go}>{copy.home}</a>
          <a href={links.bargains} onClick={go}>{copy.bargains}</a>
          <a href={links.changes} onClick={go}>{copy.changes}</a>
        </nav>
        <nav aria-label={copy.info}>
          <h2>{copy.info}</h2>
          <button type="button" onClick={onOpenGuide}>{copy.guide}</button>
          <a href={links.health} onClick={go}>{copy.health}</a>
          <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">{copy.source}</a>
        </nav>
        <p className="site-footer-note">
          {copy.disclaimer}
          <span>{copy.version} v{version}</span>
        </p>
      </div>
    </footer>
  );
}
