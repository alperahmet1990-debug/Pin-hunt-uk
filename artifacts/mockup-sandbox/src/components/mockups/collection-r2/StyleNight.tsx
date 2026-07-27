import React, { useState, useEffect } from 'react';
import { Search, Plus, ChevronRight, CheckCircle2, Bookmark, ArrowRightLeft, Target, Share2, Copy, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StyleNight() {
  // Read initial mode from URL
  const [mode, setMode] = useState<'organise' | 'trade'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('mode') === 'trade' ? 'trade' : 'organise';
    }
    return 'organise';
  });

  const PINS = [
    '/__mockup/images/pins/pin1.png',
    '/__mockup/images/pins/pin2.png',
    '/__mockup/images/pins/pin3.png',
    '/__mockup/images/pins/pin4.png',
    '/__mockup/images/pins/pin5.png',
    '/__mockup/images/pins/pin6.png',
    '/__mockup/images/pins/pin7.png',
    '/__mockup/images/pins/pin8.png',
  ];

  const hideScrollbar = "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]";

  return (
    <div 
      className="mx-auto max-w-[390px] h-[844px] relative overflow-hidden flex flex-col font-['Inter'] border-x shadow-2xl"
      style={{
        background: 'linear-gradient(to bottom, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        borderColor: '#1e293b'
      }}
    >
      {/* Ambient glow effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[400px] opacity-20 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-64 h-64 rounded-full blur-[120px]" style={{ background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)' }} />
        <div className="absolute top-20 right-1/4 w-48 h-48 rounded-full blur-[100px]" style={{ background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)' }} />
      </div>

      {/* Header */}
      <header 
        className="px-5 pt-12 pb-4 sticky top-0 z-20 backdrop-blur-xl border-b"
        style={{
          background: 'rgba(15, 23, 42, 0.85)',
          borderColor: 'rgba(148, 163, 184, 0.1)',
          boxShadow: '0 4px 24px rgba(168, 85, 247, 0.1)'
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 
              className="text-2xl font-black tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #e0e7ff 0%, #c4b5fd 50%, #ddd6fe 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              My Collection
            </h1>
            <p className="text-sm font-medium mt-0.5" style={{ color: '#94a3b8' }}>
              23 owned • 4 ISO • 3 trade
            </p>
          </div>
          <button 
            className="h-10 w-10 rounded-full flex items-center justify-center transition-all"
            style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              color: '#cbd5e1',
              boxShadow: '0 0 20px rgba(6, 182, 212, 0.2)'
            }}
          >
            <Search className="w-5 h-5" />
          </button>
        </div>
        
        {/* Mode Switch */}
        <div className="flex items-center gap-3 mb-3">
          <div 
            className="flex rounded-full p-1 flex-1"
            style={{
              background: 'rgba(30, 41, 59, 0.5)',
              border: '1px solid rgba(148, 163, 184, 0.15)'
            }}
          >
            <button
              onClick={() => setMode('organise')}
              className={cn(
                "flex-1 px-4 py-2.5 rounded-full text-sm font-bold transition-all",
                mode === 'organise'
                  ? ""
                  : "text-slate-400 hover:text-slate-300"
              )}
              style={mode === 'organise' ? {
                background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                color: '#ffffff',
                boxShadow: '0 4px 20px rgba(168, 85, 247, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.2)'
              } : {}}
            >
              My Portfolio
            </button>
            <button
              onClick={() => setMode('trade')}
              className={cn(
                "flex-1 px-4 py-2.5 rounded-full text-sm font-bold transition-all",
                mode === 'trade'
                  ? ""
                  : "text-slate-400 hover:text-slate-300"
              )}
              style={mode === 'trade' ? {
                background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                color: '#ffffff',
                boxShadow: '0 4px 20px rgba(168, 85, 247, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.2)'
              } : {}}
            >
              My Showcase
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-32">
        
        {mode === 'organise' ? (
          <>
            {/* ORGANISE MODE: Nearly Complete Hero + Shelves + Binder Grids + Boards */}
            
            {/* Hero: Nearly Complete */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4" style={{ color: '#fbbf24' }} />
                <h2 
                  className="text-sm font-bold uppercase tracking-wider"
                  style={{ color: '#fbbf24' }}
                >
                  Nearly Complete
                </h2>
              </div>
              
              <div 
                className="rounded-3xl p-5 text-white shadow-lg relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #4c1d95 0%, #6b21a8 50%, #7c3aed 100%)',
                  boxShadow: '0 20px 60px rgba(124, 58, 237, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(168, 85, 247, 0.3)'
                }}
              >
                {/* Background decoration - glowing orbs */}
                <div 
                  className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                  style={{ background: 'radial-gradient(circle, rgba(6, 182, 212, 0.4) 0%, transparent 70%)' }}
                />
                <div 
                  className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full blur-2xl pointer-events-none"
                  style={{ background: 'radial-gradient(circle, rgba(168, 85, 247, 0.5) 0%, transparent 70%)' }}
                />
                
                <div className="flex justify-between items-start mb-5 relative z-10">
                  <div>
                    <h3 className="text-xl font-black leading-tight mb-1" style={{ color: '#ffffff', textShadow: '0 2px 10px rgba(0, 0, 0, 0.3)' }}>
                      Lilo & Stitch<br/>25th Anniversary
                    </h3>
                    <p className="text-sm font-medium" style={{ color: '#e0e7ff' }}>
                      5 of 6 pins collected
                    </p>
                  </div>
                  
                  {/* Circular Progress */}
                  <div className="relative w-12 h-12 shrink-0">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="opacity-20"
                        strokeWidth="4"
                        stroke="#ffffff"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        strokeWidth="4"
                        strokeDasharray="83, 100"
                        strokeLinecap="round"
                        stroke="#06b6d4"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        style={{ 
                          filter: 'drop-shadow(0 0 8px rgba(6, 182, 212, 0.8))',
                        }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-black" style={{ color: '#ffffff' }}>
                      83%
                    </div>
                  </div>
                </div>
                
                <div className={cn("flex gap-3 overflow-x-auto -mx-5 px-5 relative z-10", hideScrollbar)}>
                  {[1, 2, 3, 4, 5].map((num) => (
                    <div 
                      key={num} 
                      className="w-[72px] h-[72px] shrink-0 rounded-2xl p-1 backdrop-blur-sm"
                      style={{
                        background: 'rgba(15, 23, 42, 0.4)',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        boxShadow: '0 0 20px rgba(6, 182, 212, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.1)'
                      }}
                    >
                      <img
                        src={`/__mockup/images/pins/pin${num}.png`}
                        className="w-full h-full object-cover rounded-xl"
                        alt={`Lilo & Stitch Pin ${num}`}
                        style={{ filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4))' }}
                      />
                    </div>
                  ))}
                  {/* Missing Ghost Pin */}
                  <div 
                    className="w-[72px] h-[72px] shrink-0 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center backdrop-blur-sm relative"
                    style={{
                      borderColor: 'rgba(251, 191, 36, 0.4)',
                      background: 'rgba(15, 23, 42, 0.3)'
                    }}
                  >
                    <div 
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center shadow-md"
                      style={{
                        background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                        boxShadow: '0 0 16px rgba(251, 191, 36, 0.8)'
                      }}
                    >
                      <Bookmark className="w-3.5 h-3.5" style={{ color: '#451a03', fill: '#451a03' }} />
                    </div>
                    <div className="text-xl font-bold mb-0.5" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>?</div>
                    <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>ISO</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Binder Page: Hidden Disney Wave A */}
            <section className="mb-6 mx-5">
              <div 
                className="rounded-2xl rounded-l-md shadow-lg relative"
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid rgba(148, 163, 184, 0.15)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.05)'
                }}
              >
                {/* Binder Spine */}
                <div 
                  className="absolute top-0 bottom-0 left-0 w-7 flex flex-col justify-evenly py-6 border-r rounded-l-md"
                  style={{
                    borderColor: 'rgba(148, 163, 184, 0.1)',
                    background: 'rgba(15, 23, 42, 0.6)'
                  }}
                >
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="relative w-full h-8 flex items-center justify-center">
                      <div 
                        className="w-3 h-3 rounded-full ring-1"
                        style={{
                          background: 'rgba(30, 41, 59, 0.8)',
                          boxShadow: 'inset 1px 1px 4px rgba(0, 0, 0, 0.5)',
                          ringColor: 'rgba(148, 163, 184, 0.2)'
                        }}
                      />
                      <div 
                        className="absolute w-5 h-[5px] left-[-4px] top-1/2 -translate-y-1/2 rounded-full z-10"
                        style={{
                          background: 'linear-gradient(to bottom, #64748b 0%, #94a3b8 50%, #475569 100%)',
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.5)'
                        }}
                      />
                    </div>
                  ))}
                </div>
                
                <div className="pl-10 pr-4 py-5">
                  <div className="flex justify-between items-start mb-5 gap-3">
                    <div>
                      <h3 className="text-[14px] font-bold leading-tight pr-2" style={{ color: '#e2e8f0' }}>
                        Hidden Disney Wave A – Castles
                      </h3>
                      <p className="text-[11px] font-bold mt-1 uppercase tracking-wider" style={{ color: '#64748b' }}>
                        3 / 8 collected
                      </p>
                    </div>
                    <div 
                      className="text-[10px] px-2.5 py-1 rounded-full font-extrabold shadow-sm"
                      style={{
                        background: 'rgba(30, 41, 59, 0.8)',
                        color: '#94a3b8',
                        border: '1px solid rgba(148, 163, 184, 0.2)'
                      }}
                    >
                      37%
                    </div>
                  </div>
                  
                  {/* Grid with visible empty slots */}
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { status: 'owned', img: PINS[5] },
                      { status: 'owned', img: PINS[6] },
                      { status: 'owned', img: PINS[7] },
                      { status: 'iso', img: null },
                      { status: 'iso', img: null },
                      { status: 'empty', img: null },
                      { status: 'empty', img: null },
                      { status: 'empty', img: null },
                    ].map((pin, i) => (
                      <div key={i} className={cn(
                        "aspect-square rounded-xl flex items-center justify-center p-1.5 relative",
                        pin.status === 'empty' && "",
                        pin.status === 'iso' && ""
                      )}
                      style={
                        pin.status === 'empty' ? {
                          background: 'rgba(15, 23, 42, 0.4)',
                          boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(71, 85, 105, 0.3)'
                        } : pin.status === 'iso' ? {
                          background: 'rgba(251, 191, 36, 0.08)',
                          border: '1px solid rgba(251, 191, 36, 0.3)',
                          boxShadow: '0 0 12px rgba(251, 191, 36, 0.2), inset 0 2px 6px rgba(0, 0, 0, 0.2)'
                        } : {}
                      }>
                        {pin.status === 'owned' && (
                          <img 
                            src={pin.img!} 
                            alt="" 
                            className="w-[90%] h-[90%] object-contain z-10" 
                            style={{ filter: 'drop-shadow(0 0 12px rgba(16, 185, 129, 0.6)) drop-shadow(0 4px 6px rgba(0, 0, 0, 0.4))' }}
                          />
                        )}
                        {pin.status === 'iso' && (
                          <div 
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{
                              background: 'rgba(251, 191, 36, 0.15)',
                              boxShadow: 'inset 1px 2px 4px rgba(251, 191, 36, 0.2), 0 0 16px rgba(251, 191, 36, 0.3)',
                              border: '1px solid rgba(251, 191, 36, 0.4)'
                            }}
                          >
                            <Bookmark className="w-3.5 h-3.5" style={{ color: '#fbbf24', fill: 'rgba(251, 191, 36, 0.2)' }} />
                          </div>
                        )}
                        {pin.status === 'empty' && (
                          <div 
                            className="w-6 h-6 rounded-full"
                            style={{
                              background: 'rgba(71, 85, 105, 0.3)',
                              boxShadow: 'inset 1px 2px 4px rgba(0, 0, 0, 0.4)'
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Shelf: Mickey & Friends */}
            <section className="mb-8 pl-5">
              <div className="pr-5 mb-3 flex items-end justify-between">
                <div>
                  <h3 className="font-bold text-lg" style={{ color: '#e2e8f0' }}>Mickey & Friends Classics</h3>
                  <p className="text-xs font-medium" style={{ color: '#64748b' }}>7 of 12 • 58%</p>
                </div>
                <button 
                  className="p-1 transition-colors rounded-full shadow-sm"
                  style={{
                    color: '#64748b',
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(148, 163, 184, 0.15)'
                  }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              
              <div className="pr-5 mb-4">
                <div 
                  className="h-1.5 w-full rounded-full overflow-hidden"
                  style={{ background: 'rgba(30, 41, 59, 0.6)' }}
                >
                  <div 
                    className="h-full rounded-full" 
                    style={{ 
                      width: '58%',
                      background: 'linear-gradient(90deg, #06b6d4 0%, #0891b2 100%)',
                      boxShadow: '0 0 12px rgba(6, 182, 212, 0.6)'
                    }}
                  />
                </div>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[6, 7, 8, 1, 2, 3, 4].map((num, i) => (
                  <div 
                    key={i} 
                    className="w-[88px] h-[88px] shrink-0 rounded-2xl p-1 shadow-sm relative group"
                    style={{
                      background: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      boxShadow: '0 0 20px rgba(16, 185, 129, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.05)'
                    }}
                  >
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-xl"
                      alt={`Mickey Pin ${num}`}
                      style={{ 
                        background: 'rgba(15, 23, 42, 0.4)',
                        filter: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.5))'
                      }}
                    />
                    {i === 2 && (
                      <div 
                        className="absolute -top-2 -right-2 w-7 h-7 text-white rounded-full flex items-center justify-center shadow-md border-2"
                        style={{
                          background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                          borderColor: 'rgba(15, 23, 42, 0.8)',
                          boxShadow: '0 0 16px rgba(168, 85, 247, 0.8)'
                        }}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                ))}
                {/* 5 missing pins */}
                {[1, 2, 3, 4, 5].map((i) => (
                  <div 
                    key={`miss-${i}`} 
                    className="w-[88px] h-[88px] shrink-0 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center relative"
                    style={{
                      borderColor: 'rgba(71, 85, 105, 0.4)',
                      background: 'rgba(15, 23, 42, 0.3)'
                    }}
                  >
                    {i === 1 && (
                      <div 
                        className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-md border-2"
                        style={{
                          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                          borderColor: 'rgba(15, 23, 42, 0.8)',
                          color: '#451a03',
                          boxShadow: '0 0 16px rgba(251, 191, 36, 0.8)'
                        }}
                      >
                        <Bookmark className="w-3.5 h-3.5 fill-current" />
                      </div>
                    )}
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center mb-1"
                      style={{
                        background: 'rgba(71, 85, 105, 0.3)',
                        color: '#64748b'
                      }}
                    >
                      <Search className="w-4 h-4" />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Boards: Grail Wall */}
            <section className="mb-6 pl-5">
              <div className="pr-5 mb-3 flex items-end justify-between">
                <div>
                  <h3 className="font-bold text-lg" style={{ color: '#e2e8f0' }}>Grail Wall</h3>
                  <p className="text-xs font-medium" style={{ color: '#64748b' }}>Your dream pins</p>
                </div>
                <button 
                  className="p-1 transition-colors rounded-full shadow-sm"
                  style={{
                    color: '#64748b',
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(148, 163, 184, 0.15)'
                  }}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[1, 2, 3, 4, 5, 6].map((num, i) => (
                  <div 
                    key={i} 
                    className="w-[88px] h-[88px] shrink-0 rounded-2xl p-1 shadow-sm"
                    style={{
                      background: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.05)'
                    }}
                  >
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-xl"
                      alt={`Grail Pin ${num}`}
                      style={{ background: 'rgba(15, 23, 42, 0.4)' }}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Shelf: Tinker Bell Complete */}
            <section className="mb-8 pl-5">
              <div className="pr-5 mb-3 flex items-end justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-lg" style={{ color: '#e2e8f0' }}>Tinker Bell Starter</h3>
                    <CheckCircle2 
                      className="w-5 h-5" 
                      style={{ 
                        color: '#10b981',
                        fill: 'rgba(16, 185, 129, 0.2)',
                        filter: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.6))'
                      }} 
                    />
                  </div>
                  <p className="text-xs font-bold mt-0.5 uppercase tracking-wide" style={{ color: '#10b981' }}>Complete Set</p>
                </div>
                <button 
                  className="p-1 transition-colors rounded-full shadow-sm"
                  style={{
                    color: '#64748b',
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(148, 163, 184, 0.15)'
                  }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[8, 1, 2, 3].map((num, i) => (
                  <div 
                    key={i} 
                    className="w-[88px] h-[88px] shrink-0 rounded-2xl p-1 shadow-sm border-2 relative"
                    style={{
                      background: 'rgba(30, 41, 59, 0.6)',
                      borderColor: '#fbbf24',
                      boxShadow: '0 0 24px rgba(251, 191, 36, 0.6), inset 0 1px 2px rgba(255, 255, 255, 0.05)'
                    }}
                  >
                    {/* Gold sparkle effect */}
                    <div 
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full pointer-events-none"
                      style={{
                        background: 'radial-gradient(circle, #fbbf24 0%, transparent 70%)',
                        filter: 'blur(2px)',
                        animation: 'pulse 2s ease-in-out infinite'
                      }}
                    />
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-xl"
                      alt={`Tinker Pin ${num}`}
                      style={{ 
                        background: 'rgba(15, 23, 42, 0.4)',
                        filter: 'drop-shadow(0 0 12px rgba(251, 191, 36, 0.4))'
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Singles */}
            <section className="mb-12 pl-5">
              <div className="pr-5 mb-3 flex items-end justify-between">
                <div>
                  <h3 className="font-bold text-lg" style={{ color: '#e2e8f0' }}>Singles</h3>
                  <p className="text-xs font-medium" style={{ color: '#64748b' }}>4 loose pins</p>
                </div>
                <button 
                  className="p-1 transition-colors rounded-full shadow-sm"
                  style={{
                    color: '#64748b',
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(148, 163, 184, 0.15)'
                  }}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[4, 5, 6, 7].map((num, i) => (
                  <div 
                    key={i} 
                    className="w-[88px] h-[88px] shrink-0 rounded-2xl p-1 shadow-sm"
                    style={{
                      background: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.05)'
                    }}
                  >
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-xl"
                      alt={`Single Pin ${num}`}
                      style={{ background: 'rgba(15, 23, 42, 0.4)' }}
                    />
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            {/* TRADE MODE: Stats + Trade Pile + ISO + CTA */}
            
            {/* Stats Header */}
            <div className="px-5 pt-6 pb-5">
              <div className="flex items-baseline gap-2 mb-6">
                <span 
                  className="text-6xl font-black tracking-tighter leading-none"
                  style={{
                    background: 'linear-gradient(135deg, #e0e7ff 0%, #c4b5fd 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                >
                  3
                </span>
                <span className="text-lg font-medium" style={{ color: '#94a3b8' }}>pins for trade</span>
              </div>

              {/* Stat Tiles */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div 
                  className="flex flex-col gap-2 p-4 rounded-2xl text-left shadow-sm"
                  style={{
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(6, 182, 212, 0.05) 100%)',
                    boxShadow: '0 0 20px rgba(6, 182, 212, 0.2), inset 0 1px 2px rgba(255, 255, 255, 0.05)'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div 
                      className="p-2 rounded-full shadow-sm"
                      style={{
                        background: 'rgba(6, 182, 212, 0.2)',
                        boxShadow: '0 0 12px rgba(6, 182, 212, 0.3)'
                      }}
                    >
                      <ArrowRightLeft size={18} strokeWidth={2.5} style={{ color: '#06b6d4' }} />
                    </div>
                    <span className="text-3xl font-black" style={{ color: '#67e8f9' }}>3</span>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#22d3ee' }}>For Trade</span>
                </div>

                <div 
                  className="flex flex-col gap-2 p-4 rounded-2xl text-left shadow-sm"
                  style={{
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(168, 85, 247, 0.05) 100%)',
                    boxShadow: '0 0 20px rgba(168, 85, 247, 0.2), inset 0 1px 2px rgba(255, 255, 255, 0.05)'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div 
                      className="p-2 rounded-full shadow-sm"
                      style={{
                        background: 'rgba(168, 85, 247, 0.2)',
                        boxShadow: '0 0 12px rgba(168, 85, 247, 0.3)'
                      }}
                    >
                      <Copy size={18} strokeWidth={2.5} style={{ color: '#a855f7' }} />
                    </div>
                    <span className="text-3xl font-black" style={{ color: '#c4b5fd' }}>2</span>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#c084fc' }}>Duplicates</span>
                </div>

                <div 
                  className="flex flex-col gap-2 p-4 rounded-2xl text-left col-span-2 shadow-sm"
                  style={{
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(251, 191, 36, 0.05) 100%)',
                    boxShadow: '0 0 20px rgba(251, 191, 36, 0.2), inset 0 1px 2px rgba(255, 255, 255, 0.05)'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div 
                      className="p-2 rounded-full shadow-sm"
                      style={{
                        background: 'rgba(251, 191, 36, 0.2)',
                        boxShadow: '0 0 12px rgba(251, 191, 36, 0.3)'
                      }}
                    >
                      <Bookmark size={18} strokeWidth={2.5} style={{ color: '#fbbf24', fill: 'rgba(251, 191, 36, 0.2)' }} />
                    </div>
                    <span className="text-3xl font-black" style={{ color: '#fcd34d' }}>4</span>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#fbbf24' }}>In Search Of (ISO)</span>
                </div>
              </div>
            </div>

            {/* Your Trade Pile */}
            <section className="mb-8 px-5">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <h3 className="font-bold text-lg" style={{ color: '#e2e8f0' }}>Your Trade Pile</h3>
                  <p className="text-xs font-medium" style={{ color: '#64748b' }}>5 pins available for trade</p>
                </div>
              </div>

              {/* Photo Grid */}
              <div className="grid grid-cols-3 gap-3">
                {[7, 3, 8, 2, 5].map((num, i) => (
                  <div 
                    key={i} 
                    className="relative group overflow-hidden rounded-2xl aspect-square shadow-sm"
                    style={{
                      background: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid rgba(148, 163, 184, 0.2)'
                    }}
                  >
                    <img 
                      src={`/__mockup/images/pins/pin${num}.png`}
                      alt={`Trade Pin ${num}`}
                      className="w-full h-full object-cover p-2"
                    />
                    {/* Overlay */}
                    <div 
                      className="absolute inset-0 opacity-60 pointer-events-none"
                      style={{
                        background: 'linear-gradient(to top, rgba(124, 58, 237, 0.8) 0%, transparent 60%)'
                      }}
                    />
                    
                    {/* Duplicate Badge */}
                    {i === 0 && (
                      <div 
                        className="absolute top-2 right-2 w-7 h-7 text-white rounded-full flex items-center justify-center shadow-md border-2 text-xs font-black"
                        style={{
                          background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                          borderColor: 'rgba(255, 255, 255, 0.3)',
                          boxShadow: '0 0 16px rgba(168, 85, 247, 0.8)'
                        }}
                      >
                        2
                      </div>
                    )}
                    {i === 3 && (
                      <div 
                        className="absolute top-2 right-2 w-7 h-7 text-white rounded-full flex items-center justify-center shadow-md border-2 text-xs font-black"
                        style={{
                          background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                          borderColor: 'rgba(255, 255, 255, 0.3)',
                          boxShadow: '0 0 16px rgba(168, 85, 247, 0.8)'
                        }}
                      >
                        2
                      </div>
                    )}
                    
                    {/* Status Badge */}
                    <div className="absolute bottom-2 left-2 right-2">
                      <div 
                        className="backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm"
                        style={{
                          background: 'rgba(255, 255, 255, 0.15)',
                          border: '1px solid rgba(168, 85, 247, 0.3)',
                          boxShadow: '0 0 12px rgba(168, 85, 247, 0.4)'
                        }}
                      >
                        <p className="text-[9px] font-bold uppercase tracking-widest text-center" style={{ color: '#e9d5ff' }}>For Trade</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* In Search Of */}
            <section className="mb-8 px-5">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2" style={{ color: '#e2e8f0' }}>
                    <Bookmark className="w-5 h-5" style={{ color: '#fbbf24', fill: 'rgba(251, 191, 36, 0.2)' }} />
                    In Search Of
                  </h3>
                  <p className="text-xs font-medium" style={{ color: '#64748b' }}>4 pins you're looking for</p>
                </div>
                <button 
                  className="p-1 transition-colors rounded-full shadow-sm"
                  style={{
                    color: '#64748b',
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(148, 163, 184, 0.15)'
                  }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pb-2", hideScrollbar)}>
                {[1, 4, 6, 8].map((num, i) => (
                  <div 
                    key={i} 
                    className="w-[110px] h-[110px] shrink-0 rounded-2xl p-3 shadow-sm border-2 relative flex flex-col items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(251, 191, 36, 0.05) 100%)',
                      borderColor: 'rgba(251, 191, 36, 0.4)',
                      boxShadow: '0 0 24px rgba(251, 191, 36, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.05)'
                    }}
                  >
                    <div 
                      className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center shadow-md border-2"
                      style={{
                        background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                        borderColor: 'rgba(15, 23, 42, 0.8)',
                        boxShadow: '0 0 20px rgba(251, 191, 36, 0.8)'
                      }}
                    >
                      <Bookmark className="w-4 h-4" style={{ color: '#451a03', fill: '#451a03' }} />
                    </div>
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-contain"
                      alt={`ISO Pin ${num}`}
                      style={{ filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4))' }}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Share CTA */}
            <section className="mb-12 px-5">
              <div 
                className="rounded-3xl p-6 text-white shadow-xl relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(148, 163, 184, 0.2)'
                }}
              >
                <div 
                  className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                  style={{ background: 'radial-gradient(circle, rgba(6, 182, 212, 0.3) 0%, transparent 70%)' }}
                />
                <div 
                  className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full blur-2xl pointer-events-none"
                  style={{ background: 'radial-gradient(circle, rgba(168, 85, 247, 0.4) 0%, transparent 70%)' }}
                />
                
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div 
                      className="w-12 h-12 rounded-2xl backdrop-blur-sm flex items-center justify-center"
                      style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.1)'
                      }}
                    >
                      <Share2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Share Your Trade List</h3>
                      <p className="text-sm font-medium" style={{ color: '#cbd5e1' }}>Find collectors nearby</p>
                    </div>
                  </div>
                  
                  <button 
                    className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2"
                    style={{
                      background: 'linear-gradient(135deg, #e0e7ff 0%, #c4b5fd 100%)',
                      color: '#1e1b4b',
                      boxShadow: '0 8px 24px rgba(196, 181, 253, 0.4)'
                    }}
                  >
                    <Share2 className="w-4 h-4" />
                    Share Trade Pile
                  </button>
                </div>
              </div>
            </section>

          </>
        )}

      </div>

      {/* Floating Action Button */}
      <button 
        className="absolute bottom-8 right-6 w-14 h-14 text-white rounded-full flex items-center justify-center shadow-lg transition-all z-30"
        style={{
          background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
          boxShadow: '0 8px 32px rgba(168, 85, 247, 0.6), inset 0 1px 2px rgba(255, 255, 255, 0.2)'
        }}
      >
        <Plus className="w-7 h-7" />
      </button>
    </div>
  );
}

export default StyleNight;
