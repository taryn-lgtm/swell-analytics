import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/* Allow all. The query-string variants of `/` and `/rankings` stay out of the
   index through their own `noindex`, not through a Disallow here: a
   disallowed URL cannot be crawled, so its noindex would never be read. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
