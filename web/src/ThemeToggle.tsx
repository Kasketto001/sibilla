import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "./theme";

const OPTIONS = [
  { value: "light", label: "Tema chiaro", Icon: SunIcon },
  { value: "dark", label: "Tema scuro", Icon: MoonIcon },
  { value: "system", label: "Tema del dispositivo", Icon: MonitorIcon },
] as const;

/** Light, dark, or whatever the device uses. The choice is remembered in this browser. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Tema" className="inline-flex gap-0.5 rounded-full border bg-background p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button key={value} type="button" role="radio" aria-checked={theme === value} aria-label={label} title={label}
          onClick={() => setTheme(value)}
          className="grid size-7 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-checked:bg-muted aria-checked:text-foreground">
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
