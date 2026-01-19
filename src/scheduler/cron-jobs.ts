import cron from 'node-cron';
import { readFileSync } from 'fs';
import { searchLinkedIn, fetchContentDetails, initBrowser, closeBrowser } from '../fetcher/linkedin-scraper.js';
import { canFetch, logFetch, getRemainingRequests } from '../fetcher/rate-limiter.js';
import { insertContent } from '../storage/repositories/content.js';
import { insertAuthor, generateAuthorId, getAuthorByProfileUrl } from '../storage/repositories/authors.js';
import type { TopicConfig } from '../types/index.js';

let isRunning = false;

export function startScheduler(): void {
  const intervalHours = parseInt(process.env.FETCH_INTERVAL_HOURS || '6', 10);

  // Run every N hours
  cron.schedule(`0 */${intervalHours} * * *`, async () => {
    await runFetchCycle();
  });

  console.log(`Scheduler started: fetching every ${intervalHours} hours`);
}

export async function runFetchCycle(): Promise<void> {
  if (isRunning) {
    console.log('Fetch cycle already running, skipping...');
    return;
  }

  isRunning = true;
  console.log('Starting fetch cycle...');

  try {
    await initBrowser();

    const config = loadTopicsConfig();
    const tasks = buildFetchTasks(config);

    for (const task of tasks) {
      if (!canFetch()) {
        console.log('Rate limit reached, stopping fetch cycle');
        break;
      }

      console.log(`Fetching: ${task.topic} / ${task.region}${task.subregion ? ` / ${task.subregion}` : ''}`);

      try {
        const results = await searchLinkedIn(task.topic, task.region, task.subregion);

        for (const result of results) {
          await processSearchResult(result, task.topic, task.region, task.subregion);
        }

        logFetch(task.topic, task.region, results.length, 'success');
        console.log(`  Found ${results.length} results`);

        // Delay between requests
        await sleep(5000 + Math.random() * 5000);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logFetch(task.topic, task.region, 0, 'error', errorMsg);
        console.error(`  Error: ${errorMsg}`);
      }
    }

  } finally {
    await closeBrowser();
    isRunning = false;
    console.log(`Fetch cycle complete. Remaining requests today: ${getRemainingRequests()}`);
  }
}

async function processSearchResult(
  result: Awaited<ReturnType<typeof searchLinkedIn>>[number],
  topic: string,
  region: string,
  subregion?: string
): Promise<void> {
  try {
    // Fetch additional details
    const details = await fetchContentDetails(result.url);
    if (details) {
      Object.assign(result, details);
    }

    // Handle author
    let authorId: string | undefined;
    if (result.authorProfileUrl) {
      authorId = generateAuthorId(result.authorProfileUrl);
      const existingAuthor = getAuthorByProfileUrl(result.authorProfileUrl);

      if (!existingAuthor) {
        insertAuthor({
          id: authorId,
          name: result.authorName || 'Unknown',
          profileUrl: result.authorProfileUrl,
          fetchedAt: new Date().toISOString()
        });
      }
    }

    // Insert content
    insertContent(
      {
        url: result.url,
        title: result.title,
        excerpt: result.excerpt,
        authorId: authorId || '',
        contentType: result.contentType,
        publishedAt: new Date().toISOString(), // Would need to extract from page
        fetchedAt: new Date().toISOString()
      },
      [{ topic, region, subregion }]
    );

  } catch (error) {
    console.error(`  Error processing ${result.url}:`, error);
  }
}

function loadTopicsConfig(): TopicConfig {
  const configPath = process.env.TOPICS_CONFIG_PATH || './config/topics.json';
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

interface FetchTask {
  topic: string;
  region: string;
  subregion?: string;
}

function buildFetchTasks(config: TopicConfig): FetchTask[] {
  const tasks: FetchTask[] = [];

  for (const [regionKey, regionConfig] of Object.entries(config.regions)) {
    for (const topic of regionConfig.topics) {
      if (regionConfig.subregions) {
        // Add task for each subregion
        for (const subregion of regionConfig.subregions) {
          tasks.push({ topic, region: regionKey, subregion });
        }
      } else {
        tasks.push({ topic, region: regionKey });
      }
    }
  }

  // Shuffle tasks to distribute load
  return shuffleArray(tasks);
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
