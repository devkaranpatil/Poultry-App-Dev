import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// Self-hosted fonts; each file carries Latin and Devanagari subsets, loaded only when used.
import "@fontsource/mukta/400.css";
import "@fontsource/mukta/500.css";
import "@fontsource/mukta/600.css";
import "@fontsource/mukta/700.css";
import "@fontsource/martel/400.css";
import "@fontsource/martel/700.css";
import "@fontsource/martel/800.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
