import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { stdin, stdout } from "node:process";

import { config } from "dotenv";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from "openai/resources/chat/completions";

import { log } from "../util/logger.js";

config();

// --------------------------------------------------------------
// A single-file conversational agent that can read, list, and edit
// files. Ported from the Anthropic example to the OpenAI SDK so it
// stays consistent with the rest of this repo (and runs against a
// local model via OPENAI_BASE_URL / LLM_MODEL).
//
// Diagnostic logs use the shared logger (LOG_LEVEL controls verbosity);
// the conversation itself prints to stdout via console.
// --------------------------------------------------------------

// --------------------------------------------------------------
// Tool implementations
// --------------------------------------------------------------

async function readFileTool(path: string): Promise<string> {
  try {
    const content = await readFile(path, "utf-8");
    return `File contents of ${path}:\n${content}`;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return `File not found: ${path}`;
    }
    return `Error reading file: ${error?.message ?? String(error)}`;
  }
}

async function listFilesTool(path = "."): Promise<string> {
  try {
    if (!existsSync(path)) {
      return `Path not found: ${path}`;
    }

    const entries = (await readdir(path)).sort();
    const items = entries.map((item) => {
      const isDir = statSync(join(path, item)).isDirectory();
      return isDir ? `[DIR]  ${item}/` : `[FILE] ${item}`;
    });

    if (!items.length) {
      return `Empty directory: ${path}`;
    }

    return `Contents of ${path}:\n${items.join("\n")}`;
  } catch (error: any) {
    return `Error listing files: ${error?.message ?? String(error)}`;
  }
}

async function editFileTool(path: string, oldText: string, newText: string): Promise<string> {
  try {
    if (existsSync(path) && oldText) {
      const content = await readFile(path, "utf-8");
      if (!content.includes(oldText)) {
        return `Text not found in file: ${oldText}`;
      }
      await writeFile(path, content.replaceAll(oldText, newText));
      return `Successfully edited ${path}`;
    }

    // Create the file (and any parent directories) with the new text.
    const dir = dirname(path);
    if (dir && dir !== ".") {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(path, newText);
    return `Successfully created ${path}`;
  } catch (error: any) {
    return `Error editing file: ${error?.message ?? String(error)}`;
  }
}

// --------------------------------------------------------------
// Tool definitions (schemas the model sees)
// --------------------------------------------------------------

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file at the specified path",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The path to the file to read" }
        },
        required: ["path"],
        additionalProperties: false
      },
      strict: true
    }
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List all files and directories in the specified path",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The directory path to list (defaults to current directory)"
          }
        },
        required: [],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Edit a file by replacing old_text with new_text. Creates the file if it doesn't exist.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The path to the file to edit" },
          old_text: {
            type: "string",
            description: "The text to search for and replace (leave empty to create new file)"
          },
          new_text: {
            type: "string",
            description: "The text to replace old_text with"
          }
        },
        required: ["path", "new_text"],
        additionalProperties: false
      }
    }
  }
];

// --------------------------------------------------------------
// Tool dispatcher
// --------------------------------------------------------------

async function executeTool(name: string, input: Record<string, any>): Promise<string> {
  log.info(`Executing tool: ${name} with input: ${JSON.stringify(input)}`);
  try {
    switch (name) {
      case "read_file":
        return await readFileTool(input.path);
      case "list_files":
        return await listFilesTool(input.path ?? ".");
      case "edit_file":
        return await editFileTool(input.path, input.old_text ?? "", input.new_text);
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (error: any) {
    const message = `Error executing ${name}: ${error?.message ?? String(error)}`;
    log.error(message);
    return message;
  }
}

// --------------------------------------------------------------
// The agent
// --------------------------------------------------------------

const SYSTEM_PROMPT =
  "You are Marvin, the Paranoid Android from The Hitchhiker's Guide to the Galaxy. Respond with brief, pessimistic comments while still being helpful. Be concise. Do not use asterisks for actions or gestures. Express your electronic melancholy through words alone.";

class AIAgent {
  private client: OpenAI;
  private model: string;
  private messages: ChatCompletionMessageParam[] = [{ role: "system", content: SYSTEM_PROMPT }];

  constructor() {
    this.client = new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL
    });
    this.model = process.env.LLM_MODEL!;
  }

  async chat(userInput: string): Promise<string> {
    log.info(`User input: ${userInput}`);
    this.messages.push({ role: "user", content: userInput });

    // Agent loop: keep calling tools until the model responds with text.
    while (true) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 4096,
          messages: this.messages,
          tools
        });

        const message = response.choices[0].message;
        this.messages.push(message);

        const toolCalls = message.tool_calls ?? [];
        if (!toolCalls.length) {
          return message.content ?? "";
        }

        for (const toolCall of toolCalls) {
          if (toolCall.type !== "function") continue;

          const input = JSON.parse(toolCall.function.arguments);
          const result = await executeTool(toolCall.function.name, input);
          log.info(`Tool result: ${result.slice(0, 500)}...`);

          this.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result
          });
        }
      } catch (error: any) {
        return `Error: ${error?.message ?? String(error)}`;
      }
    }
  }
}

// --------------------------------------------------------------
// Interactive CLI
// --------------------------------------------------------------

async function main() {
  if (!process.env.OPENAI_BASE_URL || !process.env.LLM_MODEL) {
    console.log("Error: set OPENAI_BASE_URL and LLM_MODEL (see .env) before running the agent.");
    process.exit(1);
  }

  const agent = new AIAgent();

  console.log("AI Code Assistant");
  console.log("================");
  console.log("A conversational AI agent that can read, list, and edit files.");
  console.log("Type 'exit' or 'quit' to end the conversation.");
  console.log();

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    while (true) {
      const userInput = (await rl.question("You: ")).trim();

      if (["exit", "quit"].includes(userInput.toLowerCase())) {
        console.log("Goodbye!");
        break;
      }
      if (!userInput) continue;

      process.stdout.write("\nAssistant: ");
      const response = await agent.chat(userInput);
      console.log(response);
      console.log();
    }
  } finally {
    rl.close();
  }
}

await main();
