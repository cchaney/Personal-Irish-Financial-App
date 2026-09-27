import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/cormorant-garamond";
import "./styles.css";
import { applyTheme, initialTheme } from "./theme";
import App from "./App";

applyTheme(initialTheme());
createRoot(document.getElementById("root")).render(<App />);
