import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/public-api";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/trainer$",
        "/trainer/",
        "/account",
        "/checkout",
        "/payments",
        "/api",
        "/login",
        "/register",
        "/reset-password",
        "/forgot-password",
        "/accept-invite",
        "/verify-email",
      ],
    },
    sitemap: siteUrl + "/sitemap.xml",
  };
}
