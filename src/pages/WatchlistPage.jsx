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
  ChevronDown,
  ChevronLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppAuth } from "../context/auth";
import { useToast } from "../components/Toast.jsx";
import { useConfirmDialog } from "../components/ConfirmDialog.jsx";
import MovieCard from "../components/MovieCard";
import AmbientBackground from "../components/AmbientBackground";
import ErrorBoundary from "../components/ErrorBoundary";
import { CdnImageAdapter } from "../api/cdnImageAdapter";

/* ── Shared pill chrome (matching the movies/series discovery pages) ─────── */
const GHOST_PILL =
  "inline-flex items-center gap-2 px-4 md:px-5 py-2 md:py-2.5 rounded-full border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-all duration-300 text-sm font-medium backdrop-blur-md whitespace-nowrap";
const ACCENT_PILL =
  "inline-flex items-center gap-2 px-4 md:px-5 py-2 md:py-2.5 rounded-full border border-[#95ff50]/40 bg-[#95ff50]/10 text-[#95ff50] hover:bg-[#95ff50]/20 transition-all duration-300 text-sm font-semibold backdrop-blur-md whitespace-nowrap";

/* ── Filter pill — frosted capsule that drops a listbox panel ─────────────
   Mirrors DiscoveryPage's FilterPill so My List controls feel identical to
   the movies/series browse pages: same trigger, same menu shell, same
   click-outside / Escape dismissal. */
function FilterPill({ label, children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative filter-dropdown min-w-0 md:flex-none">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filter by ${label}`}
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center justify-between gap-2 w-full md:w-auto px-3 md:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 backdrop-blur-md min-w-0 md:min-w-[140px]"
      >
        <span className="truncate text-sm font-medium text-white/80">{label}</span>
        <ChevronDown
          size={14}
          className="w-4 h-4 shrink-0 text-white/50 group-hover:text-white transition-colors"
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="discovery-menu absolute top-[calc(100%+8px)] left-0 z-[70] w-64 max-h-80 overflow-y-auto rounded-2xl border border-white/10 bg-[#121217]/95 backdrop-blur-2xl shadow-2xl p-2"
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}

/* ── Menu row inside a filter panel ─────────────────────────────────────── */
function MenuItem({ label, selected, onSelect, icon }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
        selected ? "bg-[#95ff50]/[0.1] text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="flex items-center gap-2 shrink-0 ml-2">
        {icon}
        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />}
      </span>
    </button>
  );
}

/* ── Frosted capsule search field ───────────────────────────────────────── */
function SearchField({ value, onChange, placeholder }) {
  return (
    <div className="flex items-center gap-2 w-full md:w-64 px-3 md:px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-md transition-all duration-300 focus-within:border-[#95ff50]/40 min-w-0">
      <Search size={14} className="w-4 h-4 shrink-0 text-white/40" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full min-w-0 bg-transparent outline-none text-sm text-white/90 placeholder:text-white/35"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="shrink-0 text-white/50 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/* ── Action button styled as a discovery pill ───────────────────────────── */
function PillAction({ accent, onClick, children, ariaLabel, active }) {
  const cls = accent ? ACCENT_PILL : active ? ACCENT_PILL : GHOST_PILL;
  return (
    <button type="button" aria-label={ariaLabel} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

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

/* ── My List — redesigned on the movies/series discovery page language ──── */
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

  const hasItems = inCollectionView
    ? activeCollection.itemIds.length > 0
    : myList.length > 0;

  const hasMore = visibleCount < filteredAndSortedList.length;

  const sortOptions = [
    { label: "Date Added", value: "Date Added" },
    { label: "A – Z", value: "Title A–Z" },
    { label: "Top Rated", value: "Rating" },
  ];

  return (
    <div style={{ position: "relative" }}>
      {/* Ambient liquid backdrop from the first saved title */}
      <AmbientBackground
        src={visibleResults[0]?.backdropUrl || visibleResults[0]?.posterUrl || myList[0]?.backdropUrl || myList[0]?.posterUrl}
      />

      <div className="discovery-page relative z-10">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="relative mx-auto max-w-[1600px] pt-24 pb-8 px-4 md:px-10 lg:px-14">
          <div className="relative pt-12 pb-8 px-6 md:px-8 space-y-8">
            <div className="flex flex-col xl:flex-row gap-10 xl:gap-8 items-start xl:items-end justify-between">
              <div className="max-w-xl">
                {inCollectionView && (
                  <button
                    type="button"
                    onClick={() => setActiveCollectionId(null)}
                    className="group flex items-center gap-1.5 text-sm font-medium text-white/60 transition-colors mb-4 hover:text-white/90"
                  >
                    <ChevronLeft
                      size={15}
                      className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
                    />
                    All My List
                  </button>
                )}
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white drop-shadow-lg">
                  {inCollectionView ? activeCollection.name : "My List"}
                </h1>
                <p className="mt-3 text-lg text-white/70 font-medium leading-relaxed">
                  {inCollectionView
                    ? `${activeCollection.itemIds.length} saved title${activeCollection.itemIds.length === 1 ? "" : "s"} · curated by you.`
                    : `Keep the next great watch close at hand · ${myList.length} saved.`}
                </p>
              </div>

              {hasItems && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full xl:w-auto">
                  {/* Dropdown pills: Type / Sort / Collection */}
                  <div className="filter-row flex items-center sm:justify-start gap-2 sm:gap-3 flex-wrap">
                    <FilterPill label={filterType}>
                      {({ close }) =>
                        ["All", "Movies", "TV Shows"].map((f) => (
                          <MenuItem
                            key={f}
                            label={f}
                            selected={filterType === f}
                            onSelect={() => {
                              setFilterType(f);
                              close();
                            }}
                          />
                        ))
                      }
                    </FilterPill>
                    <FilterPill label={sortBy}>
                      {({ close }) =>
                        sortOptions.map((opt) => (
                          <MenuItem
                            key={opt.value}
                            label={opt.label}
                            selected={sortBy === opt.value}
                            onSelect={() => {
                              setSortBy(opt.value);
                              close();
                            }}
                          />
                        ))
                      }
                    </FilterPill>
                    {!inCollectionView && collections.length > 0 && (
                      <FilterPill label="Collection">
                        {({ close }) => (
                          <>
                            <MenuItem
                              label="All"
                              selected={activeCollectionId === null}
                              onSelect={() => {
                                setActiveCollectionId(null);
                                close();
                              }}
                            />
                            {collections.map((c) => (
                              <MenuItem
                                key={c.id}
                                label={c.name}
                                selected={activeCollectionId === c.id}
                                onSelect={() => {
                                  setActiveCollectionId(c.id);
                                  close();
                                }}
                              />
                            ))}
                          </>
                        )}
                      </FilterPill>
                    )}
                    {isSelectMode && (
                      <PillAction
                        accent
                        active
                        onClick={handleSelectAll}
                        ariaLabel={selectedIds.size === filteredAndSortedList.length ? "Deselect all" : "Select all visible"}
                      >
                        <Check size={15} />
                        {selectedIds.size === filteredAndSortedList.length ? "Deselect All" : "Select All"}
                      </PillAction>
                    )}
                  </div>

                  {/* Buttons: search capsule + primary actions */}
                  <div className="filter-row flex items-center sm:justify-start gap-2 sm:gap-3 flex-wrap">
                    <SearchField
                      value={searchQuery}
                      onChange={setSearchQuery}
                      placeholder={inCollectionView ? "Search this collection..." : "Search your list..."}
                    />
                    {inCollectionView ? (
                      <PillAction accent onClick={() => setAddTitlesOpen(true)} ariaLabel="Add titles to this collection">
                        <Plus size={15} /> Add Titles
                      </PillAction>
                    ) : (
                      <PillAction accent onClick={() => setNameDialog({ mode: "create", collection: null })} ariaLabel="Create a new collection">
                        <FolderPlus size={15} /> New Collection
                      </PillAction>
                    )}
                    <PillAction
                      active={isSelectMode}
                      onClick={() => {
                        setIsSelectMode((v) => !v);
                        setSelectedIds(new Set());
                      }}
                      ariaLabel={isSelectMode ? "Cancel selection mode" : "Enter select mode"}
                    >
                      {isSelectMode ? "Cancel" : "Select"}
                    </PillAction>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Collections rail (main view) ────────────────────────────── */}
        {!inCollectionView && collections.length > 0 && (
          <section className="relative z-10 mt-2">
            <div className="flex items-center gap-3 px-4 md:px-8">
              <h2 className="text-lg sm:text-xl font-semibold text-white/90 drop-shadow-md">
                Your Collections
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[0.7rem] font-medium text-white/60">
                <FolderOpen size={11} className="text-white/45" />
                {collections.length}
              </span>
            </div>
            <div className="mt-6 px-4 md:px-8">
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
            </div>
          </section>
        )}

        {!inCollectionView && collections.length === 0 && myList.length > 0 && (
          <section className="relative z-10 mt-2 px-4 md:px-8">
            <p className="collections-empty-hint">
              <FolderPlus size={16} /> Group your saved titles into named collections.
            </p>
          </section>
        )}

        {/* ── Poster grid ─────────────────────────────────────────────── */}
        <section className="px-4 md:px-8 mt-4 relative z-10">
          <ErrorBoundary>
            {myList.length === 0 || (inCollectionView && activeCollection.itemIds.length === 0) ? (
              <div style={{ padding: "5rem 0", textAlign: "center", color: "#a1a1aa" }}>
                <div style={{ marginBottom: "1.25rem" }}>
                  {inCollectionView ? (
                    <FolderOpen size={48} strokeWidth={1.3} style={{ opacity: 0.2, margin: "0 auto" }} />
                  ) : (
                    <Bookmark size={48} strokeWidth={1.3} style={{ opacity: 0.2, margin: "0 auto" }} />
                  )}
                </div>
                <h2 style={{ color: "#fff", marginBottom: "0.5rem", fontSize: "1.35rem" }}>
                  {inCollectionView ? "This collection is empty" : "Your list is empty"}
                </h2>
                <p style={{ margin: "0 auto 1.5rem", maxWidth: "24rem", lineHeight: 1.6 }}>
                  {inCollectionView
                    ? `Add some of your saved titles to start filling "${activeCollection.name}".`
                    : "Add movies and series to your list to save them for later."}
                </p>
                {inCollectionView ? (
                  <button
                    type="button"
                    className={ACCENT_PILL}
                    onClick={() => setAddTitlesOpen(true)}
                  >
                    <Plus size={16} /> Add Titles
                  </button>
                ) : (
                  <button
                    type="button"
                    className={ACCENT_PILL}
                    onClick={() => navigate("/")}
                  >
                    <Bookmark size={16} /> Discover Content
                  </button>
                )}
              </div>
            ) : filteredAndSortedList.length === 0 ? (
              <div style={{ padding: "5rem 0", textAlign: "center", color: "#a1a1aa" }}>
                <h2 style={{ color: "#fff", marginBottom: "0.5rem", fontSize: "1.35rem" }}>
                  No titles found
                </h2>
                <p>
                  {searchQuery
                    ? `No saved titles match "${searchQuery}".`
                    : "No items match this filter."}
                </p>
              </div>
            ) : (
              <>
                <div className="discovery-grid">
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
                {filteredAndSortedList.length > 20 && (
                  <div className="discover-loadmore" aria-live="polite">
                    {hasMore ? (
                      <span className="loading-dots" role="status" aria-label="Loading more titles">
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : (
                      <span className="discover-loadmore__end">You have reached the end</span>
                    )}
                  </div>
                )}
              </>
            )}
          </ErrorBoundary>
        </section>
      </div>

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