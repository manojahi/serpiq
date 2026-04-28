import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

export function readIfExists(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function findFirstExisting(cwd: string, candidates: string[]): { path: string; content: string } | null {
  for (const rel of candidates) {
    const full = path.join(cwd, rel);
    const content = readIfExists(full);
    if (content !== null) return { path: rel, content };
  }
  return null;
}

export async function findFirstByGlob(cwd: string, patterns: string[]): Promise<{ path: string; content: string } | null> {
  for (const pattern of patterns) {
    const matches = await glob(pattern, { cwd, nodir: true, ignore: ['node_modules/**', 'dist/**', '.next/**', 'build/**', '.serpiq/**', '.seo-pilot/**'] });
    if (matches.length > 0) {
      const rel = matches[0];
      const content = readIfExists(path.join(cwd, rel));
      if (content !== null) return { path: rel, content };
    }
  }
  return null;
}

export function takeLines(content: string, n: number): string {
  return content.split(/\r?\n/).slice(0, n).join('\n');
}

export async function listTopDirs(cwd: string, maxDepth = 2): Promise<string[]> {
  const ignore = new Set(['node_modules', 'dist', '.git', '.next', 'build', '.serpiq', '.seo-pilot', '.cache', 'coverage', '.turbo', '.vercel']);
  const out: string[] = [];

  function walk(dir: string, depth: number, prefix: string) {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      if (ignore.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        out.push(rel + '/');
        walk(path.join(dir, entry.name), depth + 1, rel);
      } else if (depth <= 1) {
        out.push(rel);
      }
    }
  }

  walk(cwd, 0, '');
  return out;
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function appendToGitignore(cwd: string, line: string): boolean {
  const gitignorePath = path.join(cwd, '.gitignore');
  let existing = '';
  if (fs.existsSync(gitignorePath)) {
    existing = fs.readFileSync(gitignorePath, 'utf8');
    const lines = existing.split(/\r?\n/).map(l => l.trim());
    if (lines.includes(line.trim())) return false;
  }
  const newContent = existing.endsWith('\n') || existing.length === 0 ? existing : existing + '\n';
  fs.writeFileSync(gitignorePath, newContent + line + '\n');
  return true;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
