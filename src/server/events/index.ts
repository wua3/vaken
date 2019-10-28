import ical, { CalendarResponse, CalendarComponent, VEvent } from 'node-ical';
import { AuthenticationError, UserInputError } from 'apollo-server-express';
import { ObjectID } from 'mongodb';
import { EventUpdateInput, EventDbObject } from '../generated/graphql';
import { Models } from '../models';
import { EventUpdate } from '../../client/routes/events/ManageEventTypes';

const EVENTTYPE = 'VEVENT';

const filterByCalType = (
	objNames: (keyof CalendarResponse)[],
	cal: CalendarResponse,
	type: string
): string[] => {
	return objNames.filter(obj => cal[obj].type === type).map(key => `${key}`);
};

const filterCalByObjectNames = (
	objNames: (keyof CalendarResponse)[],
	cal: CalendarResponse
): CalendarComponent[] => {
	return objNames.map(key => cal[key]);
};

// Helper func to simplify VEvent type because it was overly obtuse and dramatically hindered mocks for testing
const extractVEventIntoRecord = (event: VEvent): Record<string, string> => {
	return {
		summary: event.summary,
		start: new Date(event.start as Date).toUTCString(),
		end: new Date(event.end as Date).toUTCString(),
		location: event.location,
		description: event.description,
		uid: event.uid,
	};
};

export const transformCalEventToDBUpdate = (event: Record<string, string>): EventUpdate => {
	if (!event.start || !event.end)
		throw new AuthenticationError('Calendar event did not contain start or end timestamp');
	const parsedStart = new Date(event.start);
	const parsedEnd = new Date(event.end);
	const parsedType = /\[(.*?)\]/.exec(event.summary); // Looks for a **single** [Event Type] tag in name
	return {
		name: event.summary.replace(/\s*\[(.*?)\]\s*/, ''), // Removes the [Event Type] tag in name
		startTimestamp: event.start,
		duration: Math.floor((parsedEnd.getTime() - parsedStart.getTime()) / (1000 * 60)),
		description: event.description,
		location: event.location,
		eventType: parsedType != null ? parsedType[1] : '',
		gcalID: event.uid,
	} as EventUpdate;
};

export async function pullCalendar(calendarID: string | undefined): Promise<EventUpdate[] | null> {
	if (calendarID) {
		const url = `https://www.google.com/calendar/ical/${calendarID}/public/basic.ics`;
		const cal = await ical.fromURL(url).catch(err => {
			throw new Error(`Could not fetch calendar at URL: ${url}; Error: ${err.message}`);
		});
		const calKeys = Object.keys(cal);
		const eventsKeys = filterByCalType(calKeys, cal, EVENTTYPE);
		const eventsObjects = filterCalByObjectNames(eventsKeys, cal) as VEvent[];
		if (eventsObjects.length === 0) return null;
		const eventsTransformed = eventsObjects.map((event: VEvent) =>
			transformCalEventToDBUpdate(extractVEventIntoRecord(event))
		);
		return eventsTransformed;
	}
	throw new UserInputError('Calendar ID undefined or null');
}

/**
 * @param eventInput Object using EventUpdateInput Input type to define what needs to be updated
 * @returns Event name in a promise
 */
export async function addOrUpdateEvent(
	eventInput: EventUpdateInput,
	models: Models
): Promise<EventDbObject> {
	if (!eventInput.id && !eventInput.gcalID)
		throw new Error('Event update request must contain either its database ID or GCal uid');
	// Create a temp db object using input to keep param header clean (Can't pass in EventDbObject)
	const eventDiffObj = {
		_id: eventInput.id ? new ObjectID(eventInput.id) : new ObjectID(), // Use ID to search if requested update contains it, else assume no ID
		attendees: [],
		checkins: [],
		warnRepeatedCheckins: false,
		name: eventInput.name,
		startTimestamp: new Date(eventInput.startTimestamp),
		duration: eventInput.duration,
		description: eventInput.description,
		location: eventInput.location,
		eventType: eventInput.eventType,
		gcalID: eventInput.gcalID,
	} as EventDbObject;
	const { value, lastErrorObject, ok } = await models.Events.findOneAndUpdate(
		eventDiffObj.gcalID ? { gcalID: eventDiffObj.gcalID } : { _id: eventDiffObj._id },
		{
			$set: {
				name: eventDiffObj.name,
				startTimestamp: eventDiffObj.startTimestamp,
				duration: eventDiffObj.duration,
				description: eventDiffObj.description,
				location: eventDiffObj.location,
				eventType: eventDiffObj.eventType,
			},
			$setOnInsert: {
				attendees: [],
				checkins: [],
				warnRepeatedCheckins: true,
			},
		},
		{
			returnOriginal: false,
			upsert: true,
		}
	);

	if (!value || !ok)
		throw new Error(
			`Event ${eventInput.name} <${value}> unsuccessful: ${JSON.stringify(lastErrorObject)}`
		);
	return value;
}