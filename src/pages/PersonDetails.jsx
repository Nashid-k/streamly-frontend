import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";
import MovieCard from "../components/MovieCard";
import { normalizeMovieSource } from "../api/platformAdapter";

export default function PersonDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bioExpanded, setBioExpanded] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const { data: person, isLoading: loading } = useQuery({
    queryKey: ["person", id],
    queryFn: () => movieService.getPersonDetails(id),
    enabled: !!id,
  });

  if (loading) {
    return (
      <div className="main-content" style={{ padding: "0 3rem", position: "relative" }}>
        {/* Blurred backdrop preview — mirrors the real blurred profile bg */}
        <div
          className="skeleton skeleton-glow"
          style={{
            position: "absolute", top: 0, left: 0,
            width: "100%", height: "60vh",
            borderRadius: 0, filter: "blur(60px)",
            opacity: 0.35, zIndex: 0,
          }}
        />

        {/* Navigation Breadcrumb */}
        <div style={{ position: "relative", zIndex: 1, marginBottom: "2rem" }}>
          <div
            className="skeleton"
            style={{ width: "80px", height: "36px", borderRadius: "100px" }}
          ></div>
        </div>

        {/* Profile + Info */}
        <div
          style={{
            position: "relative", zIndex: 1,
            display: "flex",
            gap: "3rem",
            flexWrap: "wrap",
            marginBottom: "4rem",
          }}
        >
          <div
            className="skeleton"
            style={{
              width: "min(300px, 80vw)",
              aspectRatio: "2/3",
              borderRadius: "1.25rem",
              flexShrink: 0,
            }}
          ></div>
          <div style={{ flex: 1, minWidth: "300px", paddingTop: "1rem" }}>
            <div
              className="skeleton skeleton-title"
              style={{ width: "45%", height: "3.5rem", marginBottom: "1.5rem" }}
            ></div>
            <div
              style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "2.5rem" }}
            >
              <div
                className="skeleton"
                style={{ width: "80px", height: "2rem", borderRadius: "8px" }}
              ></div>
              <div
                className="skeleton"
                style={{ width: "120px", height: "2rem", borderRadius: "8px" }}
              ></div>
              <div
                className="skeleton"
                style={{ width: "130px", height: "2rem", borderRadius: "8px" }}
              ></div>
            </div>
            <div
              className="skeleton"
              style={{ width: "120px", height: "1.4rem", borderRadius: "6px", marginBottom: "1rem" }}
            ></div>
            <div
              className="skeleton"
              style={{ width: "100%", height: "1.2rem", marginBottom: "0.8rem" }}
            ></div>
            <div
              className="skeleton"
              style={{ width: "95%", height: "1.2rem", marginBottom: "0.8rem" }}
            ></div>
            <div
              className="skeleton"
              style={{ width: "90%", height: "1.2rem", marginBottom: "0.8rem" }}
            ></div>
            <div
              className="skeleton"
              style={{ width: "80%", height: "1.2rem", marginBottom: "0.8rem" }}
            ></div>
          </div>
        </div>

        {/* Known For rail — mirrors topCredits horizontal rail */}
        <section style={{ position: "relative", zIndex: 1, marginBottom: "4rem" }}>
          <div className="section-header">
            <div className="skeleton" style={{ width: "140px", height: "1.6rem", borderRadius: "6px" }} />
          </div>
          <div style={{ display: "flex", gap: "1.5rem", marginTop: "1.5rem", overflow: "hidden" }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton-moviecard" style={{ width: "200px", flexShrink: 0 }}>
                <div className="skeleton sk-poster"></div>
                <div className="skeleton sk-line sk-line--w70"></div>
                <div className="skeleton sk-line sk-line--sub"></div>
              </div>
            ))}
          </div>
        </section>

        {/* Full Filmography grid — mirrors credits movie-grid */}
        <section style={{ position: "relative", zIndex: 1 }}>
          <div className="section-header">
            <div className="skeleton" style={{ width: "180px", height: "1.6rem", borderRadius: "6px" }} />
          </div>
          <div className="movie-grid" style={{ marginTop: "1.5rem" }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="skeleton-moviecard">
                <div className="skeleton sk-poster"></div>
                <div className="skeleton sk-line sk-line--w70"></div>
                <div className="skeleton sk-line sk-line--sub"></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (!person) {
    return (
      <div
        style={{ padding: "4rem 2rem", textAlign: "center", color: "#a1a1aa" }}
      >
        <h2>Actor not found</h2>
        <button
          className="btn btn-glass"
          onClick={() => navigate(-1)}
          style={{ marginTop: "1rem" }}
        >
          Go Back
        </button>
      </div>
    );
  }

  const topCredits = person.credits
    ? [...person.credits]
        .sort((a, b) => (b.imdbRating || 0) - (a.imdbRating || 0))
        .slice(0, 4)
    : [];

  return (
    <div style={{ position: "relative" }}>
      {/* Dynamic Blurred Background */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "60vh",
          backgroundImage: `url(${person.profileUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(80px) brightness(0.2)",
          zIndex: -1,
        }}
      ></div>

      {/* Navigation Breadcrumb */}
      <div style={{ marginBottom: "2rem" }}>
        <button
          onClick={() => navigate(-1)}
          className="btn btn-glass"
          style={{
            padding: "8px 16px",
            borderRadius: "100px",
            fontSize: "0.9rem",
          }}
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: "3rem",
          flexWrap: "wrap",
          marginBottom: "4rem",
        }}
      >
        {/* Profile Image */}
        <div style={{ flexShrink: 0 }}>
          {person.profileUrl ? (
            <img
              src={person.profileUrl}
              alt={person.name}
              loading="lazy"
              decoding="async"
              style={{
                width: "min(300px, 80vw)",
                aspectRatio: "2/3",
                objectFit: "cover",
                borderRadius: "1.25rem",
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.8)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
          ) : (
            <div
              style={{
                width: "min(300px, 80vw)",
                aspectRatio: "2/3",
                background: "#18181b",
                borderRadius: "1.25rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: "#a1a1aa" }}>No Image</span>
            </div>
          )}
        </div>

        {/* Person Info */}
        <div style={{ flex: 1, minWidth: "300px", paddingTop: "1rem" }}>
          <h1
            style={{
              fontSize: "clamp(2.5rem, 5vw, 4rem)",
              fontWeight: 800,
              margin: "0 0 1rem 0",
              letterSpacing: "-0.03em",
            }}
          >
            {person.name}
          </h1>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              marginBottom: "2rem",
              color: "#a1a1aa",
              fontWeight: 500,
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(255,255,255,0.05)",
                padding: "6px 12px",
                borderRadius: "8px",
              }}
            >
              {person.knownFor || "Acting"}
            </span>
            {person.birthday && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(255,255,255,0.05)",
                  padding: "6px 12px",
                  borderRadius: "8px",
                }}
              >
                <Calendar size={16} /> {person.birthday}
              </span>
            )}
            {person.placeOfBirth && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(255,255,255,0.05)",
                  padding: "6px 12px",
                  borderRadius: "8px",
                }}
              >
                <MapPin size={16} /> {person.placeOfBirth}
              </span>
            )}
          </div>

          {person.biography && (
            <div style={{ marginBottom: "2rem" }}>
              <h3
                style={{
                  fontSize: "1.2rem",
                  marginBottom: "1rem",
                  color: "#fff",
                }}
              >
                Biography
              </h3>
              <p
                style={{
                  color: "#d4d4d8",
                  lineHeight: 1.8,
                  fontSize: "1.05rem",
                  whiteSpace: "pre-line",
                }}
              >
                {person.biography.length > 500 && !bioExpanded
                  ? person.biography.substring(0, 500) + "..."
                  : person.biography}
              </p>
              {person.biography.length > 500 && (
                <button
                  onClick={() => setBioExpanded(!bioExpanded)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#fb923c",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.95rem",
                    marginTop: "0.5rem",
                    padding: 0,
                  }}
                >
                  {bioExpanded ? "Show less" : "Read more"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Top 4 Credits */}
      {topCredits.length > 0 && (
        <section style={{ marginBottom: "4rem" }}>
          <div className="section-header">
            <h2 className="section-title">Known For</h2>
          </div>
          <div
            style={{
              display: "flex",
              gap: "1.5rem",
              overflowX: "auto",
              paddingBottom: "1rem",
              marginTop: "1.5rem",
              scrollbarWidth: "none",
            }}
          >
            {topCredits.map((movie, idx) => (
              <motion.div
                key={`top-${movie.id}-${idx}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.4,
                  delay: idx * 0.08,
                  ease: "easeOut",
                }}
                style={{ width: "200px", flexShrink: 0 }}
              >
                <MovieCard
                  movie={normalizeMovieSource(movie)}
                />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Credits Grid */}
      {person.credits && person.credits.length > 4 && (
        <section>
          <div className="section-header">
            <h2 className="section-title">Full Filmography</h2>
          </div>
          <div className="movie-grid" style={{ marginTop: "1.5rem" }}>
            {person.credits.map((movie, idx) => (
              <motion.div
                key={`${movie.id}-${idx}`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.4,
                  delay: Math.min(idx * 0.04, 0.25),
                  ease: "easeOut",
                }}
              >
                <MovieCard
                  movie={normalizeMovieSource(movie)}
                />
              </motion.div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
