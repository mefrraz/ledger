/**
 * Configuração da marca (white-label).
 * Os valores vêm de variáveis de ambiente (NEXT_PUBLIC_*), com defaults neutros.
 * A EQX define os valores dela no Vercel (Settings → Environment Variables).
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "Folha de Serviço",
  shortName: process.env.NEXT_PUBLIC_APP_SHORT_NAME || "Folha",
  logoUrl: process.env.NEXT_PUBLIC_LOGO_URL || "/logo.png",
  faviconUrl: process.env.NEXT_PUBLIC_FAVICON_URL || "/favicon.png",
  primary: process.env.NEXT_PUBLIC_BRAND_PRIMARY || "#F1C411",
  dark: process.env.NEXT_PUBLIC_BRAND_DARK || "#1a1a1a",
  soft: process.env.NEXT_PUBLIC_BRAND_SOFT || "#54595F",
  muted: process.env.NEXT_PUBLIC_BRAND_MUTED || "#7A7A7A",
  light: process.env.NEXT_PUBLIC_BRAND_LIGHT || "#CFCFCF",
  page: process.env.NEXT_PUBLIC_BRAND_PAGE || "#F7F7F7",
  success: process.env.NEXT_PUBLIC_BRAND_SUCCESS || "#61CE70",
  olive: process.env.NEXT_PUBLIC_BRAND_OLIVE || "#98C03E",
  /** Acento usado nos templates de email. Fallback: cor primária da marca. */
  emailAccent: process.env.NEXT_PUBLIC_EMAIL_ACCENT || process.env.NEXT_PUBLIC_BRAND_PRIMARY || "#F1C411",
  /** Cor do texto do botão nos emails (contraste sobre o acento). */
  emailButtonText: process.env.NEXT_PUBLIC_EMAIL_BUTTON_TEXT || "#1a1a1a",
};

/** CSS variables a injetar no :root (para as cores do Tailwind). */
export function brandCssVars(): string {
  return `:root{
  --brand-gold:${brand.primary};
  --brand-dark:${brand.dark};
  --brand-soft:${brand.soft};
  --brand-muted:${brand.muted};
  --brand-light:${brand.light};
  --brand-page:${brand.page};
  --brand-success:${brand.success};
  --brand-olive:${brand.olive};
}`;
}
