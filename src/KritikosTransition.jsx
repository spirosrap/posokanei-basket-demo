import { Info } from "lucide-react";
import { usePreferences } from "./appContexts";
import { coverageCopy } from "./catalogAvailabilityCopy";

export default function KritikosTransition() {
  const { language } = usePreferences();
  const copy = coverageCopy[language];
  return (
    <aside className="retailer-transition" aria-label={copy.kritikosTransitionTitle}>
      <Info size={17} aria-hidden="true" />
      <div>
        <strong>{copy.kritikosTransitionTitle}</strong>
        <p>
          {copy.kritikosTransitionBody}{" "}
          <a href={`${import.meta.env.BASE_URL}history/kritikos.json`} download="kritikos-history.json">
            {copy.kritikosHistory}
          </a>
        </p>
      </div>
    </aside>
  );
}
