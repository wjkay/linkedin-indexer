import { chromium, Browser, Page, BrowserContext } from 'playwright';
import type { SearchResult } from '../types/index.js';

let browser: Browser | null = null;
let context: BrowserContext | null = null;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function initBrowser(): Promise<void> {
  if (!browser) {
    browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
    context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
    });
  }
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export async function searchLinkedIn(
  topic: string,
  region: string,
  subregion?: string
): Promise<SearchResult[]> {
  if (!browser || !context) {
    await initBrowser();
  }

  const page = await context!.newPage();
  const results: SearchResult[] = [];

  try {
    // Build search query - use DuckDuckGo (less aggressive bot detection)
    const searchTerms = buildSearchQuery(topic, region, subregion);
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(searchTerms)}`;

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000 + Math.random() * 1000);

    // Wait for results to load
    await page.waitForSelector('[data-testid="result"]', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // Extract LinkedIn results from DuckDuckGo search
    const links = await page.$$eval('article[data-testid="result"]', (articles) => {
      return articles.map(article => {
        const linkEl = article.querySelector('a[href*="linkedin.com"]') as HTMLAnchorElement;
        if (!linkEl) return null;

        const href = linkEl.getAttribute('href') || '';
        const titleEl = article.querySelector('h2') || article.querySelector('a[data-testid="result-title-a"]');
        const title = titleEl?.textContent?.trim() || '';
        const snippetEl = article.querySelector('[data-result="snippet"]') || article.querySelector('span');
        const snippet = snippetEl?.textContent?.trim() || '';

        return { href, title, snippet };
      }).filter(item => item && item.href.includes('linkedin.com'));
    });

    for (const link of links.slice(0, 10)) {
      if (!link) continue;
      let url = link.href;

      // Handle DuckDuckGo redirect URLs
      if (url.includes('duckduckgo.com/l/?')) {
        const match = url.match(/uddg=([^&]+)/);
        if (match) url = decodeURIComponent(match[1]);
      }

      // Skip non-article/post URLs
      if (!url.includes('/pulse/') && !url.includes('/posts/')) continue;

      const contentType = url.includes('/pulse/') ? 'article' : 'post';

      results.push({
        url,
        title: link.title || link.snippet.slice(0, 100),
        excerpt: link.snippet,
        authorName: '',
        authorProfileUrl: '',
        contentType
      });
    }

  } catch (error) {
    console.error(`Error searching LinkedIn for ${topic}/${region}:`, error);
  } finally {
    await page.close();
  }

  return results;
}

export async function fetchContentDetails(url: string): Promise<Partial<SearchResult> | null> {
  if (!browser) {
    await initBrowser();
  }

  const page = await browser!.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000 + Math.random() * 1000);

    // Extract content based on page type
    if (url.includes('/pulse/')) {
      return await extractArticleContent(page);
    } else {
      return await extractPostContent(page);
    }

  } catch (error) {
    console.error(`Error fetching content from ${url}:`, error);
    return null;
  } finally {
    await page.close();
  }
}

async function extractArticleContent(page: Page): Promise<Partial<SearchResult>> {
  return await page.evaluate(() => {
    const title = document.querySelector('h1')?.textContent?.trim() || '';
    const authorEl = document.querySelector('[data-tracking-control-name="article-reader_author"]');
    const authorName = authorEl?.textContent?.trim() || '';
    const authorProfileUrl = (authorEl as HTMLAnchorElement)?.href || '';

    // Get article content
    const articleBody = document.querySelector('.article-content') || document.querySelector('article');
    const excerpt = articleBody?.textContent?.slice(0, 500).trim() || '';

    return {
      title,
      authorName,
      authorProfileUrl,
      excerpt
    };
  });
}

async function extractPostContent(page: Page): Promise<Partial<SearchResult>> {
  return await page.evaluate(() => {
    const postContent = document.querySelector('.feed-shared-update-v2__description');
    const excerpt = postContent?.textContent?.slice(0, 500).trim() || '';

    const authorEl = document.querySelector('.update-components-actor__name');
    const authorName = authorEl?.textContent?.trim() || '';

    const authorLink = document.querySelector('.update-components-actor__container-link') as HTMLAnchorElement;
    const authorProfileUrl = authorLink?.href || '';

    return {
      title: excerpt.slice(0, 100),
      authorName,
      authorProfileUrl,
      excerpt
    };
  });
}

function buildSearchQuery(topic: string, region: string, subregion?: string): string {
  const topicFormatted = topic.replace(/-/g, ' ');
  const regionName = getRegionName(region);
  const subregionName = subregion ? ` ${subregion}` : '';

  return `"${topicFormatted}"${subregionName} ${regionName} site:linkedin.com/pulse OR site:linkedin.com/posts`;
}

function getRegionName(region: string): string {
  const names: Record<string, string> = {
    'nz': 'New Zealand',
    'au': 'Australia',
    'us': 'United States',
    'global': ''
  };
  return names[region] || region;
}
