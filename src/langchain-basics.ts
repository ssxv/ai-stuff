/**
 * LangChain Basics - Core Concepts
 *
 * This file walks through the fundamental building blocks of LangChain:
 * 1. Chat Models - Wrappers around LLMs with a standard interface
 * 2. Prompt Templates - Reusable, parameterized prompts
 * 3. Output Parsers - Structured extraction from LLM responses
 * 4. Chains - Composing multiple steps together (using LCEL)
 */

import { config } from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

config();

// --- 1. Chat Model ---
// LangChain wraps the OpenAI client (and many other providers) into a
// standard interface. This means you can swap providers without changing
// downstream code.
const model = new ChatOpenAI({
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL
  },
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.LLM_MODEL
});

// Simple invocation (like your existing code, but through LangChain)
console.log("=== 1. Direct Model Call ===");
const directResponse = await model.invoke("What is LangChain in one sentence?");
console.log(directResponse.content);
console.log();

// --- 2. Prompt Templates ---
// Instead of hardcoding messages, templates let you create reusable prompts
// with variables that get filled in at runtime.
console.log("=== 2. Prompt Templates ===");
const promptTemplate = ChatPromptTemplate.fromMessages([
  ["system", "You are a helpful AI tutor. Explain concepts clearly and concisely."],
  ["human", "Explain {topic} in the context of {domain}. Keep it under 3 sentences."]
]);

// You can inspect what the template produces:
const formattedPrompt = await promptTemplate.invoke({
  topic: "embeddings",
  domain: "natural language processing"
});
console.log(
  "Formatted messages:",
  formattedPrompt.messages.map((m) => m.content)
);
console.log();

// --- 3. Output Parsers ---
// Parsers transform raw LLM output into structured data.
// StringOutputParser is the simplest — it just extracts the text content.
const parser = new StringOutputParser();

// --- 4. Chains (LCEL - LangChain Expression Language) ---
// The pipe operator (|) composes steps into a chain:
// prompt → model → parser
// Each step's output becomes the next step's input.
console.log("=== 3. Chain (Prompt → Model → Parser) ===");
const chain = promptTemplate.pipe(model).pipe(parser);

// Now invoke the full chain with just your variables:
const result = await chain.invoke({
  topic: "vector databases",
  domain: "AI applications"
});
console.log(result);
console.log();

// --- 5. Streaming ---
// LangChain supports streaming out of the box, token by token.
console.log("=== 4. Streaming ===");
const stream = await chain.stream({
  topic: "retrieval augmented generation (RAG)",
  domain: "large language models"
});

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
console.log("\n");

// --- 6. Batch Processing ---
// Process multiple inputs in parallel.
console.log("=== 5. Batch Processing ===");
const batchResults = await chain.batch([
  { topic: "agents", domain: "LangChain" },
  { topic: "chains", domain: "LangChain" },
  { topic: "memory", domain: "chatbots" }
]);
batchResults.forEach((r, i) => console.log(`[${i + 1}] ${r}\n`));
