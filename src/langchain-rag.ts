/**
 * LangChain RAG (Retrieval Augmented Generation) Example
 *
 * RAG is the most common LangChain pattern. It works like this:
 * 1. Split documents into chunks
 * 2. Embed chunks into vectors and store them
 * 3. At query time, find relevant chunks via similarity search
 * 4. Pass those chunks as context to the LLM
 *
 * This example uses an in-memory vector store (no external DB needed).
 */

import { config } from "dotenv";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Document } from "@langchain/core/documents";
import { RunnableSequence } from "@langchain/core/runnables";

config();

// --- Setup model and embeddings ---
const model = new ChatOpenAI({
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.LLM_MODEL
});

// Embeddings model turns text into vectors.
// Note: Your provider must support an embeddings endpoint.
// If using a local model, you may need a separate embeddings model.
const embeddings = new OpenAIEmbeddings({
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.EMBD_MODEL
});

// --- Simulate a knowledge base ---
// In real apps, you'd load PDFs, web pages, databases, etc.
const documents = [
  new Document({
    pageContent:
      "LangChain is a framework for developing applications powered by large language models. It provides tools for prompt management, chains, agents, and retrieval.",
    metadata: { source: "langchain-docs" }
  }),
  new Document({
    pageContent:
      "LCEL (LangChain Expression Language) uses the pipe operator to compose runnables. A chain like prompt.pipe(model).pipe(parser) processes data through each step sequentially.",
    metadata: { source: "langchain-docs" }
  }),
  new Document({
    pageContent:
      "Agents in LangChain can use tools to interact with external systems. They decide which tools to call based on the user's input and the tool descriptions provided.",
    metadata: { source: "langchain-docs" }
  }),
  new Document({
    pageContent:
      "Vector stores hold embedded document chunks and support similarity search. When a query comes in, it's embedded and compared against stored vectors to find relevant context.",
    metadata: { source: "langchain-docs" }
  }),
  new Document({
    pageContent:
      "Memory in LangChain allows conversations to maintain context across multiple turns. Common types include buffer memory (stores full history) and summary memory (stores a compressed summary).",
    metadata: { source: "langchain-docs" }
  })
];

// --- Create vector store and index documents ---
console.log("Indexing documents into vector store...");
const vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings);
console.log(`Indexed ${documents.length} documents.\n`);

// --- Build the RAG chain ---
const retriever = vectorStore.asRetriever({ k: 2 }); // retrieve top 2 relevant docs

const ragPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a helpful assistant. Answer the question based ONLY on the following context. If the context doesn't contain the answer, say "I don't have enough information to answer that."

Context:
{context}`
  ],
  ["human", "{question}"]
]);

// Helper to format retrieved documents into a single string
function formatDocs(docs: Document[]): string {
  return docs.map((doc) => doc.pageContent).join("\n\n");
}

// The RAG chain:
// 1. Takes a question
// 2. Retrieves relevant docs
// 3. Formats them into context
// 4. Passes context + question to the LLM
const ragChain = RunnableSequence.from([
  {
    context: async (input: { question: string }) => {
      const docs = await retriever.invoke(input.question);
      console.log(
        `Retrieved ${docs.length} docs for: "${input.question}"`,
        docs.map((d) => d.metadata.source)
      );
      return formatDocs(docs);
    },
    question: (input: { question: string }) => input.question
  },
  ragPrompt,
  model,
  new StringOutputParser()
]);

// --- Run queries ---
console.log("=== RAG Query 1 ===");
const answer1 = await ragChain.invoke({
  question: "What is LCEL and how does it work?"
});
console.log(answer1);
console.log();

console.log("=== RAG Query 2 ===");
const answer2 = await ragChain.invoke({
  question: "How do agents use tools in LangChain?"
});
console.log(answer2);
console.log();

console.log("=== RAG Query 3 (out of scope) ===");
const answer3 = await ragChain.invoke({
  question: "What is the capital of France?"
});
console.log(answer3);
