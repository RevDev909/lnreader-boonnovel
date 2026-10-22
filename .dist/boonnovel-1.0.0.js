"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = function(cb, mod) {
  return function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
};

// .tsc-build/parsers.js
var require_parsers = __commonJS({
  ".tsc-build/parsers.js": function(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseBooksList = parseBooksList;
    exports2.parseBookDetail = parseBookDetail;
    exports2.parseChaptersList = parseChaptersList;
    exports2.parseChapter = parseChapter;
    exports2.mapStatus = mapStatus;
    exports2.sortPopular = sortPopular;
    exports2.sortLatest = sortLatest;
    exports2.searchBooks = searchBooks;
    exports2.buildNovelPath = buildNovelPath;
    exports2.buildChapterPath = buildChapterPath;
    exports2.parseNovelPath = parseNovelPath;
    exports2.parseChapterPath = parseChapterPath;
    exports2.chapterName = chapterName;
    exports2.buildChapters = buildChapters;
    function isRecord(v) {
      return typeof v === "object" && v !== null && !Array.isArray(v);
    }
    function parseJson(text, what) {
      var trimmed = text.replace(/^\s+/, "");
      if (trimmed.charAt(0) !== "{" && trimmed.charAt(0) !== "[") {
        throw new Error("Unexpected response from Boonnovels for " + what + " (not JSON \u2014 the site may be showing a challenge page, try opening it in WebView)");
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error("Could not read Boonnovels response for " + what);
      }
    }
    function asNumber(v, what) {
      if (typeof v !== "number" || isNaN(v) || !isFinite(v)) {
        throw new Error("Boonnovels response is missing a valid " + what);
      }
      return v;
    }
    function asString(v, what) {
      if (typeof v !== "string") {
        throw new Error("Boonnovels response is missing a valid " + what);
      }
      return v;
    }
    function asStringArray(v, what) {
      if (!Array.isArray(v)) {
        throw new Error("Boonnovels response is missing a valid " + what);
      }
      var out = [];
      for (var i = 0; i < v.length; i++) {
        if (typeof v[i] === "string")
          out.push(v[i]);
      }
      return out;
    }
    function pickCover(rec) {
      var medium = rec["cover_medium_url"];
      if (typeof medium === "string" && medium)
        return medium;
      var full = rec["cover_url"];
      if (typeof full === "string" && full)
        return full;
      var thumb = rec["cover_thumb_url"];
      if (typeof thumb === "string" && thumb)
        return thumb;
      return void 0;
    }
    function parseBookSummary(rec) {
      if (!isRecord(rec)) {
        throw new Error("Boonnovels book entry is not an object");
      }
      var recentViews = typeof rec["recent_views"] === "number" ? rec["recent_views"] : 0;
      var lastChapterDate = typeof rec["last_chapter_date"] === "string" ? rec["last_chapter_date"] : "";
      return {
        id: asNumber(rec["id"], "book id"),
        title: asString(rec["title"], "book title"),
        author: typeof rec["author"] === "string" ? rec["author"] : "",
        coverUrl: pickCover(rec),
        status: asString(rec["status"], "book status"),
        tags: asStringArray(rec["tags"], "book tags"),
        recentViews: recentViews,
        lastChapterDate: lastChapterDate
      };
    }
    function parseBooksList(text) {
      var data = parseJson(text, "book list");
      if (!isRecord(data) || !Array.isArray(data["books"])) {
        throw new Error("Boonnovels book list is missing its books array");
      }
      var books = [];
      for (var i = 0; i < data["books"].length; i++) {
        books.push(parseBookSummary(data["books"][i]));
      }
      return books;
    }
    function parseBookDetail(text) {
      var data = parseJson(text, "book detail");
      if (!isRecord(data)) {
        throw new Error("Boonnovels book detail is not an object");
      }
      return {
        id: asNumber(data["id"], "book id"),
        title: asString(data["title"], "book title"),
        author: typeof data["author"] === "string" ? data["author"] : "",
        description: typeof data["description"] === "string" ? data["description"] : "",
        coverUrl: pickCover(data),
        status: asString(data["status"], "book status"),
        tags: asStringArray(data["tags"], "book tags")
      };
    }
    function parseChaptersList(text) {
      var data = parseJson(text, "chapter list");
      if (!isRecord(data) || !Array.isArray(data["chapters"])) {
        throw new Error("Boonnovels chapter list is missing its chapters array");
      }
      var chapters = [];
      for (var i = 0; i < data["chapters"].length; i++) {
        var item = data["chapters"][i];
        if (!isRecord(item)) {
          throw new Error("Boonnovels chapter entry is not an object");
        }
        chapters.push({
          number: asNumber(item["chapter"], "chapter number"),
          title: typeof item["title"] === "string" ? item["title"] : ""
        });
      }
      return chapters;
    }
    function escapeHtml(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    function parseChapter(text) {
      var data = parseJson(text, "chapter");
      if (!isRecord(data) || !Array.isArray(data["content"])) {
        throw new Error("Boonnovels chapter is missing its content array");
      }
      var parts = [];
      for (var i = 0; i < data["content"].length; i++) {
        var para = data["content"][i];
        if (typeof para !== "string") {
          throw new Error("Boonnovels chapter paragraph is not a string");
        }
        if (para.replace(/^\s+|\s+$/g, "") !== "") {
          parts.push("<p>" + escapeHtml(para) + "</p>");
        }
      }
      if (parts.length === 0) {
        throw new Error("Boonnovels chapter has no readable content");
      }
      return parts.join("");
    }
    function mapStatus(siteStatus) {
      if (siteStatus === "ongoing" || siteStatus === "ongoing-trial") {
        return "Ongoing";
      }
      if (siteStatus === "completed")
        return "Completed";
      if (siteStatus === "dropped")
        return "Cancelled";
      if (siteStatus === "hiatus")
        return "On Hiatus";
      return "Unknown";
    }
    function sortPopular(books) {
      var sorted = books.slice();
      sorted.sort(function(a, b) {
        return b.recentViews - a.recentViews;
      });
      return sorted;
    }
    function sortLatest(books) {
      var sorted = books.slice();
      sorted.sort(function(a, b) {
        var da = Date.parse(a.lastChapterDate);
        var db = Date.parse(b.lastChapterDate);
        var ta = isNaN(da) ? 0 : da;
        var tb = isNaN(db) ? 0 : db;
        return tb - ta;
      });
      return sorted;
    }
    function searchBooks(books, term) {
      var needle = term.replace(/^\s+|\s+$/g, "").toLowerCase();
      if (needle === "")
        return [];
      var out = [];
      for (var i = 0; i < books.length; i++) {
        var b = books[i];
        if (b.title.toLowerCase().indexOf(needle) !== -1 || b.author.toLowerCase().indexOf(needle) !== -1) {
          out.push(b);
        }
      }
      return out;
    }
    function buildNovelPath(bookId) {
      return "/book/" + bookId;
    }
    function buildChapterPath(bookId, chapter) {
      return "/book/" + bookId + "/chapter/" + chapter;
    }
    function stripQuery(path) {
      var q = path.indexOf("?");
      return q === -1 ? path : path.slice(0, q);
    }
    function parseIdSegment(seg, what) {
      if (!/^\d+$/.test(seg)) {
        throw new Error("Invalid Boonnovels " + what + " in path");
      }
      var n = parseInt(seg, 10);
      if (isNaN(n) || !isFinite(n)) {
        throw new Error("Invalid Boonnovels " + what + " in path");
      }
      return n;
    }
    function parseNovelPath(novelPath) {
      var parts = stripQuery(novelPath).split("/");
      if (parts.length !== 3 || parts[1] !== "book") {
        throw new Error("Invalid Boonnovels novel path: " + novelPath);
      }
      return parseIdSegment(parts[2], "book id");
    }
    function parseChapterPath(chapterPath) {
      var parts = stripQuery(chapterPath).split("/");
      if (parts.length !== 5 || parts[1] !== "book" || parts[3] !== "chapter") {
        throw new Error("Invalid Boonnovels chapter path: " + chapterPath);
      }
      return {
        bookId: parseIdSegment(parts[2], "book id"),
        chapter: parseIdSegment(parts[4], "chapter number")
      };
    }
    function chapterName(ref) {
      if (ref.title !== "")
        return "Chapter " + ref.number + ": " + ref.title;
      return "Chapter " + ref.number;
    }
    function buildChapters(refs, bookId) {
      var sorted = refs.slice();
      sorted.sort(function(a, b) {
        return a.number - b.number;
      });
      var seen = {};
      var chapters = [];
      for (var i = 0; i < sorted.length; i++) {
        var ref = sorted[i];
        if (seen[ref.number])
          continue;
        seen[ref.number] = true;
        chapters.push({
          name: chapterName(ref),
          path: buildChapterPath(bookId, ref.number),
          chapterNumber: ref.number
        });
      }
      return chapters;
    }
  }
});

// .tsc-build/plugin.js
var __awaiter = exports && exports.__awaiter || function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator = exports && exports.__generator || function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
Object.defineProperty(exports, "__esModule", { value: true });
var parsers_1 = require_parsers();
function loadFetchLib() {
  try {
    return require("@libs/fetch") || {};
  } catch (e) {
    return {};
  }
}
function loadNovelStatus() {
  try {
    var lib = require("@libs/novelStatus");
    if (lib && lib.NovelStatus)
      return lib.NovelStatus;
  } catch (e) {
  }
  return {
    Unknown: "Unknown",
    Ongoing: "Ongoing",
    Completed: "Completed",
    Licensed: "Licensed",
    PublishingFinished: "Publishing Finished",
    Cancelled: "Cancelled",
    OnHiatus: "On Hiatus"
  };
}
var fetchLib = loadFetchLib();
var NovelStatus = loadNovelStatus();
var FETCH_TIMEOUT_MS = 3e4;
var MAX_FETCH_ATTEMPTS = 3;
function sleep(ms) {
  return new Promise(function(resolve) {
    if (typeof setTimeout === "function")
      setTimeout(resolve, ms);
    else
      resolve();
  });
}
function withTimeout(p, ms) {
  var timer = void 0;
  var timeout = new Promise(function(_, reject) {
    if (typeof setTimeout === "function") {
      timer = setTimeout(function() {
        return reject(new Error("Request timed out"));
      }, ms);
    }
  });
  var clear = function() {
    if (timer !== void 0)
      clearTimeout(timer);
  };
  return Promise.race([p, timeout]).then(function(v) {
    clear();
    return v;
  }, function(e) {
    clear();
    throw e;
  });
}
function httpError(message, status) {
  var err = new Error(message);
  err.status = status;
  return err;
}
function fetchJson(url) {
  return __awaiter(this, void 0, void 0, function() {
    var lastError, attempt, status_1, retryAfterSecs, text, res, secs, _a, e_1, msg, retryable, waitSecs;
    return __generator(this, function(_b) {
      switch (_b.label) {
        case 0:
          lastError = new Error("Request failed");
          attempt = 1;
          _b.label = 1;
        case 1:
          if (!(attempt <= MAX_FETCH_ATTEMPTS)) return [3, 14];
          status_1 = void 0;
          retryAfterSecs = void 0;
          _b.label = 2;
        case 2:
          _b.trys.push([2, 11, , 13]);
          text = void 0;
          if (!(typeof fetchLib.fetchApi === "function")) return [3, 7];
          return [4, withTimeout(fetchLib.fetchApi(url), FETCH_TIMEOUT_MS)];
        case 3:
          res = _b.sent();
          status_1 = res && typeof res.status === "number" ? res.status : void 0;
          if (res && res.headers && typeof res.headers.get === "function") {
            secs = parseInt(String(res.headers.get("Retry-After")), 10);
            if (!isNaN(secs) && secs >= 0) {
              retryAfterSecs = Math.min(secs, 10);
            }
          }
          if (!(res && typeof res.text === "function")) return [3, 5];
          return [4, res.text()];
        case 4:
          _a = _b.sent();
          return [3, 6];
        case 5:
          _a = "";
          _b.label = 6;
        case 6:
          text = _a;
          return [3, 10];
        case 7:
          if (!(typeof fetchLib.fetchText === "function")) return [3, 9];
          return [4, withTimeout(fetchLib.fetchText(url), FETCH_TIMEOUT_MS)];
        case 8:
          text = _b.sent();
          return [3, 10];
        case 9:
          throw new Error("No fetch implementation provided by the host app");
        case 10:
          if (status_1 !== void 0 && status_1 >= 400) {
            throw httpError("Boonnovels responded with HTTP " + status_1 + " for " + url, status_1);
          }
          return [2, text];
        case 11:
          e_1 = _b.sent();
          lastError = e_1;
          if (status_1 !== void 0 && lastError.status === void 0) {
            lastError.status = status_1;
          }
          msg = String(e_1 && e_1.message || e_1 || "");
          retryable = status_1 === void 0 || status_1 === 429 || status_1 >= 500 || /timed out|timeout|Network|network|fetch failed/i.test(msg);
          if (!retryable || attempt === MAX_FETCH_ATTEMPTS) {
            throw lastError;
          }
          waitSecs = status_1 === 429 && retryAfterSecs !== void 0 ? retryAfterSecs : Math.pow(2, attempt - 1);
          return [4, sleep(1e3 * waitSecs)];
        case 12:
          _b.sent();
          return [3, 13];
        case 13:
          attempt++;
          return [3, 1];
        case 14:
          throw lastError;
      }
    });
  });
}
var BoonNovel = (
  /** @class */
  (function() {
    function BoonNovel2() {
      var _this = this;
      this.id = "boonnovel";
      this.name = "BoonNovel";
      this.icon = "src/en/boonnovel/icon.png";
      this.site = "https://reader.boondollars.com";
      this.version = "1.0.0";
      this.resolveUrl = function(path, _isNovel) {
        if (/^https?:\/\//i.test(path))
          return path;
        if (path.indexOf("//") === 0)
          return "https:" + path;
        return _this.site + path;
      };
    }
    BoonNovel2.prototype.popularNovels = function(pageNo, options) {
      return __awaiter(this, void 0, void 0, function() {
        var text, books, sorted;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (pageNo !== 1)
                return [2, []];
              return [4, fetchJson(this.site + "/api/public/books")];
            case 1:
              text = _a.sent();
              books = (0, parsers_1.parseBooksList)(text);
              sorted = options && options.showLatestNovels ? (0, parsers_1.sortLatest)(books) : (0, parsers_1.sortPopular)(books);
              return [2, sorted.map(function(b) {
                var item = {
                  name: b.title,
                  path: (0, parsers_1.buildNovelPath)(b.id)
                };
                if (b.coverUrl !== void 0)
                  item.cover = b.coverUrl;
                return item;
              })];
          }
        });
      });
    };
    BoonNovel2.prototype.parseNovel = function(novelPath) {
      return __awaiter(this, void 0, void 0, function() {
        var bookId, detailText, chaptersText, detail, refs, chapters, novel;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              bookId = (0, parsers_1.parseNovelPath)(novelPath);
              return [4, fetchJson(this.site + "/api/public/books/" + bookId)];
            case 1:
              detailText = _a.sent();
              return [4, fetchJson(this.site + "/api/public/books/" + bookId + "/chapters")];
            case 2:
              chaptersText = _a.sent();
              detail = (0, parsers_1.parseBookDetail)(detailText);
              refs = (0, parsers_1.parseChaptersList)(chaptersText);
              chapters = (0, parsers_1.buildChapters)(refs, bookId);
              novel = {
                path: novelPath,
                name: detail.title,
                author: detail.author,
                summary: detail.description,
                status: NovelStatus[(0, parsers_1.mapStatus)(detail.status)] || NovelStatus.Unknown,
                genres: detail.tags.join(", "),
                chapters: chapters
              };
              if (detail.coverUrl !== void 0)
                novel.cover = detail.coverUrl;
              return [2, novel];
          }
        });
      });
    };
    BoonNovel2.prototype.parsePage = function(novelPath, page) {
      return __awaiter(this, void 0, void 0, function() {
        var novel;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              void page;
              return [4, this.parseNovel(novelPath)];
            case 1:
              novel = _a.sent();
              return [2, { chapters: novel.chapters || [] }];
          }
        });
      });
    };
    BoonNovel2.prototype.parseChapter = function(chapterPath) {
      return __awaiter(this, void 0, void 0, function() {
        var parsed, text;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              parsed = (0, parsers_1.parseChapterPath)(chapterPath);
              return [4, fetchJson(this.site + "/api/public/books/" + parsed.bookId + "/chapters/" + parsed.chapter)];
            case 1:
              text = _a.sent();
              return [2, (0, parsers_1.parseChapter)(text)];
          }
        });
      });
    };
    BoonNovel2.prototype.searchNovels = function(searchTerm, pageNo) {
      return __awaiter(this, void 0, void 0, function() {
        var text, books, found;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (pageNo !== 1)
                return [2, []];
              return [4, fetchJson(this.site + "/api/public/books")];
            case 1:
              text = _a.sent();
              books = (0, parsers_1.parseBooksList)(text);
              found = (0, parsers_1.searchBooks)(books, searchTerm);
              return [2, found.map(function(b) {
                var item = {
                  name: b.title,
                  path: (0, parsers_1.buildNovelPath)(b.id)
                };
                if (b.coverUrl !== void 0)
                  item.cover = b.coverUrl;
                return item;
              })];
          }
        });
      });
    };
    return BoonNovel2;
  })()
);
exports.default = new BoonNovel();
try { if (typeof module !== "undefined" && module && module.exports) module.exports.default = plugin_default; } catch (e) {}
