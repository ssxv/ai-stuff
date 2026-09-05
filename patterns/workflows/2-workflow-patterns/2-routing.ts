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
// Step 1: Define the data models for routing and responses
// --------------------------------------------------------------

/** Router LLM call: Determine the type of calendar request */
const CalendarRequestType = z.object({
  request_type: z
    .enum(["new_event", "modify_event", "other"])
    .describe("Type of calendar request being made"),
  confidence_score: z.number().describe("Confidence score between 0 and 1"),
  description: z.string().describe("Cleaned description of the request")
});
type CalendarRequestType = z.infer<typeof CalendarRequestType>;

/** Details for creating a new event */
const NewEventDetails = z.object({
  name: z.string().describe("Name of the event"),
  date: z.string().describe("Date and time of the event (ISO 8601)"),
  duration_minutes: z.number().int().describe("Duration in minutes"),
  participants: z.array(z.string()).describe("List of participants")
});
type NewEventDetails = z.infer<typeof NewEventDetails>;

/** Details for changing an existing event */
const Change = z.object({
  field: z.string().describe("Field to change"),
  new_value: z.string().describe("New value for the field")
});

/** Details for modifying an existing event */
const ModifyEventDetails = z.object({
  event_identifier: z.string().describe("Description to identify the existing event"),
  changes: z.array(Change).describe("List of changes to make"),
  participants_to_add: z.array(z.string()).describe("New participants to add"),
  participants_to_remove: z.array(z.string()).describe("Participants to remove")
});
type ModifyEventDetails = z.infer<typeof ModifyEventDetails>;

/** Final response format */
const CalendarResponse = z.object({
  success: z.boolean().describe("Whether the operation was successful"),
  message: z.string().describe("User-friendly response message"),
  calendar_link: z.string().nullable().describe("Calendar link if applicable")
});
type CalendarResponse = z.infer<typeof CalendarResponse>;

// --------------------------------------------------------------
// Step 2: Define the routing and processing functions
// --------------------------------------------------------------

/** Router LLM call to determine the type of calendar request */
async function routeCalendarRequest(userInput: string): Promise<CalendarRequestType> {
  log.info("Routing calendar request");

  const completion = await client.chat.completions.parse({
    model,
    messages: [
      {
        role: "system",
        content:
          "Determine if this is a request to create a new calendar event or modify an existing one."
      },
      { role: "user", content: userInput }
    ],
    response_format: zodResponseFormat(CalendarRequestType, "calendar_request_type")
  });

  const result = completion.choices[0].message.parsed!;
  log.info(`Request routed as: ${result.request_type} with confidence: ${result.confidence_score}`);
  return result;
}

/** Process a new event request */
async function handleNewEvent(description: string): Promise<CalendarResponse> {
  log.info("Processing new event request");

  // Get event details
  const completion = await client.chat.completions.parse({
    model,
    messages: [
      {
        role: "system",
        content: "Extract details for creating a new calendar event."
      },
      { role: "user", content: description }
    ],
    response_format: zodResponseFormat(NewEventDetails, "new_event_details")
  });

  const details = completion.choices[0].message.parsed!;
  log.info(`New event: ${JSON.stringify(details, null, 2)}`);

  // Generate response
  return {
    success: true,
    message: `Created new event '${details.name}' for ${details.date} with ${details.participants.join(", ")}`,
    calendar_link: `calendar://new?event=${details.name}`
  };
}

/** Process an event modification request */
async function handleModifyEvent(description: string): Promise<CalendarResponse> {
  log.info("Processing event modification request");

  // Get modification details
  const completion = await client.chat.completions.parse({
    model,
    messages: [
      {
        role: "system",
        content: "Extract details for modifying an existing calendar event."
      },
      { role: "user", content: description }
    ],
    response_format: zodResponseFormat(ModifyEventDetails, "modify_event_details")
  });

  const details = completion.choices[0].message.parsed!;
  log.info(`Modified event: ${JSON.stringify(details, null, 2)}`);

  // Generate response
  return {
    success: true,
    message: `Modified event '${details.event_identifier}' with the requested changes`,
    calendar_link: `calendar://modify?event=${details.event_identifier}`
  };
}

/** Main function implementing the routing workflow */
async function processCalendarRequest(userInput: string): Promise<CalendarResponse | null> {
  log.info("Processing calendar request");

  // Route the request
  const routeResult = await routeCalendarRequest(userInput);

  // Check confidence threshold
  if (routeResult.confidence_score < 0.7) {
    log.warning(`Low confidence score: ${routeResult.confidence_score}`);
    return null;
  }

  // Route to appropriate handler
  if (routeResult.request_type === "new_event") {
    return handleNewEvent(routeResult.description);
  } else if (routeResult.request_type === "modify_event") {
    return handleModifyEvent(routeResult.description);
  } else {
    log.warning("Request type not supported");
    return null;
  }
}

// --------------------------------------------------------------
// Step 3: Test with new event
// --------------------------------------------------------------
const newEventInput = "Let's schedule a team meeting next Tuesday at 2pm with Alice and Bob";
let result = await processCalendarRequest(newEventInput);
if (result) {
  log.info(`Response: ${result.message}`);
}

// --------------------------------------------------------------
// Step 4: Test with modify event
// --------------------------------------------------------------
const modifyEventInput =
  "Can you move the team meeting with Alice and Bob to Wednesday at 3pm instead?";
result = await processCalendarRequest(modifyEventInput);
if (result) {
  log.info(`Response: ${result.message}`);
}

// --------------------------------------------------------------
// Step 5: Test with invalid request
// --------------------------------------------------------------
const invalidInput = "What's the weather like today?";
result = await processCalendarRequest(invalidInput);
if (!result) {
  log.info("Request not recognized as a calendar operation");
}
