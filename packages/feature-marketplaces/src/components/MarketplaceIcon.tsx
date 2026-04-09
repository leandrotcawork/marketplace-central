const BRAND: Record<string, { bg: string; text: string }> = {
  vtex:          { bg: "#FF3366", text: "#FFFFFF" },
  mercado_livre: { bg: "#FFE600", text: "#1A1A1A" },
  magalu:        { bg: "#0086FF", text: "#FFFFFF" },
  shopee:        { bg: "#EE4D2D", text: "#FFFFFF" },
  americanas:    { bg: "#E30613", text: "#FFFFFF" },
};

const DEFAULT = { bg: "#6366F1", text: "#FFFFFF" };

interface MarketplaceIconProps {
  code: string;
  size?: number;
}

export function MarketplaceIcon({ code, size = 32 }: MarketplaceIconProps) {
  const { bg, text } = BRAND[code] ?? DEFAULT;
  return (
    <div
      className="rounded-lg flex items-center justify-center font-bold text-sm shrink-0 select-none"
      style={{ width: size, height: size, backgroundColor: bg, color: text }}
    >
      {code.charAt(0).toUpperCase()}
    </div>
  );
}
