import React, { useEffect, useState } from "react";

function getInitialTheme() {
  const saved = localStorage.getItem("adashe_theme");
  if (saved === "dark" || saved === "light") return saved;
  // No saved preference yet — respect the system/browser setting.
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("adashe_theme", theme);
  }, [theme]);

  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle dark mode"
      type="button"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
