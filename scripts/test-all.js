
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsScript = path.join(__dirname, 'test-background-js.js');
const tsScript = path.join(__dirname, 'test-background-ts.ts');

console.log("🚀 Starting ALL Background Tests...");

function runScript(command, args) {
    return new Promise((resolve, reject) => {
        console.log(`\n▶️ Running: ${command} ${args.join(' ')}`);
        const proc = spawn(command, args, { stdio: 'inherit', shell: true });
        
        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with code ${code}`));
            }
        });
    });
}

async function main() {
    try {
        await runScript('node', [jsScript]);
        await runScript('npx', ['tsx', tsScript]);
        console.log("\n✅✅✅ ALL TESTS COMPLETED SUCCESSFULLY! ✅✅✅");
        console.log("Check your email (edwin@editsolutions.nl) for all reports.");
    } catch (e) {
        console.error("\n❌❌❌ TESTS FAILED ❌❌❌", e);
        process.exit(1);
    }
}

main();
