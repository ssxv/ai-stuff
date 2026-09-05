import { config } from "dotenv";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod.js";
import { z } from "zod";

import { log } from "../shared/logger.js";

config();

const client = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL
});

const model = process.env.LLM_MODEL!;

// --------------------------------------------------------------
// Use case: write a blog post about a topic.
//
// The orchestrator can't know up front how many sections the post
// needs or what they should be — that depends on the topic. So it
// dynamically plans the sections, delegates each to a worker LLM
// (in parallel), then a synthesizer stitches them into one post.
// --------------------------------------------------------------

// --------------------------------------------------------------
// Step 1: Define the data models
// --------------------------------------------------------------

/** A single section the orchestrator decides the post should contain */
const SectionPlan = z.object({
  title: z.string().describe("Title of the section"),
  description: z.string().describe("What this section should cover and why it belongs")
});
type SectionPlan = z.infer<typeof SectionPlan>;

/** Orchestrator LLM call: break the topic into sections */
const WritingPlan = z.object({
  audience: z.string().describe("Who this post is written for"),
  sections: z.array(SectionPlan).describe("Ordered list of sections to write")
});
type WritingPlan = z.infer<typeof WritingPlan>;

/** Worker LLM call: the written content for one section */
const SectionContent = z.object({
  title: z.string().describe("Title of the section"),
  content: z.string().describe("The written prose for this section")
});
type SectionContent = z.infer<typeof SectionContent>;

// --------------------------------------------------------------
// Step 2: Orchestrator - plan the sections
// --------------------------------------------------------------

/** Orchestrator LLM call to dynamically break the topic into sections */
async function planPost(topic: string): Promise<WritingPlan> {
  log.info("Orchestrator: planning post sections");

  const completion = await client.chat.completions.parse({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an editor planning a short blog post. Break the topic into a small set of focused sections (2-4). Determine the target audience and, for each section, give a title and a short description of what it should cover."
      },
      { role: "user", content: `Plan a blog post about: ${topic}` }
    ],
    response_format: zodResponseFormat(WritingPlan, "writing_plan")
  });

  const result = completion.choices[0].message.parsed!;
  log.info(
    `Orchestrator planned ${result.sections.length} sections for audience: ${result.audience}`
  );
  return result;
}

// --------------------------------------------------------------
// Step 3: Worker - write a single section
// --------------------------------------------------------------

/** Worker LLM call to write one section of the post */
async function writeSection(
  topic: string,
  audience: string,
  section: SectionPlan
): Promise<SectionContent> {
  log.info(`Worker: writing section "${section.title}"`);

  const completion = await client.chat.completions.parse({
    model,
    messages: [
      {
        role: "system",
        content: `You are writing one section of a blog post for this audience: ${audience}. Write clear, engaging prose (2-3 short paragraphs). Do not repeat the section title in the body.`
      },
      {
        role: "user",
        content: `Blog post topic: ${topic}\n\nSection title: ${section.title}\nSection should cover: ${section.description}`
      }
    ],
    response_format: zodResponseFormat(SectionContent, "section_content")
  });

  return completion.choices[0].message.parsed!;
}

// --------------------------------------------------------------
// Step 4: Synthesizer - combine sections into a final post
// --------------------------------------------------------------

/** Synthesizer LLM call to combine sections into a cohesive post */
async function synthesizePost(topic: string, sections: SectionContent[]): Promise<string> {
  log.info("Synthesizer: combining sections into final post");

  const draft = sections.map((section) => `## ${section.title}\n\n${section.content}`).join("\n\n");

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an editor. Combine the given sections into one cohesive blog post. Add a short title and a one-line intro, smooth the transitions between sections, and remove any repetition. Return the post as markdown."
      },
      { role: "user", content: `Topic: ${topic}\n\nSections:\n\n${draft}` }
    ]
  });

  return completion.choices[0].message.content ?? "";
}

// --------------------------------------------------------------
// Step 5: Orchestrate the whole workflow
// --------------------------------------------------------------

/** Main function implementing the orchestrator-workers workflow */
async function writeBlogPost(topic: string): Promise<string> {
  log.info(`Processing blog post request: ${topic}`);

  // Orchestrator: decide the sections dynamically
  const plan = await planPost(topic);

  // Workers: write each section in parallel
  const sections = await Promise.all(
    plan.sections.map((section) => writeSection(topic, plan.audience, section))
  );

  // Synthesizer: stitch the sections into a final post
  const post = await synthesizePost(topic, sections);
  log.info("Blog post completed successfully");
  return post;
}

// --------------------------------------------------------------
// Step 6: Run an example
// --------------------------------------------------------------
const topic = "Why small teams should care about observability";
const post = await writeBlogPost(topic);
log.info(`Final post:\n\n${post}`);
