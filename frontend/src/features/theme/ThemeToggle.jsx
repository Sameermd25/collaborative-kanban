import { useDispatch, useSelector } from "react-redux";
import { toggleTheme } from "./themeSlice";

export default function ThemeToggle({ compact = false }) {
  const dispatch = useDispatch();
  const mode = useSelector((state) => state.theme.mode);

  return (
    <button
      type="button"
      className={`theme-toggle${compact ? " compact" : ""}`}
      onClick={() => dispatch(toggleTheme())}
      aria-label={`Switch to ${mode === "light" ? "dark" : "light"} mode`}
      title={`Switch to ${mode === "light" ? "dark" : "light"} mode`}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {mode === "light" ? "☾" : "☀"}
      </span>
      {!compact && <span>{mode === "light" ? "Dark mode" : "Light mode"}</span>}
    </button>
  );
}
