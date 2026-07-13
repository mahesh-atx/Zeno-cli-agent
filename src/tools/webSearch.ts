import { z } from "zod";
import * as cheerio from "cheerio";
import { isAllowedUrl } from "./guards";

export const WebSearchSchema = z.object({
  query: z.string().min(1).max(200).describe("The search query to look up on the web"),
});

export type WebSearchInput = z.infer<typeof WebSearchSchema>;

export interface WebSearchResult {
  success: true;
  results: Array<{ title: string; url: string; snippet: string }>;
  hints?: string[];
}

export interface WebSearchError {
  success: false;
  error: string;
  hints?: string[];
}

let lastSearchTime = 0;
const RATE_LIMIT_MS = 1000;

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

function parseResults(html: string): Array<{ title: string; url: string; snippet: string }> {
  const $ = cheerio.load(html);
  const results: Array<{ title: string; url: string; snippet: string }> = [];

  // Try multiple selectors for resilience
  const selectors = [".result", ".web-result", ".results .result", "li.b_algo", ".result__body"];

  for (const sel of selectors) {
    $(sel).each((i, el) => {
      if (results.length >= 5) return false;

      const titleEl = $(el).find(".result__a, h2 a, h3 a, .result__title a, a").first();
      const snippetEl = $(el).find(".result__snippet, .result__ snippet, p, .snippet, .b_caption p").first();

      const title = titleEl.text().trim() || $(el).find("h2, h3").first().text().trim();
      let link = titleEl.attr("href") || "";
      const snippet = snippetEl.text().trim();

      // DuckDuckGo wraps links in redirect URL with uddg param
      if (link.includes("uddg=")) {
        try {
          const urlObj = new URL(link, "https://duckduckgo.com");
          const decoded = urlObj.searchParams.get("uddg");
          if (decoded) link = decodeURIComponent(decoded);
        } catch {
          // keep original
        }
      }

      // Also handle /l/?uddg= format
      if (link.startsWith("//")) link = "https:" + link;

      if (title && link && snippet && link.startsWith("http")) {
        // Deduplicate
        if (!results.some(r => r.url === link)) {
          results.push({ title, url: link, snippet: snippet.slice(0, 300) });
        }
      }
      // If no link yet but we have title+snippet, try to find any http link inside
      if (results.length < 5 && (!link || !link.startsWith("http"))) {
        const anyLink = $(el).find("a[href^='http']").first().attr("href");
        if (anyLink && title && snippet) {
          let cleanLink = anyLink;
          if (cleanLink.includes("uddg=")) {
            try {
              const urlObj = new URL(cleanLink, "https://duckduckgo.com");
              const decoded = urlObj.searchParams.get("uddg");
              if (decoded) cleanLink = decodeURIComponent(decoded);
            } catch {}
          }
          if (cleanLink.startsWith("http") && !results.some(r => r.url === cleanLink)) {
            results.push({ title, url: cleanLink, snippet: snippet.slice(0, 300) });
          }
        }
      }
    });
    if (results.length >= 3) break; // enough if first selector worked
  }

  return results;
}

export async function webSearch(input: WebSearchInput): Promise<WebSearchResult | WebSearchError> {
  // Rate limiting - simple throttle
  const now = Date.now();
  const sinceLast = now - lastSearchTime;
  if (sinceLast < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - sinceLast));
  }
  lastSearchTime = Date.now();

  const urlsToTry = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(input.query)}`,
  ];

  for (const url of urlsToTry) {
    // URL allow check (should always pass for duckduckgo, but check)
    const urlCheck = isAllowedUrl(url);
    if (!urlCheck.allowed) {
      return { success: false, error: `Blocked URL: ${urlCheck.reason}` };
    }

    try {
      const response = await fetchWithTimeout(url, 10000);

      if (!response.ok) {
        // Try next URL
        if (url === urlsToTry[0]) continue;
        return { success: false, error: `Search failed with status ${response.status}` };
      }

      const html = await response.text();
      const results = parseResults(html);

      if (results.length > 0) {
        return { success: true, results };
      }

      // If first URL gave 0 results, try second
      if (url === urlsToTry[0]) continue;

      return {
        success: true,
        results: [],
        hints: ["No results found. Try rephrasing query or broader terms."],
      };
    } catch (error: any) {
      if (error.name === "AbortError") {
        if (url === urlsToTry[0]) continue; // retry with lite
        return { success: false, error: "Search timed out after 10s" };
      }
      if (url === urlsToTry[0]) continue;
      return { success: false, error: `Search error: ${error.message}` };
    }
  }

  return {
    success: true,
    results: [],
    hints: ["No results found after trying multiple endpoints. Try rephrasing query."],
  };
}
