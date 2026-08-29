import { z } from "zod";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { askPermission } from "../core/permissions";
import { isAllowedUrl, LIMITS } from "./guards";

export const WebFetchSchema = z.object({
  url: z.string().url().describe("The exact URL to fetch and read"),
});

export type WebFetchInput = z.infer<typeof WebFetchSchema>;

export interface WebFetchResult {
  success: true;
  title: string;
  url: string;
  content: string;
  hints?: string[];
}

export interface WebFetchError {
  success: false;
  error: string;
  hints?: string[];
}

const MAX_CONTENT_LENGTH = 15_000;

export async function webFetch(input: WebFetchInput): Promise<WebFetchResult | WebFetchError> {
  // URL guard
  const urlCheck = isAllowedUrl(input.url);
  if (!urlCheck.allowed) {
    return {
      success: false,
      error: `Blocked URL: ${urlCheck.reason}`,
      hints: ["Only http/https URLs allowed. Private networks blocked unless ALLOW_PRIVATE_NETWORK=1."],
    };
  }

  const approved = await askPermission({
    action: "web_fetch",
    title: `FETCH URL: ${input.url}`,
    details: [`  Downloading and parsing web page content.`],
  });

  if (!approved) {
    return { success: false, error: "User denied web fetch" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(input.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,application/json;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: `HTTP error ${response.status}: ${response.statusText}` };
    }

    // Check content-length header early
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const len = parseInt(contentLength, 10);
      if (!isNaN(len) && len > LIMITS.MAX_FETCH_BYTES) {
        return {
          success: false,
          error: `Content too large: ${(len / 1024 / 1024).toFixed(2)}MB exceeds ${(LIMITS.MAX_FETCH_BYTES / 1024 / 1024).toFixed(0)}MB limit`,
          hints: ["Try a more specific URL or use web_search to find summary."],
        };
      }
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain") &&
      !contentType.includes("application/json") &&
      !contentType.includes("text/markdown")
    ) {
      return {
        success: false,
        error: `Unsupported content type: ${contentType}. This tool only reads text, HTML, and JSON.`,
        hints: ["If you need to download binary, use run_command with curl/wget."],
      };
    }

    const html = await response.text();
    if (html.length > LIMITS.MAX_FETCH_BYTES) {
      // We already downloaded, but truncate later
    }

    let title = input.url;
    let markdown = "";

    if (contentType.includes("text/html")) {
      try {
        const $ = cheerio.load(html);

        // Strip noise
        $("script, style, nav, footer, aside, iframe, form, button, svg, header, .sidebar, .advertisement").remove();

        title = $("title").text().trim() || title;

        // Try main content areas first
        const mainContent = $("main, article, [role='main'], .post-content, .article-content, #content, .content").first();
        const targetHtml = mainContent.length > 0 ? (mainContent.html() || "") : ($("body").html() || "");

        const turndownService = new TurndownService({
          headingStyle: "atx",
          codeBlockStyle: "fenced",
        });

        markdown = turndownService.turndown(targetHtml);
      } catch (e: any) {
        return {
          success: false,
          error: `Failed to parse HTML: ${e.message}`,
          hints: ["Page may be malformed. Try alternative URL."],
        };
      }
    } else {
      markdown = html;
    }

    if (markdown.length > MAX_CONTENT_LENGTH) {
      markdown = markdown.slice(0, MAX_CONTENT_LENGTH) + `\n\n... [Truncated ${markdown.length - MAX_CONTENT_LENGTH} characters to save context] ...`;
    }

    if (!markdown.trim()) {
      return {
        success: false,
        error: "Page loaded but contained no readable text content.",
        hints: ["Page might be JS-heavy SPA that requires browser rendering."],
      };
    }

    return { success: true, title, url: input.url, content: markdown };
  } catch (error: any) {
    clearTimeout(timeoutId);
    const msg = error.name === "AbortError" ? "Request timed out after 15s" : error.message;
    return { success: false, error: `Fetch failed: ${msg}` };
  }
}
