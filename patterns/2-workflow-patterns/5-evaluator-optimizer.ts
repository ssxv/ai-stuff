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
// Use case: write a short joke that clears a quality bar.
//
// A generator LLM writes a joke on a topic. An evaluator LLM scores
// it against clear criteria (on-topic, actually funny, clean) and
// either passes it or returns specific feedback. The generator
// revises using that feedback, looping until it passes or we hit a
// max-iterations cap.
// --------------------------------------------------------------

const MAX_ITERATIONS = 3;

// --------------------------------------------------------------
// Step 1: Define the data models
// --------------------------------------------------------------

/** Generator LLM call: a joke attempt */
const Joke = z.object({
  joke: z.string().describe("The joke text"),
  reasoning: z.string().describe("Brief note on how feedback was addressed, if any")
});
type Joke = z.infer<typeof Joke>;

/** Evaluator LLM call: verdict on a joke */
const Evaluation = z.object({
  passed: z.boolean().describe("Whether the joke meets all the criteria"),
  score: z.number().describe("Overall quality score between 0 and 1"),
  feedback: z.string().describe("Specific, actionable feedback for improvement. Empty if passed.")
});
type Evaluation = z.infer<typeof Evaluation>;

// --------------------------------------------------------------
// Step 2: Generator - write (or revise) a joke
// --------------------------------------------------------------

/** Generator LLM call to write a joke, optionally revising from feedback */
async function generateJoke(topic: string, feedback?: string): Promise<Joke> {
  const isRevision = Boolean(feedback);
  log.info(
    isRevision ? "Generator: revising joke from feedback" : "Generator: writing initial joke"
  );

  const userContent = isRevision
    ? `Topic: ${topic}\n\nYour previous joke needs work. Revise it based on this feedback:\n${feedback}`
    : `Write a short, original joke about: ${topic}`;

  const completion = await client.chat.completions.parse({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a comedy writer. Write a single short joke (1-2 lines). It must be on-topic, genuinely funny, and clean (no offensive content)."
      },
      { role: "user", content: userContent }
    ],
    response_format: zodResponseFormat(Joke, "joke")
  });

  return completion.choices[0].message.parsed!;
}

// --------------------------------------------------------------
// Step 3: Evaluator - score the joke against the criteria
// --------------------------------------------------------------

/** Evaluator LLM call to judge a joke against clear criteria */
async function evaluateJoke(topic: string, joke: string): Promise<Evaluation> {
  log.info("Evaluator: scoring joke");

  const completion = await client.chat.completions.parse({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a strict comedy editor. Judge the joke on three criteria: it is on-topic, it is genuinely funny, and it is clean. Pass it only if all three hold. If it fails, give specific, actionable feedback the writer can use to improve it."
      },
      { role: "user", content: `Topic: ${topic}\n\nJoke: ${joke}` }
    ],
    response_format: zodResponseFormat(Evaluation, "evaluation")
  });

  const result = completion.choices[0].message.parsed!;
  log.info(`Evaluator verdict - passed: ${result.passed}, score: ${result.score.toFixed(2)}`);
  return result;
}

// --------------------------------------------------------------
// Step 4: The evaluator-optimizer loop
// --------------------------------------------------------------

/** Main function implementing the generate → evaluate → refine loop */
async function writeJoke(topic: string): Promise<Joke> {
  log.info(`Processing joke request: ${topic}`);

  let feedback: string | undefined;
  let joke = await generateJoke(topic);

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const evaluation = await evaluateJoke(topic, joke.joke);

    if (evaluation.passed) {
      log.info(`Joke passed on iteration ${iteration}`);
      return joke;
    }

    if (iteration === MAX_ITERATIONS) {
      log.warning(`Max iterations reached without passing. Returning best effort.`);
      return joke;
    }

    // Optimize: feed the evaluator's feedback back into the generator
    feedback = evaluation.feedback;
    log.info(`Refining with feedback: ${feedback}`);
    joke = await generateJoke(topic, feedback);
  }

  return joke;
}

// --------------------------------------------------------------
// Step 5: Run an example
// --------------------------------------------------------------
const topic = "software engineers and coffee";
const result = await writeJoke(topic);
log.info(`Final joke: ${result.joke}`);
