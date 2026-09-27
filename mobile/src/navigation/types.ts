export type RootStackParamList = {
  Tabs: undefined;
  Details: { id: string; title: string };
  Player: {
    id: string;
    title: string;
    type: "movie" | "tv";
    season: number | null;
    episode: number | null;
    startPosition: number;
    /* The AIRED episode numbers of the current season, so the player can step
     * prev/next through real episodes (and auto-advance) instead of guessing
     * episode+1 into an unaired or absent one. */
    episodeNumbers?: number[] | null;
  };
};

export type TabParamList = {
  Home: undefined;
  Search: undefined;
  Library: undefined;
  Settings: undefined;
};
