#!/usr/bin/env node
/**
 * LinkedIn Content Scraper CLI
 * Uses Playwright with li_at cookie authentication
 * Non-aggressive, on-demand scraping
 */

import { chromium, Browser, BrowserContext } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

// Configuration
const LI_AT_COOKIE = process.env.LI_AT || 'AQEDARQZMn0D-WouAAABm9fYeCEAAAGb--T8IU4AFDz2di6P9DjpYdBXj-pw-IA9sdNiCMnteRG_Cw0vU2hCY9ayWQsfAJBSnjrsPMWDEeIbbAmixjgxpjVd6KTEINVK2qqeUoRc8wkOavAoxnM25pN4';

// Delay between requests (be nice to LinkedIn - avoid rate limits)
const REQUEST_DELAY_MS = 8000; // 8 seconds between searches

interface SearchConfig {
  name: string;
  keywords: string[];
}

// Search configurations
const SEARCHES: SearchConfig[] = [
  // RMA Wellington Region (GWRC and related councils)
  {
    name: 'rma-wellington',
    keywords: [
      'resource management wellington',
      'RMA reform wellington',
      'GWRC consent',
      'hutt city planning',
      'wellington district plan'
    ]
  },
  // RMA All of NZ
  {
    name: 'rma-nz',
    keywords: [
      'resource management new zealand',
      'RMA reform',
      'resource consent NZ',
      'freshwater management NZ'
    ]
  },
  // Charlie Hopkins specific
  {
    name: 'charlie-hopkins',
    keywords: ['charlie hopkins']
  },
  // IT Wellington
  {
    name: 'it-wellington',
    keywords: [
      'enterprise architecture wellington',
      'digital transformation wellington',
      'CTO wellington'
    ]
  },
  // IT NZ
  {
    name: 'it-nz',
    keywords: [
      'enterprise architecture new zealand',
      'digital transformation NZ',
      'cloud architecture NZ'
    ]
  },
  // IT Australia
  {
    name: 'it-australia',
    keywords: [
      'enterprise architecture australia',
      'digital transformation australia',
      'cloud architecture sydney'
    ]
  }
];

interface LinkedInPost {
  id: string;
  text: string;
  authorName: string;
  authorHeadline?: string;
  authorUrl?: string;
  postUrl: string;
  likes?: number;
  comments?: number;
  timestamp?: string;
}

interface SearchResult {
  search: string;
  keyword: string;
  timestamp: string;
  posts: LinkedInPost[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let browser: Browser | null = null;
let context: BrowserContext | null = null;

async function initBrowser(): Promise<void> {
  if (browser) return;

  console.log('Launching browser...');
  browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
  });

  // Set the li_at cookie
  await context.addCookies([{
    name: 'li_at',
    value: LI_AT_COOKIE,
    domain: '.linkedin.com',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'None'
  }]);

  // Verify login by visiting LinkedIn
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  const url = page.url();
  if (url.includes('/login') || url.includes('/authwall')) {
    console.log('ERROR: Cookie appears to be invalid or expired. Please update LI_AT.');
    await browser.close();
    process.exit(1);
  }

  // Get logged in user name
  try {
    const name = await page.$eval('.feed-identity-module__actor-meta a', el => el.textContent?.trim());
    console.log(`Logged in as: ${name || 'Unknown'}\n`);
  } catch {
    console.log('Logged in successfully\n');
  }

  await page.close();
}

async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    context = null;
  }
}

async function searchPosts(keyword: string): Promise<LinkedInPost[]> {
  const posts: LinkedInPost[] = [];

  if (!context) {
    await initBrowser();
  }

  const page = await context!.newPage();

  try {
    console.log(`  Searching: "${keyword}"`);

    // Go to LinkedIn search with content filter (don't use sortBy - it breaks keyword filtering)
    const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await sleep(4000 + Math.random() * 2000); // 4-6 seconds random delay

    // Wait for results to load
    await page.waitForSelector('.search-results-container, .scaffold-finite-scroll__content', { timeout: 10000 }).catch(() => {});

    // Debug: save screenshot
    const screenshotPath = path.join(process.cwd(), 'output', `debug_${keyword.replace(/\s+/g, '_')}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`    Screenshot: ${screenshotPath}`);

    // Scroll to load more results
    await page.evaluate(() => window.scrollBy(0, 1000));
    await sleep(2000);

    // Extract posts from search results - based on actual LinkedIn DOM structure
    const results = await page.evaluate(() => {
      const posts: any[] = [];
      const seen = new Set<string>();
      const debug: string[] = [];

      // Find all post containers - look for divs containing author profile links
      // LinkedIn posts typically have links to /in/username or /company/name
      const allAuthorLinks = document.querySelectorAll('a[href*="/in/"], a[href*="/company/"]');
      debug.push(`Found ${allAuthorLinks.length} author links on page`);

      // Get unique parent containers for posts
      const seenContainers = new Set<Element>();
      const postContainers: Element[] = [];

      for (const link of allAuthorLinks) {
        // Walk up to find a reasonable post container (usually 3-5 levels up)
        let container = link.parentElement;
        for (let i = 0; i < 8 && container; i++) {
          // Look for container that has reaction buttons (indicates a post)
          if (container.querySelector('button[aria-label*="reaction"], button[aria-label*="Like"]')) {
            if (!seenContainers.has(container)) {
              seenContainers.add(container);
              postContainers.push(container);
            }
            break;
          }
          container = container.parentElement;
        }
      }
      debug.push(`Found ${postContainers.length} unique post containers`);

      const listItems = postContainers;

      for (const el of listItems) {
        // Check if this list item contains author links (post identification)
        const authorLink = el.querySelector('a[href*="/in/"], a[href*="/company/"]') as HTMLAnchorElement;
        const hasLikeBtn = el.querySelector('button[aria-label*="Like"], button[aria-label*="reaction"]');
        debug.push(`LI: author=${!!authorLink}, like=${!!hasLikeBtn}, html=${el.innerHTML.substring(0, 50)}`);

        if (!authorLink) continue;
        debug.push(`Found post with author link`);

        // Get author link - look for link containing /in/ or /company/
        const authorLinks = el.querySelectorAll('a[href*="/in/"], a[href*="/company/"]');
        debug.push(`  authorLinks: ${authorLinks.length}`);
        if (authorLinks.length === 0) continue;

        // The second link usually contains the full author info (first is just avatar)
        const authorInfoLink = authorLinks.length > 1 ? authorLinks[1] : authorLinks[0];
        const authorUrl = (authorInfoLink as HTMLAnchorElement)?.href || '';
        debug.push(`  authorUrl: ${authorUrl.substring(0, 40)}`);

        // Extract author info from the link's paragraphs or spans
        let authorParagraphs = authorInfoLink.querySelectorAll('p');
        debug.push(`  paragraphs in link: ${authorParagraphs.length}`);

        // If no paragraphs, try spans or direct text
        let authorName = '';
        let authorHeadline = '';
        let timestamp = '';

        if (authorParagraphs.length >= 1) {
          authorName = authorParagraphs[0]?.textContent?.replace(/•.*$/, '').trim() || '';
        } else {
          // Try getting text content directly from the link
          const linkText = authorInfoLink.textContent?.trim() || '';
          debug.push(`  linkText: ${linkText.substring(0, 50)}`);
          // Extract name from text like "Charlie Hopkins • 1st..."
          authorName = linkText.split('•')[0]?.trim() || linkText.substring(0, 50);
        }

        if (authorParagraphs.length >= 2) {
          authorHeadline = authorParagraphs[1]?.textContent?.trim() || '';
        }
        if (authorParagraphs.length >= 3) {
          timestamp = authorParagraphs[2]?.textContent?.replace(/•.*$/, '').trim() || '';
        }

        debug.push(`  authorName: "${authorName.substring(0, 30)}"`);
        if (!authorName || authorName.length < 2) {
          debug.push(`  SKIPPED: no author name`);
          continue;
        }

        // Get post text content - find paragraphs that are NOT part of author info
        const allParagraphs = el.querySelectorAll('p');
        debug.push(`  total paragraphs: ${allParagraphs.length}`);
        let text = '';
        for (const p of allParagraphs) {
          const pText = p.textContent?.trim() || '';
          // Skip: short text, author name/headline, action buttons, timestamps
          const isAuthorRelated = pText === authorName ||
                                  pText === authorHeadline ||
                                  pText.startsWith(authorName.substring(0, 10)) ||
                                  pText.includes('Follow') ||
                                  pText.includes('reaction') ||
                                  pText.includes('comment') ||
                                  pText.includes('repost') ||
                                  pText.includes('• 1st') ||
                                  pText.includes('• 2nd') ||
                                  pText.includes('• 3rd') ||
                                  pText.match(/^\d+(mo|yr|wk|d|h)/) ||  // timestamps
                                  pText.includes('followers');
          if (pText.length > 40 && !isAuthorRelated) {
            text = pText;
            debug.push(`  found text: "${pText.substring(0, 50)}..."`);
            break;
          }
        }
        text = text.replace(/…?see more|\.\.\.see more/gi, '').trim();

        // Get article link if present (for LinkedIn articles/pulse posts)
        const articleLink = el.querySelector('a[href*="/pulse/"]') as HTMLAnchorElement;
        const articleUrl = articleLink?.href || '';

        // Article title is usually in a paragraph within the article link
        let articleTitle = '';
        if (articleLink) {
          const articleParagraphs = articleLink.querySelectorAll('p');
          for (const p of articleParagraphs) {
            const pText = p.textContent?.trim() || '';
            if (pText.length > 20 && !pText.includes('Subscribe')) {
              articleTitle = pText;
              break;
            }
          }
        }

        // Skip if no content
        debug.push(`  text length: ${text.length}, articleTitle: "${articleTitle?.substring(0, 30) || 'none'}"`);
        if (!text && !articleTitle) {
          debug.push(`  SKIPPED: no text or article title`);
          continue;
        }
        debug.push(`  ADDING POST for ${authorName}`);

        // Get any activity link for post URL
        const activityLinks = el.querySelectorAll('a[href*="activity"], a[href*="/pulse/"]');
        let postUrl = '';
        for (const link of activityLinks) {
          const href = (link as HTMLAnchorElement).href;
          if (href) {
            postUrl = href;
            break;
          }
        }

        // Generate ID from URL
        const activityMatch = postUrl.match(/activity[:\-]?(\d+)/) || postUrl.match(/pulse\/([^\/\?]+)/);
        const id = activityMatch ? activityMatch[1] : Math.random().toString(36).substring(7);

        if (seen.has(id)) continue;
        seen.add(id);

        // Get engagement counts from buttons/spans with text like "16 reactions" or "5 comments"
        let likes = 0;
        let comments = 0;

        // Look for reaction/like counts
        const engagementElements = el.querySelectorAll('button, span');
        for (const elem of engagementElements) {
          const elemText = elem.textContent?.trim().toLowerCase() || '';
          // Match patterns like "16 reactions", "16", or aria-label containing reaction count
          if (elemText.includes('reaction') || elem.getAttribute('aria-label')?.includes('reaction')) {
            const match = elemText.match(/(\d+)/);
            if (match) likes = parseInt(match[1]) || 0;
          } else if ((elemText.includes('comment') && !elemText.includes('Comment')) ||
                     elem.getAttribute('aria-label')?.includes('comment')) {
            const match = elemText.match(/(\d+)/);
            if (match && !elemText.startsWith('comment')) {
              comments = parseInt(match[1]) || 0;
            }
          }
        }
        debug.push(`  engagement: ${likes} likes, ${comments} comments`);

        posts.push({
          id,
          text: articleTitle || text.substring(0, 1500),
          authorName,
          authorHeadline,
          authorUrl,
          postUrl: postUrl || articleUrl,
          articleUrl,
          articleTitle,
          likes,
          comments,
          timestamp
        });
      }

      return { posts, debug };
    });

    // Debug output (uncomment if needed):
    // console.log(`    Debug: ${results.debug.slice(0, 30).join('\n      ')}`);
    posts.push(...results.posts);
    console.log(`    Found ${posts.length} posts`);

  } catch (error) {
    console.error(`  Error searching "${keyword}":`, error instanceof Error ? error.message : error);
  } finally {
    await page.close();
  }

  return posts;
}

async function runSearch(config: SearchConfig): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  console.log(`\n=== ${config.name} ===`);

  for (const keyword of config.keywords) {
    const posts = await searchPosts(keyword);

    results.push({
      search: config.name,
      keyword,
      timestamp: new Date().toISOString(),
      posts
    });

    // Be nice - wait between requests
    await sleep(REQUEST_DELAY_MS);
  }

  return results;
}

async function main() {
  console.log('LinkedIn Content Scraper (Playwright)');
  console.log('=====================================\n');

  // Create output directory
  const outputDir = path.join(process.cwd(), 'output');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const allResults: SearchResult[] = [];

  // Determine which searches to run
  const searchArg = process.argv[2];
  let searchesToRun = SEARCHES;

  if (searchArg && searchArg !== 'all') {
    const filtered = SEARCHES.filter(s => s.name === searchArg || s.name.startsWith(searchArg));
    if (filtered.length > 0) {
      searchesToRun = filtered;
    } else {
      console.log(`Available searches: ${SEARCHES.map(s => s.name).join(', ')}`);
      console.log(`Usage: npm run scrape [search-name|all]`);
      process.exit(1);
    }
  }

  console.log(`Running ${searchesToRun.length} search(es)...`);
  console.log(`Delay between requests: ${REQUEST_DELAY_MS}ms`);

  try {
    await initBrowser();

    for (const search of searchesToRun) {
      const results = await runSearch(search);
      allResults.push(...results);

      // Save individual search results
      const searchFile = path.join(outputDir, `${timestamp}_${search.name}.json`);
      writeFileSync(searchFile, JSON.stringify(results, null, 2));
      console.log(`  Saved: ${search.name}.json`);

      // Wait between search categories
      await sleep(REQUEST_DELAY_MS);
    }

    // Save combined results
    const combinedFile = path.join(outputDir, `${timestamp}_all-results.json`);
    writeFileSync(combinedFile, JSON.stringify(allResults, null, 2));

    // Generate summary
    const totalPosts = allResults.reduce((sum, r) => sum + r.posts.length, 0);
    const bySearch = allResults.reduce((acc, r) => {
      if (!acc[r.search]) acc[r.search] = 0;
      acc[r.search] += r.posts.length;
      return acc;
    }, {} as Record<string, number>);

    const summaryFile = path.join(outputDir, `${timestamp}_summary.json`);
    writeFileSync(summaryFile, JSON.stringify({
      timestamp,
      totalSearches: allResults.length,
      totalPosts,
      bySearch
    }, null, 2));

    console.log('\n=====================================');
    console.log('Summary:');
    console.log(`  Total posts found: ${totalPosts}`);
    for (const [name, count] of Object.entries(bySearch)) {
      console.log(`    - ${name}: ${count}`);
    }
    console.log(`\nOutput: ${outputDir}`);

  } finally {
    await closeBrowser();
  }
}

main().catch(console.error);
