import React from 'react';
import { usePlatform } from './PlatformContext';

export const PlatformInitialLoader = ({ showSlowLoadMessage = false }: { showSlowLoadMessage?: boolean }) => {
  const { platform } = usePlatform();

  if (platform === 'nflix') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#141414',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <img
          src="https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg"
          alt="Netflix"
          style={{ height: '56px', width: 'auto', marginBottom: '32px', animation: 'scalePulse 1.5s infinite ease-in-out' }}
        />
        <div style={{
          width: '50px', height: '50px',
          border: '3px solid rgba(229, 9, 20, 0.2)',
          borderTop: '3px solid #E50914',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        {showSlowLoadMessage && (
          <div style={{ marginTop: '30px', color: '#999', fontSize: '0.9rem', maxWidth: '300px', textAlign: 'center', lineHeight: '1.5', animation: 'fadeIn 0.5s ease-in' }}>
            <p style={{ fontWeight: 500, color: '#FFF' }}>Preparing your experience...</p>
            <p style={{ fontSize: '0.85rem', color: '#888', marginTop: '8px' }}>Optimizing stream quality and fetching metadata.</p>
          </div>
        )}
      </div>
    );
  }

  if (platform === 'nprime') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#0F171E',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <img
          src="https://upload.wikimedia.org/wikipedia/commons/f/f1/Prime_Video.png"
          alt="Prime Video"
          style={{ height: '48px', width: 'auto', marginBottom: '32px', filter: 'drop-shadow(0 0 12px rgba(0,168,225,0.4))' }}
        />
        <div style={{
          width: '200px', height: '4px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '2px', overflow: 'hidden', position: 'relative'
        }}>
          <div style={{
            position: 'absolute', top: 0, bottom: 0, width: '40%',
            background: 'linear-gradient(90deg, transparent, #00A8E1, transparent)',
            animation: 'primeShimmer 1.2s infinite ease-in-out'
          }} />
        </div>
        {showSlowLoadMessage && (
          <div style={{ marginTop: '30px', color: '#999', fontSize: '0.9rem', maxWidth: '300px', textAlign: 'center', lineHeight: '1.5', animation: 'fadeIn 0.5s ease-in' }}>
            <p style={{ fontWeight: 500, color: '#FFF' }}>Preparing your experience...</p>
            <p style={{ fontSize: '0.85rem', color: '#888', marginTop: '8px' }}>Optimizing stream quality and fetching metadata.</p>
          </div>
        )}
      </div>
    );
  }

  // Hotstar Platform Loader
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#0F1014',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }}>
      <img
        src="https://secure-media.hotstarext.com/web-assets/prod/images/brand-logos/disney-hotstar-logo-dark.svg"
        alt="Disney+ Hotstar"
        style={{ height: '52px', width: 'auto', marginBottom: '32px' }}
      />
      <div style={{
        display: 'flex', gap: '8px'
      }}>
        {[0, 1, 2].map((idx) => (
          <div
            key={idx}
            style={{
              width: '12px', height: '12px', borderRadius: '50%',
              backgroundColor: '#1F80E0',
              animation: 'hotstarDotPulse 1.2s infinite ease-in-out',
              animationDelay: `${idx * 0.2}s`
            }}
          />
        ))}
      </div>
      {showSlowLoadMessage && (
          <div style={{ marginTop: '30px', color: '#999', fontSize: '0.9rem', maxWidth: '300px', textAlign: 'center', lineHeight: '1.5', animation: 'fadeIn 0.5s ease-in' }}>
            <p style={{ fontWeight: 500, color: '#FFF' }}>Preparing your experience...</p>
            <p style={{ fontSize: '0.85rem', color: '#888', marginTop: '8px' }}>Optimizing stream quality and fetching metadata.</p>
          </div>
      )}
    </div>
  );
};

export const HeroSkeleton = () => {
  return (
    <div style={{
      width: '100%',
      height: '80vh',
      minHeight: '600px',
      position: 'relative',
      overflow: 'hidden',
      animation: 'netflixSkeletonPulse 2s infinite ease-in-out'
    }}>
      <div style={{
        position: 'absolute',
        bottom: '20%',
        left: '4%',
        width: '40%',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div style={{ width: '80%', height: '60px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }} />
        <div style={{ width: '100%', height: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
        <div style={{ width: '90%', height: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <div style={{ width: '120px', height: '40px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }} />
          <div style={{ width: '160px', height: '40px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }} />
        </div>
      </div>
    </div>
  );
};

export const MovieRowSkeleton = () => {
  const { platform } = usePlatform();
  const cardWidth = platform === 'hotstar' ? '200px' : platform === 'nprime' ? '300px' : '220px';
  const cardHeight = platform === 'hotstar' ? '300px' : platform === 'nprime' ? '169px' : '330px';

  return (
    <div style={{ margin: '30px 0', padding: '0 4%' }}>
      <div style={{ 
        width: '200px', 
        height: '24px', 
        background: 'rgba(255,255,255,0.1)', 
        borderRadius: '4px', 
        marginBottom: '16px',
        animation: 'netflixSkeletonPulse 2s infinite ease-in-out'
      }} />
      <div style={{ display: 'flex', gap: '12px', overflow: 'hidden' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            minWidth: cardWidth,
            height: cardHeight,
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '4px',
            animation: 'netflixSkeletonPulse 2s infinite ease-in-out',
            animationDelay: `${i * 0.1}s`
          }} />
        ))}
      </div>
    </div>
  );
};
