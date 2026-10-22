// Pure parsers for the Boonnovels public JSON API
// (https://reader.boondollars.com/api/public/*).
//
// No fetching here: every function takes a response body string and
// returns structured data. A missing or mistyped field the parser relies
// on throws a clear error, so an error payload never becomes an empty
// novel or an empty chapter list.

export type BookSummary = {
  id: number;
  title: string;
  author: string;
  coverUrl: string | undefined;
  status: string;
  tags: string[];
  recentViews: number;
  lastChapterDate: string;
};

export type BookDetail = {
  id: number;
  title: string;
  author: string;
  description: string;
  coverUrl: string | undefined;
  status: string;
  tags: string[];
};

export type ChapterRef = {
  number: number;
  title: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseJson(text: string, what: string): unknown {
  const trimmed = text.replace(/^\s+/, '');
  if (trimmed.charAt(0) !== '{' && trimmed.charAt(0) !== '[') {
    throw new Error(
      'Unexpected response from Boonnovels for ' +
        what +
        ' (not JSON — the site may be showing a challenge page, try opening it in WebView)',
    );
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Could not read Boonnovels response for ' + what);
  }
}

function asNumber(v: unknown, what: string): number {
  if (typeof v !== 'number' || isNaN(v) || !isFinite(v)) {
    throw new Error('Boonnovels response is missing a valid ' + what);
  }
  return v;
}

function asString(v: unknown, what: string): string {
  if (typeof v !== 'string') {
    throw new Error('Boonnovels response is missing a valid ' + what);
  }
  return v;
}

function asStringArray(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) {
    throw new Error('Boonnovels response is missing a valid ' + what);
  }
  const out: string[] = [];
  for (let i = 0; i < v.length; i++) {
    if (typeof v[i] === 'string') out.push(v[i]);
  }
  return out;
}

// Prefer the medium cover (the grid shows covers at about that size),
// then the full cover, then the thumbnail. All three are null for a
// few books, in which case there is no cover to return.
function pickCover(rec: Record<string, unknown>): string | undefined {
  const medium = rec['cover_medium_url'];
  if (typeof medium === 'string' && medium) return medium;
  const full = rec['cover_url'];
  if (typeof full === 'string' && full) return full;
  const thumb = rec['cover_thumb_url'];
  if (typeof thumb === 'string' && thumb) return thumb;
  return undefined;
}

function parseBookSummary(rec: unknown): BookSummary {
  if (!isRecord(rec)) {
    throw new Error('Boonnovels book entry is not an object');
  }
  const recentViews =
    typeof rec['recent_views'] === 'number' ? rec['recent_views'] : 0;
  const lastChapterDate =
    typeof rec['last_chapter_date'] === 'string'
      ? rec['last_chapter_date']
      : '';
  return {
    id: asNumber(rec['id'], 'book id'),
    title: asString(rec['title'], 'book title'),
    author:
      typeof rec['author'] === 'string' ? rec['author'] : '',
    coverUrl: pickCover(rec),
    status: asString(rec['status'], 'book status'),
    tags: asStringArray(rec['tags'], 'book tags'),
    recentViews: recentViews,
    lastChapterDate: lastChapterDate,
  };
}

export function parseBooksList(text: string): BookSummary[] {
  const data = parseJson(text, 'book list');
  if (!isRecord(data) || !Array.isArray(data['books'])) {
    throw new Error('Boonnovels book list is missing its books array');
  }
  const books: BookSummary[] = [];
  for (let i = 0; i < data['books'].length; i++) {
    books.push(parseBookSummary(data['books'][i]));
  }
  return books;
}

export function parseBookDetail(text: string): BookDetail {
  const data = parseJson(text, 'book detail');
  if (!isRecord(data)) {
    throw new Error('Boonnovels book detail is not an object');
  }
  return {
    id: asNumber(data['id'], 'book id'),
    title: asString(data['title'], 'book title'),
    author: typeof data['author'] === 'string' ? data['author'] : '',
    description:
      typeof data['description'] === 'string' ? data['description'] : '',
    coverUrl: pickCover(data),
    status: asString(data['status'], 'book status'),
    tags: asStringArray(data['tags'], 'book tags'),
  };
}

export function parseChaptersList(text: string): ChapterRef[] {
  const data = parseJson(text, 'chapter list');
  if (!isRecord(data) || !Array.isArray(data['chapters'])) {
    throw new Error('Boonnovels chapter list is missing its chapters array');
  }
  const chapters: ChapterRef[] = [];
  for (let i = 0; i < data['chapters'].length; i++) {
    const item = data['chapters'][i];
    if (!isRecord(item)) {
      throw new Error('Boonnovels chapter entry is not an object');
    }
    // The number is load-bearing (dedupe, ordering, chapter paths),
    // so a bad one throws. A missing title only falls back to the
    // plain "Chapter N" name.
    chapters.push({
      number: asNumber(item['chapter'], 'chapter number'),
      title: typeof item['title'] === 'string' ? item['title'] : '',
    });
  }
  return chapters;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Chapter bodies arrive as an array of paragraphs (empty strings mark
// paragraph breaks). Empty paragraphs are skipped; if nothing readable
// remains, the chapter is a stub, not an empty chapter.
export function parseChapter(text: string): string {
  const data = parseJson(text, 'chapter');
  if (!isRecord(data) || !Array.isArray(data['content'])) {
    throw new Error('Boonnovels chapter is missing its content array');
  }
  const parts: string[] = [];
  for (let i = 0; i < data['content'].length; i++) {
    const para = data['content'][i];
    if (typeof para !== 'string') {
      throw new Error('Boonnovels chapter paragraph is not a string');
    }
    if (para.replace(/^\s+|\s+$/g, '') !== '') {
      parts.push('<p>' + escapeHtml(para) + '</p>');
    }
  }
  if (parts.length === 0) {
    throw new Error('Boonnovels chapter has no readable content');
  }
  return parts.join('');
}

// Site statuses: ongoing, ongoing-trial, completed, dropped, hiatus.
// Anything else maps to Unknown, never to a guessed status.
export function mapStatus(siteStatus: string): string {
  if (siteStatus === 'ongoing' || siteStatus === 'ongoing-trial') {
    return 'Ongoing';
  }
  if (siteStatus === 'completed') return 'Completed';
  if (siteStatus === 'dropped') return 'Cancelled';
  if (siteStatus === 'hiatus') return 'On Hiatus';
  return 'Unknown';
}

// The catalog endpoint returns the whole catalog (105 books) in one
// call and ignores paging parameters, so popular/latest are sorts
// over that list and every page past 1 is empty.
export function sortPopular(books: BookSummary[]): BookSummary[] {
  const sorted = books.slice();
  sorted.sort((a, b) => b.recentViews - a.recentViews);
  return sorted;
}

export function sortLatest(books: BookSummary[]): BookSummary[] {
  const sorted = books.slice();
  sorted.sort((a, b) => {
    const da = Date.parse(a.lastChapterDate);
    const db = Date.parse(b.lastChapterDate);
    const ta = isNaN(da) ? 0 : da;
    const tb = isNaN(db) ? 0 : db;
    return tb - ta;
  });
  return sorted;
}

export function searchBooks(
  books: BookSummary[],
  term: string,
): BookSummary[] {
  const needle = term.replace(/^\s+|\s+$/g, '').toLowerCase();
  if (needle === '') return [];
  const out: BookSummary[] = [];
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    if (
      b.title.toLowerCase().indexOf(needle) !== -1 ||
      b.author.toLowerCase().indexOf(needle) !== -1
    ) {
      out.push(b);
    }
  }
  return out;
}

// Paths are virtual (the site's reader URLs are /read/<id>/<chapter>,
// but the plugin's own paths keep the book id and chapter number
// unambiguous): novel /book/<id>, chapter /book/<id>/chapter/<n>.
export function buildNovelPath(bookId: number): string {
  return '/book/' + bookId;
}

export function buildChapterPath(bookId: number, chapter: number): string {
  return '/book/' + bookId + '/chapter/' + chapter;
}

function stripQuery(path: string): string {
  const q = path.indexOf('?');
  return q === -1 ? path : path.slice(0, q);
}

function parseIdSegment(seg: string, what: string): number {
  if (!/^\d+$/.test(seg)) {
    throw new Error('Invalid Boonnovels ' + what + ' in path');
  }
  const n = parseInt(seg, 10);
  if (isNaN(n) || !isFinite(n)) {
    throw new Error('Invalid Boonnovels ' + what + ' in path');
  }
  return n;
}

export function parseNovelPath(novelPath: string): number {
  const parts = stripQuery(novelPath).split('/');
  if (parts.length !== 3 || parts[1] !== 'book') {
    throw new Error('Invalid Boonnovels novel path: ' + novelPath);
  }
  return parseIdSegment(parts[2], 'book id');
}

export function parseChapterPath(chapterPath: string): {
  bookId: number;
  chapter: number;
} {
  const parts = stripQuery(chapterPath).split('/');
  if (
    parts.length !== 5 ||
    parts[1] !== 'book' ||
    parts[3] !== 'chapter'
  ) {
    throw new Error('Invalid Boonnovels chapter path: ' + chapterPath);
  }
  return {
    bookId: parseIdSegment(parts[2], 'book id'),
    chapter: parseIdSegment(parts[4], 'chapter number'),
  };
}

export function chapterName(ref: ChapterRef): string {
  if (ref.title !== '') return 'Chapter ' + ref.number + ': ' + ref.title;
  return 'Chapter ' + ref.number;
}

export type ChapterItem = {
  name: string;
  path: string;
  chapterNumber: number;
};

// Build the reader's chapter list from the API refs: dedupe by chapter
// number (keep the first), oldest first. The plugin maps these straight
// into the novel's chapters.
export function buildChapters(
  refs: ChapterRef[],
  bookId: number,
): ChapterItem[] {
  const sorted = refs.slice();
  sorted.sort((a, b) => a.number - b.number);
  const seen: Record<number, boolean> = {};
  const chapters: ChapterItem[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const ref = sorted[i];
    if (seen[ref.number]) continue;
    seen[ref.number] = true;
    chapters.push({
      name: chapterName(ref),
      path: buildChapterPath(bookId, ref.number),
      chapterNumber: ref.number,
    });
  }
  return chapters;
}
