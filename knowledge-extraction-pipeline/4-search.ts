import { config } from "dotenv";
import OpenAI from "openai";
import { QdrantClient } from "@qdrant/js-client-rest";

import { log } from "../util/logger.js";

config();

const COLLECTION = "docling";

const openai = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY
});

const client = new QdrantClient({ url: process.env.QDRANT_BASE_URL });

const query = "what's docling?";

// Embed the query with the same model used at ingest time.
const embedResponse = await openai.embeddings.create({
  model: process.env.EMBD_MODEL!,
  input: query,
  encoding_format: "float"
});

const queryVector = embedResponse.data[0].embedding as number[];

const results = await client.query(COLLECTION, {
  query: queryVector,
  limit: 3,
  with_payload: true
});

for (const [rank, hit] of results.points.entries()) {
  const payload = hit.payload as {
    text?: string;
    metadata?: { filename?: string; pageNumbers?: number[]; title?: string };
  };

  log.info(`#${rank + 1}  score=${hit.score.toFixed(4)}`);
  log.info(`title: ${payload.metadata?.title ?? "-"}`);
  log.info(`pages: ${payload.metadata?.pageNumbers?.join(", ") ?? "-"}`);
  log.info(payload.text ?? "");
}
