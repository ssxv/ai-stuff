import { config } from "dotenv";

config();

// Document conversion via a local Docling Serve instance
// (POST /v1/convert/source). Base URL is set via DOCLING_BASE_URL.

/**
 * Per-format content fields are only populated for the formats you
 * request via `to_formats`, so they're all optional.
 */
export type DoclingDocument = {
  filename?: string;
  md_content?: string | null;
  json_content?: unknown;
  html_content?: string | null;
  text_content?: string | null;
  doctags_content?: string | null;
  doclang_content?: string | null;
};

export type ConversionStatus = "pending" | "started" | "success" | "partial_success" | "failure";

/** Docling's per-document quality confidence report. */
export type ConfidenceReport = {
  parse_score?: number;
  layout_score?: number;
  table_score?: number;
  ocr_score?: number;
  mean_score?: number;
  low_score?: number;
  mean_grade?: string;
  low_grade?: string;
};

export type ConvertResponse = {
  document: DoclingDocument;
  status: ConversionStatus;
  errors?: unknown[];
  processing_time?: number;
  timings?: Record<string, unknown>;
  confidence?: ConfidenceReport;
};

export type ConvertOptions = {
  to_formats?: string[];
  [key: string]: unknown;
};

/**
 * A source to convert. Either an `http` source (fetched by URL) or a
 * `file` source (a base64-encoded document uploaded inline).
 */
export type HttpSource = {
  kind?: "http";
  url: string;
  headers?: Record<string, string>;
};

export type FileSource = {
  kind: "file";
  base64_string: string;
  filename: string;
};

export type Source = HttpSource | FileSource;

// --------------------------------------------------------------
// Convert one or more sources
// --------------------------------------------------------------

async function convert(sources: Source[], options: ConvertOptions): Promise<DoclingDocument> {
  const response = await fetch(`${process.env.DOCLING_BASE_URL}/v1/convert/source`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ options, sources })
  });

  if (!response.ok) {
    throw new Error(`Docling convert failed (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as ConvertResponse;
  return data.document;
}

/** Convert a document fetched from an HTTP URL. */
export async function convertSource(
  url: string,
  options: ConvertOptions = { to_formats: ["md", "json"] }
): Promise<DoclingDocument> {
  return convert([{ kind: "http", url }], options);
}

/** Convert a document supplied inline as a base64-encoded file. */
export async function convertFile(
  base64String: string,
  filename: string,
  options: ConvertOptions = { to_formats: ["md", "json"] }
): Promise<DoclingDocument> {
  return convert([{ kind: "file", base64_string: base64String, filename }], options);
}
