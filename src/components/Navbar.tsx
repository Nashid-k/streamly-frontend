import React, { useState, useEffect, useRef } from 'react';
import { Search, Home, Tv, Film, Plus, Grip, ChevronDown, Filter, Globe, Settings, LogIn } from 'lucide-react';
import { usePlatform } from './PlatformContext';

interface NavbarProps {
  activeTab: 'home' | 'movies' | 'series' | 'anime' | 'mylist';
  setActiveTab: (tab: 'home' | 'movies' | 'series' | 'anime' | 'mylist') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  availableGenres?: string[];
  selectedGenreFilter?: string;
  onGenreFilterChange?: (genre: string) => void;
  selectedLangFilter?: string;
  selectedDubFilter?: string;
  onDubFilterChange?: (dub: any) => void;
  onOpenProfileModal: () => void;
  onOpenOnboardingModal?: () => void;
  uiLanguage?: string;
  currentProfile?: { name: string; avatarUrl?: string } | null;
  searchResults?: any[];
  onSearchResultSelect?: (movie: any) => void;
  /** If provided and authToken is falsy, renders a Sign In button in the navbar */
  onSignInClick?: () => void;
  onSignOutClick?: () => void;
  authToken?: string | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  searchQuery,
  onSearchChange,
  availableGenres = [],
  selectedGenreFilter = 'All',
  onGenreFilterChange,
  selectedLangFilter,
  selectedDubFilter,
  onDubFilterChange,
  onOpenProfileModal,
  onOpenOnboardingModal,
  uiLanguage = 'English',
  currentProfile,
  searchResults = [],
  onSearchResultSelect,
  onSignInClick,
  onSignOutClick,
  authToken,
}) => {
  const showSignIn = !authToken && !!onSignInClick;
  const { platform, setPlatform } = usePlatform();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showAppSwitcher, setShowAppSwitcher] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [isHotstarExpanded, setIsHotstarExpanded] = useState(false);
  const appSwitcherRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setIsScrolled(window.scrollY > 0);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (appSwitcherRef.current && !appSwitcherRef.current.contains(event.target as Node)) {
        setShowAppSwitcher(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const copy: Record<string, any> = {
    English: { home: 'Home', series: 'TV Series', movies: 'Movies', mylist: 'My List', languages: 'Languages', dubbed: 'Dubbed' },
    Telugu: { home: 'హోమ్', series: 'టీవీ సిరీస్', movies: 'సినిమాలు', mylist: 'నా జాబితా', languages: 'భాషలు', dubbed: 'డబ్' },
  };
  const t = copy[uiLanguage] || copy.English;

  // Authentic labels per platform
  const getNavItems = () => {
    if (platform === 'nflix') {
      return [
        { id: 'home', label: 'Home' },
        { id: 'series', label: 'TV Shows' },
        { id: 'movies', label: 'Movies' },
        { id: 'anime', label: 'New & Popular' },
        { id: 'mylist', label: 'My List' },
      ];
    } else if (platform === 'nprime') {
      return [
        { id: 'home', label: 'Home' },
        { id: 'movies', label: 'Movies' },
        { id: 'series', label: 'TV Shows' },
        { id: 'anime', label: 'Categories' },
        { id: 'mylist', label: 'My Stuff' },
      ];
    } else { // hotstar
      return [
        { id: 'home', label: 'Home' },
        { id: 'series', label: 'TV' },
        { id: 'movies', label: 'Movies' },
        { id: 'anime', label: 'Sports' },
        { id: 'mylist', label: 'Categories' },
      ];
    }
  };

  const navItems = getNavItems();

  const renderAppSwitcherDropdown = () => (
    <div
      className="app-switcher-dropdown"
      style={{
        position: 'absolute',
        right: platform !== 'hotstar' ? 0 : 'auto',
        left: platform === 'hotstar' ? '32px' : 'auto',
        bottom: platform === 'hotstar' ? '60px' : 'auto',
        top: platform !== 'hotstar' ? '42px' : 'auto',
        width: '240px',
        background: 'rgba(15, 15, 15, 0.95)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '12px',
        borderRadius: '12px',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
        animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      {platform !== 'nflix' && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPlatform('nflix'); setShowAppSwitcher(false); }}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setPlatform('nflix'); setShowAppSwitcher(false); }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(229,9,20,0.12)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          style={{ background: 'transparent', border: 'none', padding: '12px 14px', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', transition: 'all 0.2s ease', touchAction: 'manipulation' }}
        >
          <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#E50914', letterSpacing: '-0.02em', fontFamily: 'Arial, sans-serif', textShadow: '0 2px 10px rgba(229,9,20,0.35)' }}>NETFLIX</span>
        </button>
      )}
      {platform !== 'nprime' && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPlatform('nprime'); setShowAppSwitcher(false); }}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setPlatform('nprime'); setShowAppSwitcher(false); }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,168,225,0.12)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          style={{ background: 'transparent', border: 'none', padding: '12px 14px', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', transition: 'all 0.2s ease', touchAction: 'manipulation' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#FFF', letterSpacing: '-0.02em' }}>prime</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 400, color: '#00A8E1', letterSpacing: '-0.02em' }}>video</span>
          </div>
        </button>
      )}
      {platform !== 'hotstar' && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPlatform('hotstar'); setShowAppSwitcher(false); }}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setPlatform('hotstar'); setShowAppSwitcher(false); }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(15,112,224,0.12)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          style={{ background: 'transparent', border: 'none', padding: '12px 14px', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', transition: 'all 0.2s ease', touchAction: 'manipulation' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#FFF', letterSpacing: '-0.02em' }}>Disney+</span>
            <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#1570E0', letterSpacing: '-0.02em' }}>hotstar</span>
          </div>
        </button>
      )}
    </div>
  );

  if (platform === 'hotstar') {
    return (
      <>
        {/* Hotstar Mobile Top Header (<768px) */}
        <header className="hotstar-mobile-header" style={{ display: 'none', position: 'fixed', top: 0, left: 0, right: 0, height: '54px', background: 'rgba(15, 16, 20, 0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.08)', zIndex: 1000, padding: '0 12px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} onClick={() => setActiveTab('home')}>
            <img src="https://secure-media.hotstarext.com/web-assets/prod/images/brand-logos/disney-hotstar-logo-dark.svg" alt="Disney+ Hotstar" style={{ height: '28px' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <button onClick={() => setIsSearchOpen(!isSearchOpen)} style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Search size={20} color="#1F80E0" />
              </button>
              {isSearchOpen && (
                <input type="text" placeholder="Search" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} autoFocus onBlur={() => { if (!searchQuery) setIsSearchOpen(false); }} style={{ background: 'rgba(0, 0, 0, 0.85)', border: '1px solid #1F80E0', color: '#FFF', padding: '6px 10px', marginLeft: '6px', width: '150px', fontSize: '0.85rem', outline: 'none', borderRadius: '6px' }} />
              )}
            </div>

            <div style={{ position: 'relative' }} ref={appSwitcherRef}>
              <button onClick={() => setShowAppSwitcher(!showAppSwitcher)} style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Switch Platform">
                <Grip size={20} color="#1F80E0" />
              </button>
              {showAppSwitcher && renderAppSwitcherDropdown()}
            </div>

            <div onClick={onOpenProfileModal} style={{ width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', border: '1.5px solid #1F80E0' }}>
              {currentProfile?.avatarUrl ? (
                <img src={currentProfile.avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Settings size={14} color="#FFF" /></div>
              )}
            </div>
          </div>
        </header>

        {/* Hotstar Desktop Sidebar (>768px) */}
        {isHotstarExpanded && (
          <div 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1999 }}
            onMouseEnter={() => setIsHotstarExpanded(false)}
          />
        )}
        <aside className={isHotstarExpanded ? 'hotstar-sidebar expanded' : 'hotstar-sidebar'} style={{
          position: 'fixed', left: 0, top: 0, bottom: 0, width: isHotstarExpanded ? '280px' : '80px',
          background: isHotstarExpanded ? 'linear-gradient(to right, #0f1014 60%, transparent 100%)' : 'transparent',
          zIndex: 2000, display: 'flex', flexDirection: 'column', padding: '32px 0',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s', overflow: 'hidden',
        }}
        onMouseEnter={() => setIsHotstarExpanded(true)}
        onMouseLeave={() => setIsHotstarExpanded(false)}
        >
          <div style={{ marginBottom: '40px', padding: '0 32px', display: 'flex', alignItems: 'center', height: '48px', minWidth: '280px' }}>
            <img src="https://secure-media.hotstarext.com/web-assets/prod/images/brand-logos/disney-hotstar-logo-dark.svg" alt="Disney+ Hotstar" style={{ height: '42px', transition: 'opacity 0.3s', opacity: isHotstarExpanded ? 1 : 0, position: 'absolute', left: '32px' }} />
            {!isHotstarExpanded && (
               <img src="https://img10.hotstar.com/image/upload/f_auto,q_90,w_256/v1656431456/web-images/logo-d-plus.svg" alt="D+" style={{ position: 'absolute', left: '32px', height: '36px', opacity: isHotstarExpanded ? 0 : 1, transition: 'opacity 0.3s' }} />
            )}
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '280px' }}>
            <button onClick={onOpenProfileModal} className="hotstar-sidebar-btn">
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)' }}>
                {currentProfile?.avatarUrl ? (
                  <img src={currentProfile.avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Settings size={14} color="#FFF" /></div>
                )}
              </div>
              <span style={{ opacity: isHotstarExpanded ? 1 : 0, transition: 'opacity 0.2s 0.1s' }}>My Space</span>
            </button>

            <button className="hotstar-sidebar-btn search-btn" onClick={() => setIsSearchOpen(true)}>
              <Search size={24} style={{ flexShrink: 0 }} />
              <div style={{ opacity: isHotstarExpanded ? 1 : 0, transition: 'opacity 0.2s 0.1s', display: 'flex', alignItems: 'center', width: '100%' }}>
                <input type="text" placeholder="Search" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#FFF', outline: 'none', width: '100%', fontSize: '1rem', fontFamily: 'inherit' }} />
              </div>
            </button>

            {navItems.map((item) => {
              const isActive = activeTab === item.id && !searchQuery;
              const Icon = item.id === 'home' ? Home : item.id === 'series' ? Tv : item.id === 'movies' ? Film : item.id === 'anime' ? Globe : item.id === 'mylist' ? Plus : Home;
              return (
                <button key={item.id} onClick={() => { setActiveTab(item.id as any); onSearchChange(''); }} className={`hotstar-sidebar-btn ${isActive ? 'active' : ''}`} style={{ fontFamily: 'Inter, sans-serif' }}>
                  <Icon size={22} style={{ flexShrink: 0, color: isActive ? '#FFF' : '#8f98b0' }} />
                  <span style={{ opacity: isHotstarExpanded ? 1 : 0, transition: 'opacity 0.2s 0.1s', fontSize: '0.95rem', fontWeight: isActive ? 700 : 500, color: isActive ? '#FFF' : '#8f98b0' }}>{item.label}</span>
                </button>
              )
            })}
          </nav>

          <div style={{ marginTop: 'auto', width: '280px', paddingBottom: '24px', position: 'relative' }} ref={appSwitcherRef}>
             <button onClick={() => setShowAppSwitcher(!showAppSwitcher)} style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', paddingLeft: '32px' }} title="Switch App">
                <Grip size={20} />
             </button>
             {showAppSwitcher && renderAppSwitcherDropdown()}
          </div>
        </aside>

        {/* Hotstar Mobile Bottom Nav Bar (<768px) */}
        <nav className="mobile-bottom-nav" style={{ display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0, height: '56px', background: 'rgba(15, 16, 20, 0.96)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.1)', zIndex: 2000, alignItems: 'center', justifyContent: 'space-around', padding: '0 8px' }}>
          <button onClick={() => setActiveTab('home')} style={{ background: 'none', border: 'none', color: activeTab === 'home' ? '#1F80E0' : '#8F98B2', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}>
            <Home size={18} />
            Home
          </button>
          <button onClick={() => setActiveTab('movies')} style={{ background: 'none', border: 'none', color: activeTab === 'movies' ? '#1F80E0' : '#8F98B2', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}>
            <Film size={18} />
            Movies
          </button>
          <button onClick={() => setActiveTab('series')} style={{ background: 'none', border: 'none', color: activeTab === 'series' ? '#1F80E0' : '#8F98B2', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}>
            <Tv size={18} />
            TV
          </button>
          <button onClick={() => setActiveTab('mylist')} style={{ background: 'none', border: 'none', color: activeTab === 'mylist' ? '#1F80E0' : '#8F98B2', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={18} />
            My Space
          </button>
        </nav>
      </>
    );
  }

  // NETFLIX & PRIME TOP NAV
  return (
    <>
      <header>
        <div className={`navbar ${isScrolled ? 'scrolled' : ''}`} style={{ 
          marginLeft: 0, 
          transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)', 
          background: isScrolled 
            ? (platform === 'nprime' ? 'rgba(15, 23, 30, 0.95)' : 'rgba(20, 20, 20, 0.95)') 
            : 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)', 
          boxShadow: isScrolled ? '0 4px 12px rgba(0,0,0,0.5)' : 'none', 
          backdropFilter: isScrolled ? 'blur(20px)' : 'none', 
          height: platform === 'nprime' ? '72px' : '68px', 
          padding: '0 4%', 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
          position: 'fixed', top: 0, right: 0, left: 0, zIndex: 1000
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
            {platform === 'nflix' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setActiveTab('home')}>
                <img src="https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg" alt="Netflix" style={{ height: '24px' }} />
              </div>
            )}
            {platform === 'nprime' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setActiveTab('home')}>
                <img src="https://upload.wikimedia.org/wikipedia/commons/f/f1/Prime_Video.png" alt="Prime Video" style={{ height: '32px' }} />
              </div>
            )}
            
            <nav className="desktop-nav-items" style={{ display: 'flex', alignItems: 'center', gap: platform === 'nprime' ? '28px' : '20px', fontFamily: platform === 'nprime' ? '"Amazon Ember", Arial, sans-serif' : 'Helvetica, Arial, sans-serif' }}>
              {navItems.map((item) => (
                <button key={item.id} onClick={() => setActiveTab(item.id as any)} style={{ background: 'none', border: 'none', color: activeTab === item.id ? '#FFF' : (platform === 'nprime' ? '#8197a4' : '#E5E5E5'), fontWeight: activeTab === item.id ? 700 : (platform === 'nprime' ? 600 : 400), fontSize: platform === 'nprime' ? '0.95rem' : '0.85rem', cursor: 'pointer', transition: 'color 0.2s', letterSpacing: platform === 'nprime' ? '0.02em' : 'normal' }} onMouseEnter={(e) => e.currentTarget.style.color = '#FFF'} onMouseLeave={(e) => e.currentTarget.style.color = activeTab === item.id ? '#FFF' : (platform === 'nprime' ? '#8197a4' : '#E5E5E5')}>
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="navbar-right-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ position: 'relative' }} ref={appSwitcherRef}>
              <button onClick={() => setShowAppSwitcher(!showAppSwitcher)} style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Switch App">
                <Grip size={20} />
              </button>
              {showAppSwitcher && renderAppSwitcherDropdown()}
            </div>


            {onGenreFilterChange && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Filter size={14} color="var(--primary-color)" />
                <select aria-label="Filter by genre" value={selectedGenreFilter} onChange={(e) => onGenreFilterChange(e.target.value)} style={{ background: (platform === 'nprime') ? 'var(--bg-elevated)' : 'rgba(20, 20, 20, 0.85)', color: '#FFF', border: (platform === 'nprime') ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255, 255, 255, 0.25)', borderRadius: (platform === 'nprime') ? '8px' : '4px', padding: '5px 8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', outline: 'none', backdropFilter: 'blur(8px)' }}>
                  {['All', ...availableGenres.filter((genre) => genre !== 'All')].map((g) => (
                    <option key={g} value={g} style={{ background: '#141414', color: '#FFF' }}>{g === 'All' ? 'All Genres' : g}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <button onClick={() => setIsSearchOpen(!isSearchOpen)} style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Search"><Search size={20} /></button>
              {isSearchOpen && (
                <div style={{ position: 'relative' }}>
                  <input aria-label="Search titles, people, or genres" type="text" placeholder="Titles, people, genres" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} autoFocus onBlur={() => { setTimeout(() => { if (!searchQuery) setIsSearchOpen(false); }, 400); }} style={{ background: 'rgba(0, 0, 0, 0.75)', border: '1px solid rgba(255, 255, 255, 0.8)', color: '#FFF', padding: '6px 12px', marginLeft: '10px', width: '220px', fontSize: '0.9rem', outline: 'none', borderRadius: (platform === 'nprime') ? '8px' : '4px' }} />
                  {/* Search Dropdown Removed */}
                </div>
              )}
            </div>

            <div style={{ position: 'relative' }} ref={profileRef}>
              <div role="button" tabIndex={0} aria-expanded={showProfileDropdown} aria-label="Profile Menu" onKeyDown={(e) => { if(e.key === 'Enter') setShowProfileDropdown(!showProfileDropdown); }} onClick={() => setShowProfileDropdown(!showProfileDropdown)} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                {currentProfile?.avatarUrl ? (
                  <img src={currentProfile.avatarUrl} alt="Profile" style={{ width: '32px', height: '32px', borderRadius: (platform === 'nprime') ? '50%' : '4px', objectFit: 'cover' }} />
                ) : (
                  <img src={platform === 'nprime' ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=Prime' : 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png'} alt="Profile" style={{ width: '32px', height: '32px', borderRadius: (platform === 'nprime') ? '50%' : '4px', objectFit: 'cover' }} />
                )}
                <ChevronDown size={14} color="#FFF" />
              </div>

              {showProfileDropdown && (
                <div style={{ position: 'absolute', right: 0, top: '46px', width: '200px', background: (platform === 'nprime') ? 'var(--bg-elevated)' : 'rgba(20, 20, 20, 0.85)', border: '1px solid rgba(255, 255, 255, 0.15)', padding: '8px 0', borderRadius: (platform === 'nprime') ? '8px' : '8px', zIndex: 100, backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                  
                  {showSignIn && onSignInClick && (
                    <button onClick={() => { setShowProfileDropdown(false); onSignInClick(); }} style={{ width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', color: '#FFF', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <LogIn size={15} color="var(--primary-color)" /> Sign In
                    </button>
                  )}
                  {onOpenOnboardingModal && (
                    <button onClick={() => { setShowProfileDropdown(false); onOpenOnboardingModal(); }} style={{ width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', color: '#FFF', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Globe size={15} color="var(--primary-color)" /> Language & Dub Settings
                    </button>
                  )}
                  {!showSignIn && (
                    <button onClick={() => { setShowProfileDropdown(false); onOpenProfileModal(); }} style={{ width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', color: '#AAA', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Settings size={15} /> Manage Profiles
                    </button>
                  )}
                  {!showSignIn && onSignOutClick && (
                    <button onClick={() => { setShowProfileDropdown(false); onSignOutClick(); }} style={{ width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', color: '#E50914', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <LogIn size={15} /> Log Out
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (<768px) */}
      <nav className="mobile-bottom-nav" style={{ 
        display: 'none', 
        position: 'fixed', 
        bottom: 0, left: 0, right: 0, 
        height: '60px', 
        background: platform === 'nflix' ? 'rgba(18, 18, 18, 0.98)' : 'rgba(15, 23, 30, 0.98)', 
        backdropFilter: 'blur(20px)', 
        borderTop: platform === 'nflix' ? 'none' : '1px solid rgba(255,255,255,0.05)', 
        zIndex: 2000, 
        alignItems: 'center', 
        justifyContent: 'space-around', 
        padding: '0 4px',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}>
        <button onClick={() => setActiveTab('home')} style={{ background: 'none', border: 'none', color: activeTab === 'home' ? (platform === 'nflix' ? '#FFF' : 'var(--primary-color)') : '#808080', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '0.65rem', fontWeight: activeTab === 'home' ? 700 : 500, cursor: 'pointer', transition: 'color 0.2s', width: '20%' }}>
          <Home size={22} strokeWidth={activeTab === 'home' ? 2.5 : 1.5} />
          Home
        </button>
        <button onClick={() => setActiveTab('movies')} style={{ background: 'none', border: 'none', color: activeTab === 'movies' ? (platform === 'nflix' ? '#FFF' : 'var(--primary-color)') : '#808080', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '0.65rem', fontWeight: activeTab === 'movies' ? 700 : 500, cursor: 'pointer', transition: 'color 0.2s', width: '20%' }}>
          <Film size={22} strokeWidth={activeTab === 'movies' ? 2.5 : 1.5} />
          Movies
        </button>
        <button onClick={() => setActiveTab('series')} style={{ background: 'none', border: 'none', color: activeTab === 'series' ? (platform === 'nflix' ? '#FFF' : 'var(--primary-color)') : '#808080', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '0.65rem', fontWeight: activeTab === 'series' ? 700 : 500, cursor: 'pointer', transition: 'color 0.2s', width: '20%' }}>
          <Tv size={22} strokeWidth={activeTab === 'series' ? 2.5 : 1.5} />
          TV Shows
        </button>
        
        {/* Search icon added to bottom bar for mobile! */}
        <button onClick={() => { setActiveTab('home'); setIsSearchOpen(true); }} style={{ background: 'none', border: 'none', color: isSearchOpen ? (platform === 'nflix' ? '#FFF' : 'var(--primary-color)') : '#808080', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '0.65rem', fontWeight: isSearchOpen ? 700 : 500, cursor: 'pointer', transition: 'color 0.2s', width: '20%' }}>
          <Search size={22} strokeWidth={isSearchOpen ? 2.5 : 1.5} />
          Search
        </button>

        <button onClick={() => setActiveTab('mylist')} style={{ background: 'none', border: 'none', color: activeTab === 'mylist' ? (platform === 'nflix' ? '#FFF' : 'var(--primary-color)') : '#808080', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '0.65rem', fontWeight: activeTab === 'mylist' ? 700 : 500, cursor: 'pointer', transition: 'color 0.2s', width: '20%' }}>
          <Plus size={22} strokeWidth={activeTab === 'mylist' ? 2.5 : 1.5} />
          My List
        </button>
      </nav>
    </>
  );
};
