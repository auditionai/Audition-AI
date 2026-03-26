import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(path.join(dir, f));
    }
  });
}

const map = [
  { regex: /bg-white/g, rep: 'bg-white dark:bg-[#18181B]' },
  { regex: /bg-gray-50/g, rep: 'bg-gray-50 dark:bg-[#27272A]' },
  { regex: /bg-gray-100/g, rep: 'bg-gray-100 dark:bg-zinc-800' },
  { regex: /bg-gray-200/g, rep: 'bg-gray-200 dark:bg-zinc-700' },
  { regex: /text-gray-900/g, rep: 'text-gray-900 dark:text-white' },
  { regex: /text-gray-800/g, rep: 'text-gray-800 dark:text-zinc-100' },
  { regex: /text-gray-700/g, rep: 'text-gray-700 dark:text-zinc-200' },
  { regex: /text-gray-600/g, rep: 'text-gray-600 dark:text-zinc-300' },
  { regex: /text-gray-500/g, rep: 'text-gray-500 dark:text-zinc-400' },
  { regex: /text-gray-400/g, rep: 'text-gray-400 dark:text-zinc-500' },
  { regex: /border-gray-100/g, rep: 'border-gray-100 dark:border-zinc-800' },
  { regex: /border-gray-200/g, rep: 'border-gray-200 dark:border-zinc-700' },
  { regex: /ring-gray-100/g, rep: 'ring-gray-100 dark:ring-zinc-800' },
  
  // Revert my previous vars to use dark modes
  { regex: /bg-\[var\(--color-background\)\]/g, rep: 'bg-[#FAFAFA] dark:bg-[#09090B]' },
  { regex: /bg-\[var\(--color-surface\)\]/g, rep: 'bg-white dark:bg-[#18181B]' },
  { regex: /bg-\[var\(--color-secondary\)\]/g, rep: 'bg-gray-50 dark:bg-zinc-800' },
  { regex: /text-\[var\(--color-primary\)\]/g, rep: 'text-gray-900 dark:text-white' },
  { regex: /text-\[var\(--color-muted\)\]/g, rep: 'text-gray-500 dark:text-zinc-400' },
  { regex: /border-\[var\(--color-border\)\]/g, rep: 'border-gray-100 dark:border-zinc-800' },
  { regex: /bg-\[#FAFAFA\]/g, rep: 'bg-[#FAFAFA] dark:bg-[#09090B]' }
];

walkDir('c:\\Users\\cuong\\OneDrive\\Documents\\GitHub\\Audition-Mobile\\mobile-app\\src', (filePath) => {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf-8');
    let original = content;

    // We shouldn't duplicate dark classes if we already added them or ran the script twice.
    // So we first clean up existing duplicates in case.
    map.forEach(({ regex, rep }) => {
       // Just a simple guard: if the line doesn't already have the dark rep, replace it. 
       // This regex engine doesn't easily avoid replace inside strings without full AST block parsing.
       // Since it's a codebase we just want to patch quickly, we replaces instances but avoid repeating.
       content = content.replace(regex, (match, offset, string) => {
           // check if string right after match is already our rep
           const after = string.substring(offset + match.length, offset + match.length + 20);
           if (after.includes('dark:')) return match; // already handled somewhat
           return rep;
       });
    });

    if (content !== original) {
      fs.writeFileSync(filePath, content);
      console.log('Updated: ' + filePath);
    }
  }
});
