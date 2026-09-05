import { log } from "../util/logger.js";
import { convertSource } from "./util/docling-document-converter.js";

const doc = await convertSource("https://arxiv.org/pdf/2408.09869");

log.info(doc.md_content ?? "");
