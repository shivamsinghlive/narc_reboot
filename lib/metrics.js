const BRANCH_RE = /\b(if|elif|for|foreach|while|case|catch|except|when|guard|unless|rescue)\b|&&|\|\||\?\?/g;
const TODO_RE = /\b(TODO|FIXME|HACK|XXX|KLUDGE)\b/;
const SUPPRESS_RE = /(eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck|#\s*type:\s*ignore|#\s*noqa|#\s*pylint:\s*disable|@SuppressWarnings|\/\/\s*nolint|#\[allow\(|NOSONAR|istanbul ignore|# pragma: no cover|rubocop:disable|phpcs:ignore)/;
const ANY_RE = /:\s*any\b|\bas any\b|<any>/g;
const FN_RE = /^\s*(?:export\s+)?(?:async\s+)?(?:function\b|def\s|func\s|fn\s|(?:public|private|protected|static|\s)+[\w<>[\],\s]+\s+\w+\s*\([^)]*\)\s*\{)|^\s*(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/;

export function fileMetrics(f) {
  const lines = f.text.split('\n');
  const indents = [];
  let loc = 0, maxIndent = 0, longLines = 0, todos = 0, suppressions = 0, functions = 0;
  const todoSamples = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    if (!t) continue;
    loc++;
    if (f.isCode) {
      const ind = l.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
      if (ind < 120) indents.push(ind);
      if (l.length > 160) longLines++;
      if (FN_RE.test(l)) functions++;
    }
    if (TODO_RE.test(t)) { todos++; if (todoSamples.length < 4) todoSamples.push({ line: i + 1, text: t.slice(0, 140) }); }
    if (SUPPRESS_RE.test(t)) suppressions++;
  }
  if (indents.length) { indents.sort((a, b) => a - b); maxIndent = indents[Math.min(indents.length - 1, Math.floor(indents.length * 0.98))]; }
  const complexity = f.isCode ? (f.text.match(BRANCH_RE) || []).length : 0;
  const anys = ['ts', 'tsx'].includes(f.ext) ? (f.text.match(ANY_RE) || []).length : 0;
  const unit = f.ext === 'py' || /\n\t/.test(f.text) ? 4 : /\n {2}\S/.test(f.text) && !/\n {4}\S/.test(f.text.slice(0, 3000)) ? 2 : 4;
  return { loc, complexity, todos, todoSamples, suppressions, anys, functions, longLines, maxNest: Math.round(maxIndent / unit) };
}

/** Test linkage by naming convention: foo.test.ts ↔ foo.ts, test_foo.py ↔ foo.py, FooTest.java ↔ Foo.java, foo_test.go ↔ foo.go */
export function testStem(path) {
  const b = path.split('/').pop().replace(/\.\w+$/, '');
  return b.replace(/(\.|_|-)(test|spec|e2e)$/i, '').replace(/^test_/i, '').replace(/Tests?$/, '').toLowerCase();
}
