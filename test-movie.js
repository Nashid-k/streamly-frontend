import { movieService } from './src/api/movieService.js';
console.log("Fetching...");
movieService.getRecommendations('movie-271110').then(res => console.log("Success! " + res.length + " recommendations found.")).catch(e => console.error(e.message));
