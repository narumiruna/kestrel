import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Use the lockfile-pinned Web parsers. Do not replace these with regular expressions.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'web/package.json'));
const { SaxesParser } = require('saxes');
const { parse, TYPE } = await import(
  pathToFileURL(require.resolve('@formatjs/icu-messageformat-parser')).href
);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function sameKeys(expected, actual, context) {
  const missing = [...expected].filter((key) => !actual.has(key)).sort();
  const extra = [...actual].filter((key) => !expected.has(key)).sort();
  check(
    !missing.length && !extra.length,
    `${context}: missing [${missing.join(', ')}]; unexpected [${extra.join(', ')}]`,
  );
}

function nonempty(value, context) {
  check(
    typeof value === 'string' && value.trim().length > 0,
    `${context}: message must be a nonempty string`,
  );
}

// JSON.parse validates the grammar; a token walk also detects duplicate object keys,
// which JSON.parse would silently overwrite.
export function parseJsonCatalog(text) {
  const value = JSON.parse(text);
  const tokens = text.match(
    /"(?:[^"\\]|\\.)*"|[{}[\]:,]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/gs,
  );
  let cursor = 0;
  function walk() {
    const token = tokens[cursor++];
    if (token === '{') {
      const keys = new Set();
      while (tokens[cursor] !== '}') {
        const key = JSON.parse(tokens[cursor++]);
        check(!keys.has(key), `duplicate JSON key: ${key}`);
        keys.add(key);
        cursor++; // colon; grammar already checked by JSON.parse
        walk();
        if (tokens[cursor] !== ',') break;
        cursor++;
      }
      cursor++;
    } else if (token === '[') {
      while (tokens[cursor] !== ']') {
        walk();
        if (tokens[cursor] !== ',') break;
        cursor++;
      }
      cursor++;
    }
  }
  walk();
  return value;
}

export function flattenMessages(catalog, prefix = '', result = new Map()) {
  check(
    catalog !== null && typeof catalog === 'object' && !Array.isArray(catalog),
    `${prefix || 'catalog'}: expected a message object`,
  );
  check(Object.keys(catalog).length > 0, `${prefix || 'catalog'}: empty namespace`);
  for (const [key, value] of Object.entries(catalog)) {
    check(
      /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) &&
        !['__proto__', 'prototype', 'constructor'].includes(key),
      `invalid message key: ${key}`,
    );
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) flattenMessages(value, path, result);
    else {
      nonempty(value, path);
      result.set(path, value);
    }
  }
  return result;
}

const pluralCategoryCache = new Map();
export function pluralCategories(locale, type = 'cardinal', platform = 'web') {
  const cacheKey = `${locale}/${type}/${platform}`;
  if (pluralCategoryCache.has(cacheKey)) return pluralCategoryCache.get(cacheKey);
  const rules = new Intl.PluralRules(locale, { type });
  if (platform === 'web') {
    const categories = rules.resolvedOptions().pluralCategories;
    pluralCategoryCache.set(cacheKey, categories);
    return categories;
  }
  // Android quantity lookup accepts integers, not fractional CLDR operands.
  // Include powers of ten for CLDR's million-based `many`, plus mandatory `other`.
  const categories = new Set(['other']);
  for (let n = 0; n <= 1000; n++) categories.add(rules.select(n));
  for (let n = 4; n <= 9; n++) categories.add(rules.select(10 ** n));
  const result = [...categories].sort();
  pluralCategoryCache.set(cacheKey, result);
  return result;
}

function validateIcuStyle(node, locale) {
  if (!node.style) return;
  if (typeof node.style === 'string') {
    // The client has no custom named formats. Unknown names otherwise silently
    // degrade to default formatting in IntlMessageFormat.
    const styles =
      node.type === TYPE.number ? ['integer', 'percent'] : ['short', 'medium', 'long', 'full'];
    check(
      styles.includes(node.style),
      `unknown ICU format style: ${node.style}; use a valid skeleton`,
    );
    return;
  }
  if (node.type === TYPE.number) {
    // FormatJS accepts unknown skeleton stems as no-ops. Check each parsed token
    // separately so a valid token cannot conceal an ignored/invalid token.
    for (const token of node.style.tokens) {
      const skeleton = [token.stem, ...token.options].join('/');
      const [single] = parse(`{value, number, ::${skeleton}}`, { shouldParseSkeletons: true });
      check(
        Object.keys(single.style.parsedOptions).length > 0,
        `unknown number skeleton: ${skeleton}`,
      );
    }
    const { scale, ...options } = node.style.parsedOptions;
    check(scale === undefined || Number.isFinite(scale), 'invalid number skeleton scale');
    new Intl.NumberFormat(locale, options);
  } else {
    check(
      Object.keys(node.style.parsedOptions).length > 0,
      'empty or unsupported date/time skeleton',
    );
    new Intl.DateTimeFormat(locale, node.style.parsedOptions);
  }
}

export function icuSignature(message, locale) {
  nonempty(message, 'ICU');
  const signature = new Set();
  function walk(nodes) {
    for (const node of nodes) {
      if (node.type === TYPE.literal || node.type === TYPE.pound) continue;
      if (node.type === TYPE.tag) {
        // Named rich placeholders are rendered by explicit React callbacks, never
        // innerHTML. Only the source's controlled strong placeholder is used.
        check(node.value === 'strong', 'unsupported rich-text placeholder');
        signature.add(`${node.value}:tag`);
        walk(node.children);
        continue;
      }
      validateIcuStyle(node, locale);
      const type = Object.entries(TYPE).find(([, value]) => value === node.type)?.[0];
      signature.add(`${node.value}:${type}`);
      if (node.type === TYPE.plural) {
        const categories = pluralCategories(locale, node.pluralType);
        const selectors = Object.keys(node.options);
        for (const category of categories) {
          check(
            selectors.includes(category),
            `${node.value}: missing ${locale} ${node.pluralType} plural category ${category}`,
          );
        }
        for (const selector of selectors) {
          check(
            selector.startsWith('=') || categories.includes(selector),
            `${node.value}: invalid ${locale} plural category ${selector}`,
          );
        }
        signature.add(
          `${node.value}:${node.pluralType}:offset=${node.offset}:exact=${selectors
            .filter((s) => s.startsWith('='))
            .sort()
            .join(',')}`,
        );
      } else if (node.type === TYPE.select) {
        signature.add(`${node.value}:select=${Object.keys(node.options).sort().join(',')}`);
      }
      if (node.options) {
        const hasContent = (option) =>
          option.value.some((part) => part.type !== TYPE.literal || part.value.trim().length > 0);
        check(
          Object.values(node.options).some(hasContent),
          `${node.value}: all ICU branches are empty`,
        );
        for (const option of Object.values(node.options)) {
          // Optional select suffixes can be empty; a counted plural message cannot.
          check(node.type === TYPE.select || hasContent(option), `${node.value}: empty ICU branch`);
          walk(option.value);
        }
      }
    }
  }
  walk(parse(message, { requiresOtherClause: true, shouldParseSkeletons: true }));
  return signature;
}

export function validateWebCatalog(source, translated, locale) {
  const english = flattenMessages(source);
  const target = flattenMessages(translated);
  sameKeys(new Set(english.keys()), new Set(target.keys()), `${locale} Web keys`);
  const identical = [];
  for (const [key, message] of english) {
    try {
      sameKeys(
        icuSignature(message, 'en'),
        icuSignature(target.get(key), locale),
        `${locale} ${key} ICU arguments/types`,
      );
    } catch (error) {
      throw new Error(`${locale} ${key}: ${error.message}`);
    }
    if (locale !== 'en' && target.get(key) === message) identical.push(key);
  }
  if (locale !== 'en')
    check(identical.length < english.size, `${locale}: entire Web catalog is an English copy`);
  return identical;
}

export function parseXml(text) {
  const parser = new SaxesParser();
  const stack = [];
  let rootNode;
  parser.on('doctype', () => {
    throw new Error('XML DOCTYPE is not allowed');
  });
  parser.on('error', (error) => {
    throw error;
  });
  parser.on('opentag', (tag) => {
    const node = { name: tag.name, attributes: tag.attributes, children: [], content: [] };
    if (stack.length) {
      stack.at(-1).children.push(node);
      stack.at(-1).content.push(node);
    } else rootNode = node;
    stack.push(node);
  });
  const append = (text) => {
    if (stack.length) stack.at(-1).content.push(text);
  };
  parser.on('text', append);
  parser.on('cdata', append);
  parser.on('closetag', () => stack.pop());
  parser.write(text).close();
  return rootNode;
}

function textContent(node) {
  return node.content.map((part) => (typeof part === 'string' ? part : textContent(part))).join('');
}

export function parseAndroidCatalog(text) {
  const tree = parseXml(text);
  check(tree?.name === 'resources', 'Android catalog root must be resources');
  const result = new Map();
  for (const node of tree.children) {
    const type = node.name === 'item' ? node.attributes.type : node.name;
    if (!['string', 'plurals', 'string-array'].includes(type)) continue;
    const name = node.attributes.name;
    check(
      typeof name === 'string' && /^[a-z][a-z0-9_]*$/.test(name),
      `invalid Android resource key: ${name}`,
    );
    const key = `${type}/${name}`;
    check(!result.has(key), `duplicate Android resource: ${key}`);
    for (const attribute of ['translatable', 'formatted']) {
      check(
        node.attributes[attribute] === undefined ||
          ['true', 'false'].includes(node.attributes[attribute]),
        `${key}: invalid ${attribute} attribute`,
      );
    }
    const items = new Map();
    if (type === 'string') items.set('value', textContent(node));
    else {
      check(node.children.length > 0, `${key}: empty resource`);
      for (const [index, item] of node.children.entries()) {
        check(item.name === 'item', `${key}: expected item`);
        const quantity = type === 'plurals' ? item.attributes.quantity : String(index);
        check(
          type !== 'plurals' || ['zero', 'one', 'two', 'few', 'many', 'other'].includes(quantity),
          `${key}: invalid plural quantity ${quantity}`,
        );
        check(!items.has(quantity), `${key}: duplicate plural quantity ${quantity}`);
        items.set(quantity, textContent(item));
      }
    }
    for (const [item, value] of items) {
      nonempty(value, `${key}/${item}`);
      // Aliases can resolve to the English resource even when this key exists.
      check(
        node.attributes.translatable === 'false' || !/^\s*[@?](?:[\w.]+:)?[\w]+\//.test(value),
        `${key}: translatable resource aliases are not allowed`,
      );
    }
    result.set(key, {
      type,
      items,
      translatable: node.attributes.translatable !== 'false',
      formatted: node.attributes.formatted !== 'false',
    });
  }
  return result;
}

export function androidFormatSignature(message, formatted = true) {
  const args = new Set();
  if (!formatted) return args;
  let implicit = 0;
  let previous;
  for (let cursor = 0; cursor < message.length; cursor++) {
    if (message[cursor] !== '%') continue;
    const match = /^%(?:(\d+)\$)?([-#+ 0,(<]*)(\d+)?(?:\.(\d+))?([tT])?([a-zA-Z%])/.exec(
      message.slice(cursor),
    );
    check(match, `invalid Android format near ${message.slice(cursor, cursor + 16)}`);
    const [, index, flags, width, precision, date, conversion] = match;
    cursor += match[0].length - 1;
    check(new Set(flags).size === flags.length, 'duplicate Android format flag');
    const presentationFlags = flags.replace('<', '');
    check(!(flags.includes('-') && flags.includes('0')), 'incompatible Android format flags');
    check(!(flags.includes('+') && flags.includes(' ')), 'incompatible Android sign flags');
    check(!/[-0]/.test(presentationFlags) || Number(width) > 0, 'format flag requires a width');
    if (!date && ['%', 'n'].includes(conversion)) {
      check(!index && !flags.includes('<'), 'nonargument format has an argument index');
      check(precision === undefined, 'nonargument format cannot have precision');
      check(
        conversion === '%' ? !/[^-]/.test(flags) : !flags && !width,
        'invalid nonargument format flags or width',
      );
      continue;
    }
    check(
      date || 'bBhHsScCdoxXeEfgGaA'.includes(conversion),
      `invalid Android format conversion ${conversion}`,
    );
    const validFlags = date
      ? '-'
      : {
          b: '-',
          h: '-',
          s: '-',
          c: '-',
          d: '-+ 0,(',
          o: '-#0',
          x: '-#0',
          e: '-+ 0(#',
          f: '-+ 0,(#',
          g: '-+ 0,(',
          a: '-+ 0#',
        }[conversion.toLowerCase()];
    check(
      [...presentationFlags].every((flag) => validFlags.includes(flag)),
      'flag is incompatible with Android format conversion',
    );
    check(
      precision === undefined || (!date && 'bBhHsSeEfgGaA'.includes(conversion)),
      'precision is incompatible with Android format conversion',
    );
    const position = flags.includes('<') ? previous : index ? Number(index) : ++implicit;
    check(Number.isInteger(position) && position > 0, 'invalid Android format argument index');
    check(!(index && flags.includes('<')), 'format cannot combine explicit and relative indexes');
    previous = position;
    let type;
    if (date) {
      check(
        'HIklMSLNpzZsQBbhAaCYyjmdeRTrDFc'.includes(conversion),
        `invalid date format ${conversion}`,
      );
      type = 'date';
    } else {
      const lower = conversion.toLowerCase();
      type = {
        s: 'string',
        b: 'boolean',
        h: 'hash',
        c: 'char',
        d: 'integer',
        o: 'integer',
        x: 'integer',
        e: 'float',
        f: 'float',
        g: 'float',
        a: 'float',
      }[lower];
      check(type, `invalid Android format conversion ${conversion}`);
    }
    args.add(`${position}:${type}`);
  }
  return args;
}

export function validateAndroidCatalog(source, translated, locale) {
  const english = new Map([...source].filter(([, entry]) => entry.translatable));
  const target = new Map(
    [...translated].filter(([key]) => !source.has(key) || source.get(key).translatable),
  );
  sameKeys(new Set(english.keys()), new Set(target.keys()), `${locale} Android keys`);
  const identical = [];
  for (const [key, entry] of english) {
    const localized = target.get(key);
    check(localized.translatable, `${locale} ${key}: translation cannot set translatable=false`);
    check(
      localized.formatted === entry.formatted,
      `${locale} ${key}: formatted attribute mismatch`,
    );
    if (entry.type === 'plurals') {
      sameKeys(
        new Set(pluralCategories(locale, 'cardinal', 'android')),
        new Set(localized.items.keys()),
        `${locale} ${key} plural categories`,
      );
    } else
      sameKeys(
        new Set(entry.items.keys()),
        new Set(localized.items.keys()),
        `${locale} ${key} items`,
      );
    const reference = entry.items.get('other') ?? entry.items.values().next().value;
    for (const [item, value] of localized.items) {
      const sourceValue = entry.type === 'plurals' ? reference : entry.items.get(item);
      sameKeys(
        androidFormatSignature(sourceValue, entry.formatted),
        androidFormatSignature(value, localized.formatted),
        `${locale} ${key}/${item} format arguments/types`,
      );
    }
    if (JSON.stringify([...entry.items].sort()) === JSON.stringify([...localized.items].sort()))
      identical.push(key);
  }
  check(english.size > 0, 'English Android catalog has no translatable resources');
  if (locale !== 'en')
    check(identical.length < english.size, `${locale}: entire Android catalog is an English copy`);
  return locale === 'en' ? [] : identical;
}

export function androidDirectory(locale) {
  if (locale === 'en') return 'values';
  if (locale === 'zh-TW') return 'values-zh-rTW';
  // Android's resource matcher uses the legacy Indonesian qualifier even for BCP 47 id.
  if (locale === 'id') return 'values-in';
  if (locale === 'fil') return 'values-b+fil';
  return `values-${locale}`;
}

export function validateLocales(locales) {
  check(Array.isArray(locales) && locales.length > 0, 'client locale list is empty');
  check(new Set(locales).size === locales.length, 'duplicate client locale');
  check(locales.includes('en'), 'English default locale is missing');
  for (const locale of locales) {
    check(
      Intl.getCanonicalLocales(locale)[0] === locale &&
        Intl.PluralRules.supportedLocalesOf([locale]).length === 1,
      `invalid or unsupported canonical locale: ${locale}`,
    );
  }
}

async function readAndroidDirectory(path) {
  const result = new Map();
  for (const name of (await readdir(path)).filter((name) => name.endsWith('.xml')).sort()) {
    const catalog = parseAndroidCatalog(await readFile(join(path, name), 'utf8'));
    for (const [key, entry] of catalog) {
      check(!result.has(key), `${path}: duplicate Android resource ${key}`);
      result.set(key, entry);
    }
  }
  return result;
}

export async function validateProject(projectRoot, locales) {
  validateLocales(locales);
  const errors = [];
  const identical = [];
  async function inspect(label, action) {
    try {
      await action();
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }
  const messages = join(projectRoot, 'web/messages');
  const resources = join(projectRoot, 'app/src/main/res');
  await inspect('Web locale files', async () => {
    const files = (await readdir(messages)).filter((name) => name.endsWith('.json'));
    sameKeys(
      new Set(locales.map((locale) => `${locale}.json`)),
      new Set(files),
      'Web locale files',
    );
    const source = parseJsonCatalog(await readFile(join(messages, 'en.json'), 'utf8'));
    for (const locale of locales)
      await inspect(`${locale} Web`, async () => {
        const translated = parseJsonCatalog(
          await readFile(join(messages, `${locale}.json`), 'utf8'),
        );
        for (const key of validateWebCatalog(source, translated, locale))
          identical.push(`${locale} Web ${key}`);
      });
  });
  await inspect('Android catalogs', async () => {
    const source = await readAndroidDirectory(join(resources, 'values'));
    const expectedDirectories = new Set(locales.map(androidDirectory));
    for (const directory of (await readdir(resources))
      .filter((name) => /^values(?:-|$)/.test(name))
      .sort()) {
      if (!expectedDirectories.has(directory)) {
        const extra = await readAndroidDirectory(join(resources, directory));
        check(
          ![...extra.values()].some((entry) => entry.translatable),
          `unexpected Android catalog directory: ${directory}`,
        );
      }
    }
    for (const locale of locales)
      await inspect(`${locale} Android`, async () => {
        const translated = await readAndroidDirectory(join(resources, androidDirectory(locale)));
        for (const key of validateAndroidCatalog(source, translated, locale))
          identical.push(`${locale} Android ${key}`);
      });
  });
  await inspect('Android locale metadata', async () => {
    const manifest = parseXml(
      await readFile(join(projectRoot, 'app/src/main/AndroidManifest.xml'), 'utf8'),
    );
    const application = manifest.children.find((node) => node.name === 'application');
    const reference = application?.attributes['android:localeConfig'];
    check(/^@xml\/[a-z_]+$/.test(reference ?? ''), 'manifest must reference android:localeConfig');
    const config = parseXml(await readFile(join(resources, `${reference.slice(1)}.xml`), 'utf8'));
    check(config.name === 'locale-config', 'expected locale-config XML');
    const tags = config.children.map((node) => {
      check(node.name === 'locale', 'unexpected locale-config child');
      return node.attributes['android:name'];
    });
    check(new Set(tags).size === tags.length, 'duplicate Android locale metadata');
    sameKeys(new Set(locales), new Set(tags), 'Android supported locale metadata');
  });
  return { errors, identical: identical.sort() };
}

async function main() {
  // This is the client's registry, not a second runtime locale registry.
  const metadata = await import(pathToFileURL(join(root, 'web/i18n/config.ts')).href);
  const result = await validateProject(root, metadata.locales);
  if (result.identical.length) {
    console.log(
      `Identical-to-English entries require translation review (${result.identical.length}):\n${result.identical.join('\n')}`,
    );
  }
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else console.log(`i18n catalogs valid: ${metadata.locales.length} locales on Android and Web.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
