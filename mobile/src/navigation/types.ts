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
  };
};

export type TabParamList = {
  Home: undefined;
  Search: undefined;
  Library: undefined;
  Settings: undefined;
};
