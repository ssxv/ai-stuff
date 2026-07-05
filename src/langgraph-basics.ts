/**
 * LangGraph Basics - Stateful Agent with Tool Calling
 *
 * This file demonstrates the core LangGraph concepts:
 * 1. State - A shared object that flows through the graph
 * 2. Nodes - Functions that read/write state (LLM calls, tool calls, logic)
 * 3. Edges - Connections between nodes (including conditional routing)
 * 4. The Agent Loop - Think → Act → Observe → Think again
 *
 * We'll build a simple ReAct agent that can use tools to answer questions.
 * The key insight: unlike a linear chain, this agent can LOOP — it calls a
 * tool, observes the result, and decides whether to call another tool or
 * respond to the user.
 */

import { config } from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { StateGraph, MessagesAnnotation, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";

config();

// --- Setup the model ---
const model = new ChatOpenAI({
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL
});

// =============================================================================
// STEP 1: Define Tools
// =============================================================================
// Tools are functions the agent can decide to call. Each tool has a name,
// description (so the LLM knows when to use it), and a schema for its inputs.

const getWeather = tool(
  async ({ city }) => {
    // Simulate a weather API call
    const weatherData: Record<string, string> = {
      london: "15°C, cloudy with light rain",
      tokyo: "28°C, sunny and humid",
      "new york": "22°C, partly cloudy",
      paris: "18°C, clear skies"
    };
    const result = weatherData[city.toLowerCase()];
    return result ?? `Sorry, I don't have weather data for ${city}.`;
  },
  {
    name: "get_weather",
    description: "Get the current weather for a given city",
    schema: z.object({
      city: z.string().describe("The city name to get weather for")
    })
  }
);

const calculate = tool(
  async ({ expression }) => {
    try {
      // Simple math evaluation (in production, use a proper math parser)
      const result = Function(`"use strict"; return (${expression})`)();
      return `${expression} = ${result}`;
    } catch {
      return `Could not evaluate: ${expression}`;
    }
  },
  {
    name: "calculate",
    description: "Evaluate a mathematical expression (e.g., '2 + 2', '15 * 3.5')",
    schema: z.object({
      expression: z.string().describe("The math expression to evaluate")
    })
  }
);

const tools = [getWeather, calculate];

// Bind tools to the model — this tells the LLM what tools are available
const modelWithTools = model.bindTools(tools);

// =============================================================================
// STEP 2: Define the Graph State
// =============================================================================
// MessagesAnnotation is a built-in state schema that holds a list of messages.
// Each node can append messages to this list. The state flows through the graph
// and accumulates the conversation history.
//
// State shape: { messages: BaseMessage[] }
//
// You could define custom state with additional fields, but for a basic agent,
// messages are all you need.

// =============================================================================
// STEP 3: Define Nodes
// =============================================================================
// Nodes are async functions that take the current state and return updates.

/**
 * The "agent" node - calls the LLM with the current messages.
 * The LLM either responds directly or requests tool calls.
 */
async function agentNode(state: typeof MessagesAnnotation.State) {
  const response = await modelWithTools.invoke(state.messages);
  // Return the response to be appended to messages
  return { messages: [response] };
}

// The "tools" node — executes any tool calls the LLM requested.
// ToolNode is a built-in convenience that handles this automatically.
const toolNode = new ToolNode(tools);

// =============================================================================
// STEP 4: Define Conditional Edges (Routing Logic)
// =============================================================================
// After the agent responds, we need to decide: did it call a tool, or is it done?
// This is the "conditional edge" — it routes to different nodes based on state.

function shouldContinue(state: typeof MessagesAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

  // If the LLM made tool calls, route to the "tools" node
  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools";
  }
  // Otherwise, the agent is done — route to END
  return END;
}

// =============================================================================
// STEP 5: Build the Graph
// =============================================================================
// This is where it all comes together. We define the structure:
//
//   START → agent → (conditional) → tools → agent → ... → END
//                        ↓
//                       END (if no tool calls)

const workflow = new StateGraph(MessagesAnnotation)
  // Add nodes
  .addNode("agent", agentNode)
  .addNode("tools", toolNode)
  // Set the entry point
  .addEdge("__start__", "agent")
  // After agent, conditionally route
  .addConditionalEdges("agent", shouldContinue)
  // After tools, always go back to agent (so it can process the results)
  .addEdge("tools", "agent");

// Compile the graph into a runnable
const app = workflow.compile();

// =============================================================================
// STEP 6: Run the Agent
// =============================================================================

console.log("=== LangGraph ReAct Agent ===\n");

// Query 1: Requires a tool call
console.log("--- Query 1: Weather (requires tool) ---");
const result1 = await app.invoke({
  messages: [{ role: "user", content: "What's the weather like in Tokyo?" }]
});
// Print the final response (last message)
console.log("Agent:", result1.messages[result1.messages.length - 1].content);
console.log();

// Query 2: Requires calculation tool
console.log("--- Query 2: Math (requires tool) ---");
const result2 = await app.invoke({
  messages: [{ role: "user", content: "What is 42 * 17 + 5?" }]
});
console.log("Agent:", result2.messages[result2.messages.length - 1].content);
console.log();

// Query 3: No tool needed — agent responds directly
console.log("--- Query 3: General knowledge (no tool needed) ---");
const result3 = await app.invoke({
  messages: [{ role: "user", content: "What is LangGraph in one sentence?" }]
});
console.log("Agent:", result3.messages[result3.messages.length - 1].content);
console.log();

// Query 4: Multi-step — might use multiple tools
console.log("--- Query 4: Multi-step ---");
const result4 = await app.invoke({
  messages: [
    {
      role: "user",
      content:
        "What's the weather in London and Paris? Also, what's 100 divided by 7 rounded to 2 decimals?"
    }
  ]
});
console.log("Agent:", result4.messages[result4.messages.length - 1].content);
console.log();

// =============================================================================
// BONUS: Inspect the full message history to see the agent's reasoning
// =============================================================================
console.log("--- Full message trace (Query 4) ---");
for (const msg of result4.messages) {
  const type = msg.constructor.name;
  if ("tool_calls" in msg && (msg as AIMessage).tool_calls?.length) {
    console.log(`[${type}] Tool calls:`, (msg as AIMessage).tool_calls);
  } else {
    console.log(`[${type}]`, typeof msg.content === "string" ? msg.content : msg.content);
  }
}
