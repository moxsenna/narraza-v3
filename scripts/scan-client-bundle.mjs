import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCANNABLE_EXTENSIONS = ['.js', '.mjs', '.json', '.map'];
const FORBIDDEN = [
  { name: 'OpenRouter API key name', pattern: /OPENROUTER_API_KEY/i },
  { name: 'Gemini API key name', pattern: /GEMINI_API_KEY/i },
  { name: 'AI mock environment key', pattern: /AI_ENABLE_MOCK/i },
  { name: 'worker database environment key', pattern: /DATABASE_URL_WORKER/i },
  { name: 'restricted-service internal state', pattern: /service_restricted/i },
  { name: 'canonical operation internal type', pattern: /CanonicalChangeOperation/i },
  {
    name: 'raw provider model identifier',
    pattern:
      /(?:google\/gemini-[\w.-]+|anthropic\/claude-[\w.-]+|openai\/(?:gpt|o\d)[\w.-]*|gemini-\d[\w.-]*|claude-\d[\w.-]*)/i,
  },
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(target)));
    } else if (
      entry.isFile() &&
      SCANNABLE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
    ) {
      files.push(target);
    }
  }
  return files;
}

export async function scanClientBundle(bundleDirectory) {
  let details;
  try {
    details = await stat(bundleDirectory);
  } catch {
    throw new Error(`Client bundle directory is missing: ${bundleDirectory}`);
  }
  if (!details.isDirectory()) {
    throw new Error(`Client bundle directory is missing: ${bundleDirectory}`);
  }

  const files = await collectFiles(bundleDirectory);
  if (files.length === 0) {
    throw new Error(`Client bundle has no client bundle files: ${bundleDirectory}`);
  }

  const violations = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const forbidden of FORBIDDEN) {
      if (forbidden.pattern.test(content)) {
        violations.push(`${path.relative(bundleDirectory, file)}: ${forbidden.name}`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(`Forbidden client bundle content found:\n${violations.join('\n')}`);
  }
  return { filesScanned: files.length };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const directory = path.resolve(process.argv[2] ?? 'apps/web/.next/static');
  scanClientBundle(directory)
    .then(({ filesScanned }) => {
      process.stdout.write(`Client bundle security scan passed (${filesScanned} files).\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
