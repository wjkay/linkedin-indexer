export interface Content {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  fullText?: string;
  authorId: string;
  contentType: 'article' | 'post';
  publishedAt: string;
  fetchedAt: string;
  likes?: number;
  comments?: number;
}

export interface ContentWithTopics extends Content {
  topics: ContentTopic[];
  author?: Author;
}

export interface ContentTopic {
  contentId: string;
  topic: string;
  region: string;
  subregion?: string;
}

export interface Author {
  id: string;
  name: string;
  headline?: string;
  profileUrl: string;
  avatarUrl?: string;
  fetchedAt: string;
}

export interface FetchLog {
  id: number;
  topic: string;
  region: string;
  fetchedAt: string;
  itemsFound: number;
  status: 'success' | 'error' | 'rate_limited';
  errorMessage?: string;
}

export interface TopicConfig {
  regions: {
    [key: string]: {
      name: string;
      subregions: string[] | null;
      topics: string[];
    };
  };
}

export interface ContentQuery {
  topic?: string;
  region?: string;
  subregion?: string;
  type?: 'article' | 'post' | 'all';
  limit?: number;
  offset?: number;
  since?: string;
  authorId?: string;
}

export interface SearchResult {
  url: string;
  title: string;
  excerpt: string;
  authorName: string;
  authorProfileUrl: string;
  publishedDate?: string;
  contentType: 'article' | 'post';
}
