import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bookmark,
  X,
  Search,
  Check,
  Trash2,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppAuth } from "../context/auth";
import { useToast } from "../components/Toast.jsx";
import { useConfirmDialog } from "../components/ConfirmDialog.jsx";
import MovieCard from "../components/MovieCard";
import Chip from "../components/Chip";
import AmbientBackground from "../components/AmbientBackground";
import ErrorBoundary from "../components/ErrorBoundary";
import ContentPageHeader from "../components/ContentPageHeader";
import { CdnImageAdapter } from "../api/cdnImageAdapter";

/* ── Create / Rename dialog ─────────────────────────────────────────────── */
function CollectionNameDialog({ open, title, initial = "", submitLabel, onSubmit, onClose }) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setValue(initial);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, initial]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSubmit(value.trim());
  };

  return (
    <div className="collection-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="collection-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="collection-dialog__header">
          <h2 className="collection-dialog__title">{title}</h2>
          <button
            type="button"
            className="collection-dialog__close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="collection-dialog__form">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Collection name"
            aria-label="Collection name"
            maxLength={60}
            className="collection-dialog__input"
          />
          <div className="collection-dialog__actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Add-titles picker (from My List) ───────────────────────────────────── */
function AddTitlesDialog({ open, candidates, assignedIds, onConfirm, onClose }) {
  const [checked, setChecked] = useState(() => new Set());
  useEffect(() => setChecked(new Set()), [open]);

  if (!open) return null;
  const available = candidates.filter((m) => !assignedIds.has(m.id));

  const toggleChecked = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="collection-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="collection-dialog collection-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-label="Add titles to collection"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="collection-dialog__header">
          <h2 className="collection-dialog__title">Add titles</h2>
          <button
            type="button"
            className="collection-dialog__close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="collection-add__list">
          {available.length === 0 ? (
            <p className="collection-add__empty">
              Everything from your list is already in this collection.
            </p>
          ) : (
            available.map((m) => {
              const label = m.title || "Untitled";
              return (
                <button
                  type="button"
                  key={m.id}
                  className="collection-add__row"
                  aria-pressed={checked.has(m.id)}
                  onClick={() => toggleChecked(m.id)}
                >
                  <span className="collection-add__check">
                    {checked.has(m.id) && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="collection-add__title">{label}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="collection-dialog__actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={checked.size === 0}
            onClick={() => {
              onConfirm(Array.from(checked));
              setChecked(new Set());
            }}
          >
            Add {checked.size > 0 ? `(${checked.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Collection picker: add/remove ONE title from ANY collection ────────── */
function CollectionPickerDialog({ open, movie, collections, onToggle, onCreateWithItems, onClose }) {
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setShowCreate(false);
      setCreateName("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open || !movie) return null;

  const submitCreate = (e) => {
    e.preventDefault();
    if (!createName.trim()) return;
    onCreateWithItems(createName.trim(), [movie.id]);
    setShowCreate(false);
    setCreateName("");
  };

  return (
    <div className="collection-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="collection-dialog collection-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-label={`Add "${movie.title}" to a collection`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="collection-dialog__header">
          <h2 className="collection-dialog__title">Add to collection</h2>
          <button
            type="button"
            className="collection-dialog__close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="collection-add__hint">
          Pick a folder for "{movie.title}" — tick to add, untick to remove.
        </p>
        <div className="collection-add__list">
          {collections.length === 0 ? (
            <p className="collection-add__empty">No collections yet — create one below.</p>
          ) : (
            collections.map((collection) => {
              const active = (collection.itemIds || []).includes(movie.id);
              return (
                <button
                  type="button"
                  key={collection.id}
                  className="collection-add__row"
                  aria-pressed={active}
                  onClick={() => onToggle(collection.id, movie.id)}
                >
                  <span className="collection-add__check">
                    {active && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="collection-add__title">{collection.name}</span>
                  <span className="collection-add__meta">
                    {collection.itemIds.length} {collection.itemIds.length === 1 ? "title" : "titles"}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <form onSubmit={submitCreate} className="collection-dialog__form">
          {showCreate ? (
            <>
              <input
                ref={inputRef}
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="New collection name"
                aria-label="New collection name"
                maxLength={60}
                className="collection-dialog__input"
              />
              <div className="collection-dialog__actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!createName.trim()}>
                  Create &amp; add
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="collection-add__create" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> New collection
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

/* ── Collection folder card: 2×2 cover collage mining the saved list ────── */
function CollectionCard({ collection, items, onOpen, onRename, onDelete }) {
  const hasItems = collection.itemIds.length > 0;
  const posters = (collection.itemIds || [])
    .map((id) => items.find((m) => m.id === id))
    .filter(Boolean)
    .slice(0, 4);

  return (
    <div
      className="collection-card"
      role="button"
      tabIndex={0}
      aria-label={`Open collection ${collection.name}`}
      onClick={() => onOpen(collection)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(collection);
        }
      }}
    >
      <div className="collection-card__collage">
        {hasItems && posters.length > 0 ? (
          <div className="collection-card__collage-grid">
            {[0, 1, 2, 3].map((slot) => {
              const poster = posters[slot];
              return poster?.posterUrl || poster?.backdropUrl ? (
                <img
                  key={slot}
                  className="collection-card__poster"
                  src={CdnImageAdapter.getUrl(
                    poster?.posterUrl || poster?.backdropUrl,
                    "w185",
                  )}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <div key={slot} className="collection-card__poster collection-card__poster--empty" />
              );
            })}
          </div>
        ) : (
          <div className="collection-card__empty">
            <FolderOpen size={40} strokeWidth={1.4} />
          </div>
        )}
        <div className="collection-card__shade" />
      </div>

      <div className="collection-card__meta">
        <div className="collection-card__name-row">
          <span className="collection-card__name">{collection.name}</span>
          <span className="collection-card__count">
            {collection.itemIds.length} {collection.itemIds.length === 1 ? "title" : "titles"}
          </span>
        </div>
        <div className="collection-card__actions">
          <button
            type="button"
            className="collection-card__action"
            aria-label={`Rename collection ${collection.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onRename(collection);
            }}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className="collection-card__action collection-card__action--danger"
            aria-label={`Delete collection ${collection.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(collection);
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const navigate = useNavigate();
  const {
    myList,
    toggleMyList,
    removeBatchFromMyList,
    collections,
    createCollection,
    createCollectionWithItems,
    renameCollection,
    deleteCollection,
    addToCollection,
    removeFromCollection,
    toggleInCollection,
  } = useAppAuth();
  const { toast } = useToast();
  const { confirmDialog, ConfirmDialogRenderer } = useConfirmDialog();

  const [filterType, setFilterType] = useState("All");
  const [sortBy, setSortBy] = useState("Date Added");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  /* Collection view state */
  const [activeCollectionId, setActiveCollectionId] = useState(null);
  const [nameDialog, setNameDialog] = useState(null); // { mode, collection } | null
  const [addTitlesOpen, setAddTitlesOpen] = useState(false);
  const [pickerMovie, setPickerMovie] = useState(null);

  const activeCollection = useMemo(
    () => collections.find((c) => c.id === activeCollectionId) || null,
    [collections, activeCollectionId],
  );

  /* An index of collection membership for fast lookups on cards. */
  const collectionForTitle = useMemo(() => {
    const map = new Map();
    for (const col of collections) {
      for (const id of col.itemIds || []) map.set(id, col.id);
    }
    return map;
  }, [collections]);

  const collectionItems = useMemo(() => {
    if (!activeCollection) return [];
    const ids = new Set(activeCollection.itemIds || []);
    return myList.filter((m) => ids.has(m.id));
  }, [activeCollection, myList]);

  const filteredAndSortedList = useMemo(() => {
    let list = [...(activeCollection ? collectionItems : myList || [])];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((m) => m.title?.toLowerCase().includes(q));
    }

    if (filterType === "Movies") list = list.filter((m) => !m.isSeries);
    else if (filterType === "TV Shows") list = list.filter((m) => m.isSeries);

    if (sortBy === "Title A–Z") {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "Rating") {
      list.sort((a, b) => (b.imdbRating || 0) - (a.imdbRating || 0));
    }
    if (sortBy === "Date Added") {
      list.reverse();
    }
    return list;
  }, [myList, activeCollection, collectionItems, filterType, sortBy, searchQuery]);

  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    setVisibleCount(20);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [filterType, sortBy, searchQuery, activeCollectionId]);

  useEffect(() => {
    let inThrottle;
    const handleScroll = () => {
      if (!inThrottle) {
        if (
          window.innerHeight + window.scrollY >=
          document.body.offsetHeight - 800
        ) {
          setVisibleCount((prev) =>
            Math.min(prev + 20, filteredAndSortedList.length),
          );
        }
        inThrottle = true;
        setTimeout(() => (inThrottle = false), 200);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [filteredAndSortedList.length]);

  const visibleResults = filteredAndSortedList.slice(0, visibleCount);

  const handleRemove = (e, movie) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMyList(movie);
    toast({
      title: "Removed from List",
      message: `"${movie.title}" was removed.`,
      type: "info",
      duration: 2500,
    });
  };

  /* ── Collection actions ─────────────────────────────────────────────── */
  const handleCreate = (name) => {
    const id = createCollection(name);
    setNameDialog(null);
    if (id) {
      toast({ title: "Collection Created", message: `"${name}" is ready for titles.`, type: "success", duration: 2500 });
      setActiveCollectionId(id);
    }
  };

  /* Per-card picker: toggle membership of one title across any collection. */
  const confirmPickerCreate = (name, movieId) => {
    const id = createCollectionWithItems(name, [movieId]);
    toast({
      title: "Collection Created",
      message: `"${name}" created with 1 title.`,
      type: "success",
      duration: 2500,
    });
    return id;
  };

  const handleRename = (name) => {
    if (!nameDialog?.collection) return;
    renameCollection(nameDialog.collection.id, name);
    setNameDialog(null);
    toast({ title: "Collection Renamed", message: `Now "${name}".`, type: "info", duration: 2500 });
  };

  const confirmDelete = async (collection) => {
    const ok = await confirmDialog({
      title: "Delete Collection?",
      message: `"${collection.name}" will be removed. The titles stay in your My List.`,
      confirmLabel: "Delete Collection",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    deleteCollection(collection.id);
    if (activeCollectionId === collection.id) setActiveCollectionId(null);
    toast({ title: "Collection Deleted", message: `"${collection.name}" was removed.`, type: "info", duration: 2500 });
  };

  const confirmAdd = (ids) => {
    if (!activeCollection) return;
    addToCollection(activeCollection.id, ids);
    setAddTitlesOpen(false);
    toast({
      title: "Added to Collection",
      message: `${ids.length} title${ids.length > 1 ? "s" : ""} added to "${activeCollection.name}".`,
      type: "success",
      duration: 2500,
    });
  };

  const handleRemoveFromCollection = (e, movie) => {
    if (!activeCollection) return;
    e.preventDefault();
    e.stopPropagation();
    removeFromCollection(activeCollection.id, movie.id);
    toast({
      title: "Removed from Collection",
      message: `"${movie.title}" left "${activeCollection.name}".`,
      type: "info",
      duration: 2500,
    });
  };

  const toggleSelectCard = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredAndSortedList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedList.map((m) => m.id)));
    }
  };

  const handleBatchDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (removeBatchFromMyList) {
      removeBatchFromMyList(ids);
    } else {
      ids.forEach((id) => {
        const item = myList.find((m) => m.id === id);
        if (item) toggleMyList(item);
      });
    }
    toast({
      title: "Items Removed",
      message: `Removed ${ids.length} item${ids.length > 1 ? "s" : ""} from your list.`,
      type: "info",
      duration: 2500,
    });
    setSelectedIds(new Set());
    setIsSelectMode(false);
  };

  const inCollectionView = Boolean(activeCollection);
  const assignedIds = useMemo(
    () => new Set(activeCollection?.itemIds || []),
    [activeCollection],
  );

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      {/* Ambient background — same banner-at-the-time gradient blur as the
          movies/series browse pages. */}
      <AmbientBackground
        src={visibleResults[0]?.backdropUrl || visibleResults[0]?.posterUrl || visibleResults[0]?.poster || myList[0]?.backdropUrl || myList[0]?.posterUrl}
      />
      {/* Cinematic fade to black behind the header — identical to Genre/Category */}
      <div
        style={{
          position: "absolute",
          top: "10vh",
          left: 0,
          width: "100%",
          height: "30vh",
          background: "linear-gradient(to bottom, transparent, #000)",
          zIndex: -1,
        }}
      />
      <div className="main-content content-page content-page--library">
        <div className="content-page__inner">
          <ContentPageHeader
            eyebrow={inCollectionView ? "Collection" : "Your library"}
            title={inCollectionView ? activeCollection.name : "My List"}
            description={
              inCollectionView
                ? `${activeCollection.itemIds.length} saved title${activeCollection.itemIds.length === 1 ? "" : "s"} · curated by you.`
                : "Keep the next great watch close at hand."
            }
            count={inCollectionView ? activeCollection.itemIds.length : myList.length}
            onBack={inCollectionView ? () => setActiveCollectionId(null) : undefined}
            backLabel={inCollectionView ? "All My List" : "Back"}
            actions={
              (inCollectionView ? activeCollection.itemIds.length > 0 : myList.length > 0) && (
                <div className="filter-controls">
                  {!inCollectionView && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ borderRadius: "999px", padding: "5px 14px", fontSize: "0.78rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}
                      onClick={() => setNameDialog({ mode: "create", collection: null })}
                    >
                      <FolderPlus size={14} />
                      New Collection
                    </button>
                  )}
                  {inCollectionView && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ borderRadius: "999px", padding: "5px 14px", fontSize: "0.78rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}
                      onClick={() => setAddTitlesOpen(true)}
                    >
                      <Plus size={14} />
                      Add Titles
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSelectMode((v) => !v);
                      setSelectedIds(new Set());
                    }}
                    style={{
                      background: isSelectMode ? "rgba(var(--accent-primary-rgb), 0.2)" : "rgba(255,255,255,0.06)",
                      border: isSelectMode ? "1px solid rgba(var(--accent-primary-rgb), 0.4)" : "1px solid rgba(255,255,255,0.1)",
                      color: isSelectMode ? "var(--accent-primary, #60a5fa)" : "#fff",
                      borderRadius: "999px",
                      padding: "5px 14px",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {isSelectMode ? "Cancel" : "Select"}
                  </button>
                  <div className="filter-group" aria-label="Filter My List by type">
                    {["All", "Movies", "TV Shows"].map((f) => (
                      <Chip key={f} active={filterType === f} onClick={() => setFilterType(f)}>
                        {f}
                      </Chip>
                    ))}
                  </div>
                  <div className="filter-group filter-group--quiet" aria-label="Sort My List">
                    {[
                      { label: "Date Added", value: "Date Added" },
                      { label: "A – Z", value: "Title A–Z" },
                      { label: "Top Rated", value: "Rating" },
                    ].map((opt) => (
                      <Chip
                        key={opt.value}
                        size="sm"
                        active={sortBy === opt.value}
                        onClick={() => setSortBy(opt.value)}
                      >
                        {opt.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              )
            }
          />

          {!inCollectionView && collections.length > 0 && (
            <section className="collections-rail" aria-label="My collections">
              <div className="collections-rail__grid">
                {collections.map((collection) => (
                  <CollectionCard
                    key={collection.id}
                    collection={collection}
                    items={myList}
                    onOpen={(c) => setActiveCollectionId(c.id)}
                    onRename={(c) => setNameDialog({ mode: "rename", collection: c })}
                    onDelete={(c) => confirmDelete(c)}
                  />
                ))}
              </div>
            </section>
          )}

          {!inCollectionView && collections.length === 0 && myList.length > 0 && (
            <p className="collections-empty-hint">
              <FolderPlus size={16} /> Group your saved titles into named collections.
            </p>
          )}

          {(inCollectionView ? activeCollection.itemIds.length > 0 : myList.length > 0) && (
            <div style={{ position: "relative", marginBottom: "1.25rem", maxWidth: "340px" }}>
              <Search
                size={15}
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "rgba(255,255,255,0.4)",
                  pointerEvents: "none",
                }}
              />
              <input
                type="text"
                placeholder={inCollectionView ? "Search this collection..." : "Search your list..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 32px 8px 34px",
                  borderRadius: "100px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "#fff",
                  fontSize: "0.82rem",
                  outline: "none",
                  transition: "border-color 0.2s, background 0.2s",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "rgba(var(--accent-primary-rgb), 0.5)";
                  e.target.style.background = "rgba(255, 255, 255, 0.08)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(255, 255, 255, 0.1)";
                  e.target.style.background = "rgba(255, 255, 255, 0.05)";
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                  }}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {myList.length === 0 || (inCollectionView && activeCollection.itemIds.length === 0) ? (
            <motion.div
              className="collection-empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                {inCollectionView ? (
                  <FolderOpen size={56} style={{ opacity: 0.2, marginBottom: "1.5rem" }} />
                ) : (
                  <Bookmark size={56} style={{ opacity: 0.2, marginBottom: "1.5rem" }} />
                )}
              </motion.div>
              {inCollectionView ? (
                <>
                  <h2>This collection is empty</h2>
                  <p>Add some of your saved titles to start filling "{activeCollection.name}".</p>
                  <div className="collection-empty__hint">
                    <p>
                      Tap <span className="collection-empty__key">Add Titles</span> to pick from your list.
                    </p>
                  </div>
                  <motion.button
                    onClick={() => setAddTitlesOpen(true)}
                    className="btn btn-primary"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Plus size={16} /> Add Titles
                  </motion.button>
                </>
              ) : (
                <>
                  <h2>Your list is empty</h2>
                  <p>Add movies and series to your list to save them for later.</p>
                  <div className="collection-empty__hint">
                    <p>
                      Browse any title and tap{" "}
                      <span className="collection-empty__key">＋</span>{" "}
                      to save it here.
                    </p>
                  </div>
                  <motion.button
                    onClick={() => navigate("/")}
                    className="btn btn-primary"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Discover Content
                  </motion.button>
                </>
              )}
            </motion.div>
          ) : filteredAndSortedList.length === 0 ? (
            <motion.div
              className="content-page__notice"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {searchQuery
                ? `No saved titles match "${searchQuery}".`
                : "No items match this filter."}
            </motion.div>
          ) : (
            <ErrorBoundary>
              <div className="movie-grid" style={{ marginTop: "1rem" }}>
                <AnimatePresence>
                  {visibleResults.map((movie, idx) => {
                    const isSelected = selectedIds.has(movie.id);
                    const inCollection = collectionForTitle.get(movie.id);
                    return (
                      <motion.div
                        key={movie.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{
                          opacity: 0,
                          scale: 0.85,
                          transition: { duration: 0.2 },
                        }}
                        transition={{
                          duration: 0.4,
                          delay: (idx % 20) * 0.04,
                          ease: "easeOut",
                        }}
                        onClick={
                          isSelectMode ? () => toggleSelectCard(movie.id) : undefined
                        }
                        style={{
                          position: "relative",
                          cursor: isSelectMode ? "pointer" : "default",
                          borderRadius: "16px",
                          outline:
                            isSelectMode && isSelected
                              ? "2px solid var(--accent-primary, #60a5fa)"
                              : "none",
                          outlineOffset: "3px",
                          transition: "outline 0.15s ease",
                        }}
                      >
                        <MovieCard movie={movie} />

                        {isSelectMode ? (
                          <div
                            style={{
                              position: "absolute",
                              top: "10px",
                              left: "10px",
                              zIndex: 10,
                              width: "24px",
                              height: "24px",
                              borderRadius: "50%",
                              background: isSelected
                                ? "var(--accent-primary, #3b82f6)"
                                : "rgba(0,0,0,0.6)",
                              border: isSelected
                                ? "none"
                                : "2px solid rgba(255,255,255,0.7)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                              transition: "all 0.2s",
                            }}
                          >
                            {isSelected && (
                              <Check size={14} color="#fff" strokeWidth={3} />
                            )}
                          </div>
                        ) : inCollectionView ? (
                          <motion.button
                            className="card-remove-button"
                            onClick={(e) => handleRemoveFromCollection(e, movie)}
                            title="Remove from Collection"
                            aria-label={`Remove ${movie.title} from this collection`}
                          >
                            <X size={14} />
                          </motion.button>
                        ) : (
                          <>
                            <motion.button
                              className="card-add-collection-button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setPickerMovie(movie);
                              }}
                              title="Add to / remove from collection"
                              aria-label={`Add ${movie.title} to a collection`}
                            >
                              <FolderPlus size={14} />
                            </motion.button>
                            {inCollection && (
                              <span
                                className="card-collection-badge"
                                title={`In "${collections.find((c) => c.id === inCollection)?.name || "collection"}"`}
                              >
                                <FolderOpen size={11} />
                              </span>
                            )}
                            <motion.button
                              className="card-remove-button"
                              onClick={(e) => handleRemove(e, movie)}
                              title="Remove from List"
                              aria-label={`Remove ${movie.title} from My List`}
                            >
                              <X size={14} />
                            </motion.button>
                          </>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </ErrorBoundary>
          )}

          {isSelectMode && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 30 }}
                style={{
                  position: "fixed",
                  bottom: "calc(var(--mobile-nav-height, 64px) + 16px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 100,
                  background: "rgba(18, 18, 22, 0.92)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "999px",
                  padding: "8px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.6)",
                  maxWidth: "92vw",
                }}
              >
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "none",
                    color: "#e4e4e7",
                    padding: "5px 12px",
                    borderRadius: "999px",
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {selectedIds.size === filteredAndSortedList.length ? "Deselect All" : "Select All"}
                </button>
                <button
                  type="button"
                  disabled={selectedIds.size === 0}
                  onClick={handleBatchDelete}
                  style={{
                    background: selectedIds.size > 0 ? "rgba(239, 68, 68, 0.95)" : "rgba(255,255,255,0.06)",
                    border: "none",
                    color: selectedIds.size > 0 ? "#fff" : "rgba(255,255,255,0.3)",
                    padding: "5px 14px",
                    borderRadius: "999px",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: selectedIds.size > 0 ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Trash2 size={13} />
                  Delete ({selectedIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectMode(false);
                    setSelectedIds(new Set());
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.5)",
                    padding: "4px 8px",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Done
                </button>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      <CollectionNameDialog
        open={Boolean(nameDialog)}
        title={nameDialog?.mode === "create" ? "Create Collection" : "Rename Collection"}
        initial={nameDialog?.mode === "rename" ? nameDialog.collection?.name || "" : ""}
        submitLabel={nameDialog?.mode === "create" ? "Create" : "Rename"}
        onSubmit={nameDialog?.mode === "create" ? handleCreate : handleRename}
        onClose={() => setNameDialog(null)}
      />

      <AddTitlesDialog
        open={addTitlesOpen && Boolean(activeCollection)}
        candidates={myList}
        assignedIds={assignedIds}
        onConfirm={confirmAdd}
        onClose={() => setAddTitlesOpen(false)}
      />

      <CollectionPickerDialog
        open={Boolean(pickerMovie)}
        movie={pickerMovie}
        collections={collections}
        onToggle={toggleInCollection}
        onCreateWithItems={(name) => confirmPickerCreate(name, pickerMovie?.id)}
        onClose={() => setPickerMovie(null)}
      />

      <ConfirmDialogRenderer />
    </div>
  );
}