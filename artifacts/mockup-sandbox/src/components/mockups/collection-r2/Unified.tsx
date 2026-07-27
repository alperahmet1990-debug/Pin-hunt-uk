import React, { useState, useEffect } from 'react';
import { Search, Plus, ChevronRight, CheckCircle2, Bookmark, ArrowRightLeft, Target, Share2, Copy, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Unified() {
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
    <div className="mx-auto max-w-[390px] h-[844px] bg-slate-50 relative overflow-hidden flex flex-col font-sans border-x border-slate-200 shadow-2xl">
      {/* Header */}
      <header className="px-5 pt-12 pb-4 bg-white sticky top-0 z-20 shadow-sm border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">My Collection</h1>
            <p className="text-sm text-slate-500 font-medium mt-0.5">23 owned • 4 ISO • 3 trade</p>
          </div>
          <button className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 hover:bg-slate-200 transition-colors">
            <Search className="w-5 h-5" />
          </button>
        </div>
        
        {/* Mode Switch */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex bg-slate-100 rounded-full p-1 flex-1">
            <button
              onClick={() => setMode('organise')}
              className={cn(
                "flex-1 px-4 py-2.5 rounded-full text-sm font-bold transition-all",
                mode === 'organise'
                  ? "bg-white shadow-md text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              My Portfolio
            </button>
            <button
              onClick={() => setMode('trade')}
              className={cn(
                "flex-1 px-4 py-2.5 rounded-full text-sm font-bold transition-all",
                mode === 'trade'
                  ? "bg-white shadow-md text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              )}
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
                <Target className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-bold text-amber-600 uppercase tracking-wider">Nearly Complete</h2>
              </div>
              
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-5 text-white shadow-lg shadow-indigo-200 relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-purple-400/20 rounded-full blur-xl"></div>
                
                <div className="flex justify-between items-start mb-5 relative z-10">
                  <div>
                    <h3 className="text-xl font-bold leading-tight mb-1">Lilo & Stitch<br/>25th Anniversary</h3>
                    <p className="text-indigo-100 text-sm font-medium">5 of 6 pins collected</p>
                  </div>
                  
                  {/* Circular Progress */}
                  <div className="relative w-12 h-12 shrink-0">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-white/20"
                        strokeWidth="4"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-white drop-shadow-md"
                        strokeWidth="4"
                        strokeDasharray="83, 100"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                      83%
                    </div>
                  </div>
                </div>
                
                <div className={cn("flex gap-3 overflow-x-auto -mx-5 px-5 relative z-10", hideScrollbar)}>
                  {[1, 2, 3, 4, 5].map((num) => (
                    <div key={num} className="w-[72px] h-[72px] shrink-0 rounded-2xl bg-white/10 p-1 backdrop-blur-sm border border-white/20">
                      <img
                        src={`/__mockup/images/pins/pin${num}.png`}
                        className="w-full h-full object-cover rounded-xl"
                        alt={`Lilo & Stitch Pin ${num}`}
                      />
                    </div>
                  ))}
                  {/* Missing Ghost Pin */}
                  <div className="w-[72px] h-[72px] shrink-0 rounded-2xl border-2 border-dashed border-white/40 flex flex-col items-center justify-center bg-white/5 backdrop-blur-sm relative">
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center shadow-md">
                      <Bookmark className="w-3.5 h-3.5 text-amber-900 fill-amber-900" />
                    </div>
                    <div className="text-white/60 text-xl font-bold mb-0.5">?</div>
                    <div className="text-[9px] font-bold text-white/60 uppercase tracking-widest">ISO</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Binder Page: Hidden Disney Wave A */}
            <section className="mb-6 mx-5">
              <div className="bg-[#fefcf8] rounded-2xl rounded-l-md border border-[#e8dfd5] shadow-[4px_4px_12px_rgba(0,0,0,0.03)] relative">
                {/* Binder Spine */}
                <div className="absolute top-0 bottom-0 left-0 w-7 flex flex-col justify-evenly py-6 border-r border-[#e8dfd5]/50 bg-[#f9f6f0] rounded-l-md">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="relative w-full h-8 flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full bg-[#fcfbf9] shadow-[inset_1px_1px_4px_rgba(0,0,0,0.2)] ring-1 ring-black/5" />
                      <div className="absolute w-5 h-[5px] left-[-4px] top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-[#b5b5b5] via-[#f0f0f0] to-[#999999] shadow-[0_1px_2px_rgba(0,0,0,0.2)] z-10" />
                    </div>
                  ))}
                </div>
                
                <div className="pl-10 pr-4 py-5">
                  <div className="flex justify-between items-start mb-5 gap-3">
                    <div>
                      <h3 className="text-[14px] font-bold text-stone-800 leading-tight pr-2">Hidden Disney Wave A – Castles</h3>
                      <p className="text-[11px] font-bold text-stone-400 mt-1 uppercase tracking-wider">3 / 8 collected</p>
                    </div>
                    <div className="text-[10px] px-2.5 py-1 rounded-full font-extrabold bg-stone-50 text-stone-500 border border-stone-200 shadow-sm">
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
                        pin.status === 'empty' && "bg-[#f5f1eb]/50 shadow-[inset_0_2px_6px_rgba(0,0,0,0.04)] border border-[#e8dfd5]/40",
                        pin.status === 'iso' && "bg-amber-50/30 border border-amber-200/50 shadow-[inset_0_2px_6px_rgba(0,0,0,0.02)]"
                      )}>
                        {pin.status === 'owned' && (
                          <img src={pin.img!} alt="" className="w-[90%] h-[90%] object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.2)] z-10" />
                        )}
                        {pin.status === 'iso' && (
                          <div className="w-8 h-8 rounded-full bg-amber-50 shadow-[inset_1px_2px_4px_rgba(251,191,36,0.2)] border border-amber-200 flex items-center justify-center">
                            <Bookmark className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
                          </div>
                        )}
                        {pin.status === 'empty' && (
                          <div className="w-6 h-6 rounded-full bg-[#e8dfd5]/40 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.08)]" />
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
                  <h3 className="font-bold text-slate-900 text-lg">Mickey & Friends Classics</h3>
                  <p className="text-xs text-slate-500 font-medium">7 of 12 • 58%</p>
                </div>
                <button className="text-slate-400 p-1 hover:text-slate-600 transition-colors bg-white rounded-full shadow-sm border border-slate-100">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              
              <div className="pr-5 mb-4">
                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: '58%' }}></div>
                </div>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[6, 7, 8, 1, 2, 3, 4].map((num, i) => (
                  <div key={i} className="w-[88px] h-[88px] shrink-0 rounded-2xl bg-white p-1 shadow-sm border border-slate-200 relative group">
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-xl bg-slate-50"
                      alt={`Mickey Pin ${num}`}
                    />
                    {i === 2 && (
                      <div className="absolute -top-2 -right-2 w-7 h-7 bg-purple-500 text-white rounded-full flex items-center justify-center shadow-sm border-2 border-slate-50">
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                ))}
                {/* 5 missing pins */}
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={`miss-${i}`} className="w-[88px] h-[88px] shrink-0 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center relative">
                    {i === 1 && (
                      <div className="absolute -top-2 -right-2 w-7 h-7 bg-amber-400 text-amber-950 rounded-full flex items-center justify-center shadow-sm border-2 border-slate-50">
                        <Bookmark className="w-3.5 h-3.5 fill-amber-950" />
                      </div>
                    )}
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 mb-1">
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
                  <h3 className="font-bold text-slate-900 text-lg">Grail Wall</h3>
                  <p className="text-xs text-slate-500 font-medium">Your dream pins</p>
                </div>
                <button className="text-slate-400 p-1 hover:text-slate-600 transition-colors bg-white rounded-full shadow-sm border border-slate-100">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[1, 2, 3, 4, 5, 6].map((num, i) => (
                  <div key={i} className="w-[88px] h-[88px] shrink-0 rounded-2xl bg-white p-1 shadow-sm border border-slate-200">
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-xl bg-slate-50"
                      alt={`Grail Pin ${num}`}
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
                    <h3 className="font-bold text-slate-900 text-lg">Tinker Bell Starter</h3>
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-100" />
                  </div>
                  <p className="text-xs text-emerald-600 font-bold mt-0.5 uppercase tracking-wide">Complete Set</p>
                </div>
                <button className="text-slate-400 p-1 hover:text-slate-600 transition-colors bg-white rounded-full shadow-sm border border-slate-100">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[8, 1, 2, 3].map((num, i) => (
                  <div key={i} className="w-[88px] h-[88px] shrink-0 rounded-2xl bg-white p-1 shadow-sm border-2 border-emerald-400 relative">
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-xl bg-slate-50"
                      alt={`Tinker Pin ${num}`}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Singles */}
            <section className="mb-12 pl-5">
              <div className="pr-5 mb-3 flex items-end justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Singles</h3>
                  <p className="text-xs text-slate-500 font-medium">4 loose pins</p>
                </div>
                <button className="text-slate-400 p-1 hover:text-slate-600 transition-colors bg-white rounded-full shadow-sm border border-slate-100">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[4, 5, 6, 7].map((num, i) => (
                  <div key={i} className="w-[88px] h-[88px] shrink-0 rounded-2xl bg-white p-1 shadow-sm border border-slate-200">
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-xl bg-slate-50"
                      alt={`Single Pin ${num}`}
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
                <span className="text-6xl font-black tracking-tighter text-slate-900 leading-none">3</span>
                <span className="text-lg font-medium text-slate-500">pins for trade</span>
              </div>

              {/* Stat Tiles */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="flex flex-col gap-2 p-4 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-50/50 text-left shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-full bg-blue-100 shadow-sm">
                      <ArrowRightLeft size={18} className="text-blue-600" strokeWidth={2.5} />
                    </div>
                    <span className="text-3xl font-black text-blue-900">3</span>
                  </div>
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">For Trade</span>
                </div>

                <div className="flex flex-col gap-2 p-4 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-purple-50/50 text-left shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-full bg-purple-100 shadow-sm">
                      <Copy size={18} className="text-purple-600" strokeWidth={2.5} />
                    </div>
                    <span className="text-3xl font-black text-purple-900">2</span>
                  </div>
                  <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">Duplicates</span>
                </div>

                <div className="flex flex-col gap-2 p-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-50/50 text-left col-span-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-full bg-amber-100 shadow-sm">
                      <Bookmark size={18} className="text-amber-600 fill-amber-600/20" strokeWidth={2.5} />
                    </div>
                    <span className="text-3xl font-black text-amber-900">4</span>
                  </div>
                  <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">In Search Of (ISO)</span>
                </div>
              </div>
            </div>

            {/* Your Trade Pile */}
            <section className="mb-8 px-5">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Your Trade Pile</h3>
                  <p className="text-xs text-slate-500 font-medium">5 pins available for trade</p>
                </div>
              </div>

              {/* Photo Grid */}
              <div className="grid grid-cols-3 gap-3">
                {[7, 3, 8, 2, 5].map((num, i) => (
                  <div key={i} className="relative group overflow-hidden bg-white rounded-2xl aspect-square shadow-sm border border-slate-200">
                    <img 
                      src={`/__mockup/images/pins/pin${num}.png`}
                      alt={`Trade Pin ${num}`}
                      className="w-full h-full object-cover p-2"
                    />
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-blue-600/80 via-transparent to-transparent opacity-60" />
                    
                    {/* Duplicate Badge */}
                    {i === 0 && (
                      <div className="absolute top-2 right-2 w-7 h-7 bg-purple-500 text-white rounded-full flex items-center justify-center shadow-md border-2 border-white text-xs font-black">
                        2
                      </div>
                    )}
                    {i === 3 && (
                      <div className="absolute top-2 right-2 w-7 h-7 bg-purple-500 text-white rounded-full flex items-center justify-center shadow-md border-2 border-white text-xs font-black">
                        2
                      </div>
                    )}
                    
                    {/* Status Badge */}
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="bg-white/95 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm border border-blue-100">
                        <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest text-center">For Trade</p>
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
                  <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                    <Bookmark className="w-5 h-5 text-amber-500 fill-amber-500/20" />
                    In Search Of
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">4 pins you're looking for</p>
                </div>
                <button className="text-slate-400 p-1 hover:text-slate-600 transition-colors bg-white rounded-full shadow-sm border border-slate-100">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pb-2", hideScrollbar)}>
                {[1, 4, 6, 8].map((num, i) => (
                  <div key={i} className="w-[110px] h-[110px] shrink-0 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/50 p-3 shadow-sm border-2 border-amber-200 relative flex flex-col items-center justify-center">
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center shadow-md border-2 border-white">
                      <Bookmark className="w-4 h-4 text-amber-900 fill-amber-900" />
                    </div>
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-contain drop-shadow-md"
                      alt={`ISO Pin ${num}`}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Share CTA */}
            <section className="mb-12 px-5">
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-slate-900/30 relative overflow-hidden">
                <div className="absolute -top-8 -right-8 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-purple-500/20 rounded-full blur-2xl"></div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
                      <Share2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Share Your Trade List</h3>
                      <p className="text-sm text-slate-300 font-medium">Find collectors nearby</p>
                    </div>
                  </div>
                  
                  <button className="w-full bg-white text-slate-900 py-3.5 px-6 rounded-2xl font-bold text-sm shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2">
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
      <button className="absolute bottom-8 right-6 w-14 h-14 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-lg shadow-slate-900/30 hover:scale-105 active:scale-95 transition-all z-30">
        <Plus className="w-7 h-7" />
      </button>
    </div>
  );
}

export default Unified;
