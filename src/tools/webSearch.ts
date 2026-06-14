import { z } from "zod";
import * as cheerio from "cheerio";

export const WebSearchSchema = z.object({
  query: z.string().describe("The search query to look up on the web"),
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

export async function webSearch(input: WebSearchInput): Promise<WebSearchResult | WebSearchError> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    });
    
    if (!response.ok) {
      return { success: false, error: `Search failed with status ${response.status}` };
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    
    // Limit to 5 results to protect the context window
    $(".result").each((i, el) => {
      if (i >= 5) return false; 
      
      const titleEl = $(el).find(".result__a");
      const snippetEl = $(el).find(".result__snippet");
      
      const title = titleEl.text().trim();
      let link = titleEl.attr("href") || "";
      const snippet = snippetEl.text().trim();
      
      // DuckDuckGo wraps links in a redirect URL. Extract the actual URL.
      if (link.includes("uddg=")) {
        try {
          const urlObj = new URL(link, "https://duckduckgo.com");
          link = decodeURIComponent(urlObj.searchParams.get("uddg") || link);
        } catch {}
      }
      
      if (title && link && snippet) {
        results.push({ title, url: link, snippet });
      }
    });
    
    if (results.length === 0) {
      return { 
        success: true, 
        results: [], 
        hints: ["No results found. Try rephrasing your query or using broader terms."] 
      };
    }
    
    return { success: true, results };
  } catch (error: any) {
    return { success: false, error: `Search error: ${error.message}` };
  }
}