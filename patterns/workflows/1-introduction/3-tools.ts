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
  baseURL: process.env.LLM_BASE_URL
});

// docs: https://platform.openai.com/docs/guides/function-calling

// --------------------------------------------------------------
// Define the tool (function) that we want to call
// --------------------------------------------------------------
async function getWeather(latitude: number, longitude: number) {
  /**
   * This is a publicly available API that returns the weather for a given location.
   */
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m`
  );

  const data = await response.json();

  return data.current;
}

type Location = {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  country_code: string;
  timezone: string;
};

async function getLocation(city: string): Promise<Location> {
  /**
   * This is a publicly available API that returns geo coordinates for a city name.
   */
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Geocoding API failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data.results?.length) {
    throw new Error(`Could not find city: ${city}`);
  }

  return data.results[0];
}

// --------------------------------------------------------------
// Step 1: Call model with tools defined
// --------------------------------------------------------------
const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current temperature for provided coordinates in celsius.",
      parameters: {
        type: "object",
        properties: {
          latitude: { type: "number" },
          longitude: { type: "number" }
        },
        required: ["latitude", "longitude"],
        additionalProperties: false
      },
      strict: true
    }
  },
  {
    type: "function",
    function: {
      name: "get_location",
      description: "Get geo coordinates (latitude/longitude) for a given city name.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string" }
        },
        required: ["city"],
        additionalProperties: false
      },
      strict: true
    }
  }
];

const messages: ChatCompletionMessageParam[] = [
  { role: "system", content: "You are a helpful weather assistant." },
  {
    role: "user",
    content: "What's the weather like in Paris today?"
  }
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
// Step 3: Execute get_weather function
// --------------------------------------------------------------
async function callFunction(name: string, args: Record<string, any>) {
  if (name === "get_weather") {
    return getWeather(args.latitude, args.longitude);
  }
  if (name === "get_location") {
    return getLocation(args.city);
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
const WeatherResponse = z.object({
  temperature: z.number().describe("The current temperature in celsius for the given location."),
  response: z.string().describe("A natural language response to the user's question.")
});

const completion2 = await client.chat.completions.parse({
  model: process.env.LLM_MODEL!,
  messages,
  tools,
  response_format: zodResponseFormat(WeatherResponse, "weather_response")
});

// --------------------------------------------------------------
// Step 5: Check model response
// --------------------------------------------------------------
const finalResponse = completion2.choices[0].message.parsed;
console.log(finalResponse?.temperature);
console.log(finalResponse?.response);
