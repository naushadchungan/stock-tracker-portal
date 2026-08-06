export function extractJsonArray(text: string): unknown[] | null {
  // Normalise no-comma newline-delimited format: }\n{ → },{
  const normalised = text.replace(/\}\s*\n\s*\{/g, "},\n{");

  // (A) Single big array — try the greedily matched outer [...] first
  const greedyMatch = normalised.match(/\[[\s\S]*\]/);
  if (greedyMatch) {
    try {
      const p = JSON.parse(greedyMatch[0]);
      if (Array.isArray(p) && p.length > 0) return p;
    } catch { /* fall through */ }
  }

  // (B) Multiple per-page arrays — collect every [...] block non-greedily and merge
  const merged: unknown[] = [];
  const blockRe = /\[[^\[\]]*\]/g; // non-greedy: innermost [...] blocks only
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(normalised)) !== null) {
    try {
      const p = JSON.parse(m[0]);
      if (Array.isArray(p)) merged.push(...p);
    } catch { /* skip malformed block */ }
  }
  if (merged.length > 0) return merged;

  // (D) Truncation recovery: close the array at the last complete object
  const arrayStart = normalised.indexOf("[");
  if (arrayStart === -1) return null;
  let partial = normalised.slice(arrayStart);
  const lastClose = partial.lastIndexOf("}");
  if (lastClose === -1) return null;
  partial = partial.slice(0, lastClose + 1) + "]";
  try {
    const p = JSON.parse(partial);
    return Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}