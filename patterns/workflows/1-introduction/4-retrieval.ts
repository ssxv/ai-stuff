import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod.js";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from "openai/resources/chat/completions";
import { z } from "zod";

config();

const client = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL
});

// docs: https://platform.openai.com/docs/guides/function-calling

// --------------------------------------------------------------
// Define the knowledge base retrieval tool
// --------------------------------------------------------------
async function searchKb(question: string) {
  /**
   * Load the whole knowledge base from the JSON file.
   * (This is a mock function for demonstration purposes, we don't search.)
   */
  const kbPath = fileURLToPath(new URL("./kb.json", import.meta.url));
  const contents = await readFile(kbPath, "utf-8");

  return JSON.parse(contents);
}

// --------------------------------------------------------------
// Step 1: Call model with search_kb tool defined
// --------------------------------------------------------------
const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_kb",
      description: "Get the answer to the user's question from the knowledge base.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" }
        },
        required: ["question"],
        additionalProperties: false
      },
      strict: true
    }
  }
];

const systemPrompt =
  "You are a helpful assistant that answers questions from the knowledge base about our e-commerce store.";

const messages: ChatCompletionMessageParam[] = [
  { role: "system", content: systemPrompt },
  { role: "user", content: "What is the return policy?" }
];

const completion = await client.chat.completions.create({
  model: process.env.LLM_MODEL!,
  messages,
  tools
});

// --------------------------------------------------------------
// Step 2: Model decides to call function(s)
// --------------------------------------------------------------
console.log(JSON.stringify(completion, null, 2));

// --------------------------------------------------------------
// Step 3: Execute search_kb function
// --------------------------------------------------------------
async function callFunction(name: string, args: Record<string, any>) {
  if (name === "search_kb") {
    return searchKb(args.question);
  }
}

const message = completion.choices[0].message;
messages.push(message);

for (const toolCall of message.tool_calls ?? []) {
  if (toolCall.type !== "function") continue;

  const name = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments);

  const result = await callFunction(name, args);
  messages.push({
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify(result)
  });
}

// --------------------------------------------------------------
// Step 4: Supply result and call model again
// --------------------------------------------------------------
const KBResponse = z.object({
  answer: z.string().describe("The answer to the user's question."),
  source: z.number().describe("The record id of the answer.")
});

const completion2 = await client.chat.completions.parse({
  model: process.env.LLM_MODEL!,
  messages,
  tools,
  response_format: zodResponseFormat(KBResponse, "kb_response")
});

// --------------------------------------------------------------
// Step 5: Check model response
// --------------------------------------------------------------
const finalResponse = completion2.choices[0].message.parsed;
console.log(finalResponse?.answer);
console.log(finalResponse?.source);

// --------------------------------------------------------------
// Question that doesn't trigger the tool
// --------------------------------------------------------------
const messages2: ChatCompletionMessageParam[] = [
  { role: "system", content: systemPrompt },
  { role: "user", content: "What is the weather in Tokyo?" }
];

const completion3 = await client.chat.completions.parse({
  model: process.env.LLM_MODEL!,
  messages: messages2,
  tools
});

console.log(completion3.choices[0].message.content);
