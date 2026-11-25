'use strict';
// Zuno 0.45: a small, careful minifier for Zuno's own JS and CSS (no packages).
// JS: comments and indentation go; line breaks stay, so automatic semicolons work exactly as before.
// Strings, template literals and regular expressions are copied untouched.

const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

function minifyJs(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  // What came last that matters for "/": 'value' (then / divides) or 'op' (then / starts a regex).
  let last = 'op';
  let lastWord = '';
  const tplStack = []; // brace depth inside each open ${ … }
  let braceDepth = 0;
  let lineStart = true; // only whitespace written on this line so far
  const push = s => { out += s; lineStart = false; };
  const newline = () => { if (!lineStart) { out = out.replace(/[ \t]+$/, ''); out += '\n'; lineStart = true; } };

  const readTemplate = () => {
    // at a backtick or after "}" closing a ${ }: copy until ` or ${
    let s = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') { s += c + src[i + 1]; i += 2; continue; }
      if (c === '`') { s += c; i++; return { s, done: true }; }
      if (c === '$' && src[i + 1] === '{') { s += '${'; i += 2; return { s, done: false }; }
      s += c; i++;
    }
    throw new Error('unterminated template');
  };

  while (i < n) {
    const c = src[i];
    // whitespace
    if (c === '\n' || c === '\r') { i++; newline(); continue; }
    if (c === ' ' || c === '\t' || c === '\f' || c === '\v' || c === ' ' || c === '﻿') {
      i++;
      if (!lineStart && !/\s$/.test(out)) out += ' ';
      continue;
    }
    // comments
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error('unterminated comment');
      const body = src.slice(i, end + 2);
      i = end + 2;
      if (body.includes('\n')) newline(); else if (!lineStart && !/\s$/.test(out)) out += ' ';
      continue;
    }
    // strings
    if (c === '"' || c === "'") {
      let s = c; i++;
      while (i < n) {
        const d = src[i];
        if (d === '\\') { s += d + src[i + 1]; i += 2; continue; }
        s += d; i++;
        if (d === c) break;
        if (d === '\n') throw new Error('newline in string');
      }
      push(s); last = 'value'; continue;
    }
    // template literals
    if (c === '`') {
      i++;
      const r = readTemplate();
      push('`' + r.s);
      if (r.done) last = 'value'; else { tplStack.push(braceDepth); braceDepth = 0; last = 'op'; }
      continue;
    }
    if (c === '}' && tplStack.length && braceDepth === 0) {
      i++;
      const r = readTemplate();
      push('}' + r.s);
      if (r.done) { braceDepth = tplStack.pop(); last = 'value'; } else { last = 'op'; }
      continue;
    }
    // regular expression or division
    if (c === '/') {
      const regexOk = last === 'op' || (last === 'word' && KEYWORDS_BEFORE_REGEX.has(lastWord));
      if (regexOk) {
        let s = '/'; i++;
        let inClass = false;
        while (i < n) {
          const d = src[i];
          if (d === '\\') { s += d + src[i + 1]; i += 2; continue; }
          if (d === '\n') throw new Error('newline in regex at ' + i);
          s += d; i++;
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) break;
        }
        while (i < n && /[a-z]/i.test(src[i])) s += src[i++];
        push(s); last = 'value'; continue;
      }
      push('/'); i++;
      if (src[i] === '=') { push('='); i++; }
      last = 'op'; continue;
    }
    // words and numbers
    if (/[A-Za-z0-9_$\u0080-￿]/.test(c)) {
      let s = '';
      while (i < n && /[A-Za-z0-9_$\u0080-￿.]/.test(src[i])) {
        // a "." ends a word unless it's part of a number
        if (src[i] === '.' && !/^[0-9]/.test(s)) break;
        s += src[i++];
      }
      push(s);
      if (/^[0-9]/.test(s)) last = 'value';
      else { lastWord = s; last = KEYWORDS_BEFORE_REGEX.has(s) ? 'word' : 'value'; }
      continue;
    }
    // punctuation
    if (c === '{') braceDepth++;
    if (c === '}') braceDepth--;
    push(c); i++;
    if (c === ')' || c === ']' || c === '}') last = 'value';
    else if ((c === '+' || c === '-') && src[i] === c) { push(c); i++; } // ++ / -- keep what came before
    else last = 'op';
  }
  return out.replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n').trim() + '\n';
}

function minifyCss(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") {
      let s = c; i++;
      while (i < n) { const d = src[i]; if (d === '\\') { s += d + src[i + 1]; i += 2; continue; } s += d; i++; if (d === c) break; }
      out += s; continue;
    }
    if (/\s/.test(c)) {
      while (i < n && /\s/.test(src[i])) i++;
      const prev = out[out.length - 1];
      const next = src[i];
      if (prev === undefined || prev === '{' || prev === '}' || prev === ';' || next === '{' || next === '}' || next === ';') continue;
      out += ' ';
      continue;
    }
    out += c; i++;
  }
  return out.trim() + '\n';
}

module.exports = { minifyJs, minifyCss };
