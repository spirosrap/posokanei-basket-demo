import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { registerAppServiceWorker } from "./serviceWorker.js";
import "./styles.css";

const rootElement = document.getElementById("root");
rootElement.replaceChildren();
createRoot(rootElement).render(<App />);
registerAppServiceWorker();
