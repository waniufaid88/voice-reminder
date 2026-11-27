import fs from "fs";
import path from "path";
import { processWithGemini } from "../lib/gemini.ts";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
let geminiApiKey = "";
let groqApiKey = "";

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("GEMINI_API_KEY=")) {
      geminiApiKey = trimmed.replace("GEMINI_API_KEY=", "").trim();
    }
    if (trimmed.startsWith("GROQ_API_KEY=")) {
      groqApiKey = trimmed.replace("GROQ_API_KEY=", "").trim();
    }
  }
}

console.log("Keys loaded:", {
  hasGemini: Boolean(geminiApiKey),
  hasGroq: Boolean(groqApiKey),
});

const testCases = [
  // 1. Lists - Difficult Cases
  {
    category: "LIST",
    input: "Prepare a first-aid kit with bandages, cotton, antiseptic cream, painkillers and a thermometer.",
    expectedType: "list",
    validate: (res) => {
      const cl = (res.checklist || []).map((c) => c.toLowerCase());
      const hasBandage = cl.some((c) => c.includes("bandage"));
      const hasThermometer = cl.some((c) => c.includes("thermometer"));
      return cl.length >= 4 && hasBandage && hasThermometer;
    },
  },
  {
    category: "LIST",
    input: "a first-aid kit with bandages, cotton, antiseptic cream, painkillers and a thermometer.",
    expectedType: "list",
    validate: (res) => {
      const cl = (res.checklist || []).map((c) => c.toLowerCase());
      const hasCotton = cl.some((c) => c.includes("cotton"));
      return cl.length >= 4 && hasCotton;
    },
  },
  {
    category: "LIST",
    input: "Camping gear: 2-person tent, sleeping bags, flashlight, portable stove and bug spray.",
    expectedType: "list",
    validate: (res) => {
      const cl = (res.checklist || []).map((c) => c.toLowerCase());
      return cl.length >= 4 && cl.some((c) => c.includes("tent"));
    },
  },
  {
    category: "LIST",
    input: "Buy macaroni and cheese, peanut butter and jelly, milk and bread.",
    expectedType: "list",
    validate: (res) => {
      const cl = (res.checklist || []).map((c) => c.toLowerCase());
      const hasMac = cl.some((c) => c.includes("macaroni and cheese"));
      const hasPBJ = cl.some(
        (c) => c.includes("peanut butter and jelly") || c.includes("peanut butter")
      );
      return hasMac && hasPBJ;
    },
  },
  {
    category: "LIST",
    input: "I have already booked the flight. For the trip bring sunscreen, swimming goggles, beach towel and passport.",
    expectedType: "list",
    validate: (res) => {
      const cl = (res.checklist || []).map((c) => c.toLowerCase());
      const noBackground = !cl.some(
        (c) => c.includes("booked") || c.includes("flight")
      );
      const hasItems = cl.some((c) => c.includes("sunscreen"));
      return noBackground && hasItems;
    },
  },

  // 2. Reminders - Difficult Cases
  {
    category: "REMINDER",
    input: "Remind me to call the doctor tomorrow at 3pm.",
    expectedType: "reminder",
    validate: (res) => Boolean(res.dueDateLocal),
  },
  {
    category: "REMINDER",
    input: "Pay electricity bill on 5th December at 10am.",
    expectedType: "reminder",
    validate: (res) => Boolean(res.dueDateLocal),
  },
  {
    category: "REMINDER",
    input: "Take blood pressure medication every morning at 8am.",
    expectedType: "reminder",
    validate: (res) => res.recurrenceMode === "daily",
  },
  {
    category: "REMINDER",
    input: "Call mom at 11am and meet accountant tomorrow at 4pm.",
    expectedType: "reminder",
    validate: (res) => {
      return (
        Array.isArray(res.multipleReminders) &&
        res.multipleReminders.length >= 2
      );
    },
  },

  // 3. Notes - Difficult Cases
  {
    category: "NOTE",
    input: "Our next engineering sync will focus on database indexing and GraphQL migration.",
    expectedType: "note",
    validate: (res) => {
      const noChecklist = !res.checklist || res.checklist.length === 0;
      const noDueDate = !res.dueDateLocal;
      return noChecklist && noDueDate;
    },
  },
  {
    category: "NOTE",
    input: "React Server Components run only on the server and do not increase client bundle size.",
    expectedType: "note",
    validate: (res) => {
      return !res.checklist || res.checklist.length === 0;
    },
  },
  {
    category: "NOTE",
    input: "I want to learn Go, Rust and Kubernetes this year.",
    expectedType: "note",
    validate: (res) => {
      return !res.checklist || res.checklist.length === 0;
    },
  },
];

async function runTests() {
  console.log(`\n======================================================`);
  console.log(`RUNNING ${testCases.length} DIFFICULT CLASSIFICATION TEST CASES WITH GEMINI`);
  console.log(`======================================================\n`);

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    process.stdout.write(
      `[${i + 1}/${testCases.length}] [${tc.category}] "${tc.input.slice(0, 45)}..." -> `
    );

    try {
      const output = await processWithGemini({
        apiKey: geminiApiKey,
        text: tc.input,
        userLocalDate: "27 November 2026, 3:45 PM",
        userDayName: "Friday",
        userTimezone: "Asia/Kolkata",
      });

      const isCorrectType = output.type === tc.expectedType;
      const isValidCustom = tc.validate ? tc.validate(output) : true;

      if (isCorrectType && isValidCustom) {
        console.log(`PASS (Type: "${output.type}", Title: "${output.title}")`);
        if (output.type === "list") {
          console.log(`      Items: ${JSON.stringify(output.checklist)}`);
        }
        if (output.type === "reminder") {
          console.log(`      Due: ${output.dueDateLocal}, Mode: ${output.recurrenceMode || "once"}`);
          if (output.multipleReminders) {
            console.log(`      Multiple: ${JSON.stringify(output.multipleReminders)}`);
          }
        }
        passed++;
      } else {
        console.log(`FAIL`);
        console.log(`      Expected: type=${tc.expectedType}, got type=${output.type}`);
        console.log(`      Output:`, JSON.stringify(output, null, 2));
        failed++;
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n======================================================`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${testCases.length})`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
