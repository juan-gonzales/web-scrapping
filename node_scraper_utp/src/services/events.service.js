import { createEventQuery, getEventsQuery } from '../db/queries/events.queries.js';

export const listEvents = async () => getEventsQuery();

export const createEvent = async () => createEventQuery();
