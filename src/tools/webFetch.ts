import { z } from "zod";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { askPermission } from "../core/permissions";

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

const MAX_CONTENT_LENGTH = 15000; // ~3500 tokens. Prevents context overflow.

export async function webFetch(input: WebFetchInput): Promise<WebFetchResult | WebFetchError> {
  const approved = await askPermission({
    action: "web_fetch",
    title: `FETCH URL: ${input.url}`,
    details: [`  Downloading and parsing web page content.`],
  });

  if (!approved) {
    return { success: false, error: "User denied web fetch" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(input.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: `HTTP error ${response.status}: ${response.statusText}` };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/json")) {
      return { 
        success: false, 
        error: `Unsupported content type: ${contentType}. This tool only reads text, HTML, and JSON.`,
        hints: ["If you need to download a binary file, use run_command with curl/wget instead."]
      };
    }

    const html = await response.text();
    let title = input.url;
    let markdown = "";

    if (contentType.includes("text/html")) {
      const $ = cheerio.load(html);
      
      // Strip noise (ads, navbars, scripts)
      $("script, style, nav, footer, aside, iframe, form, button, svg, header, .sidebar").remove();
      
      title = $("title").text().trim() || title;
      
      // Find the main content area
      const mainContent = $("main, article, [role='main'], .post-content, .article-content, #content").first();
      const targetHtml = mainContent.length > 0 ? mainContent.html() || "" : $("body").html() || "";
      
      const turndownService = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced"
      });
      
      markdown = turndownService.turndown(targetHtml);
    } else {
      markdown = html; // Plain text or JSON
    }

    // Truncate to protect context window
    if (markdown.length > MAX_CONTENT_LENGTH) {
      markdown = markdown.slice(0, MAX_CONTENT_LENGTH) + `\n\n... [Truncated ${markdown.length - MAX_CONTENT_LENGTH} characters to save context] ...`;
    }

    if (!markdown.trim()) {
      return { 
        success: false, 
        error: "Page loaded but contained no readable text content.",
        hints: ["The page might be a JavaScript-heavy SPA that requires a browser to render."]
      };
    }

    return { success: true, title, url: input.url, content: markdown };

  } catch (error: any) {
    clearTimeout(timeoutId);
    const msg = error.name === "AbortError" ? "Request timed out after 15s" : error.message;
    return { success: false, error: `Fetch failed: ${msg}` };
  }
}