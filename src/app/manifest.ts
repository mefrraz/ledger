import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: "Plataforma de gestão de folhas de serviço semanais",
    start_url: "/",
    display: "standalone",
    background_color: brand.page,
    theme_color: brand.primary,
    orientation: "portrait-primary",
    lang: "pt",
    icons: [
      {
        src: brand.faviconUrl,
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
      {
        src: brand.faviconUrl,
        sizes: "any",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}