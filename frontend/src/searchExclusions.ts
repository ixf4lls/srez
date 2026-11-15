// Match the API's exclusion parsing so each displayed item is one HH phrase.
export function parseExclusionWords(raw: string): string[] {
  const seen = new Set<string>();
  return raw.split(/[,;\n\r]/).flatMap(part => {
    const word = part.replaceAll('"', '').trim().replace(/\s+/g, ' ');
    const key = word.toLowerCase();
    if (!word || seen.has(key)) return [];
    seen.add(key);
    return [word];
  });
}

export function formatExclusionWords(words: string[]): string {
  return words.map(word => `«${word}»`).join(' · ');
}
