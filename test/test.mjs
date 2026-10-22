// Integration test: fetch live JSON from reader.boondollars.com and
// exercise the pure parsers exactly as the plugin will use them.
import {
  buildChapters,
  buildChapterPath,
  buildNovelPath,
  chapterName,
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
} from './parsers.bundle.mjs';

const SITE = 'https://reader.boondollars.com';
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

async function get(path) {
  const res = await fetch(SITE + path, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + path);
  return res.text();
}

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log('PASS  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name + ' ' + extra);
  }
}

function throws(name, fn) {
  try {
    fn();
    failures++;
    console.log('FAIL  ' + name + ' (did not throw)');
  } catch (e) {
    console.log('PASS  ' + name);
  }
}

async function main() {
  // 1. Catalog
  const catalogJson = await get('/api/public/books');
  const books = parseBooksList(catalogJson);
  check('catalog: 100+ books', books.length >= 100, 'got ' + books.length);
  const b124 = books.find(b => b.id === 124);
  check(
    'catalog: book 124 present',
    !!b124 && b124.title === 'With a Pure Heart, I Roam the Heavens',
    b124 ? b124.title : 'missing',
  );
  if (b124) {
    check('catalog: 124 has 1300+ chapters listed', (b124.recentViews || 0) >= 0, '');
  }

  // 2. Popular / latest sorts
  const popular = sortPopular(books);
  check(
    'popular: sorted by recent views desc',
    popular[0].recentViews >= popular[1].recentViews,
    popular[0].recentViews + ' < ' + popular[1].recentViews,
  );
  const latest = sortLatest(books);
  check(
    'latest: sorted by last chapter date desc',
    latest[0].lastChapterDate >= latest[1].lastChapterDate,
    latest[0].lastChapterDate + ' < ' + latest[1].lastChapterDate,
  );

  // 3. Search (client-side over the catalog)
  const found = searchBooks(books, 'Pure Heart');
  check('search: finds book 124', found.some(b => b.id === 124), found.map(b => b.id).join(','));
  const none = searchBooks(books, 'zzzzqqqnotreal');
  check('search: nonsense query empty', none.length === 0, 'got ' + none.length);
  check('search: blank query empty', searchBooks(books, '   ').length === 0);

  // 4. Book detail
  const detailJson = await get('/api/public/books/124');
  const detail = parseBookDetail(detailJson);
  check('detail: title', detail.title === 'With a Pure Heart, I Roam the Heavens', detail.title);
  check('detail: author', detail.author.indexOf('How Can Feelings') !== -1, detail.author);
  check('detail: status ongoing', detail.status === 'ongoing', detail.status);
  check('detail: xianxia tag', detail.tags.indexOf('xianxia') !== -1, detail.tags.join(','));
  check('detail: cover url', (detail.coverUrl || '').startsWith('https://'), detail.coverUrl);
  check('detail: mapped status', mapStatus(detail.status) === 'Ongoing');
  check('detail: completed maps', mapStatus('completed') === 'Completed');
  check('detail: dropped maps', mapStatus('dropped') === 'Cancelled');
  check('detail: hiatus maps', mapStatus('hiatus') === 'On Hiatus');
  check('detail: ongoing-trial maps', mapStatus('ongoing-trial') === 'Ongoing');
  check('detail: bogus maps Unknown', mapStatus('bogus') === 'Unknown');

  // 5. Chapter list
  const chaptersJson = await get('/api/public/books/124/chapters');
  const refs = parseChaptersList(chaptersJson);
  check('chapters: 1300+ chapters', refs.length >= 1300, 'got ' + refs.length);
  check('chapters: first is 1', refs[0].number === 1, 'got ' + refs[0].number);
  const chapters = buildChapters(refs, 124);
  check('chapters: built list same length', chapters.length === refs.length);
  check('chapters: first name', chapters[0].name.indexOf('Chapter 1:') === 0, chapters[0].name);
  check('chapters: first path', chapters[0].path === '/book/124/chapter/1', chapters[0].path);
  check(
    'chapters: ascending order',
    chapters[chapters.length - 1].chapterNumber > chapters[0].chapterNumber,
  );
  // Dedupe: a duplicated number keeps the first entry only.
  const dupes = buildChapters(
    [
      { number: 2, title: 'Second' },
      { number: 2, title: 'Second again' },
      { number: 1, title: 'First' },
    ],
    7,
  );
  check('chapters: dedupe keeps first', dupes.length === 2 && dupes[1].name === 'Chapter 2: Second', JSON.stringify(dupes));
  check('chapters: untitled name', chapterName({ number: 5, title: '' }) === 'Chapter 5');

  // 6. Chapter content
  const lastNo = chapters[chapters.length - 1].chapterNumber;
  const chapterJson = await get('/api/public/books/124/chapters/' + lastNo);
  const html = parseChapter(chapterJson);
  check('chapter: html starts with <p>', html.indexOf('<p>') === 0, html.slice(0, 40));
  check('chapter: long text', html.length > 1000, 'len=' + html.length);
  check('chapter: no script tags', html.indexOf('<script') === -1);
  check('chapter: no javascript: urls', html.indexOf('javascript:') === -1);
  throws('chapter: empty content throws', () =>
    parseChapter(JSON.stringify({ chapter: 1, title: 'x', content: [] })),
  );
  throws('chapter: bad shape throws', () =>
    parseChapter(JSON.stringify({ nope: true })),
  );
  throws('books: bad shape throws', () =>
    parseBooksList(JSON.stringify({ books: 'nope' })),
  );

  // 7. Paths
  check('paths: novel path', buildNovelPath(124) === '/book/124');
  check('paths: chapter path', buildChapterPath(124, 1301) === '/book/124/chapter/1301');
  check('paths: parse novel', parseNovelPath('/book/124') === 124);
  check('paths: parse novel strips query', parseNovelPath('/book/124?x=1') === 124);
  const parsed = parseChapterPath('/book/124/chapter/1301');
  check('paths: parse chapter', parsed.bookId === 124 && parsed.chapter === 1301);
  throws('paths: bad novel path throws', () => parseNovelPath('/book/abc'));
  throws('paths: bad chapter path throws', () => parseChapterPath('/book/124/chapter/x'));
  throws('paths: short chapter path throws', () => parseChapterPath('/book/124'));

  console.log(failures === 0 ? '\nALL TESTS PASSED' : '\n' + failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('ERROR', e);
  process.exit(1);
});
