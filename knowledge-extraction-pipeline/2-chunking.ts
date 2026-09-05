import { log } from "../util/logger.js";
import { chunkSource } from "./util/docling-hybrid-chunker.js";

const chunks = await chunkSource("https://arxiv.org/pdf/2408.09869", {
  max_tokens: null,
  merge_peers: true
});

log.info(`Produced ${chunks.length} chunks.`);
log.info(chunks[0]?.text ?? "");
