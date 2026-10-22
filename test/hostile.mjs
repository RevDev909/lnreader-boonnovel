// Hostile-input test, adapted for this plugin's pipeline.
//
// This plugin never ingests HTML: chapter bodies arrive as plain-text
// paragraphs from a JSON API, and the only markup the plugin emits is
// <p> wrappers around fully escaped text. So the hostile property is
// different from an HTML-sanitizer plugin: hostile input must only ever
// land as inert text, never as live markup, attributes, or URLs.
//
// Each hostile fragment below is fed as one paragraph of a chapter
// JSON body, exactly as the API would deliver it. The output must
// contain no live tags, no event-handler attributes, and no href/src
// attributes at all — while the story text itself survives (escaped).
import { parseChapter } from './parsers.bundle.mjs';

let failures = 0;
function check(label, ok, extra = '') {
  if (ok) console.log('PASS  ' + label);
  else {
    failures++;
    console.log('FAIL  ' + label + ' ' + extra);
  }
}

const fragments = [
  'real story text',
  '<script>alert(1)</script>',
  '<style>p{color:red}</style>',
  '<iframe src="https://evil.example"></iframe>',
  '<object data="https://evil.example"></object>',
  '<form action="https://evil.example"><input></form>',
  '<p onclick="steal()">clicked story</p>',
  '<img src="https://img.example/x.jpg" onerror="steal()">',
  '<a href="javascript:steal()">trap link</a>',
  "<a href='javascript:steal()'>single-quote trap</a>",
  '<a href=javascript:steal()>unquoted trap</a>',
  '<a href="&#106;avascript:steal()">entity trap</a>',
  '<a href="javascript&colon;steal()">colon-entity trap</a>',
  '<a href="JaVaScRiPt:steal()">mixed-case trap</a>',
  '<a href="vbscript:steal()">vbscript trap</a>',
  '<a href="data:text/html,<script>alert(1)</script>">data trap</a>',
  '<p>Set online=true before continuing.</p>',
  'more story',
];

const body = JSON.stringify({ chapter: 1, title: 't', content: fragments });
const out = parseChapter(body);

check('story text kept', out.indexOf('real story text') !== -1 && out.indexOf('more story') !== -1 && out.indexOf('clicked story') !== -1);
check('no live script tags', !/<script/i.test(out));
check('no live style tags', !/<style/i.test(out));
check('no live iframe/object/form', !/<iframe/i.test(out) && !/<object/i.test(out) && !/<form/i.test(out));
check('no live event-handler attributes', !/<[^>]*\son(click|error)\s*=/i.test(out));
check('no live href/src attributes', !/<[^>]*\s(href|src)\s*=/i.test(out));
check('only <p> tags emitted', (() => {
  const tags = out.match(/<\/?[a-zA-Z][^>]*>/g) || [];
  return tags.every(t => /^<\/?p>$/.test(t));
})());
check('angle brackets escaped', out.indexOf('&lt;script&gt;') !== -1);
check('quotes escaped', out.indexOf('&quot;') !== -1);

console.log(failures === 0 ? '\nALL HOSTILE TESTS PASSED' : '\n' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
