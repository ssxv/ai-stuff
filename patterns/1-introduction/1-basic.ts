import { config } from "dotenv";
import OpenAI from "openai";

config();

const client = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL
});

const startMs = performance.now();
const response = await client.chat.completions.create({
  model: process.env.LLM_MODEL!,
  messages: [
    { role: "system", content: "You're a helpful assistant." },
    {
      role: "user",
      content: "Write a limerick about the Javascript programming language."
    }
  ]
});
const endMs = performance.now();

console.log(`[Duration]: ${((endMs - startMs) / 1000).toFixed(2)} s`);
console.log(response.choices[0].message.content);
