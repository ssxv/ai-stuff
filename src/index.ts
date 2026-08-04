import { config } from "dotenv";
import OpenAI from "openai";

config();

const client = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY
});

const startMs = performance.now();
const response = await client.chat.completions.create({
  model: process.env.OPENAI_MODEL!,
  messages: [
    {
      role: "user",
      content: "In the context of AI, What is RAG?"
    }
  ]
});
const endMs = performance.now();

console.log(`Duration: ${(endMs - startMs).toFixed(0)} ms`);
console.log(response.choices[0].message.content);
