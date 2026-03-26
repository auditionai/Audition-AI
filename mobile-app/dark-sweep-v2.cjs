/**
 * dark-sweep-v2.cjs — Fix all remaining "light-only" Tailwind utility classes
 * Run: node dark-sweep-v2.cjs
 */

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, 'src');

const REPLACEMENTS = [
  // bg-{color}-50 → add dark:bg-{color}-500/10
  [/\bbg-green-50\b(?!\s+dark:)/g, 'bg-green-50 dark:bg-green-500/10'],
  [/\bbg-red-50\b(?!\s+dark:)/g, 'bg-red-50 dark:bg-red-500/10'],
  [/\bbg-yellow-50\b(?!\s+dark:)/g, 'bg-yellow-50 dark:bg-yellow-500/10'],
  [/\bbg-blue-50\b(?!\s+dark:)/g, 'bg-blue-50 dark:bg-blue-500/10'],
  [/\bbg-purple-50\b(?!\s+dark:)/g, 'bg-purple-50 dark:bg-purple-500/10'],
  [/\bbg-indigo-50\b(?!\s+dark:)/g, 'bg-indigo-50 dark:bg-indigo-500/10'],
  [/\bbg-orange-50\b(?!\s+dark:)/g, 'bg-orange-50 dark:bg-orange-500/10'],
  [/\bbg-cyan-50\b(?!\s+dark:)/g, 'bg-cyan-50 dark:bg-cyan-500/10'],

  // border-{color}-100 → dark:border-{color}-500/30
  [/\bborder-green-100\b(?!\s+dark:)/g, 'border-green-100 dark:border-green-500/30'],
  [/\bborder-red-100\b(?!\s+dark:)/g, 'border-red-100 dark:border-red-500/30'],
  [/\bborder-blue-100\b(?!\s+dark:)/g, 'border-blue-100 dark:border-blue-500/30'],
  [/\bborder-purple-100\b(?!\s+dark:)/g, 'border-purple-100 dark:border-purple-500/30'],
  [/\bborder-indigo-100\b(?!\s+dark:)/g, 'border-indigo-100 dark:border-indigo-500/30'],
  [/\bborder-orange-100\b(?!\s+dark:)/g, 'border-orange-100 dark:border-orange-500/30'],
  [/\bborder-yellow-100\b(?!\s+dark:)/g, 'border-yellow-100 dark:border-yellow-500/30'],
  [/\bborder-cyan-100\b(?!\s+dark:)/g, 'border-cyan-100 dark:border-cyan-500/30'],

  // border-{color}-200 → dark:border-{color}-500/30
  [/\bborder-green-200\b(?!\s+dark:)/g, 'border-green-200 dark:border-green-500/30'],
  [/\bborder-red-200\b(?!\s+dark:)/g, 'border-red-200 dark:border-red-500/30'],
  [/\bborder-blue-200\b(?!\s+dark:)/g, 'border-blue-200 dark:border-blue-500/30'],
  [/\bborder-purple-200\b(?!\s+dark:)/g, 'border-purple-200 dark:border-purple-500/30'],
  [/\bborder-indigo-200\b(?!\s+dark:)/g, 'border-indigo-200 dark:border-indigo-500/30'],
  [/\bborder-orange-200\b(?!\s+dark:)/g, 'border-orange-200 dark:border-orange-500/30'],

  // border-gray-200 without dark
  [/\bborder-gray-200\b(?!\s+dark:)/g, 'border-gray-200 dark:border-zinc-700'],

  // bg-gray-50 without dark
  [/\bbg-gray-50\b(?!\s+dark:)/g, 'bg-gray-50 dark:bg-zinc-800'],
];

function walkDir(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkDir(fullPath));
    } else if (entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = walkDir(SRC);
console.log(`Scanning ${files.length} TSX files...\n`);

let totalFixed = 0;
for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const [pattern, replacement] of REPLACEMENTS) {
    const before = content;
    content = content.replace(pattern, replacement);
    if (content !== before) changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  Fixed: ${path.relative(SRC, filePath)}`);
    totalFixed++;
  }
}

console.log(`\nDone! Fixed ${totalFixed} files.`);
