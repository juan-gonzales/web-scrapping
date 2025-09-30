import { getCoursesQuery, insertCourseQuery } from '../db/queries/courses.queries.js';

export const listCourses = async (filters = {}) => getCoursesQuery(filters);

export const createCourse = async (data) => insertCourseQuery(data);
