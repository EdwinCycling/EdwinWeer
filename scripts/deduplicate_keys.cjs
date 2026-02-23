const fs = require('fs');
const path = require('path');

const files = [
    '../services/locales/fr.ts',
    '../services/locales/es.ts',
    '../services/locales/de.ts',
    '../services/locales/nl.ts'
];

files.forEach(relativePath => {
    const filePath = path.join(__dirname, relativePath);
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }

    console.log(`Processing ${filePath}...`);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    const newLines = [];
    const seenKeys = new Set();
    
    // We need to process from top to bottom.
    // But to keep the "last one wins" logic (which is how JS objects work), 
    // we should maybe process, find duplicates, and only keep the last occurrence?
    // OR, since TS complains, we just want to remove one.
    // If I keep the first one, it's safer for "not changing existing behavior" if the top one was the original.
    // If I keep the last one, it might be the "new" one added by a script.
    
    // Let's first identify which keys are duplicated.
    const keyCounts = {};
    lines.forEach(line => {
        const match = line.match(/^\s*['"](.+?)['"]:/);
        if (match) {
            const key = match[1];
            keyCounts[key] = (keyCounts[key] || 0) + 1;
        }
    });
    
    // Now rewrite, skipping duplicates if we've seen them enough times?
    // Actually, simply keeping the *last* occurrence is usually the standard "override" behavior.
    // But for a cleaner file, maybe the *first* is better if the file is append-only?
    // The error log showed duplicates at the end of the file (lines 2487+ vs 600+).
    // It seems the bottom ones are the "new" ones added blindly.
    // Wait, the error said `fr.ts:648` and `fr.ts:2487`.
    // 2487 is way at the bottom. 648 is in the middle.
    // If I remove the bottom one, I lose the new translation?
    // If I remove the top one, I might change the order (not important for object).
    
    // Let's assume the bottom one is the intended one (most recent addition).
    // So we need to remove the EARLIER occurrences of the duplicated keys.
    
    // Strategy:
    // 1. Map key -> last_line_index
    const keyToLastLine = {};
    lines.forEach((line, index) => {
        const match = line.match(/^\s*['"](.+?)['"]:/);
        if (match) {
            const key = match[1];
            keyToLastLine[key] = index;
        }
    });
    
    // 2. Iterate and include line ONLY if it's not a key definition OR it is the last definition of that key.
    lines.forEach((line, index) => {
        const match = line.match(/^\s*['"](.+?)['"]:/);
        if (match) {
            const key = match[1];
            if (keyToLastLine[key] === index) {
                newLines.push(line);
            } else {
                console.log(`  Removing duplicate key '${key}' at line ${index + 1} (kept line ${keyToLastLine[key] + 1})`);
            }
        } else {
            newLines.push(line);
        }
    });
    
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
    console.log(`Saved ${filePath}`);
});
