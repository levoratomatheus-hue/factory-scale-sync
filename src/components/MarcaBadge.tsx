interface MarcaBadgeProps {
  marca?: string | null;
  size?: "default" | "sm";
}

export function MarcaBadge({ marca, size = "default" }: MarcaBadgeProps) {
  if (!marca) return null;

  if (marca === "Zan Collor") {
    const gradientStyle = {
      background: "linear-gradient(to right, #7C3AED, #2563EB)",
      WebkitBackgroundClip: "text" as const,
      WebkitTextFillColor: "transparent" as const,
      backgroundClip: "text" as const,
    };

    if (size === "sm") {
      return (
        <span style={gradientStyle} className="font-bold text-xs tracking-wide shrink-0">
          ZAN COIIOR
        </span>
      );
    }

    return (
      <div className="leading-none shrink-0">
        <div style={gradientStyle} className="font-bold text-lg tracking-wide">
          ZAN COIIOR
        </div>
        <div className="text-[10px] text-muted-foreground tracking-widest uppercase">
          masterbatches
        </div>
      </div>
    );
  }

  if (marca === "Pigma") {
    return (
      <span
        style={{ color: "#EC4899" }}
        className={`font-bold shrink-0 ${size === "sm" ? "text-xs" : "text-lg"}`}
      >
        PIGMA
      </span>
    );
  }

  return null;
}
