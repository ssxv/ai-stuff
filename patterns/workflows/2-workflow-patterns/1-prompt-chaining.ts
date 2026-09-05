import { config } from "dotenv";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod.js";
import { z } from "zod";
import { log } from "../shared/logger.js";

config();

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL
});

const model = process.env.LLM_MODEL!;

// --------------------------------------------------------------
// Step 1: Define the data models for each stage
// --------------------------------------------------------------

/** First LLM call: Extract basic event information */
const EventExtraction = z.object({
  description: z.string().describe("Raw description of the event"),
  is_calendar_event: z.boolean().describe("Whether this text describes a calendar event"),
  confidence_score: z.number().describe("Confidence score between 0 and 1")
});
type EventExtraction = z.infer<typeof EventExtraction>;

/** Second LLM call: Parse specific event details */
const EventDetails = z.object({
  name: z.string().describe("Name of the event"),
  date: z.string().describe("Date and time of the event. Use ISO 8601 to format this value."),
  duration_minutes: z.number().int().describe("Expected duration in minutes"),
  participants: z.array(z.string()).describe("List of participants")
});
type EventDetails = z.infer<typeof EventDetails>;

/** Third LLM call: Generate confirmation message */
const EventConfirmation = z.object({
  confirmation_message: z.string().describe("Natural language confirmation message"),
  calendar_link: z.string().nullable().describe("Generated calendar link if applicable")
});
type EventConfirmation = z.infer<typeof EventConfirmation>;

// --------------------------------------------------------------
// Step 2: Define the functions
// --------------------------------------------------------------

/** First LLM call to determine if input is a calendar event */
async function extractEventInfo(userInput: string): Promise<EventExtraction> {
  log.info("Starting event extraction analysis");
  log.debug(`Input text: ${userInput}`);

  const today = new Date();
  const dateContext = `Today is ${today.toDateString()}.`;

  const completion = await client.chat.completions.parse({
    model,
    messages: [
      {
        role: "system",
        content: `${dateContext} Analyze if the text describes a calendar event.`
      },
      { role: "user", content: userInput }
    ],
    response_format: zodResponseFormat(EventExtraction, "event_extraction")
  });

  const result = completion.choices[0].message.parsed!;
  log.info(
    `Extraction complete - Is calendar event: ${result.is_calendar_event}, Confidence: ${result.confidence_score.toFixed(2)}`
  );
  return result;
}

/** Second LLM call to extract specific event details */
async function parseEventDetails(description: string): Promise<EventDetails> {
  log.info("Starting event details parsing");

  const today = new Date();
  const dateContext = `Today is ${today.toDateString()}.`;

  const completion = await client.chat.completions.parse({
    model,
    messages: [
      {
        role: "system",
        content: `${dateContext} Extract detailed event information. When dates reference 'next Tuesday' or similar relative dates, use this current date as reference.`
      },
      { role: "user", content: description }
    ],
    response_format: zodResponseFormat(EventDetails, "event_details")
  });

  const result = completion.choices[0].message.parsed!;
  log.info(
    `Parsed event details - Name: ${result.name}, Date: ${result.date}, Duration: ${result.duration_minutes}min`
  );
  log.debug(`Participants: ${result.participants.join(", ")}`);
  return result;
}

/** Third LLM call to generate a confirmation message */
async function generateConfirmation(eventDetails: EventDetails): Promise<EventConfirmation> {
  log.info("Generating confirmation message");

  const completion = await client.chat.completions.parse({
    model,
    messages: [
      {
        role: "system",
        content:
          "Generate a natural confirmation message for the event. Sign of with your name; Susie"
      },
      { role: "user", content: JSON.stringify(eventDetails) }
    ],
    response_format: zodResponseFormat(EventConfirmation, "event_confirmation")
  });

  const result = completion.choices[0].message.parsed!;
  log.info("Confirmation message generated successfully");
  return result;
}

// --------------------------------------------------------------
// Step 3: Chain the functions together
// --------------------------------------------------------------

/** Main function implementing the prompt chain with gate check */
async function processCalendarRequest(userInput: string): Promise<EventConfirmation | null> {
  log.info("Processing calendar request");
  log.debug(`Raw input: ${userInput}`);

  // First LLM call: Extract basic info
  const initialExtraction = await extractEventInfo(userInput);

  // Gate check: Verify if it's a calendar event with sufficient confidence
  if (!initialExtraction.is_calendar_event || initialExtraction.confidence_score < 0.7) {
    log.warning(
      `Gate check failed - is_calendar_event: ${initialExtraction.is_calendar_event}, confidence: ${initialExtraction.confidence_score.toFixed(2)}`
    );
    return null;
  }

  log.info("Gate check passed, proceeding with event processing");

  // Second LLM call: Get detailed event information
  const eventDetails = await parseEventDetails(initialExtraction.description);

  // Third LLM call: Generate confirmation
  const confirmation = await generateConfirmation(eventDetails);
  log.info("Calendar request processing completed successfully");
  return confirmation;
}

// --------------------------------------------------------------
// Step 4: Test the chain with a valid input
// --------------------------------------------------------------
let userInput =
  "Let's schedule a 1h team meeting next Tuesday at 2pm with Alice and Bob to discuss the project roadmap.";
let result = await processCalendarRequest(userInput);

if (result) {
  console.log(`Confirmation: ${result.confirmation_message}`);
  if (result.calendar_link) {
    console.log(`Calendar Link: ${result.calendar_link}`);
  }
} else {
  console.log("This doesn't appear to be a calendar event request.");
}

// --------------------------------------------------------------
// Step 5: Test the chain with an invalid input
// --------------------------------------------------------------
userInput = "Can you send an email to Alice and Bob to discuss the project roadmap?";
result = await processCalendarRequest(userInput);

if (result) {
  console.log(`Confirmation: ${result.confirmation_message}`);
  if (result.calendar_link) {
    console.log(`Calendar Link: ${result.calendar_link}`);
  }
} else {
  console.log("This doesn't appear to be a calendar event request.");
}
