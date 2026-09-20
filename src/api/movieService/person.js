import tmdb from '../tmdbClient';
import { logServiceError } from './core';
import { normalizeResult, isBrowsableTitle } from './normalize';

export const getPersonDetails = async (id) => {
  try {
    const [person, credits] = await Promise.all([
      tmdb(`/person/${id}`),
      tmdb(`/person/${id}/combined_credits`),
    ]);
  return {
    id: person.id,
    name: person.name,
    biography: person.biography,
    birthday: person.birthday,
    deathday: person.deathday,
    placeOfBirth: person.place_of_birth,
    profileUrl: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null,
    knownFor: person.known_for_department || null,
    knownForDepartment: person.known_for_department || null,
    credits: (credits.cast || [])
      .filter(isBrowsableTitle)
      .map((c) => normalizeResult({ ...c, media_type: c.media_type, roleDepartment: 'Acting' }))
      .slice(0, 50),
    castCredits: (credits.cast || [])
      .filter(isBrowsableTitle)
      .map((c) => normalizeResult({ ...c, media_type: c.media_type, roleDepartment: 'Acting' }))
      .slice(0, 40),
    crewCredits: (credits.crew || [])
      .filter(isBrowsableTitle)
      .map((c) => normalizeResult({ ...c, media_type: c.media_type, roleDepartment: c.department || 'Production' }))
      .slice(0, 40),
  };
  } catch (error) {
    logServiceError('getPersonDetails', error, { id });
    throw error;
  }
};