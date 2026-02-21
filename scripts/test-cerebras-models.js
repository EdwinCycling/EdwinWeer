import Cerebras from '@cerebras/cerebras_cloud_sdk';
import fs from 'fs';
import path from 'path';

// Manual .env parser
function loadEnv() {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            envContent.split('\n').forEach(line => {
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join('=').trim().replace(/^"|"$/g, ''); 
                    if (key && value && !process.env[key]) {
                         process.env[key] = value;
                    }
                }
            });
            console.log("Loaded .env file");
        } else {
             console.log("No .env file found in root");
        }
    } catch (e) {
        console.error("Error loading .env:", e);
    }
}

loadEnv();

const apiKey = process.env.CEREBRAS_API_KEY;

if (!apiKey) {
    console.error("Error: CEREBRAS_API_KEY is not set. Please set it in .env or environment.");
    process.exit(1);
}

const client = new Cerebras({ apiKey });

const models = [
    "llama3.1-8b",
    "gpt-oss-120b",
    "qwen-3-235b-a22b-instruct-2507",
    "zai-glm-4.7",
    "llama-3.3-70b"
];

async function testModel(model) {
    console.log(`\nTesting model: ${model}...`);
    try {
        const completion = await client.chat.completions.create({
            messages: [{ role: "user", content: "Say hello." }],
            model: model,
        });
        const content = completion.choices[0].message.content;
        console.log(`✅ Success! Response: "${content.substring(0, 50)}..."`);
        return true;
    } catch (error) {
        console.log(`❌ Failed: ${error.message}`);
        return false;
    }
}

async function runTests() {
    console.log("Starting Cerebras Model Tests...");
    const results = [];
    for (const model of models) {
        const success = await testModel(model);
        results.push({ model, success });
    }

    console.log("\nSummary:");
    results.forEach(r => {
        console.log(`- ${r.model}: ${r.success ? "✅ Working" : "❌ Failed"}`);
    });
}

runTests();
