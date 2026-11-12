/**
 * Curated fallback provider catalogue from streamly-update/provider.html.
 * Guarantees that even without an active TMDB API key or in offline tests,
 * every streaming provider page displays rich titles, counts, and artwork.
 */

export const CURATED_PROVIDER_TITLES = {
  // Netflix
  8: {
    movies: [
      { id: "tmdb-movie-361743", title: "Top Gun: Maverick", year: "2022", rating: "8.2", posterUrl: "https://image.tmdb.org/t/p/w500/n0YuM4f5lvGAP6MAW2kBIzugXnc.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/jALOpRgEjKLWn5ZD01pGecHdCNt.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-1514026", title: "Buddy", year: "2026", rating: "7.4", posterUrl: "https://image.tmdb.org/t/p/w500/fGRNCssTRrhYZxNzykGGCoMsAVq.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/fGRNCssTRrhYZxNzykGGCoMsAVq.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-1375441", title: "Primetime", year: "2026", rating: "7.1", posterUrl: "https://image.tmdb.org/t/p/w500/xE5tY3lppZUyG7WKKThsuYHuAHr.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/xE5tY3lppZUyG7WKKThsuYHuAHr.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-155", title: "The Dark Knight", year: "2008", rating: "8.5", posterUrl: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/qJ2tW6WMUDux911r6m7haRef0WH.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-244786", title: "Whiplash", year: "2014", rating: "8.4", posterUrl: "https://image.tmdb.org/t/p/w500/7fn624j5lj3xTme2SgiLCeuedmO.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/7fn624j5lj3xTme2SgiLCeuedmO.jpg", mediaType: "movie", media_type: "movie" },
    ],
    series: [
      { id: "tmdb-tv-1396", title: "Breaking Bad", year: "2008", rating: "9.0", posterUrl: "https://image.tmdb.org/t/p/w500/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg", mediaType: "tv", media_type: "tv" },
      { id: "tmdb-tv-2190", title: "South Park", year: "1997", rating: "8.3", posterUrl: "https://image.tmdb.org/t/p/w500/k7n2EVge7G77eMr3brztRGG1fFU.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/k7n2EVge7G77eMr3brztRGG1fFU.jpg", mediaType: "tv", media_type: "tv" },
      { id: "tmdb-tv-78191", title: "You", year: "2018", rating: "8.0", posterUrl: "https://image.tmdb.org/t/p/w500/oANi0vEE92nuijiZQgPZ88FSxqQ.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/oANi0vEE92nuijiZQgPZ88FSxqQ.jpg", mediaType: "tv", media_type: "tv" },
      { id: "tmdb-tv-34307", title: "Shameless", year: "2011", rating: "8.2", posterUrl: "https://image.tmdb.org/t/p/w500/Yi3WVT6hOkPahOwwvmLmif1jhs.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/Yi3WVT6hOkPahOwwvmLmif1jhs.jpg", mediaType: "tv", media_type: "tv" },
      { id: "tmdb-tv-68716", title: "Marvel's Inhumans", year: "2017", rating: "5.8", posterUrl: "https://image.tmdb.org/t/p/w500/zKfGip55oJ9tdzhyd9ayGyFFhuo.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/zKfGip55oJ9tdzhyd9ayGyFFhuo.jpg", mediaType: "tv", media_type: "tv" },
    ],
  },
  // Prime Video
  9: {
    movies: [
      { id: "tmdb-movie-1538497", title: "Hexed", year: "2026", rating: "7.2", posterUrl: "https://image.tmdb.org/t/p/w500/gZfQ5bhbxUnsaURCiIsiCHrRtmX.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/gZfQ5bhbxUnsaURCiIsiCHrRtmX.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-1128204", title: "Feed", year: "2026", rating: "7.0", posterUrl: "https://image.tmdb.org/t/p/w500/snFM00mpNAfUzUtkdEW0uDEvXA0.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/snFM00mpNAfUzUtkdEW0uDEvXA0.jpg", mediaType: "movie", media_type: "movie" },
    ],
    series: [
      { id: "tmdb-tv-108978", title: "Reacher", year: "2022", rating: "8.4", posterUrl: "https://image.tmdb.org/t/p/w500/xbp1pmJ8k6ldUHL8rJaceVSOWjk.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/xbp1pmJ8k6ldUHL8rJaceVSOWjk.jpg", mediaType: "tv", media_type: "tv" },
      { id: "tmdb-tv-84773", title: "The Lord of the Rings: The Rings of Power", year: "2022", rating: "7.2", posterUrl: "https://image.tmdb.org/t/p/w500/bMXWXKM9ydUmMTNvDnYo9QtCBRt.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/achmETPRJZc9QVXsMPgHwYEyNar.jpg", mediaType: "tv", media_type: "tv" },
      { id: "tmdb-tv-95057", title: "Superman & Lois", year: "2021", rating: "8.0", posterUrl: "https://image.tmdb.org/t/p/w500/vlv1gn98GqMnKHLSh0dNciqGfBl.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/vlv1gn98GqMnKHLSh0dNciqGfBl.jpg", mediaType: "tv", media_type: "tv" },
    ],
  },
  // Disney Plus
  337: {
    movies: [
      { id: "tmdb-movie-891621", title: "Wild Horse Nine", year: "2026", rating: "8.1", posterUrl: "https://image.tmdb.org/t/p/w500/dNJFRtVg3xLQ7dbNIQ55cmmIniD.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/dNJFRtVg3xLQ7dbNIQ55cmmIniD.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-496243", title: "Parasite", year: "2019", rating: "8.5", posterUrl: "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-399055", title: "The Shape of Water", year: "2017", rating: "7.2", posterUrl: "https://image.tmdb.org/t/p/w500/9zfwPffUXpBrEP26yp0q1ckXDcj.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/9zfwPffUXpBrEP26yp0q1ckXDcj.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-354912", title: "Coco", year: "2017", rating: "8.2", posterUrl: "https://image.tmdb.org/t/p/w500/6Ryitt95xrO8KXuqRGm1fUuNwqF.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/cy09IbbXk1gcpD1PqYLQeRVIhE6.jpg", mediaType: "movie", media_type: "movie" },
    ],
    series: [
      { id: "tmdb-tv-84958", title: "Loki", year: "2021", rating: "8.2", posterUrl: "https://image.tmdb.org/t/p/w500/kEl2t3OhXc3Zb9FBh1AuYzRTgZp.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/kEl2t3OhXc3Zb9FBh1AuYzRTgZp.jpg", mediaType: "tv", media_type: "tv" },
      { id: "tmdb-tv-85271", title: "WandaVision", year: "2021", rating: "8.2", posterUrl: "https://image.tmdb.org/t/p/w500/ijWWwINc8h71NQ8j1LTJMFSj5wr.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/ijWWwINc8h71NQ8j1LTJMFSj5wr.jpg", mediaType: "tv", media_type: "tv" },
      { id: "tmdb-tv-88396", title: "The Falcon and the Winter Soldier", year: "2021", rating: "7.6", posterUrl: "https://image.tmdb.org/t/p/w500/6kbAMLteGO8yyewYau6bJ683sw7.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/6kbAMLteGO8yyewYau6bJ683sw7.jpg", mediaType: "tv", media_type: "tv" },
      { id: "tmdb-tv-138502", title: "X-Men '97", year: "2024", rating: "8.7", posterUrl: "https://image.tmdb.org/t/p/w500/2HKBc5UiFw8JrruHq8S1Y7TnlW0.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/2HKBc5UiFw8JrruHq8S1Y7TnlW0.jpg", mediaType: "tv", media_type: "tv" },
    ],
  },
  // Apple TV+
  350: {
    movies: [
      { id: "tmdb-movie-1300968", title: "The Hunger Games: Sunrise on the Reaping", year: "2026", rating: "8.0", posterUrl: "https://image.tmdb.org/t/p/w500/j1MNyNNgNQL6f27cb3m3uKaPKd6.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/j1MNyNNgNQL6f27cb3m3uKaPKd6.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-1286656", title: "I Play Rocky", year: "2026", rating: "8.7", posterUrl: "https://image.tmdb.org/t/p/w500/xE5tY3lppZUyG7WKKThsuYHuAHr.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/xE5tY3lppZUyG7WKKThsuYHuAHr.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-776503", title: "CODA", year: "2021", rating: "7.9", posterUrl: "https://image.tmdb.org/t/p/w500/BzVjmm8l23rPsijLiNLUzuQtyd.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/BzVjmm8l23rPsijLiNLUzuQtyd.jpg", mediaType: "movie", media_type: "movie" },
    ],
    series: [
      { id: "tmdb-tv-213375", title: "VisionQuest", year: "2026", rating: "8.4", posterUrl: "https://image.tmdb.org/t/p/w500/WGyAyBPncfuu8MZhLY9RtfZPM0.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/WGyAyBPncfuu8MZhLY9RtfZPM0.jpg", mediaType: "tv", media_type: "tv" },
      { id: "tmdb-tv-1400", title: "Seinfeld", year: "1989", rating: "8.2", posterUrl: "https://image.tmdb.org/t/p/w500/aCw8ONfyz3AhngVQa1E2Ss4KSUQ.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/aCw8ONfyz3AhngVQa1E2Ss4KSUQ.jpg", mediaType: "tv", media_type: "tv" },
    ],
  },
  // Hulu
  15: {
    movies: [
      { id: "tmdb-movie-98", title: "Gladiator", year: "2000", rating: "8.2", posterUrl: "https://image.tmdb.org/t/p/w500/aDb548BOkFfI4nFm0kx8A3Ezh7H.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/aDb548BOkFfI4nFm0kx8A3Ezh7H.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-1064213", title: "Anora", year: "2024", rating: "7.1", posterUrl: "https://image.tmdb.org/t/p/w500/cgXk2tNYhJZLXdBDO5DidAVzQ82.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/cgXk2tNYhJZLXdBDO5DidAVzQ82.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-1437511", title: "How to Rob a Bank", year: "2026", rating: "8.5", posterUrl: "https://image.tmdb.org/t/p/w500/ifYDZkr2qkHFz87TNVvlxajOxl5.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/ifYDZkr2qkHFz87TNVvlxajOxl5.jpg", mediaType: "movie", media_type: "movie" },
    ],
    series: [
      { id: "tmdb-tv-69629", title: "The Gifted", year: "2017", rating: "7.6", posterUrl: "https://image.tmdb.org/t/p/w500/nshCqszjTNuqhrB53vrSqWO18sE.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/nshCqszjTNuqhrB53vrSqWO18sE.jpg", mediaType: "tv", media_type: "tv" },
      { id: "tmdb-tv-138501", title: "Agatha All Along", year: "2024", rating: "7.4", posterUrl: "https://image.tmdb.org/t/p/w500/mGsxKwXUjojitRv2E9qMTbxbBRd.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/mGsxKwXUjojitRv2E9qMTbxbBRd.jpg", mediaType: "tv", media_type: "tv" },
      { id: "tmdb-tv-63333", title: "The Last Kingdom", year: "2015", rating: "8.3", posterUrl: "https://image.tmdb.org/t/p/w500/8eJf0hxgIhE6QSxbtuNCekTddy1.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/8eJf0hxgIhE6QSxbtuNCekTddy1.jpg", mediaType: "tv", media_type: "tv" },
    ],
  },
  // HBO Max
  1899: {
    movies: [
      { id: "tmdb-movie-872585", title: "Oppenheimer", year: "2023", rating: "8.0", posterUrl: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-1381071", title: "Godzilla Minus Zero", year: "2026", rating: "7.8", posterUrl: "https://image.tmdb.org/t/p/w500/hSmIJluOJmTWvJs4d7kHRxjc8s8.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/hSmIJluOJmTWvJs4d7kHRxjc8s8.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-1400940", title: "Clayface", year: "2026", rating: "7.4", posterUrl: "https://image.tmdb.org/t/p/w500/9l1NuFjel2j89hiuiJbsxfblqjy.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/9l1NuFjel2j89hiuiJbsxfblqjy.jpg", mediaType: "movie", media_type: "movie" },
    ],
    series: [
      { id: "tmdb-tv-44217", title: "Vikings", year: "2013", rating: "8.1", posterUrl: "https://image.tmdb.org/t/p/w500/bQLrHIRNEkE3PdIWQrZHynQZazu.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/bQLrHIRNEkE3PdIWQrZHynQZazu.jpg", mediaType: "tv", media_type: "tv" },
      { id: "tmdb-tv-1416", title: "Grey's Anatomy", year: "2005", rating: "8.2", posterUrl: "https://image.tmdb.org/t/p/w500/gO8Fo47KV1opiutRDdBS5jclTQB.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/gO8Fo47KV1opiutRDdBS5jclTQB.jpg", mediaType: "tv", media_type: "tv" },
    ],
  },
  // Paramount Plus
  2303: {
    movies: [
      { id: "tmdb-movie-687163", title: "Project Hail Mary", year: "2026", rating: "8.6", posterUrl: "https://image.tmdb.org/t/p/w500/iOb2fjXLbpJgyQXe46n1WtGCnaa.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/iOb2fjXLbpJgyQXe46n1WtGCnaa.jpg", mediaType: "movie", media_type: "movie" },
      { id: "tmdb-movie-1311031", title: "Demon Slayer: Kimetsu no Yaiba Infinity Castle", year: "2025", rating: "8.8", posterUrl: "https://image.tmdb.org/t/p/w500/fWVSwgjpT2D78VUh6X8UBd2rorW.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/fWVSwgjpT2D78VUh6X8UBd2rorW.jpg", mediaType: "movie", media_type: "movie" },
    ],
    series: [
      { id: "tmdb-tv-259909", title: "Dexter: Resurrection", year: "2025", rating: "8.5", posterUrl: "https://image.tmdb.org/t/p/w500/o2Oyi3boT100bY5kCP4MBiTeetO.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/o2Oyi3boT100bY5kCP4MBiTeetO.jpg", mediaType: "tv", media_type: "tv" },
      { id: "tmdb-tv-279246", title: "The Remarried Empress", year: "2026", rating: "8.4", posterUrl: "https://image.tmdb.org/t/p/w500/zn3IXZzGavH3qle3o3g1r32eXDy.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/zn3IXZzGavH3qle3o3g1r32eXDy.jpg", mediaType: "tv", media_type: "tv" },
    ],
  },
};
