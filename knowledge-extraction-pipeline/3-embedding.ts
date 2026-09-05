import { config } from "dotenv";
import OpenAI from "openai";
import { QdrantClient } from "@qdrant/js-client-rest";

import { log } from "../util/logger.js";
import { chunkSource } from "./util/docling-hybrid-chunker.js";

config();

const COLLECTION = "docling";

const openai = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY
});

const client = new QdrantClient({ url: process.env.QDRANT_BASE_URL });

const chunks = await chunkSource("https://arxiv.org/pdf/2408.09869", {
  max_tokens: null,
  merge_peers: true
});

log.info(`Produced ${chunks.length} chunks.`);

// Qdrant stores vectors you provide, so embed the chunk text first.
const embedResponse = await openai.embeddings.create({
  model: process.env.EMBD_MODEL!,
  input: chunks.map((chunk) => chunk.text),
  // Force float arrays; the SDK otherwise returns base64-encoded vectors.
  encoding_format: "float"
});

const embeddings = embedResponse.data.map((item) => item.embedding as number[]);
const vectorSize = embeddings[0]?.length ?? 0;
log.info(`Embedded ${embeddings.length} chunks (dim: ${vectorSize}).`);

if (vectorSize === 0 || embeddings[0].every((value) => value === 0)) {
  throw new Error(
    "Embeddings look invalid (empty or all-zero). Check EMBD_MODEL and that the endpoint returns float vectors."
  );
}

await client.recreateCollection(COLLECTION, {
  vectors: { size: vectorSize, distance: "Cosine" }
});

const points = chunks.map((chunk, index) => ({
  id: index,
  vector: embeddings[index],
  payload: {
    text: chunk.text,
    metadata: {
      filename: chunk.filename ?? null,
      pageNumbers: chunk.page_numbers?.length ? chunk.page_numbers : null,
      title: chunk.headings?.length ? chunk.headings[0] : null
    }
  }
}));

await client.upsert(COLLECTION, { wait: true, points });

const { count } = await client.count(COLLECTION, { exact: true });
log.info(`Upserted ${count} points into "${COLLECTION}".`);
