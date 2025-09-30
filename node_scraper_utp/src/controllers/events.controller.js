import { createEvent, listEvents } from '../services/events.service.js';

export const getEvents = async (req, res, next) => {
  try {
    const events = await listEvents();
    res.json(events);
  } catch (error) {
    next(error);
  }
};

export const postEvent = async (req, res, next) => {
  try {
    const event = await createEvent();
    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
};
