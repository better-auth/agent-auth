import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./globals.css";

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
if (prefersDark) document.documentElement.classList.add("dark");

window
	.matchMedia("(prefers-color-scheme: dark)")
	.addEventListener("change", (e) => {
		document.documentElement.classList.toggle("dark", e.matches);
	});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
