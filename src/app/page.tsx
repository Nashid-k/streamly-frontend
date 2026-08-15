'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Navbar } from '../components/Navbar';
import { HeroBanner } from '../components/HeroBanner';
import { MovieRow } from '../components/MovieRow';
import { MovieDetailModal } from '../components/MovieDetailModal';
import { VideoPlayerModal } from '../components/VideoPlayerModal';
import { TrailerModal } from '../components/TrailerModal';
import { ProfileModal } from '../components/ProfileModal';
import { OnboardingModal } from '../components/OnboardingModal';
import { MovieCard } from '../components/MovieCard';
import { usePlatform } from '../components/PlatformContext';
import { HeroSkeleton, MovieRowSkeleton, PlatformInitialLoader } from '../components/SkeletonLoaders';
import { AuthModal } from '../components/AuthModal';
import { SearchFilters, SearchFiltersState, DEFAULT_SEARCH_FILTERS, applySearchFilters } from '../components/SearchFilters';
import { PWAInstallPrompt } from '../components/PWAInstallPrompt';
import { Footer } from '../components/Footer';
import { ScrollToTop } from '../components/ScrollToTop';
import { Toast } from '../components/Toast';
import { SearchView } from '../components/SearchView';
import { initSpatialNavigation } from '../lib/spatialNav';
import { motion, AnimatePresence } from 'framer-motion';
import Fuse from 'fuse.js';
import { useGlobalHotkeys } from '../hooks/useGlobalHotkeys';

import {
  fetchFeaturedMovie,
  fetchCategories,
  fetchTop10Movies,
  fetchMovieById,
  searchMovies,
  fetchUser,
  toggleMyListApi,
  updateUserPreferencesApi,
  switchProfileApi,
  prewarmPlatformCatalogs,
  fetchContinueWatchingApi,
  getAuthToken,
  fetchAIRecommendations,
} from '../lib/api';

import { Film, ArrowUp, Filter, LogIn, Sparkles } from 'lucide-react';
import { Movie, Category, User, UserProfile, UserPreferences, Actor } from '../types';


const HERO_ROTATION_MS = 10_000;

const normalizeGenre = (value: string) => value.trim().toLocaleLowerCase();
const hasGenre = (movie: Movie, selected: string) => {
  if (selected === 'All') return true;
  const normSelected = normalizeGenre(selected);
  if (normSelected === 'popular') {
    return (movie.matchScore >= 70) || (movie.seasonsCount ?? 0) > 0 || (movie.releaseYear >= 2020);
  }
  if (normSelected === 'hotstar specials' || normSelected === 'star plus') {
    return Boolean(movie.isSeries) || Boolean(movie.logoUrl) || Boolean(movie.backdropUrl);
  }
  if (['hindi', 'english', 'tamil', 'telugu', 'malayalam', 'kannada', 'marathi', 'bengali'].includes(normSelected)) {
    const audioMatch = (movie.audioLanguages || []).some(l => normalizeGenre(l) === normSelected);
    const subMatch = (movie.subtitleLanguages || []).some(l => normalizeGenre(l) === normSelected);
    const titleMatch = movie.title.toLowerCase().includes(normSelected) || (movie.originalTitle?.toLowerCase() || '').includes(normSelected);
    return audioMatch || subMatch || titleMatch;
  }
  // Genre check with fallback keyword matching
  const genreMatch = movie.genres.some((genre) => normalizeGenre(genre) === normSelected);
  const keywordMatch = (movie.tags || []).some((tag) => normalizeGenre(tag).includes(normSelected)) ||
                       movie.title.toLowerCase().includes(normSelected) ||
                       (movie.description || '').toLowerCase().includes(normSelected);
  return genreMatch || keywordMatch;
};

function shuffleForDiscovery<T>(items: T[], seedText: string): T[] {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed = Math.imul(seed ^ seedText.charCodeAt(index), 16777619);
  }
  const nextRandom = () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export default function Home() {
  const { platform, setPlatform } = usePlatform();
  const [featuredMovie, setFeaturedMovie] = useState<Movie | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [top10Movies, setTop10Movies] = useState<Movie[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [allMovies, setAllMovies] = useState<Movie[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);
  const [themeColor, setThemeColor] = useState<string | null>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [searchActor, setSearchActor] = useState<Actor | undefined>(undefined);
  const [isSearching, setIsSearching] = useState(false);
  const [searchFilters, setSearchFilters] = useState<SearchFiltersState>(DEFAULT_SEARCH_FILTERS);
  const [isAILoading, setIsAILoading] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);

  // Global Hotkeys
  useGlobalHotkeys({
    't': () => {
      // Only toggle if we have a modal open, or just allow it anytime
      setIsTheaterMode((prev) => !prev);
      showToast('Theater Mode toggled');
    },
    'Escape': () => {
      // Close active modals
      if (activeVideoMovie) setActiveVideoMovie(null);
      if (activeDetailMovie) setActiveDetailMovie(null);
      if (isTheaterMode) setIsTheaterMode(false);
    },
    '/': () => {
      // Focus the search input inside Navbar (needs a DOM query or ref, we can dispatch a custom event)
      const searchBtn = document.getElementById('navbar-search-btn');
      if (searchBtn) searchBtn.click();
    },
  });

  const handleAISearch = async () => {
    if (!searchQuery.trim()) return;
    setIsAILoading(true);
    try {
      const res = await fetch('/api/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });
      if (res.ok) {
        const filters = await res.json();
        const newFilters = { ...searchFilters };
        if (filters.genre) newFilters.genre = filters.genre;
        if (filters.type) newFilters.type = filters.type as any;
        if (filters.yearRange) newFilters.yearRange = filters.yearRange as any;
        if (filters.minRating) newFilters.minRating = Number(filters.minRating);
        setSearchFilters(newFilters);
        showToast('AI applied smart filters based on your query ✨');
      }
    } catch (err) {
      showToast('AI search failed. Please try again.');
    } finally {
      setIsAILoading(false);
    }
  };

  // State mapping & helper refs

  const [activeTab, setActiveTab] = useState<'home' | 'movies' | 'series' | 'anime' | 'mylist'>('home');
  const [selectedGenreFilter, setSelectedGenreFilter] = useState<string>('All');
  const [selectedLangFilter, setSelectedLangFilter] = useState<string[]>(['All']);
  const [selectedDubFilter, setSelectedDubFilter] = useState<'all' | 'dubbed_only' | 'subtitled_only' | 'dual_audio'>('all');
  const [preferences, setPreferences] = useState<UserPreferences>({
    uiLanguage: 'English', preferredAudioLanguages: [], preferredSubtitleLanguages: [], dubOption: 'all',
  });
  const [showOnboardingModal, setShowOnboardingModal] = useState<boolean>(false);
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  // A new browser refresh gets a fresh discovery session. Route and profile
  // changes increment the revision below, producing a new but stable ordering.
  const [discoverySessionKey] = useState(() => Date.now().toString(36));
  const [discoveryRevision, setDiscoveryRevision] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);
  const [isHeroReady, setIsHeroReady] = useState(false);

  
  const handleHeroReady = useCallback(() => {
    setIsHeroReady(true);
  }, []);

  // Dynamic Global Geolocation & Browser Language Detection
  useEffect(() => {
    const cleanupSpatialNav = initSpatialNavigation();
    
    const languageMap: Record<string, string> = {
      en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam',
      kn: 'Kannada', mr: 'Marathi', bn: 'Bengali', ar: 'Arabic', es: 'Spanish',
      fr: 'French', de: 'German', ja: 'Japanese', ko: 'Korean', zh: 'Mandarin',
      it: 'Italian', ru: 'Russian', pt: 'Portuguese',
    };

    // 1. Detect Browser Preferences (e.g., if OS is set to Malayalam, catch it)
    const browserLangs = typeof navigator !== 'undefined' ? (navigator.languages || [navigator.language]) : [];
    const browserCodes = browserLangs.map(l => l.split('-')[0].toLowerCase());
    
    // 2. Fetch Geolocation as a fallback (since many users set OS to English)
    fetch('https://ipapi.co/json/')
      .then(res => res.json())
      .then(data => {
        const country = data.country_code;
        const region = data.region_code;
        
        let regionalCodes: string[] = [];
        
        // Dynamic Indian State Mapping (Since India has 22 languages, we dynamically route by state code)
        const indianStateMap: Record<string, string[]> = {
          'KL': ['ml', 'ta', 'hi'], 'TN': ['ta', 'te', 'ml', 'hi'],
          'KA': ['kn', 'te', 'hi'], 'MH': ['mr', 'hi'],
          'WB': ['bn', 'hi'], 'AP': ['te', 'ta', 'hi'], 'TG': ['te', 'ta', 'hi']
        };

        if (country === 'IN' && region && indianStateMap[region]) {
           regionalCodes = indianStateMap[region];
        } else if (data.languages) {
           // Globally dynamic: use the country's official languages from ipapi
           regionalCodes = data.languages.split(',').map((l: string) => l.split('-')[0].toLowerCase());
        }

        // Combine Browser Languages + Regional Languages
        const combinedCodes = Array.from(new Set([...browserCodes, ...regionalCodes, 'en']));
        const matched = combinedCodes.map(c => languageMap[c]).filter(Boolean);
        
        if (matched.length > 0) {
          setSelectedLangFilter(matched);
        }
      })
      .catch(err => console.error('Failed to detect geolocation:', err));
    
    return () => {
      if (cleanupSpatialNav) cleanupSpatialNav();
    };
  }, []);

  const [activeDetailMovie, setActiveDetailMovie] = useState<Movie | null>(null);
  const [activeVideoMovie, setActiveVideoMovie] = useState<Movie | null>(null);
  const [activeTrailerMovie, setActiveTrailerMovie] = useState<Movie | null>(null);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [myList, setMyList] = useState<string[]>([]);

  // Toast Notification System
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Continue Watching List
  const [continueWatching, setContinueWatching] = useState<Movie[]>([]);
  const [aiRecommendations, setAiRecommendations] = useState<Movie[]>([]);
  const [isAiRecsLoading, setIsAiRecsLoading] = useState(false);
  // Auth state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<any>(null);


  // Ref holding the full movie lookup including search results and top10
  const allMoviesMapRef = useRef<Map<string, Movie>>(new Map());

  useEffect(() => {
    if (typeof window !== 'undefined' && allMoviesMapRef.current.size > 0) {
      const cwList: Movie[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('watch_pos_')) {
          const movieId = key.replace('watch_pos_', '');
          const movie = allMoviesMapRef.current.get(movieId);
          if (movie) {
             cwList.push(movie);
          }
        }
      }
      setContinueWatching(cwList);
    }
  }, [activeVideoMovie]);

  const handlePlayMovie = (movie: Movie) => {
    // Both Play and Info from the card now open the unified detail modal
    handleOpenDetails(movie);
  };

  // ── Search Direct Play ────────────────────────────────────────────────────
  // Called from search result cards — skips the detail modal entirely and
  // auto-switches the active platform if the title lives on a different one.
  const platformKeyMap: Record<string, 'nflix' | 'nprime' | 'hotstar'> = {
    'Netflix': 'nflix',
    'Prime Video': 'nprime',
    'Hotstar': 'hotstar',
  };
  const handleSearchResultPlay = (movie: Movie) => {
    // Determine the best platform for this title
    if (movie.availablePlatforms && movie.availablePlatforms.length > 0) {
      // If current platform has the title, keep it; otherwise switch to first available
      const platformLabel: Record<string, string> = { nflix: 'Netflix', nprime: 'Prime Video', hotstar: 'Hotstar' };
      const currentLabel = platformLabel[platform];
      if (!movie.availablePlatforms.includes(currentLabel)) {
        const firstAvailable = platformKeyMap[movie.availablePlatforms[0]];
        if (firstAvailable && firstAvailable !== platform) {
          setPlatform(firstAvailable);
          showToast(`Switched to ${movie.availablePlatforms[0]} to play "${movie.title}"`);
        }
      }
    }
    // Directly open the video player (skip detail modal)
    setActiveVideoMovie(movie);
    setContinueWatching((prev) => {
      const filtered = prev.filter((m) => m.id !== movie.id);
      return [movie, ...filtered].slice(0, 10);
    });
  };
  // ─────────────────────────────────────────────────────────────────────────

  // Called from detail modal "Play" button — goes straight to player
  const handleStreamNow = (movie: Movie, episode?: any) => {
    setActiveDetailMovie(null);
    setActiveTrailerMovie(null);
    const movieToPlay = episode ? {
      ...movie,
      sources: episode.sources || movie.sources,
      title: `${movie.title.split(' · ')[0]} · ${episode.title}`,
      tmdbId: movie.tmdbId,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber
    } : movie;
    setActiveVideoMovie(movieToPlay as Movie);
    setContinueWatching((prev) => {
      const filtered = prev.filter((m) => m.id !== movie.id);
      return [movie, ...filtered].slice(0, 10);
    });
    showToast(`Streaming "${movieToPlay.title}"`);
  };

  const handleToggleMyListWithToast = async (movieId: string) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
    // Search allMoviesMapRef first (covers search results + top10 + categories)
    const found = allMoviesMapRef.current.get(movieId);
    const title = found ? found.title : 'Title';
    const isAdding = !myList.includes(movieId);
    await handleToggleMyList(movieId);
    showToast(isAdding ? `Added "${title}" to My Watchlist` : `Removed "${title}" from My Watchlist`);
  };

  const updateUrlParam = (key: string, value: string | null) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.history.pushState({}, '', url.toString());
  };

  const withViewTransition = (callback: () => void) => {
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as any).startViewTransition(() => {
        callback();
      });
    } else {
      callback();
    }
  };

  const handleOpenDetails = (movie: Movie) => {
    withViewTransition(() => {
      setActiveDetailMovie(movie);
    });
    updateUrlParam('title', movie.id);
  };

  const handleCloseDetails = () => {
    withViewTransition(() => {
      setActiveDetailMovie(null);
    });
    updateUrlParam('title', null);
  };

  const [isTabTransitioning, setIsTabTransitioning] = useState(false);

  const handleTabChange = (tab: 'home' | 'movies' | 'series' | 'anime' | 'mylist') => {
    if (tab === activeTab) return;
    
    withViewTransition(() => {
      setSelectedGenreFilter('All');
      setDiscoveryRevision((revision) => revision + 1);
      setIsTabTransitioning(true);
      setActiveTab(tab);
    });

    updateUrlParam('tab', tab === 'home' ? null : tab);
    setTimeout(() => {
      setIsTabTransitioning(false);
    }, 350);
  };

  useEffect(() => {
    const handleScroll = () => {
      if (typeof window !== 'undefined') {
        setShowScrollTop(window.scrollY > 400);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Preference Restoration & Onboarding Trigger
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('nflix_language_preference');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<UserPreferences> & { preferredLanguages?: string[] };
        const preferredLanguages = [...(parsed.preferredAudioLanguages || parsed.preferredLanguages || []), ...(parsed.preferredSubtitleLanguages || [])];
        setSelectedLangFilter(preferredLanguages.length ? Array.from(new Set(preferredLanguages)) : ['All']);
        if (parsed.dubOption) setSelectedDubFilter(parsed.dubOption as any);
      } catch (e) {}
    } else {
      const timer = setTimeout(() => setShowOnboardingModal(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  // Auth initialization from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('auth_user');
    if (token) setAuthToken(token);
    if (userStr) {
      try { setAuthUser(JSON.parse(userStr)); } catch {}
    }
  }, []);

  // Fetch Continue Watching from backend on mount
  useEffect(() => {
    fetchContinueWatchingApi().then((items) => {
      if (!items || items.length === 0) return;
      // Merge with local allMoviesMap to get full Movie objects for continue watching row
      setContinueWatching((prev) => {
        const merged = [...prev];
        items.forEach((item) => {
          const found = allMoviesMapRef.current.get(item.movieId);
          if (found && !merged.find((m) => m.id === item.movieId)) {
            merged.push({ ...found, watchProgress: item.progressSeconds });
          }
        });
        return merged.slice(0, 10);
      });
    }).catch(() => {});
  }, []);


  const handleSavePreferences = async (newPrefs: UserPreferences) => {
    const discoveryLanguages = Array.from(new Set([...newPrefs.preferredAudioLanguages, ...newPrefs.preferredSubtitleLanguages]));
    setPreferences(newPrefs);
    setSelectedLangFilter(discoveryLanguages.length ? discoveryLanguages : ['All']);
    setSelectedDubFilter(newPrefs.dubOption);
    if (currentProfile) {
      setUser((current) => current ? {
        ...current,
        preferencesByProfile: { ...(current.preferencesByProfile || {}), [currentProfile.id]: newPrefs },
      } : current);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('nflix_language_preference', JSON.stringify(newPrefs));
    }
    await updateUserPreferencesApi(newPrefs).catch(() => {});
    showToast(`Language settings saved for ${currentProfile?.name || 'this profile'}`);
  };

  const matchesPreferredLanguages = (movie: Movie): boolean => {
    // Preferences rank dedicated discovery rails; they must not make the rest of
    // the catalog, search results, or a title's tracks disappear.
    return true;
  };

  const matchesLanguage = (movie: Movie, language: string): boolean => {
    const lowerLang = language.toLowerCase();
    return movie.audioLanguages?.some((item) => item.toLowerCase().includes(lowerLang)) ||
      movie.subtitleLanguages?.some((item) => item.toLowerCase().includes(lowerLang)) ||
      movie.title.toLowerCase().includes(lowerLang) ||
      movie.originalTitle?.toLowerCase().includes(lowerLang) || false;
  };

  const filterMoviesByPreferences = (list: Movie[]): Movie[] => {
    return list.filter((m) => {
      if (!hasGenre(m, selectedGenreFilter)) return false;
      if (!matchesPreferredLanguages(m)) return false;
      
      // If the movie hasn't been deep-scraped yet (e.g. fresh search results from TMDB),
      // it won't have .sources populated. We should let it pass the dub filter so it doesn't disappear.
      if (!m.sources || m.sources.length === 0) {
        return true;
      }

      if (selectedDubFilter === 'dubbed_only') {
        const hasDub = m.sources?.some((s) => s.name.toLowerCase().includes('dub') || s.name.toLowerCase().includes('audio')) ||
          m.audioLanguages?.some((l) => l.toLowerCase().includes('dub')) ||
          (m.audioLanguages && m.audioLanguages.length > 1);
        if (!hasDub) return false;
      } else if (selectedDubFilter === 'dual_audio') {
        const isDual = m.isAnime || m.sources?.some((s) => s.name.toLowerCase().includes('dual'));
        if (!isDual) return false;
      }
      return true;
    });
  };

  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
  const [isSwitchingPlatform, setIsSwitchingPlatform] = useState(false);
  const [isSlowLoad, setIsSlowLoad] = useState(false);

  useEffect(() => {
    if (!isLoadingPage) {
      setHasCompletedInitialLoad(true);
    }
  }, [isLoadingPage]);
  const [isSwitching, setIsSwitching] = useState(false);

  // Initial Data Fetching & Dynamic Platform Switching Sync
  useEffect(() => {
    let isMounted = true;
    setIsLoadingPage(true);
    setIsSwitchingPlatform(true);
    
    async function loadData() {
      try {
        const [featuredResult, categoriesResult, top10Result, userResult] = await Promise.allSettled([
          fetchFeaturedMovie(platform),
          fetchCategories(platform),
          fetchTop10Movies(platform),
          fetchUser(),
        ]);

        if (!isMounted) return;

        // The catalog should not disappear because an optional user/profile
        // request failed. Categories are the only required payload; the other
        // rails gracefully fall back to empty data and can be retried later.
        if (categoriesResult.status === 'rejected') throw categoriesResult.reason;
        const feat = featuredResult.status === 'fulfilled' ? featuredResult.value : null;
        const cats = categoriesResult.value;
        const top10 = top10Result.status === 'fulfilled' ? top10Result.value : [];
        const userData = userResult.status === 'fulfilled' ? userResult.value : null;
        if (featuredResult.status === 'rejected' || top10Result.status === 'rejected' || userResult.status === 'rejected') {
          setCatalogError('Some optional catalog data is unavailable. Showing the available titles.');
        }

        setFeaturedMovie(feat);
        setCategories(cats);
        setTop10Movies(top10);

        const movieMap = new Map<string, Movie>();
        cats.forEach((cat) => cat.movies.forEach((m) => movieMap.set(m.id, m)));
        top10.forEach((m) => movieMap.set(m.id, m));
        if (feat) movieMap.set(feat.id, feat);

        const allMovieItems = Array.from(movieMap.values());
        setAllMovies(allMovieItems);
        // Keep the ref up-to-date so toast handlers can resolve titles instantly
        allMoviesMapRef.current = movieMap;

        // Catalog data is ready — reveal UI immediately (0ms delay)
        setIsLoadingPage(false);

        // Background non-blocking pre-fetch for secondary platform catalogs & images
        void Promise.resolve().then(() => {
          prewarmPlatformCatalogs();
          const heroCandidateList = allMovieItems.slice(0, 10);
          heroCandidateList.forEach(async (m) => {
            if (!m.logoUrl && m.id) {
              try {
                const fetched = await fetchMovieById(m.id);
                if (fetched?.logoUrl) m.logoUrl = fetched.logoUrl;
              } catch (e) {}
            }
          });
        });

        // Fire-and-forget image preloader — don't block the UI thread
        const imageUrlsToPreload: string[] = [];
        if (feat?.backdropUrl) imageUrlsToPreload.push(feat.backdropUrl);
        if (feat?.posterUrl) imageUrlsToPreload.push(feat.posterUrl);
        top10.forEach((m) => {
          if (m.posterUrl) imageUrlsToPreload.push(m.posterUrl);
          if (m.backdropUrl) imageUrlsToPreload.push(m.backdropUrl);
        });
        cats.forEach((cat) => cat.movies.forEach((m) => {
          if (m.posterUrl) imageUrlsToPreload.push(m.posterUrl);
        }));
        const uniqueUrls = Array.from(new Set(imageUrlsToPreload)).slice(0, 20);
        // Non-blocking: preload in the background after paint
        void Promise.resolve().then(() => {
          uniqueUrls.forEach((url) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = url;
          });
        });

        // Sync tab and title modal from URL parameters
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const tabParam = params.get('tab') as any;
          // Include 'anime' in the allow-list (was previously missing)
          if (tabParam && ['home', 'movies', 'series', 'anime', 'mylist'].includes(tabParam)) {
            setActiveTab(tabParam);
          }
          const titleParam = params.get('title');
          if (titleParam) {
            const found = movieMap.get(titleParam);
            if (found) {
              setActiveDetailMovie(found);
            } else {
              fetchMovieById(titleParam)
                .then((m) => { if (isMounted && m) setActiveDetailMovie(m); })
                .catch(() => showToast('Could not load the requested title'));
            }
          }
        }

        if (userData) {
          setUser(userData);
          setMyList(userData.myList || []);
          if (userData.profiles && userData.profiles.length > 0) {
            const active = userData.profiles.find((p) => p.id === userData.currentProfileId) || userData.profiles[0];
            setCurrentProfile(active);
            
            

            const profilePrefs = userData.preferencesByProfile?.[active.id];
            if (profilePrefs) {
              setPreferences(profilePrefs);
              const languages = Array.from(new Set([...profilePrefs.preferredAudioLanguages, ...profilePrefs.preferredSubtitleLanguages]));
              setSelectedLangFilter(languages.length ? languages : ['All']);
              setSelectedDubFilter(profilePrefs.dubOption);
            }
          }
        }
      } catch (error) {
        if (isMounted) setCatalogError(error instanceof Error ? error.message : 'The catalog could not be loaded.');
      } finally {
        if (isMounted) {
          setIsLoadingPage(false);
          setHasCompletedInitialLoad(true);
          if (isMounted) setIsSwitchingPlatform(false);
        }
      }
    }

    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setIsSlowLoad(true);
      }
    }, 5500);

    loadData();
    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
    };
  }, [platform]);

  // Load AI Recommendations based on watch history
  useEffect(() => {
    let isMounted = true;
    if (hasCompletedInitialLoad && continueWatching.length > 0 && aiRecommendations.length === 0 && !isAiRecsLoading) {
      setIsAiRecsLoading(true);
      const historyTitles = continueWatching.slice(0, 3).map(m => m.title);
      fetchAIRecommendations(historyTitles).then(titles => {
        if (!isMounted) return;
        if (titles.length > 0) {
          Promise.all(titles.map(t => searchMovies(t, 'All').then(res => res.movies[0]))).then(results => {
            if (!isMounted) return;
            const valid = results.filter(Boolean) as Movie[];
            setAiRecommendations(valid);
            setIsAiRecsLoading(false);
          }).catch(() => { if (isMounted) setIsAiRecsLoading(false); });
        } else {
          setIsAiRecsLoading(false);
        }
      }).catch(() => { if (isMounted) setIsAiRecsLoading(false); });
    }
    return () => { isMounted = false; };
  }, [hasCompletedInitialLoad, continueWatching.length, aiRecommendations.length]);



  const currentSearchNonce = useRef(0);
  // Live Search Handling
  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(async () => {
      const q = searchQuery.trim();
      if (q !== '') {
        setIsSearching(true);
        const nonce = ++currentSearchNonce.current;

        // God-Tier UX: Instant Fuzzy Search on local cache
        const localMovies = Array.from(allMoviesMapRef.current.values());
        const fuse = new Fuse(localMovies, {
          keys: ['title', 'originalTitle', 'tags', 'genres', 'director'],
          threshold: 0.4, // Typo forgiveness (0.0 is perfect match, 1.0 is match anything)
          distance: 100,
        });

        const fuzzyResults = fuse.search(q).map(res => res.item);

        if (fuzzyResults.length > 0 && isMounted && nonce === currentSearchNonce.current) {
          setSearchResults(fuzzyResults);
          setIsSearching(false);
          return; // Instant results shown, skip network request!
        }

        try {
          const response = await searchMovies(q, selectedGenreFilter);
          if (isMounted && nonce === currentSearchNonce.current) {
            setSearchResults(response.movies);
            setSearchActor(response.actor);
            response.movies.forEach((m: Movie) => allMoviesMapRef.current.set(m.id, m));
          }
        } catch {
          if (isMounted) {
            setSearchResults([]);
            setSearchActor(undefined);
            showToast('Search is temporarily unavailable. Try again.');
          }
        } finally {
          if (isMounted) setIsSearching(false);
        }
      } else {
        if (isMounted) {
          setSearchResults([]);
          setSearchActor(undefined);
          setIsSearching(false);
        }
      }
    }, 450);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedGenreFilter]);

  // My List Toggle Handler — optimistic update with revert on API failure
  const handleToggleMyList = async (movieId: string) => {
    const prevList = [...myList];
    let updatedList = [...myList];
    if (updatedList.includes(movieId)) {
      updatedList = updatedList.filter((id) => id !== movieId);
    } else {
      updatedList.push(movieId);
    }
    setMyList(updatedList);
    try {
      await toggleMyListApi(movieId);
    } catch {
      setMyList(prevList); // revert on API failure
      showToast('Failed to update watchlist — please try again');
    }
  };

  const myListMovies = useMemo(() => {
    const map = new Map<string, Movie>();
    allMovies.forEach((m) => map.set(m.id, m));
    const resolved = myList.map((id) => map.get(id)).filter((m): m is Movie => m !== undefined);
    return filterMoviesByPreferences(resolved);
  }, [allMovies, myList, selectedGenreFilter, selectedDubFilter]);

  const languageFilteredSearchResults = useMemo(
    () => filterMoviesByPreferences(searchResults),
    [searchResults, selectedGenreFilter, selectedDubFilter]
  );
  const languageFilteredTop10 = useMemo(
    () => {
      const filtered = top10Movies.filter(matchesPreferredLanguages);
      return filtered.slice(0, 10);
    },
    [top10Movies]
  );
  const { moviesOnly, seriesOnly, animeOnly } = useMemo(() => {
    const moviesOnly = [];
    const seriesOnly = [];
    const animeOnly = [];
    for (const m of allMovies) {
      if (m.isAnime) animeOnly.push(m);
      else if (m.isSeries) seriesOnly.push(m);
      else moviesOnly.push(m);
    }
    return { moviesOnly, seriesOnly, animeOnly };
  }, [allMovies]);

  const top10MoviesList = useMemo(() => {
    let movies = moviesOnly.filter(m => matchesPreferredLanguages(m));
    if (movies.length === 0) movies = allMovies.filter(m => matchesPreferredLanguages(m));
    return movies.slice(0, 10);
  }, [moviesOnly, allMovies, matchesPreferredLanguages]);
  
  const top10SeriesList = useMemo(() => {
    return seriesOnly.filter(m => matchesPreferredLanguages(m)).slice(0, 10);
  }, [seriesOnly, matchesPreferredLanguages]);
  
  const top10AnimeList = useMemo(() => {
    return animeOnly.filter(m => matchesPreferredLanguages(m)).slice(0, 10);
  }, [animeOnly, matchesPreferredLanguages]);
  const languageFilteredCategories = useMemo(
    () => categories.map((category) => ({ ...category, movies: category.movies.filter(matchesPreferredLanguages) })),
    [categories]
  );
  const discoveryKey = `${discoverySessionKey}:${discoveryRevision}:${activeTab}:${currentProfile?.id || 'guest'}:${selectedGenreFilter}:${selectedLangFilter.join(',')}`;
  const discoveryCategories = useMemo(
    () => languageFilteredCategories.map((category) => ({
      ...category,
      movies: shuffleForDiscovery(category.movies, `${discoveryKey}:${category.id}`),
    })),
    [languageFilteredCategories, discoveryKey]
  );
  // Streaming homepages expose a small, ranked set of rails rather than every
  // catalog source. Keep the full catalog for search/filtering, but surface at
  // four catalog rows. This leaves room for Top 10 and Continue Watching, so
  // every browse surface stays compact. When a regional language is selected,
  // its dedicated movie and series hubs lead the page.
  const languageRailPrefixes: Record<string, string> = {
    Hindi: 'hi', Tamil: 'ta', Telugu: 'te', Malayalam: 'ml', Kannada: 'kn',
    Marathi: 'mr', Bengali: 'bn',
  };
  const selectedBrowseLanguages = selectedLangFilter.includes('All') ? [] : selectedLangFilter;
  const curatedCategories = useMemo(() => {
    const nonEmpty = discoveryCategories.filter((category) => category.movies.length > 0);
    const languageHubIds = selectedBrowseLanguages.flatMap((language) => {
      const prefix = languageRailPrefixes[language];
      if (!prefix) return [];
      if (activeTab === 'movies') return [`${prefix}-movies`];
      if (activeTab === 'series') return [`${prefix}-series`];
      return [`${prefix}-movies`, `${prefix}-series`];
    });
    const baseIds = activeTab === 'movies'
      ? ['trending-movies', 'indian-cinema-hits', 'recently-added-movies', 'popular-movies', 'top-rated-movies', 'upcoming-movies', 'leaving-soon-movies']
      : activeTab === 'series'
        ? ['trending-series', 'recently-added-series', 'popular-series', 'top-rated-series', 'upcoming-series']
        : activeTab === 'anime'
          ? ['trending-anime', 'recently-added-anime', 'popular-anime', 'top-rated-anime', 'upcoming-anime', 'anime-action', 'anime-fantasy', 'anime-comedy']
          : ['trending-movies', 'indian-cinema-hits', 'recently-added-movies', 'popular-movies', 'top-rated-movies', 'upcoming-movies', 'leaving-soon-movies', 'trending-series', 'recently-added-series', 'popular-series', 'top-rated-series', 'upcoming-series', 'trending-anime', 'popular-anime', 'upcoming-anime'];
    const samePageRegional = nonEmpty
      .filter((category) => activeTab === 'movies' ? category.id.endsWith('-movies') : activeTab === 'series' ? category.id.endsWith('-series') : activeTab === 'home')
      .map((category) => category.id);
    const orderedIds = Array.from(new Set([...languageHubIds, ...baseIds, ...samePageRegional, ...nonEmpty.map((category) => category.id)]));
    const usedGenreTitles = new Set<string>();
    return orderedIds
      .map((id) => nonEmpty.find((category) => category.id === id))
      .filter((category): category is Category => Boolean(category))
      .map((category) => ({
        ...category,
        movies: category.movies.filter((movie) => {
          if (!hasGenre(movie, selectedGenreFilter)) return false;
          return true;
        }),
      }))
      .filter((category) => category.movies.length > 0)
      // Keep every matching rail when a genre is selected; the compact ten-rail
      // cap is only for the unfiltered homepage.
      .slice(0, selectedGenreFilter === 'All' ? 40 : 100);
  }, [discoveryCategories, selectedBrowseLanguages, activeTab, selectedGenreFilter]);
  const heroCandidates = useMemo(() => {
    const matchesTab = (movie: Movie) => {
      if (movie.isUpcoming) return false;
      // Strictly require a valid backdropUrl or posterUrl image
      if (!movie.backdropUrl && !movie.posterUrl) return false;
      if (activeTab === 'home') return true;
      if (activeTab === 'movies') return !movie.isSeries && !movie.isAnime;
      if (activeTab === 'series') return movie.isSeries && !movie.isAnime;
      if (activeTab === 'anime') return Boolean(movie.isAnime);
      return false;
    };
    const candidates = allMovies.filter(matchesTab);
    if (activeTab === 'home' && featuredMovie && (featuredMovie.backdropUrl || featuredMovie.posterUrl) && !candidates.some((movie) => movie.id === featuredMovie.id)) {
      candidates.unshift(featuredMovie);
    }
    return shuffleForDiscovery(candidates, `hero:${discoveryKey}`);
  }, [activeTab, allMovies, featuredMovie, discoveryKey]);
  const heroCandidateIds = heroCandidates.map((movie) => movie.id).join(',');
  useEffect(() => {
    setHeroIndex(0);
    setIsHeroReady(false);
  }, [heroCandidateIds]);

  useEffect(() => {
    if (heroCandidates.length < 2) return;
    if (!isHeroReady) return;

    const timer = window.setTimeout(() => {
      setIsHeroReady(false); // Pause rotation until the next movie is fully loaded
      setHeroIndex((index) => (index + 1) % heroCandidates.length);
    }, HERO_ROTATION_MS);

    return () => window.clearTimeout(timer);
  }, [heroCandidateIds, heroIndex, isHeroReady, heroCandidates.length]);
  const heroMovie = heroCandidates.length
    ? heroCandidates[heroIndex % heroCandidates.length]
    : featuredMovie;
  const languageAwareCategoryTitle = (title: string) =>
    selectedBrowseLanguages.length === 1 ? `Best in ${selectedBrowseLanguages[0]} · ${title}` : title;
  const languageLabel = selectedBrowseLanguages.length ? selectedBrowseLanguages.join(' & ') : 'All Languages';
  const availableGenres = useMemo(() => {
    const labels = new Map<string, string>();
    allMovies.flatMap((movie) => movie.genres || []).forEach((genre) => {
      const label = genre.trim();
      if (label) labels.set(normalizeGenre(label), label);
    });
    return Array.from(labels.values()).sort((a, b) => a.localeCompare(b));
  }, [allMovies]);
  const relatedMovies = useMemo(() => {
    if (!activeDetailMovie) return [];
    const genreSet = new Set((activeDetailMovie.genres || []).map((genre) => genre.toLowerCase()));
    const languageSet = new Set([...(activeDetailMovie.audioLanguages || []), ...(activeDetailMovie.subtitleLanguages || [])].map((language) => language.toLowerCase()));
    const tagSet = new Set((activeDetailMovie.tags || []).map((tag) => tag.toLowerCase()));
    return allMovies
      .filter((candidate) => candidate.id !== activeDetailMovie.id)
      .map((candidate) => {
        const sharedGenres = candidate.genres.filter((genre) => genreSet.has(genre.toLowerCase())).length;
        const sharedLanguages = [...(candidate.audioLanguages || []), ...(candidate.subtitleLanguages || [])]
          .filter((language) => languageSet.has(language.toLowerCase())).length;
        const sharedTags = (candidate.tags || []).filter((tag) => tagSet.has(tag.toLowerCase())).length;
        const sameType = candidate.isAnime === activeDetailMovie.isAnime && candidate.isSeries === activeDetailMovie.isSeries;
        const score = sharedGenres * 30 + sharedLanguages * 12 + sharedTags * 8 + (sameType ? 18 : 0) + (candidate.isUpcoming ? -20 : 0);
        return { candidate, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.candidate.matchScore - a.candidate.matchScore)
      .slice(0, 6)
      .map(({ candidate }) => candidate);
  }, [activeDetailMovie, allMovies]);

  const renderFilteredGrid = (title: string, filterFn: (m: Movie) => boolean) => {
    const matchingMovies = allMovies.filter((m) => filterFn(m) && hasGenre(m, selectedGenreFilter));
    return (
      <div style={{ padding: '20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', padding: '0 4%' }}>
          <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#FFF' }}>
            {title}
          </h3>
          <button
            onClick={() => setSelectedGenreFilter('All')}
            style={{ background: 'rgba(255,255,255,0.1)', color: '#FFF', border: 'none', padding: '6px 14px', borderRadius: '16px', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600 }}
          >
            Clear Filter ✕
          </button>
        </div>
        {matchingMovies.length > 0 ? (
          <div className="classic-grid">
            {matchingMovies.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                onPlay={(m) => handlePlayMovie(m)}
                onOpenDetails={handleOpenDetails}
                onToggleMyList={handleToggleMyListWithToast}
                isMyList={myList.includes(movie.id)}
              />
            ))}
          </div>
        ) : (
          <div style={{ padding: '60px 0', textAlign: 'center', color: '#808080' }}>
            <p style={{ fontSize: '1.1rem' }}>No titles available in {selectedGenreFilter} right now.</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <main className={platform === 'hotstar' ? 'hotstar-main-content' : ''} style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)', background: themeColor ? `radial-gradient(circle at 50% 0%, ${themeColor}, var(--bg-color) 70%)` : 'var(--bg-color)', color: '#FFF', width: '100%', position: 'relative', transition: 'background 1.5s ease' }}>
      {/* Top Navigation Bar with Status Bar Genre & Language Dropdowns */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedGenreFilter={selectedGenreFilter}
        onGenreFilterChange={setSelectedGenreFilter}
        availableGenres={availableGenres}
        selectedLangFilter={languageLabel}
        selectedDubFilter={selectedDubFilter}
        uiLanguage={preferences.uiLanguage}
        onDubFilterChange={setSelectedDubFilter}
        currentProfile={currentProfile}
        onOpenProfileModal={() => setShowProfileModal(true)}
        onOpenOnboardingModal={() => setShowOnboardingModal(true)}
        searchResults={searchResults}
        onSearchResultSelect={handleOpenDetails}
        authToken={authToken}
        onSignInClick={() => setShowAuthModal(true)}
        onSignOutClick={() => {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
          setAuthToken(null);
          setAuthUser(null);
          showToast('Signed out successfully');
        }}
      />

      {/* Full-Screen Initial Loader */}
      {(!hasCompletedInitialLoad) && <PlatformInitialLoader showSlowLoadMessage={isSlowLoad} />}

      {/* Main Page Content Router */}
      <div style={{ opacity: hasCompletedInitialLoad ? 1 : 0, transition: 'opacity 0.3s' }}>
      {searchQuery.trim() !== '' ? (
        /* Search View */
        <SearchView
          searchQuery={searchQuery}
          isSearching={isSearching}
          languageFilteredSearchResults={languageFilteredSearchResults}
          searchActor={searchActor}
          isAILoading={isAILoading}
          onAISearch={handleAISearch}
          onClearSearch={() => setSearchQuery('')}
          onPlayMovie={handlePlayMovie}
          onOpenDetails={handleOpenDetails}
          onToggleMyList={handleToggleMyList}
          myList={myList}
        />
      ) : (
        <>
          {catalogError && (
            <div role="status" style={{ padding: '96px 4% 24px', color: '#FDE68A', background: '#2A2110', borderBottom: '1px solid rgba(245,158,11,.25)' }}>
              {catalogError} You can refresh to retry unavailable rails.
            </div>
          )}
          {/* Dynamic Hero Banner (Hidden on My List Tab) */}
          {activeTab !== 'mylist' && (
            isLoadingPage ? (
              <HeroSkeleton />
            ) : (
              <HeroBanner 
                movie={heroMovie} 
                carouselMovies={heroCandidates.slice(0, 8)}
                activeCarouselIndex={heroIndex % (heroCandidates.slice(0, 8).length || 1)}
                onSelectCarouselIndex={(idx) => { setHeroIndex(idx); setIsHeroReady(true); }}
                onPlay={handlePlayMovie} 
                onOpenDetails={handleOpenDetails} 
                onToggleMyList={handleToggleMyListWithToast}
                isMyList={heroMovie ? myList.includes(heroMovie.id) : false}
                onHeroReady={handleHeroReady}
                onThemeColorChange={setThemeColor}
              />
            )
          )}

          {/* Page-Specific Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              style={{ marginTop: activeTab === 'mylist' ? '110px' : '-40px', position: 'relative', zIndex: 20, width: '100%', minHeight: '50vh' }}
            >
              {(isTabTransitioning || isLoadingPage) ? (
                <div style={{ paddingTop: activeTab === 'mylist' ? '20px' : '40px' }}>
                  <MovieRowSkeleton />
                  <MovieRowSkeleton />
                  <MovieRowSkeleton />
                </div>
              ) : (
              <>

                {activeTab === 'home' && (
                  /* Home Tab: Continue Watching + Top 10 Row + Dynamic Categories */
                  <>
                    {platform === 'hotstar' && (
                      <div className="hotstar-category-pills" style={{ display: 'flex', gap: '10px', padding: '0 4% 16px 4%', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        {['All', 'Popular', 'Hotstar Specials', 'Star Plus', 'Action', 'Comedies', 'Drama', 'Hindi', 'English', 'Tamil', 'Telugu'].map((pill) => {
                          const isActive = selectedGenreFilter === pill;
                          return (
                            <button
                              key={pill}
                              onClick={() => setSelectedGenreFilter(pill)}
                              style={{
                                background: isActive ? '#1F80E0' : 'rgba(255, 255, 255, 0.08)',
                                color: '#FFF',
                                border: 'none',
                                padding: '8px 18px',
                                borderRadius: '20px',
                                fontSize: '0.88rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                                boxShadow: isActive ? '0 4px 14px rgba(31, 128, 224, 0.4)' : 'none'
                              }}
                            >
                              {pill}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {continueWatching.length > 0 && (
                      <MovieRow
                        title={`Continue Watching for ${currentProfile?.name || 'You'}`}
                        movies={continueWatching.filter(matchesPreferredLanguages)}
                        onPlay={(m) => handlePlayMovie(m)}
                        onOpenDetails={handleOpenDetails}
                        onToggleMyList={handleToggleMyListWithToast}
                        myList={myList}
                      />
                    )}
                    {aiRecommendations.length > 0 && (
                      <MovieRow
                        title={`✨ AI Recommended for You`}
                        movies={aiRecommendations.filter(matchesPreferredLanguages)}
                        onPlay={(m) => handlePlayMovie(m)}
                        onOpenDetails={handleOpenDetails}
                        onToggleMyList={handleToggleMyListWithToast}
                        myList={myList}
                      />
                    )}
                    {languageFilteredTop10.length > 0 && (
                      <MovieRow title="Top 10 Titles Today" movies={languageFilteredTop10} isTop10={true} onPlay={(m) => handlePlayMovie(m)} onOpenDetails={handleOpenDetails} onToggleMyList={handleToggleMyListWithToast} myList={myList} />
                    )}
                    {selectedGenreFilter !== 'All' ? (
                      renderFilteredGrid(`${selectedGenreFilter} Catalog`, () => true)
                    ) : (
                      curatedCategories.map((category) => (
                        <MovieRow
                          key={category.id}
                          title={languageAwareCategoryTitle(category.name)}
                          movies={category.movies}
                          onPlay={(m) => handlePlayMovie(m)}
                          onOpenDetails={handleOpenDetails}
                          onToggleMyList={handleToggleMyListWithToast}
                          myList={myList}
                          onExploreAll={() => {
                            setSelectedGenreFilter(category.name);
                          }}
                        />
                      ))
                    )}
                  </>
                )}

                {activeTab === 'movies' && (
                  /* Movies Tab: Top 10 Movies + Dynamic Movie Rows with Genre Filter + Upcoming */
                  <div style={{ paddingTop: '10px' }}>
                    {selectedGenreFilter !== 'All' ? (
                      renderFilteredGrid(`${selectedGenreFilter} Movies`, (m) => !m.isSeries && !m.isAnime)
                    ) : (
                      <>
                        {selectedGenreFilter === 'All' && top10MoviesList.length > 0 && (
                      <MovieRow title="Top 10 Movies Today" movies={top10MoviesList} isTop10={true} onPlay={(m) => handlePlayMovie(m)} onOpenDetails={handleOpenDetails} onToggleMyList={handleToggleMyListWithToast} myList={myList} />
                    )}
                    {curatedCategories
                      .map((cat) => ({
                        ...cat,
                        movies: cat.movies.filter((m) => {
                          if (m.isUpcoming) return false; // upcoming shown separately below
                          if (m.isSeries || m.isAnime) return false;
                          return hasGenre(m, selectedGenreFilter);
                        }),
                      }))
                      .filter((cat) => cat.movies.length > 0)
                      .map((cat) => (
                        <MovieRow
                          key={`movies-${cat.id}`}
                          title={languageAwareCategoryTitle(cat.name)}
                          movies={cat.movies}
                          onPlay={(m) => handlePlayMovie(m)}
                          onOpenDetails={handleOpenDetails}
                          onToggleMyList={handleToggleMyListWithToast}
                          myList={myList}
                        />
                      ))}

                    {/* Upcoming Movies — pinned section, bypasses curatedCategories slice */}
                    {(() => {
                      const upcomingCat = discoveryCategories.find((c) => c.id === 'upcoming-movies');
                      const upcomingMovies = (upcomingCat?.movies || []).filter(
                        (m) => m.isUpcoming && !m.isSeries && !m.isAnime &&
                          hasGenre(m, selectedGenreFilter)
                      );
                      return upcomingMovies.length >= 2 ? (
                        <MovieRow
                          title="🔔 New & Upcoming Movies"
                          movies={upcomingMovies}
                          onPlay={(m) => handlePlayMovie(m)}
                          onOpenDetails={handleOpenDetails}
                          onToggleMyList={handleToggleMyListWithToast}
                          myList={myList}
                        />
                      ) : null;
                    })()}
                  </>
                  )}
                  </div>
                )}

                {activeTab === 'series' && (
                  /* Series Tab: Top 10 TV Series + Dynamic TV Series Rows with Genre Filter + Upcoming */
                  <div style={{ paddingTop: '10px' }}>
                    {selectedGenreFilter !== 'All' ? (
                      renderFilteredGrid(`${selectedGenreFilter} Series`, (m) => !!m.isSeries && !m.isAnime)
                    ) : (
                      <>
                        {selectedGenreFilter === 'All' && top10SeriesList.length > 0 && (
                      <MovieRow title="Top 10 TV Series Today" movies={top10SeriesList} isTop10={true} onPlay={(m) => handlePlayMovie(m)} onOpenDetails={handleOpenDetails} onToggleMyList={handleToggleMyListWithToast} myList={myList} />
                    )}
                    {curatedCategories
                      .map((cat) => ({
                        ...cat,
                        movies: cat.movies.filter((m) => {
                          if (m.isUpcoming) return false;
                          if (!m.isSeries || m.isAnime) return false;
                          return hasGenre(m, selectedGenreFilter);
                        }),
                      }))
                      .filter((cat) => cat.movies.length > 0)
                      .map((cat) => (
                        <MovieRow
                          key={`series-${cat.id}`}
                          title={languageAwareCategoryTitle(cat.name)}
                          movies={cat.movies}
                          onPlay={(m) => handlePlayMovie(m)}
                          onOpenDetails={handleOpenDetails}
                          onToggleMyList={handleToggleMyListWithToast}
                          myList={myList}
                        />
                      ))}

                    {/* Upcoming Series — pinned */}
                    {(() => {
                      const upcomingCat = discoveryCategories.find((c) => c.id === 'upcoming-series');
                      const upcomingMovies = (upcomingCat?.movies || []).filter(
                        (m) => m.isUpcoming && m.isSeries && !m.isAnime &&
                          hasGenre(m, selectedGenreFilter)
                      );
                      return upcomingMovies.length >= 2 ? (
                        <MovieRow
                          title="🔔 New & Upcoming Series"
                          movies={upcomingMovies}
                          onPlay={(m) => handlePlayMovie(m)}
                          onOpenDetails={handleOpenDetails}
                          onToggleMyList={handleToggleMyListWithToast}
                          myList={myList}
                        />
                      ) : null;
                    })()}
                  </>
                  )}
                  </div>
                )}

                {activeTab === 'anime' && (
                  /* Anime Tab: Top 10 Anime + Dynamic Anime Rows with Genre Filter + Upcoming */
                  <div style={{ paddingTop: '10px' }}>
                    {selectedGenreFilter !== 'All' ? (
                      renderFilteredGrid(`${selectedGenreFilter} Anime`, (m) => !!m.isAnime)
                    ) : (
                      <>
                        {selectedGenreFilter === 'All' && top10AnimeList.length > 0 && (
                      <MovieRow title="Top 10 Anime Today" movies={top10AnimeList} isTop10={true} onPlay={(m) => handlePlayMovie(m)} onOpenDetails={handleOpenDetails} onToggleMyList={handleToggleMyListWithToast} myList={myList} />
                    )}
                    {curatedCategories
                      .map((cat) => ({
                        ...cat,
                        movies: cat.movies.filter((m) => {
                          if (m.isUpcoming) return false;
                          if (!m.isAnime) return false;
                          return hasGenre(m, selectedGenreFilter);
                        }),
                      }))
                      .filter((cat) => cat.movies.length > 0)
                      .map((cat) => (
                        <MovieRow
                          key={`anime-${cat.id}`}
                          title={languageAwareCategoryTitle(cat.name)}
                          movies={cat.movies}
                          onPlay={(m) => handlePlayMovie(m)}
                          onOpenDetails={handleOpenDetails}
                          onToggleMyList={handleToggleMyListWithToast}
                          myList={myList}
                        />
                      ))}

                    {/* Upcoming Anime — pinned */}
                    {(() => {
                      const upcomingCat = discoveryCategories.find((c) => c.id === 'upcoming-anime');
                      const upcomingMovies = (upcomingCat?.movies || []).filter(
                        (m) => m.isUpcoming && m.isAnime &&
                          hasGenre(m, selectedGenreFilter)
                      );
                      return upcomingMovies.length >= 2 ? (
                        <MovieRow
                          title="🔔 New & Upcoming Anime"
                          movies={upcomingMovies}
                          onPlay={(m) => handlePlayMovie(m)}
                          onOpenDetails={handleOpenDetails}
                          onToggleMyList={handleToggleMyListWithToast}
                          myList={myList}
                        />
                      ) : null;
                    })()}
                  </>
                  )}
                  </div>
                )}

                {activeTab === 'mylist' && (
                  /* My Watchlist Tab */
                  <div>
                    {/* Header row with count + genre filter chips */}
                    <div style={{ paddingLeft: '4%', paddingRight: '4%', marginBottom: '24px' }}>
                      <h2 style={{ fontSize: '2rem', fontWeight: 900, color: '#FFF', marginBottom: '16px' }}>
                        My Watchlist ({myListMovies.length})
                      </h2>
                      {/* Genre filter chips for watchlist */}
                      {myListMovies.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.82rem', color: '#777', fontWeight: 600, flexShrink: 0 }}>Filter:</span>
                          {['All', ...availableGenres].map((g) => (
                            <button
                              key={g}
                              onClick={() => setSelectedGenreFilter(g)}
                              style={{
                                background: selectedGenreFilter === g ? 'var(--primary-color)' : 'rgba(255,255,255,0.08)',
                                color: '#FFF',
                                border: selectedGenreFilter === g ? '1px solid var(--primary-color)' : '1px solid rgba(255,255,255,0.15)',
                                padding: '5px 14px',
                                borderRadius: '20px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {myListMovies.length > 0 ? (
                      <div className="classic-grid">
                        {myListMovies.map((movie) => (
                          <MovieCard
                            key={movie.id}
                            movie={movie}
                            onPlay={(m) => handlePlayMovie(m)}
                            onOpenDetails={handleOpenDetails}
                            onToggleMyList={handleToggleMyListWithToast}
                            isMyList={true}
                          />
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '70px 20px', backgroundColor: 'var(--bg-elevated)', borderRadius: '12px', margin: '0 4%', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <Film size={48} color="var(--primary-color)" style={{ marginBottom: '16px' }} />
                        {selectedGenreFilter !== 'All' ? (
                          <>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '8px', color: '#FFF' }}>No {selectedGenreFilter} titles in your Watchlist</h3>
                            <p style={{ color: '#AAA', maxWidth: '460px', margin: '0 auto 24px', fontSize: '0.95rem', lineHeight: 1.5 }}>
                              You don't have any {selectedGenreFilter} titles saved yet. Clear the filter to see all your watchlisted titles.
                            </p>
                            <button
                              onClick={() => setSelectedGenreFilter('All')}
                              style={{ backgroundColor: 'var(--primary-color)', color: '#FFF', border: 'none', padding: '12px 28px', borderRadius: '4px', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px var(--primary-glow)' }}
                            >
                              Clear Filter
                            </button>
                          </>
                        ) : (
                          <>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '8px', color: '#FFF' }}>Your Watchlist is Empty</h3>
                            <p style={{ color: '#AAA', maxWidth: '460px', margin: '0 auto 24px', fontSize: '0.95rem', lineHeight: 1.5 }}>
                              Add movies and TV series to your watchlist by clicking the plus (+) icon on any title so you can easily find and watch them anytime.
                            </p>
                            <button
                              onClick={() => handleTabChange('home')}
                              style={{ backgroundColor: 'var(--primary-color)', color: '#FFF', border: 'none', padding: '12px 28px', borderRadius: '4px', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px var(--primary-glow)' }}
                            >
                              Explore Trending Titles
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
        </>
      )}

      {/* Floating Scroll to Top Button */}
      <ScrollToTop showScrollTop={showScrollTop} />

      {/* Footer */}
      <Footer />

      {/* Detail Modal */}
      {activeDetailMovie && (
        <MovieDetailModal
          movie={activeDetailMovie}
          onClose={handleCloseDetails}
          onPlay={handleStreamNow}
          onOpenDetails={handleOpenDetails}
          onToggleMyList={handleToggleMyListWithToast}
          isMyList={myList.includes(activeDetailMovie.id)}
          similarMovies={relatedMovies}
        />
      )}

      </div>

      {/* Video Player Modal */}
      {activeVideoMovie && (
        <VideoPlayerModal
          movie={activeVideoMovie}
          onClose={() => setActiveVideoMovie(null)}
        />
      )}


      {/* Profile Modal */}
      {showProfileModal && (user || currentProfile) && (
        <ProfileModal
          profiles={user?.profiles || [currentProfile!]}
          currentProfile={currentProfile}
          onSelectProfile={(prof) => {
            switchProfileApi(prof.id).catch(() => {});
            setCurrentProfile(prof);
            setDiscoveryRevision((revision) => revision + 1);
            const profilePrefs = user?.preferencesByProfile?.[prof.id] || { uiLanguage: 'English', preferredAudioLanguages: [], preferredSubtitleLanguages: [], dubOption: 'all' as const };
            setPreferences(profilePrefs);
            setSelectedDubFilter(profilePrefs.dubOption);
            const languages = Array.from(new Set([...profilePrefs.preferredAudioLanguages, ...profilePrefs.preferredSubtitleLanguages]));
            setSelectedLangFilter(languages.length ? languages : ['All']);
            localStorage.setItem('profileSelected', 'true');
            setShowProfileModal(false);
          }}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {/* Onboarding Language & Dub Preference Modal */}
      <OnboardingModal
        isOpen={showOnboardingModal}
        onClose={() => setShowOnboardingModal(false)}
        onSave={handleSavePreferences}
        currentPreferences={{
          ...preferences,
          dubOption: selectedDubFilter,
        }}
      />
      {/* Dynamic Glassmorphic Toast Notification */}
      <Toast message={toastMessage} />
      {/* ─── Auth Modal ──────────────────────────────────────────────────── */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onAuthSuccess={(token, user) => {
            setAuthToken(token);
            setAuthUser(user);
            setShowAuthModal(false);
            showToast(`Welcome back, ${user?.name || 'Streamer'}! 🎉`);
          }}
        />
      )}

      <PWAInstallPrompt />
    </main>
  );
}
