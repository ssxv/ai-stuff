import { config } from "dotenv";

import { log } from "../../util/logger.js";

config();

// Hybrid chunking via a local Docling Serve instance (POST /v1/chunk/hybrid/source).
// Chunking runs server-side; the client only sends chunker config.

// The `tokenizer` must be a HuggingFace model id the docling server can load
// (not an LM Studio or Ollama tag). Set it via CHUNK_TOKENIZER to align token
// counts with your embedding model. When unset, the server uses its default.
export const DEFAULT_TOKENIZER = process.env.CHUNK_TOKENIZER;

// --------------------------------------------------------------
// Types (subset of the Docling Serve chunking schema)
// --------------------------------------------------------------

export type HybridChunkerOptions = {
  chunker: "hybrid";
  tokenizer?: string;
  /** Max tokens per chunk. When null/omitted, taken from the tokenizer. */
  max_tokens?: number | null;
  /** Merge undersized successive chunks with the same headings. */
  merge_peers?: boolean;
  use_markdown_tables?: boolean;
  use_markdown_images?: boolean;
  image_placeholder?: string;
  /** Include both raw_text and contextualized text in the response. */
  include_raw_text?: boolean;
};

export type DocChunk = {
  filename?: string;
  chunk_index?: number;
  /** Contextualized chunk text (headings + content) */
  text: string;
  /** Raw chunk text, present when include_raw_text is true */
  raw_text?: string;
  num_tokens?: number;
  headings?: string[];
  captions?: string[];
  doc_items?: string[];
  page_numbers?: number[];
  metadata?: Record<string, unknown>;
};

/** The converted document(s) returned alongside the chunks. */
export type ChunkedDocument = {
  kind?: string;
  content?: {
    filename?: string;
    md_content?: string | null;
    json_content?: unknown;
    html_content?: string | null;
    text_content?: string | null;
    doctags_content?: string | null;
    doclang_content?: string | null;
  };
  status?: string;
  errors?: unknown[];
  timings?: Record<string, unknown>;
  confidence?: Record<string, unknown>;
};

export type ChunkResponse = {
  chunks: DocChunk[];
  documents?: ChunkedDocument[];
  processing_time?: number;
};

/** An `http` (fetched by URL) or `file` (base64 inline) source. */
export type HttpSource = { kind?: "http"; url: string; headers?: Record<string, string> };
export type FileSource = { kind: "file"; base64_string: string; filename: string };
export type Source = HttpSource | FileSource;

async function chunk(
  sources: Source[],
  options: Partial<HybridChunkerOptions>
): Promise<DocChunk[]> {
  const chunkingOptions: HybridChunkerOptions = {
    chunker: "hybrid",
    merge_peers: true,
    // Only send a tokenizer when explicitly configured; an unresolvable one
    // makes the server return zero chunks with a "success" status.
    ...(DEFAULT_TOKENIZER ? { tokenizer: DEFAULT_TOKENIZER } : {}),
    ...options
  };

  const response = await fetch(`${process.env.DOCLING_BASE_URL}/v1/chunk/hybrid/source`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chunking_options: chunkingOptions,
      sources
    })
  });

  if (!response.ok) {
    throw new Error(`Docling chunk failed (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as ChunkResponse;
  const chunks = data.chunks ?? [];

  // The server can return 0 chunks with a "success" status when the requested
  // tokenizer can't be loaded. Surface that instead of failing silently.
  if (chunks.length === 0) {
    log.warning(
      `chunking returned 0 chunks. If a tokenizer was set, make sure it's a HuggingFace id the server can load (CHUNK_TOKENIZER=${chunkingOptions.tokenizer ?? "<unset>"}).`
    );
  }

  return chunks;
}

/** Apply hybrid chunking to a document fetched from an HTTP URL. */
export async function chunkSource(
  url: string,
  options: Partial<HybridChunkerOptions> = {}
): Promise<DocChunk[]> {
  return chunk([{ kind: "http", url }], options);
}

/** Apply hybrid chunking to a document supplied inline as a base64 file. */
export async function chunkFile(
  base64String: string,
  filename: string,
  options: Partial<HybridChunkerOptions> = {}
): Promise<DocChunk[]> {
  return chunk([{ kind: "file", base64_string: base64String, filename }], options);
}
