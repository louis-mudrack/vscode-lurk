export interface IrcMessage {
  tags: Record<string, string>;
  prefix: string | undefined;
  command: string;
  params: string[];
}

const TAG_ESCAPES: Record<string, string> = { ':': ';', s: ' ', '\\': '\\', r: '\r', n: '\n' };

export function unescapeTagValue(value: string): string {
  return value.replace(/\\(.?)/g, (_match, escaped: string) => TAG_ESCAPES[escaped] ?? escaped);
}

function parseTags(raw: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const pair of raw.split(';')) {
    const separator = pair.indexOf('=');
    const key = separator === -1 ? pair : pair.slice(0, separator);
    tags[key] = separator === -1 ? '' : unescapeTagValue(pair.slice(separator + 1));
  }
  return tags;
}

/** Parses one IRCv3 line as sent by Twitch chat (tags, prefix, command, params, trailing). */
export function parseIrcLine(line: string): IrcMessage | undefined {
  let rest = line.trimEnd();
  let tags: Record<string, string> = {};
  let prefix: string | undefined;

  if (rest.startsWith('@')) {
    const end = rest.indexOf(' ');
    if (end === -1) {
      return undefined;
    }
    tags = parseTags(rest.slice(1, end));
    rest = rest.slice(end + 1).trimStart();
  }
  if (rest.startsWith(':')) {
    const end = rest.indexOf(' ');
    if (end === -1) {
      return undefined;
    }
    prefix = rest.slice(1, end);
    rest = rest.slice(end + 1).trimStart();
  }

  const trailingStart = rest.indexOf(' :');
  const head = trailingStart === -1 ? rest : rest.slice(0, trailingStart);
  const [command, ...params] = head.split(' ').filter(Boolean);
  if (!command) {
    return undefined;
  }
  if (trailingStart !== -1) {
    params.push(rest.slice(trailingStart + 2));
  }
  return { tags, prefix, command, params };
}

export function nickFromPrefix(prefix: string | undefined): string {
  return prefix?.split('!')[0] ?? '';
}
