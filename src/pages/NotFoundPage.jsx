import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Compass } from "lucide-react";
import SEO from "../components/SEO";
import AmbientBackground from "../components/AmbientBackground";
import EmptyState from "../components/EmptyState";
import SearchField from "../components/browse/SearchField";

/* Catch-all route. An unmatched <Routes> renders NOTHING, so a stale bookmark
   or a typo'd URL lands on a blank screen with no branding and no way out.
   This gives it the same ambient wash as the rest of the app, an honest 404,
   and the two things a lost visitor actually needs: a way back, and a way to
   search for whatever they were looking for. */
export default function NotFoundPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const goBack = () => {
    // A deep-linked 404 is often the FIRST history entry, where navigate(-1)
    // leaves the app entirely (or does nothing); fall back to Home.
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  const submit = (event) => {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  return (
    <div className="not-found">
      <AmbientBackground fallback />
      <SEO
        title="Page not found"
        description="The page you were looking for doesn't exist or has moved."
        noindex
      />
      <motion.div
        className="not-found__inner"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="not-found__code" aria-hidden="true">
          404
        </div>
        <EmptyState
          icon={<Compass size={36} strokeWidth={1.5} color="#52525b" />}
          title="This page is off the map"
          description="The link you followed is broken, or we couldn't find what you were looking for. Try a search, or head back home."
          actions={
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate("/")}
              >
                Go Home
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={goBack}
              >
                Go Back
              </button>
            </>
          }
        />
        <form className="not-found__search" role="search" onSubmit={submit}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search movies & TV shows"
          />
          <button type="submit" className="btn btn-glass">
            Search
          </button>
        </form>
      </motion.div>
    </div>
  );
}
