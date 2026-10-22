// BoonNovel plugin for LNReader.
// Site: reader.boondollars.com ("Boonnovels") — a self-hosted reader
// with a clean public JSON API, no login needed:
//   GET /api/public/books                     full catalog (105 books)
//   GET /api/public/books/<id>                book detail
//   GET /api/public/books/<id>/chapters       chapter list
//   GET /api/public/books/<id>/chapters/<n>   chapter paragraphs
// The catalog call returns everything and ignores paging parameters,
// so popular/latest/search all work off that one list.
import type { Plugin } from './lnreader-api';
import {
  buildChapters,
  buildNovelPath,
  mapStatus,
  parseBookDetail,
  parseBooksList,
  parseChapter,
  parseChapterPath,
  parseChaptersList,
  parseNovelPath,
  searchBooks,
  sortLatest,
  sortPopular,
} from './parsers';

declare function require(name: string): any;

function loadFetchLib(): {
  fetchText?: (url: string) => Promise<string>;
  fetchApi?: (url: string) => Promise<{
    status?: number;
    headers?: { get(name: string): string | null };
    text: () => Promise<string>;
  }>;
} {
  try {
    return require('@libs/fetch') || {};
  } catch (e) {
    return {};
  }
}

function loadNovelStatus(): Record<string, string> {
  try {
    const lib = require('@libs/novelStatus');
    if (lib && lib.NovelStatus) return lib.NovelStatus;
  } catch (e) {
    // fall through to the built-in copy below
  }
  return {
    Unknown: 'Unknown',
    Ongoing: 'Ongoing',
    Completed: 'Completed',
    Licensed: 'Licensed',
    PublishingFinished: 'Publishing Finished',
    Cancelled: 'Cancelled',
    OnHiatus: 'On Hiatus',
  };
}

const fetchLib = loadFetchLib();
const NovelStatus = loadNovelStatus();

// --- Resilient fetching -------------------------------------------------
// Same shape as the skeleton's wrapper, plus two rules this API needs:
// every HTTP error status throws with .status attached (the live-check
// harness reads error.status, not the message text), and definite 4xx
// errors are never retried. A 200 body that is not JSON (a challenge
// page) throws a readable error instead of a SyntaxError.
const FETCH_TIMEOUT_MS = 30000;
const MAX_FETCH_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => {
    if (typeof setTimeout === 'function') setTimeout(resolve, ms);
    else resolve();
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: any = undefined;
  const timeout = new Promise<T>((_, reject) => {
    if (typeof setTimeout === 'function') {
      timer = setTimeout(() => reject(new Error('Request timed out')), ms);
    }
  });
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
  };
  return Promise.race([p, timeout]).then(
    v => {
      clear();
      return v;
    },
    e => {
      clear();
      throw e;
    },
  );
}

function httpError(message: string, status: number): Error {
  const err = new Error(message);
  (err as any).status = status;
  return err;
}

async function fetchJson(url: string): Promise<string> {
  let lastError: any = new Error('Request failed');
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    let status: number | undefined;
    let retryAfterSecs: number | undefined;
    try {
      let text: string;
      if (typeof fetchLib.fetchApi === 'function') {
        const res: any = await withTimeout(
          fetchLib.fetchApi(url),
          FETCH_TIMEOUT_MS,
        );
        status =
          res && typeof res.status === 'number' ? res.status : undefined;
        if (
          res &&
          res.headers &&
          typeof res.headers.get === 'function'
        ) {
          const secs = parseInt(
            String(res.headers.get('Retry-After')),
            10,
          );
          if (!isNaN(secs) && secs >= 0) {
            retryAfterSecs = Math.min(secs, 10);
          }
        }
        text =
          res && typeof res.text === 'function' ? await res.text() : '';
      } else if (typeof fetchLib.fetchText === 'function') {
        text = await withTimeout(fetchLib.fetchText(url), FETCH_TIMEOUT_MS);
      } else {
        throw new Error('No fetch implementation provided by the host app');
      }
      if (status !== undefined && status >= 400) {
        throw httpError(
          'Boonnovels responded with HTTP ' + status + ' for ' + url,
          status,
        );
      }
      return text;
    } catch (e) {
      lastError = e;
      if (
        status !== undefined &&
        (lastError as any).status === undefined
      ) {
        (lastError as any).status = status;
      }
      const msg = String((e && (e as Error).message) || e || '');
      const retryable =
        status === undefined ||
        status === 429 ||
        status >= 500 ||
        /timed out|timeout|Network|network|fetch failed/i.test(msg);
      if (!retryable || attempt === MAX_FETCH_ATTEMPTS) {
        throw lastError;
      }
      const waitSecs =
        status === 429 && retryAfterSecs !== undefined
          ? retryAfterSecs
          : Math.pow(2, attempt - 1);
      await sleep(1000 * waitSecs);
    }
  }
  throw lastError;
}

// --- Plugin -------------------------------------------------------------
// NOTE: implement Plugin.PluginBase, never bare `Plugin` — the DOM lib
// declares a global `Plugin` interface and the bare name binds to it,
// failing the build's type-check (TS2420).

class BoonNovel implements Plugin.PluginBase {
  id = 'boonnovel';
  name = 'BoonNovel';
  icon = 'src/en/boonnovel/icon.png';
  site = 'https://reader.boondollars.com';
  version = '1.0.0';

  async popularNovels(
    pageNo: number,
    options?: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];
    const text = await fetchJson(this.site + '/api/public/books');
    const books = parseBooksList(text);
    const sorted =
      options && options.showLatestNovels
        ? sortLatest(books)
        : sortPopular(books);
    return sorted.map(b => {
      const item: Plugin.NovelItem = {
        name: b.title,
        path: buildNovelPath(b.id),
      };
      if (b.coverUrl !== undefined) item.cover = b.coverUrl;
      return item;
    });
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const bookId = parseNovelPath(novelPath);
    const detailText = await fetchJson(
      this.site + '/api/public/books/' + bookId,
    );
    const chaptersText = await fetchJson(
      this.site + '/api/public/books/' + bookId + '/chapters',
    );
    const detail = parseBookDetail(detailText);
    const refs = parseChaptersList(chaptersText);
    const chapters: Plugin.ChapterItem[] = buildChapters(refs, bookId);
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: detail.title,
      author: detail.author,
      summary: detail.description,
      status: NovelStatus[mapStatus(detail.status)] || NovelStatus.Unknown,
      genres: detail.tags.join(', '),
      chapters: chapters,
    };
    if (detail.coverUrl !== undefined) novel.cover = detail.coverUrl;
    return novel;
  }

  // The app opens a novel already saved in its database but with no
  // stored chapters through parsePage, not parseNovel — and it throws
  // when the plugin has none. This plugin has no server-side chapter
  // paging (the app pages the full list itself), so every page is the
  // whole list.
  async parsePage(
    novelPath: string,
    page: string,
  ): Promise<{ chapters: Plugin.ChapterItem[] }> {
    void page;
    const novel = await this.parseNovel(novelPath);
    return { chapters: novel.chapters || [] };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const parsed = parseChapterPath(chapterPath);
    const text = await fetchJson(
      this.site +
        '/api/public/books/' +
        parsed.bookId +
        '/chapters/' +
        parsed.chapter,
    );
    return parseChapter(text);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];
    const text = await fetchJson(this.site + '/api/public/books');
    const books = parseBooksList(text);
    const found = searchBooks(books, searchTerm);
    return found.map(b => {
      const item: Plugin.NovelItem = {
        name: b.title,
        path: buildNovelPath(b.id),
      };
      if (b.coverUrl !== undefined) item.cover = b.coverUrl;
      return item;
    });
  }

  // resolveUrl MUST pass absolute URLs through unchanged: the app
  // also passes the novel's cover URL through here (EPUB export does
  // this), and prefixing the site onto an absolute cover breaks it.
  // Protocol-relative URLs get https:. Everything else is a site path.
  resolveUrl = (path: string, _isNovel?: boolean) => {
    if (/^https?:\/\//i.test(path)) return path;
    if (path.indexOf('//') === 0) return 'https:' + path;
    return this.site + path;
  };
}

export default new BoonNovel();
