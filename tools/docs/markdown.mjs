function blank(text) {
  return text.replace(/[^\n]/g, ' ');
}

export function markdownLines(source) {
  let fence = null;
  return source
    .replace(/<!--[\s\S]*?-->/g, blank)
    .split('\n')
    .map((text, index) => {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
      if (marker && !fence) {
        fence = { character: marker[1][0], length: marker[1].length, language: marker[2].trim() };
        return { text: '', line: index + 1, code: false };
      }
      if (
        fence &&
        marker &&
        marker[1][0] === fence.character &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      ) {
        fence = null;
        return { text: '', line: index + 1, code: false };
      }
      return { text, line: index + 1, code: Boolean(fence), language: fence?.language };
    });
}

export function inlineCodeSpans(text) {
  const spans = [];
  const pattern = /(`+)([\s\S]*?)\1(?!`)/g;
  for (const match of text.matchAll(pattern)) {
    spans.push({ text: match[2], index: match.index, length: match[0].length });
  }
  return spans;
}

function maskInlineCode(text) {
  let result = text;
  for (const span of inlineCodeSpans(text).reverse()) {
    result =
      result.slice(0, span.index) +
      blank(result.slice(span.index, span.index + span.length)) +
      result.slice(span.index + span.length);
  }
  return result;
}

function decodeEntities(text) {
  const names = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (original, name) => {
    if (name[0] !== '#') return names[name.toLowerCase()];
    const value =
      name[1].toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : original;
  });
}

export function headingAnchors(source) {
  const anchors = new Set();
  const lines = markdownLines(source);
  const addHeading = (heading) => {
    const plain = decodeEntities(
      heading
        .replace(/!?\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]*>/g, '')
        .replace(/`+/g, '')
    );
    const base = plain
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
      .replace(/\s/g, '-');
    let slug = base;
    let suffix = 0;
    while (anchors.has(slug)) slug = `${base}-${++suffix}`;
    anchors.add(slug);
  };
  for (let index = 0; index < lines.length; index++) {
    const { text, code } = lines[index];
    if (code) continue;
    for (const match of text.matchAll(
      /<(?:[a-z][\w-]*)\b[^>]*\b(?:id|name)\s*=\s*["']([^"']+)["'][^>]*>/gi
    ))
      anchors.add(match[1]);
    const heading = /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(text);
    if (heading) addHeading(heading[1]);
    else if (
      /^ {0,3}(?:=+|-+)\s*$/.test(text) &&
      index > 0 &&
      !lines[index - 1].code &&
      lines[index - 1].text.trim()
    )
      addHeading(lines[index - 1].text.trim());
  }
  return anchors;
}

function normalizeReference(label) {
  return label
    .replace(/\\([\[\]\\])/g, '$1')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function bracketEnd(text, start) {
  let depth = 1;
  for (let index = start + 1; index < text.length; index++) {
    if (text[index] === '\\') {
      index++;
      continue;
    }
    if (text[index] === '[') depth++;
    if (text[index] === ']' && --depth === 0) return index;
  }
  return -1;
}

function destination(text, start) {
  let index = start;
  while (/\s/.test(text[index] ?? '') && index < text.length) index++;
  if (text[index] === '<') {
    const end = text.indexOf('>', index + 1);
    return end < 0 ? null : { target: text.slice(index + 1, end), end: end + 1 };
  }
  const beginning = index;
  let depth = 0;
  for (; index < text.length; index++) {
    if (text[index] === '\\' && /[()\s]/.test(text[index + 1] ?? '')) {
      index++;
      continue;
    }
    if (text[index] === '(') depth++;
    else if (text[index] === ')') {
      if (depth === 0) break;
      depth--;
    } else if (/\s/.test(text[index]) && depth === 0) break;
  }
  return { target: text.slice(beginning, index), end: index };
}

export function markdownLinks(source) {
  const lines = markdownLines(source);
  const definitions = new Map();
  const definitionLines = new Set();
  for (const { text, line, code } of lines) {
    if (code) continue;
    const match = /^ {0,3}\[([^\]]+)\]:\s*(.*)$/.exec(text);
    if (!match) continue;
    let parsed = destination(match[2], 0);
    if (!parsed?.target && !match[2].trim()) {
      const next = lines[line];
      if (next && !next.code && next.text.trim()) {
        parsed = destination(next.text, 0);
        if (parsed?.target) definitionLines.add(next.line);
      }
    }
    const reference = normalizeReference(match[1]);
    // CommonMark resolves duplicate definitions to the first occurrence.
    if (parsed?.target && !definitions.has(reference)) definitions.set(reference, parsed.target);
    definitionLines.add(line);
  }
  const links = [];
  const text = maskInlineCode(
    lines
      .map((entry) =>
        entry.code || definitionLines.has(entry.line) ? blank(entry.text) : entry.text
      )
      .join('\n')
  );
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\\') {
      index++;
      continue;
    }
    if (text[index] !== '[') continue;
    const end = bracketEnd(text, index);
    if (end < 0) continue;
    const label = text.slice(index + 1, end);
    const image = index > 0 && text[index - 1] === '!';
    const line = text.slice(0, index).split('\n').length;
    if (text[end + 1] === '(') {
      const parsed = destination(text, end + 2);
      if (parsed)
        links.push({
          target: decodeEntities(parsed.target).replace(/\\([() ])/g, '$1'),
          line,
          image
        });
      index = parsed?.end ?? end;
    } else if (text[end + 1] === '[') {
      const referenceEnd = text.indexOf(']', end + 2);
      if (referenceEnd < 0) continue;
      const reference = normalizeReference(text.slice(end + 2, referenceEnd) || label);
      links.push({ target: definitions.get(reference), reference, line, image });
      index = referenceEnd;
    } else {
      const reference = normalizeReference(label);
      if (definitions.has(reference))
        links.push({ target: definitions.get(reference), reference, line, image });
      index = end;
    }
  }
  return links;
}
