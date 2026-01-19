import { chromium, Browser, Page } from 'playwright';
import type { SearchResult } from '../types/index.js';

let browser: Browser | null = null;

export async function initBrowser(): Promise<void> {
  if (!browser) {
    browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
}

export async function closeBrowser(): Promise<void> {
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
  if (!browser) {
    await initBrowser();
  }

  const page = await browser!.newPage();
  const results: SearchResult[] = [];

  try {
    // Build search query
    const searchTerms = buildSearchQuery(topic, region, subregion);
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchTerms)}`;

    await page.goto(searchUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000 + Math.random() * 2000); // Random delay

    // Extract LinkedIn results from Google search
    const links = await page.$$eval('a[href*="linkedin.com/pulse"], a[href*="linkedin.com/posts"]', (anchors) => {
      return anchors.map(a => {
        const href = a.getAttribute('href') || '';
        const text = a.textContent || '';
        return { href, text };
      }).filter(item => item.href.includes('linkedin.com'));
    });

    for (const link of links.slice(0, 10)) {
      // Clean URL (remove Google redirect wrapper if present)
      let url = link.href;
      if (url.includes('/url?q=')) {
        const match = url.match(/\/url\?q=([^&]+)/);
        if (match) url = decodeURIComponent(match[1]);
      }

      const contentType = url.includes('/pulse/') ? 'article' : 'post';

      results.push({
        url,
        title: link.text.slice(0, 200),
        excerpt: '',
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
