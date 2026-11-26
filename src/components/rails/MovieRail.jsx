import React from "react";

import HomeCard from "../home/HomeCard";
import HomeRail from "../home/HomeRail";

export { getRailScrollBehavior } from "../home/HomeRail";

/* Home's catalogue shelf. The canonical shell/card live under `home/`; this
   module stays as the narrow adapter the rest of the home feed imports. */
const MovieRail = React.memo(function MovieRail({ category, header, rowIndex = 0 }) {
  return (
    <HomeRail
      title={category.name}
      header={header}
      rowIndex={rowIndex}
      movies={category.movies}
      renderItem={(movie, index, detailToken) => (
        <HomeCard
          key={movie.id}
          movie={movie}
          index={index}
          detailToken={detailToken}
        />
      )}
    />
  );
});

export default MovieRail;
