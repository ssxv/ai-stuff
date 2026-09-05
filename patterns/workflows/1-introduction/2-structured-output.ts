import { config } from "dotenv";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod.js";
import { z } from "zod";

config();

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL
});

const CalendarEvent = z.object({
  name: z.string(),
  date: z.string(),
  participants: z.array(z.string())
});

const startMs = performance.now();
const response = await client.chat.completions.parse({
  model: process.env.LLM_MODEL!,
  messages: [
    { role: "system", content: "Extract the event information." },
    {
      role: "user",
      content: "Alice and Bob are going to a science fair on Friday."
    }
  ],
  response_format: zodResponseFormat(CalendarEvent, "event")
});
const endMs = performance.now();

console.log(`[Duration]: ${((endMs - startMs) / 1000).toFixed(2)} s`);
console.log(response.choices[0].message.parsed);
