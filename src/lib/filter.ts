import type { RNPlugin, RichTextInterface } from '@remnote/plugin-sdk';
import type { SmartTTSConfig } from './config';

type RichNode = any;

/**
 * RemNote markup text nodes use i: 'm'. Bold is b: true and italic is l: true.
 * Unknown rich-text node types are preserved so RemNote can flatten them safely.
 */
export function filterFormatting(richText: RichTextInterface | undefined, config: SmartTTSConfig): RichTextInterface {
  if (!richText) return [];
  const result: RichNode[] = [];

  for (const item of richText as RichNode[]) {
    if (typeof item === 'string') {
      result.push(item);
      continue;
    }

    if (item && typeof item === 'object' && item.i === 'm') {
      if (config.skipItalic && item.l === true) continue;
      if (config.skipBold && item.b === true) continue;
    }

    result.push(item);
  }

  return result as RichTextInterface;
}

export function removeBracketedContent(
  input: string,
  options: { parentheses: boolean; square: boolean; curly: boolean }
): string {
  const pairs: Record<string, string> = {};
  if (options.parentheses) pairs['('] = ')';
  if (options.square) pairs['['] = ']';
  if (options.curly) pairs['{'] = '}';

  const closers = new Set(Object.values(pairs));
  const stack: string[] = [];
  let out = '';

  for (const char of input) {
    if (pairs[char]) {
      stack.push(pairs[char]);
      continue;
    }

    if (stack.length > 0) {
      if (char === stack[stack.length - 1]) {
        stack.pop();
      } else if (pairs[char]) {
        stack.push(pairs[char]);
      }
      continue;
    }

    if (closers.has(char)) {
      // Preserve unmatched closing brackets instead of silently deleting text.
      out += char;
      continue;
    }

    out += char;
  }

  return out;
}

export function applyPlainTextFilters(input: string, config: SmartTTSConfig): string {
  let text = input;

  text = removeBracketedContent(text, {
    parentheses: config.removeParentheses,
    square: config.removeSquareBrackets,
    curly: config.removeCurlyBraces,
  });

  if (config.removeUrls) {
    text = text.replace(/https?:\/\/\S+|www\.\S+/gi, ' ');
  }

  for (const pattern of config.customRegex) {
    if (!pattern.trim()) continue;
    try {
      text = text.replace(new RegExp(pattern, 'gu'), ' ');
    } catch {
      // Invalid custom patterns are ignored at runtime and highlighted in the settings UI.
    }
  }

  return text
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

export async function richTextToSpeechText(
  plugin: RNPlugin,
  richText: RichTextInterface | undefined,
  config: SmartTTSConfig
): Promise<string> {
  const filtered = filterFormatting(richText, config);
  const plain = await plugin.richText.toString(filtered || []);
  return applyPlainTextFilters(plain || '', config);
}

export function validateRegexLines(lines: string[]): string[] {
  const invalid: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      new RegExp(line, 'gu');
    } catch {
      invalid.push(line);
    }
  }
  return invalid;
}
