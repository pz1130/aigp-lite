import localFont from "next/font/local";

// Self-hosted so `next build` never fetches from Google Fonts (a transient
// fetch failure used to break CI builds). The files are the latin-subset
// variable woff2s Google serves, unmodified; licenses (SIL OFL 1.1) sit next
// to them in src/assets/fonts/.

export const fontSans = localFont({
  src: "../assets/fonts/inter-latin-var.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-sans-loaded",
});

export const fontMono = localFont({
  src: "../assets/fonts/jetbrains-mono-latin-var.woff2",
  weight: "100 800",
  display: "swap",
  variable: "--font-mono-loaded",
});

export const fontTabular = localFont({
  src: "../assets/fonts/ibm-plex-sans-latin-var.woff2",
  weight: "100 700",
  display: "swap",
  variable: "--font-tabular-loaded",
});
