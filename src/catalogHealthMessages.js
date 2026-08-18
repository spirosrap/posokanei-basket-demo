const messages = {
  el: {
    catalogHealthDocumentTitle: "Υγεία καταλόγου · Καλάθι Τιμών",
    catalogHealthDocumentDescription:
      "Δες την πληρότητα, τη φρεσκάδα και τις μεταβολές κάλυψης του συγχρονισμένου καταλόγου PosoKanei.",
    catalogHealthEyebrow: "Διαφάνεια δεδομένων",
    catalogHealthTitle: "Υγεία καταλόγου",
    catalogHealthDescription:
      "Δες τι δημοσιεύτηκε, τι άλλαξε από τον προηγούμενο επιτυχημένο συγχρονισμό και αν απορρίφθηκε ελλιπής λήψη.",
    catalogHealthLoading: "Φόρτωση κατάστασης καταλόγου",
    catalogHealthUnavailable: "Η κατάσταση του καταλόγου δεν είναι διαθέσιμη αυτή τη στιγμή.",
    catalogHealthCurrentSync: "Τρέχων δημοσιευμένος κατάλογος",
    catalogHealthComparedWith: ({ time }) => `Σύγκριση με ${time}`,
    catalogHealthSyncStatus: "Κατάσταση τελευταίου συγχρονισμού",
    catalogHealthStatusHealthy: "Ο κατάλογος ενημερώθηκε και πέρασε όλους τους ελέγχους.",
    catalogHealthStatusHealthyBody:
      "Οι αριθμοί που βλέπεις προέρχονται από την τελευταία πλήρη λήψη που δημοσιεύτηκε.",
    catalogHealthStatusProtected: "Μια ελλιπής λήψη απορρίφθηκε με ασφάλεια.",
    catalogHealthStatusProtectedBody:
      "Ο προηγούμενος πλήρης κατάλογος παραμένει ενεργός και δεν αφαιρέθηκαν προϊόντα από την εφαρμογή.",
    catalogHealthStatusDelayed: "Η τελευταία προσπάθεια δεν ολοκληρώθηκε.",
    catalogHealthStatusDelayedBody:
      "Η εφαρμογή συνεχίζει με τον τελευταίο επιτυχημένο κατάλογο και θα δοκιμάσει ξανά αυτόματα.",
    catalogHealthLastAttempt: ({ time }) => `Τελευταία προσπάθεια: ${time}`,
    catalogHealthSummary: "Σύνοψη κάλυψης καταλόγου",
    catalogHealthProducts: "μοναδικά προϊόντα",
    catalogHealthOffers: "ενεργές τιμές προϊόντος-αλυσίδας",
    catalogHealthCategories: "κατηγορίες",
    catalogHealthChains: "ελληνικές αλυσίδες με τιμές",
    catalogHealthRootCoverage: "Κάλυψη βασικών κατηγοριών",
    catalogHealthRootCoverageDescription:
      "Τα προϊόντα που συλλέχθηκαν από καθεμία από τις έξι επίσημες βασικές κατηγορίες.",
    catalogHealthRetailerCoverage: "Κάλυψη ανά αλυσίδα",
    catalogHealthRetailerCoverageDescription:
      "Πόσα προϊόντα του δημοσιευμένου καταλόγου έχουν τρέχουσα τιμή σε κάθε ελληνική αλυσίδα.",
    catalogHealthCoveragePercent: ({ percent }) => `${percent}% του καταλόγου`,
    catalogHealthNoComparison: "χωρίς προηγούμενο",
    catalogHealthUnchanged: "χωρίς αλλαγή",
    catalogHealthRejectedCandidate: "Τι εντοπίστηκε στην απορριφθείσα λήψη",
    catalogHealthRejectedCandidateDescription:
      "Οι παρακάτω μειώσεις δεν δημοσιεύτηκαν και δεν επηρεάζουν τον ενεργό κατάλογο.",
    catalogHealthFootnote:
      "Η κάλυψη αλυσίδας σημαίνει προϊόντα με διαθέσιμη τρέχουσα τιμή στη δημόσια πηγή. Δεν είναι απογραφή όλων των προϊόντων που υπάρχουν στα φυσικά καταστήματα.",
    catalogRootCleaning: "Καθαριότητα",
    catalogRootDrinks: "Ποτά",
    catalogRootPersonalCare: "Προσωπική Φροντίδα",
    catalogRootPets: "Είδη για Κατοικίδια",
    catalogRootBaby: "Βρεφικά",
    catalogRootFood: "Τρόφιμα",
  },
  en: {
    catalogHealthDocumentTitle: "Catalogue health · Price Basket",
    catalogHealthDocumentDescription:
      "See the completeness, freshness, and coverage changes of the synchronized PosoKanei catalogue.",
    catalogHealthEyebrow: "Data transparency",
    catalogHealthTitle: "Catalogue health",
    catalogHealthDescription:
      "See what was published, what changed since the previous successful sync, and whether an incomplete download was rejected.",
    catalogHealthLoading: "Loading catalogue status",
    catalogHealthUnavailable: "Catalogue status is not available right now.",
    catalogHealthCurrentSync: "Current published catalogue",
    catalogHealthComparedWith: ({ time }) => `Compared with ${time}`,
    catalogHealthSyncStatus: "Latest synchronization status",
    catalogHealthStatusHealthy: "The catalogue was updated and passed every check.",
    catalogHealthStatusHealthyBody:
      "These figures come from the latest complete download that was published.",
    catalogHealthStatusProtected: "An incomplete download was safely rejected.",
    catalogHealthStatusProtectedBody:
      "The previous complete catalogue remains active, so products were not removed from the app.",
    catalogHealthStatusDelayed: "The latest attempt did not complete.",
    catalogHealthStatusDelayedBody:
      "The app continues with the latest successful catalogue and will retry automatically.",
    catalogHealthLastAttempt: ({ time }) => `Latest attempt: ${time}`,
    catalogHealthSummary: "Catalogue coverage summary",
    catalogHealthProducts: "unique products",
    catalogHealthOffers: "active product-chain prices",
    catalogHealthCategories: "categories",
    catalogHealthChains: "Greek chains with prices",
    catalogHealthRootCoverage: "Main category coverage",
    catalogHealthRootCoverageDescription:
      "Products collected from each of the six official top-level categories.",
    catalogHealthRetailerCoverage: "Coverage by chain",
    catalogHealthRetailerCoverageDescription:
      "How many published catalogue products have a current price at each Greek chain.",
    catalogHealthCoveragePercent: ({ percent }) => `${percent}% of catalogue`,
    catalogHealthNoComparison: "no previous sync",
    catalogHealthUnchanged: "unchanged",
    catalogHealthRejectedCandidate: "What was detected in the rejected download",
    catalogHealthRejectedCandidateDescription:
      "These drops were not published and do not affect the active catalogue.",
    catalogHealthFootnote:
      "Chain coverage means products with a current price in the public source. It is not an inventory of every product available in physical stores.",
    catalogRootCleaning: "Cleaning",
    catalogRootDrinks: "Drinks",
    catalogRootPersonalCare: "Personal care",
    catalogRootPets: "Pet supplies",
    catalogRootBaby: "Baby",
    catalogRootFood: "Food",
  },
};

export function catalogHealthText(language, key, values = {}, fallback = null) {
  const message = messages[language]?.[key] ?? messages.el[key];
  if (message === undefined) return fallback ? fallback(key, values) : key;
  return typeof message === "function" ? message(values) : message;
}
