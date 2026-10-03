import { useEffect } from "react";
import {
  Bell,
  Bookmark,
  CircleDollarSign,
  CircleHelp,
  ListChecks,
  MapPin,
  Route,
  Share2,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { usePreferences } from "./appContexts";

const COPY = {
  el: {
    eyebrow: "Οδηγός",
    title: "Πώς λειτουργεί το Καλάθι Τιμών",
    lead:
      "Φτιάχνεις τη λίστα με τα ψώνια σου και η εφαρμογή υπολογίζει σε ποιες αλυσίδες supermarket θα την αγοράσεις φθηνότερα συνολικά.",
    stepsTitle: "Σε 3 βήματα",
    steps: [
      [
        "Βρες προϊόντα",
        "Στη στήλη «Προϊόντα» αναζήτησε με όνομα, μάρκα ή barcode και πάτησε το πράσινο + για να μπει το προϊόν στο καλάθι.",
      ],
      [
        "Φτιάξε το καλάθι σου",
        "Στη στήλη «Καλάθι» όρισε ποσότητες. Το καλάθι που βλέπεις στην αρχή είναι παράδειγμα: πάτησε «Νέο καλάθι» για να ξεκινήσεις το δικό σου.",
      ],
      [
        "Δες το φθηνότερο πλάνο",
        "Στη στήλη «Πλάνο» βλέπεις το σύνολο για 1, 2, 3 ή 4 στάσεις και τι ακριβώς αγοράζεις από κάθε αλυσίδα.",
      ],
    ],
    featuresTitle: "Τι άλλο μπορείς να κάνεις",
    features: [
      [
        "route",
        "Σύγκριση στάσεων",
        "Περισσότερες στάσεις σημαίνουν συνήθως χαμηλότερο σύνολο. Κάθε επιλογή δείχνει πόσα γλιτώνεις σε σχέση με τη μία στάση.",
      ],
      [
        "money",
        "Πότε αξίζει άλλη στάση",
        "Στο «Τι προτιμάς στα ψώνια σου;» ορίζεις πόσα ευρώ πρέπει να κερδίζεις για να αξίζει ένα επιπλέον supermarket. Η πρόταση προσαρμόζεται.",
      ],
      [
        "target",
        "Προϋπολογισμός",
        "Βάλε ένα όριο αγορών και δες αμέσως αν το πλάνο χωράει ή πόσο το ξεπερνά.",
      ],
      [
        "pin",
        "Κοντινά supermarket",
        "Με «Χρήση τοποθεσίας» ο υπολογισμός κρατά μόνο αλυσίδες με κατάστημα κοντά σου, σε ακτίνα 2, 5 ή 10 χλμ.",
      ],
      [
        "list",
        "Λίστα για το κατάστημα",
        "Τσέκαρε τα προϊόντα καθώς τα αγοράζεις και δες τι ποσό και ποια προϊόντα απομένουν σε κάθε στάση.",
      ],
      [
        "bell",
        "Παρακολούθηση τιμών",
        "Από τις λεπτομέρειες ενός προϊόντος μπορείς να το παρακολουθείς και να ορίσεις τιμή-στόχο. Τα βρίσκεις όλα στο καμπανάκι.",
      ],
      [
        "bookmark",
        "Αποθηκευμένες λίστες",
        "Στο «Λίστες» αποθηκεύεις το καλάθι με όνομα και το ξανανοίγεις αργότερα με τις τρέχουσες τιμές.",
      ],
      [
        "share",
        "Κοινή χρήση και εξαγωγή",
        "Στείλε το καλάθι με σύνδεσμο ή αντίγραψε το πλάνο ως κείμενο για να το έχεις στο κινητό.",
      ],
      [
        "sparkles",
        "Ευκαιρίες και αλλαγές τιμών",
        "Οι «Ευκαιρίες» δείχνουν προϊόντα με μεγάλη διαφορά τιμής ανάμεσα σε αλυσίδες. Οι «Αλλαγές τιμών» δείχνουν τι ανέβηκε ή έπεσε τις τελευταίες 7 ημέρες.",
      ],
    ],
    faqTitle: "Συχνές ερωτήσεις",
    faq: [
      [
        "Από πού προέρχονται οι τιμές;",
        "Από τον δημόσιο κατάλογο PosoKanei. Η εφαρμογή συγχρονίζει τον κατάλογο αυτόματα κάθε ώρα και δείχνει πάντα την ώρα της τελευταίας ενημέρωσης.",
      ],
      [
        "Είναι επίσημη εφαρμογή;",
        "Η εφαρμογή είναι ανεξάρτητη και δεν συνδέεται με το PosoKanei ή με κάποια αλυσίδα. Οι τιμές προέρχονται από τον δημόσιο κατάλογο PosoKanei, που ακολουθεί τις τρέχουσες τιμές των supermarket, και συγχρονίζονται κάθε ώρα.",
      ],
      [
        "Τι σημαίνει «πλήρες πλάνο»;",
        "Ένα πλάνο είναι πλήρες όταν οι αλυσίδες του διαθέτουν όλα τα προϊόντα του καλαθιού. Αν ένα προϊόν λείπει από λίγες στάσεις, η εφαρμογή σου δείχνει ποιο είναι και προτείνει ισοδύναμες εναλλακτικές.",
      ],
      [
        "Πού αποθηκεύονται το καλάθι και οι ρυθμίσεις μου;",
        "Μόνο στον browser της συσκευής σου, χωρίς λογαριασμό. Όταν δημιουργείς σύντομο σύνδεσμο κοινής χρήσης, το περιεχόμενο του καλαθιού αποθηκεύεται στον διακομιστή ώστε να ανοίγει ο σύνδεσμος. Η τοποθεσία χρησιμοποιείται μόνο για να βρεθούν κοντινά καταστήματα.",
      ],
    ],
    close: "Κλείσιμο",
  },
  en: {
    eyebrow: "Guide",
    title: "How the price basket works",
    lead:
      "Build your shopping list and the app works out which supermarket chains give you the lowest total for all of it.",
    stepsTitle: "In 3 steps",
    steps: [
      [
        "Find products",
        "In the Products column, search by name, brand or barcode and press the green + to add a product to the basket.",
      ],
      [
        "Build your basket",
        "In the Basket column, set quantities. The basket you see at first is an example: press “New basket” to start your own.",
      ],
      [
        "See the cheapest plan",
        "The Plan column shows the total for 1, 2, 3 or 4 stops and exactly what to buy from each chain.",
      ],
    ],
    featuresTitle: "What else you can do",
    features: [
      [
        "route",
        "Stop comparison",
        "More stops usually mean a lower total. Each option shows how much you save compared with a single stop.",
      ],
      [
        "money",
        "When another stop is worth it",
        "Under “What matters for your shopping?” choose how many euros an extra supermarket has to save you. The recommendation adapts.",
      ],
      [
        "target",
        "Budget",
        "Set a spending limit and see at once whether the plan fits or by how much it goes over.",
      ],
      [
        "pin",
        "Nearby supermarkets",
        "With “Use location” the calculation keeps only chains with a store near you, within 2, 5 or 10 km.",
      ],
      [
        "list",
        "In-store checklist",
        "Tick products off as you buy them and see the amount and items still left at each stop.",
      ],
      [
        "bell",
        "Price watch",
        "From a product’s details you can watch it and set a target price. Find them all under the bell.",
      ],
      [
        "bookmark",
        "Saved lists",
        "Under “Lists”, save the basket with a name and reopen it later at current prices.",
      ],
      [
        "share",
        "Share and export",
        "Send the basket as a link, or copy the plan as text to keep on your phone.",
      ],
      [
        "sparkles",
        "Bargains and price changes",
        "Bargains shows products with a large price gap between chains. Price changes shows what went up or down in the last 7 days.",
      ],
    ],
    faqTitle: "Common questions",
    faq: [
      [
        "Where do the prices come from?",
        "From the public PosoKanei catalogue. The app syncs the catalogue automatically every hour and always shows the time of the last update.",
      ],
      [
        "Is this an official app?",
        "The app is independent and not affiliated with PosoKanei or any chain. Prices come from the public PosoKanei catalogue, which tracks current supermarket prices, and are synced every hour.",
      ],
      [
        "What does “complete plan” mean?",
        "A plan is complete when its chains stock every product in the basket. If a product is missing with fewer stops, the app shows which one and suggests equivalent alternatives.",
      ],
      [
        "Where are my basket and settings stored?",
        "Only in your device’s browser, with no account. When you create a short share link, the basket contents are stored on the server so the link can open. Location is used only to find nearby stores.",
      ],
    ],
    close: "Close",
  },
};

const ICONS = {
  route: Route,
  money: CircleDollarSign,
  target: Target,
  pin: MapPin,
  list: ListChecks,
  bell: Bell,
  bookmark: Bookmark,
  share: Share2,
  sparkles: Sparkles,
};

export default function GuideDialog({ onClose }) {
  const { language } = usePreferences();
  const copy = COPY[language] || COPY.el;

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <aside
      className="drawer guide-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
    >
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel guide-panel">
        <div className="drawer-head">
          <span className="guide-dialog-icon" aria-hidden="true">
            <CircleHelp size={20} />
          </span>
          <button type="button" className="icon-button" onClick={onClose} aria-label={copy.close}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-title">
          <small>{copy.eyebrow}</small>
          <h2 id="guide-title">{copy.title}</h2>
          <p>{copy.lead}</p>
        </div>

        <h3>{copy.stepsTitle}</h3>
        <ol className="guide-steps">
          {copy.steps.map(([title, text], index) => (
            <li key={title}>
              <b aria-hidden="true">{index + 1}</b>
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
            </li>
          ))}
        </ol>

        <h3>{copy.featuresTitle}</h3>
        <ul className="guide-features">
          {copy.features.map(([icon, title, text]) => {
            const Icon = ICONS[icon];
            return (
              <li key={title}>
                <Icon size={17} aria-hidden="true" />
                <span>
                  <strong>{title}</strong>
                  <small>{text}</small>
                </span>
              </li>
            );
          })}
        </ul>

        <h3>{copy.faqTitle}</h3>
        <div className="guide-faq">
          {copy.faq.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </aside>
  );
}
