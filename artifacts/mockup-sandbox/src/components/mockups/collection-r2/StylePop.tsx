import React, { useState, useEffect } from 'react';
import { Search, Plus, ChevronRight, CheckCircle2, Bookmark, ArrowRightLeft, Target, Share2, Copy, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StylePop() {
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
    <div className="mx-auto max-w-[390px] h-[844px] bg-[#fef9f5] relative overflow-hidden flex flex-col font-['Nunito'] border-x border-[#ffd7e0] shadow-2xl">
      {/* Header */}
      <header className="px-5 pt-12 pb-4 bg-[#fff5f8] sticky top-0 z-20 shadow-[0_4px_20px_rgba(255,182,193,0.15)] border-b border-[#ffd7e0]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#2d2440]" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>My Collection</h1>
            <p className="text-sm text-[#8b7a9f] font-bold mt-0.5">23 owned • 4 ISO • 3 trade</p>
          </div>
          <button className="h-11 w-11 rounded-[20px] bg-[#ffe8f0] flex items-center justify-center text-[#ff6b9d] hover:bg-[#ffd7e0] transition-all shadow-[0_4px_12px_rgba(255,107,157,0.12)]">
            <Search className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
        
        {/* Mode Switch */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex bg-[#ffe8f0] rounded-[28px] p-1.5 flex-1 shadow-[inset_0_2px_8px_rgba(255,107,157,0.08)]">
            <button
              onClick={() => setMode('organise')}
              className={cn(
                "flex-1 px-4 py-3 rounded-[24px] text-sm font-black transition-all",
                mode === 'organise'
                  ? "bg-white shadow-[0_4px_16px_rgba(255,107,157,0.2)] text-[#ff6b9d] scale-[1.02]"
                  : "text-[#c7a8d4] hover:text-[#ff6b9d]"
              )}
            >
              My Portfolio
            </button>
            <button
              onClick={() => setMode('trade')}
              className={cn(
                "flex-1 px-4 py-3 rounded-[24px] text-sm font-black transition-all",
                mode === 'trade'
                  ? "bg-white shadow-[0_4px_16px_rgba(255,107,157,0.2)] text-[#ff6b9d] scale-[1.02]"
                  : "text-[#c7a8d4] hover:text-[#ff6b9d]"
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
                <Target className="w-4 h-4 text-[#ffa500]" strokeWidth={3} />
                <h2 className="text-sm font-black text-[#ffa500] uppercase tracking-wider">Nearly Complete</h2>
              </div>
              
              <div className="bg-gradient-to-br from-[#ffa5d8] to-[#ff6b9d] rounded-[32px] p-6 text-white shadow-[0_8px_24px_rgba(255,107,157,0.35)] relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/15 rounded-full blur-2xl"></div>
                <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-[#ff85b3]/30 rounded-full blur-xl"></div>
                
                <div className="flex justify-between items-start mb-5 relative z-10">
                  <div>
                    <h3 className="text-xl font-black leading-tight mb-1" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>Lilo & Stitch<br/>25th Anniversary</h3>
                    <p className="text-[#ffe0ed] text-sm font-bold">5 of 6 pins collected</p>
                  </div>
                  
                  {/* Circular Progress */}
                  <div className="relative w-14 h-14 shrink-0">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-white/25"
                        strokeWidth="5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-white drop-shadow-md"
                        strokeWidth="5"
                        strokeDasharray="83, 100"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-black">
                      83%
                    </div>
                  </div>
                </div>
                
                <div className={cn("flex gap-3 overflow-x-auto -mx-6 px-6 relative z-10", hideScrollbar)}>
                  {[1, 2, 3, 4, 5].map((num) => (
                    <div key={num} className="w-[76px] h-[76px] shrink-0 rounded-[24px] bg-white/15 p-1.5 backdrop-blur-sm border-2 border-white/30 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
                      <img
                        src={`/__mockup/images/pins/pin${num}.png`}
                        className="w-full h-full object-cover rounded-[18px]"
                        alt={`Lilo & Stitch Pin ${num}`}
                      />
                    </div>
                  ))}
                  {/* Missing Ghost Pin */}
                  <div className="w-[76px] h-[76px] shrink-0 rounded-[24px] border-[3px] border-dashed border-white/50 flex flex-col items-center justify-center bg-white/10 backdrop-blur-sm relative">
                    <div className="absolute -top-2 -right-2 w-7 h-7 bg-[#ffd93d] rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(255,217,61,0.4)] border-2 border-white">
                      <Bookmark className="w-3.5 h-3.5 text-[#8b6914] fill-[#8b6914]" strokeWidth={2.5} />
                    </div>
                    <div className="text-white/70 text-2xl font-black mb-0.5">?</div>
                    <div className="text-[10px] font-black text-white/70 uppercase tracking-widest">ISO</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Binder Page: Hidden Disney Wave A */}
            <section className="mb-6 mx-5">
              <div className="bg-[#d4f4dd] rounded-[32px] rounded-l-[16px] border-[3px] border-[#9fd4ab] shadow-[6px_6px_0_rgba(159,212,171,0.3)] relative">
                {/* Binder Spine */}
                <div className="absolute top-0 bottom-0 left-0 w-8 flex flex-col justify-evenly py-6 border-r-[3px] border-[#9fd4ab] bg-[#b8e6c5] rounded-l-[16px]">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="relative w-full h-8 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full bg-[#eafaef] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15)] ring-2 ring-white/50" />
                      <div className="absolute w-5 h-[6px] left-[-4px] top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-[#b5b5b5] via-[#f0f0f0] to-[#999999] shadow-[0_2px_4px_rgba(0,0,0,0.2)] z-10" />
                    </div>
                  ))}
                </div>
                
                <div className="pl-11 pr-5 py-6">
                  <div className="flex justify-between items-start mb-5 gap-3">
                    <div>
                      <h3 className="text-[15px] font-black text-[#2d5f3c] leading-tight pr-2">Hidden Disney Wave A – Castles</h3>
                      <p className="text-[11px] font-black text-[#7db88e] mt-1 uppercase tracking-wider">3 / 8 collected</p>
                    </div>
                    <div className="text-[11px] px-3 py-1.5 rounded-full font-black bg-white text-[#2d5f3c] border-2 border-[#9fd4ab] shadow-[0_3px_8px_rgba(159,212,171,0.25)]">
                      37%
                    </div>
                  </div>
                  
                  {/* Grid with visible empty slots */}
                  <div className="grid grid-cols-3 gap-3">
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
                        "aspect-square rounded-[20px] flex items-center justify-center p-2 relative",
                        pin.status === 'empty' && "bg-white/60 shadow-[inset_0_3px_8px_rgba(159,212,171,0.15)] border-2 border-[#c8ead4]",
                        pin.status === 'iso' && "bg-[#fff9e6] border-2 border-[#ffd93d] shadow-[0_3px_8px_rgba(255,217,61,0.2)]"
                      )}>
                        {pin.status === 'owned' && (
                          <img src={pin.img!} alt="" className="w-[85%] h-[85%] object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.25)] z-10" />
                        )}
                        {pin.status === 'iso' && (
                          <div className="w-9 h-9 rounded-full bg-[#fff4cc] shadow-[inset_2px_3px_6px_rgba(255,217,61,0.3)] border-2 border-[#ffd93d] flex items-center justify-center">
                            <Bookmark className="w-4 h-4 text-[#ffa500] fill-[#ffa500]/30" strokeWidth={2.5} />
                          </div>
                        )}
                        {pin.status === 'empty' && (
                          <div className="w-7 h-7 rounded-full bg-[#e0f0e6] shadow-[inset_2px_3px_6px_rgba(159,212,171,0.2)] border-2 border-[#b8e6c5]" />
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
                  <h3 className="font-black text-[#2d2440] text-lg" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>Mickey & Friends Classics</h3>
                  <p className="text-xs text-[#8b7a9f] font-bold">7 of 12 • 58%</p>
                </div>
                <button className="text-[#c7a8d4] p-1.5 hover:text-[#ff6b9d] transition-colors bg-white rounded-full shadow-[0_3px_8px_rgba(255,107,157,0.12)] border-2 border-[#ffe8f0]">
                  <ChevronRight className="w-4 h-4" strokeWidth={3} />
                </button>
              </div>
              
              <div className="pr-5 mb-4">
                <div className="h-2 w-full bg-[#ffe8f0] rounded-full overflow-hidden shadow-[inset_0_2px_4px_rgba(255,107,157,0.1)]">
                  <div className="h-full bg-gradient-to-r from-[#a5d8ff] to-[#74c0fc] rounded-full shadow-[0_0_8px_rgba(116,192,252,0.4)]" style={{ width: '58%' }}></div>
                </div>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[6, 7, 8, 1, 2, 3, 4].map((num, i) => (
                  <div key={i} className="w-[92px] h-[92px] shrink-0 rounded-[24px] bg-white p-2 shadow-[0_4px_12px_rgba(165,216,255,0.25),0_0_0_3px_rgba(165,216,255,0.2)] border-2 border-[#a5d8ff] relative group">
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-[18px] bg-[#f0f9ff]"
                      alt={`Mickey Pin ${num}`}
                    />
                    {i === 2 && (
                      <div className="absolute -top-2 -right-2 w-8 h-8 bg-[#b197fc] text-white rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(177,151,252,0.4)] border-[3px] border-white">
                        <ArrowRightLeft className="w-4 h-4" strokeWidth={2.5} />
                      </div>
                    )}
                  </div>
                ))}
                {/* 5 missing pins */}
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={`miss-${i}`} className="w-[92px] h-[92px] shrink-0 rounded-[24px] border-[3px] border-dashed border-[#d0ebff] bg-[#f0f9ff]/70 flex flex-col items-center justify-center relative">
                    {i === 1 && (
                      <div className="absolute -top-2 -right-2 w-8 h-8 bg-[#ffd93d] text-[#8b6914] rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(255,217,61,0.4)] border-[3px] border-white">
                        <Bookmark className="w-4 h-4 fill-[#8b6914]" strokeWidth={2.5} />
                      </div>
                    )}
                    <div className="w-9 h-9 rounded-full bg-[#d0ebff] flex items-center justify-center text-[#74c0fc] mb-1 shadow-[inset_0_2px_4px_rgba(116,192,252,0.15)]">
                      <Search className="w-4 h-4" strokeWidth={2.5} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Boards: Grail Wall */}
            <section className="mb-6 pl-5">
              <div className="pr-5 mb-3 flex items-end justify-between">
                <div>
                  <h3 className="font-black text-[#2d2440] text-lg" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>Grail Wall</h3>
                  <p className="text-xs text-[#8b7a9f] font-bold">Your dream pins</p>
                </div>
                <button className="text-[#c7a8d4] p-1.5 hover:text-[#ff6b9d] transition-colors bg-white rounded-full shadow-[0_3px_8px_rgba(255,107,157,0.12)] border-2 border-[#ffe8f0]">
                  <MoreHorizontal className="w-4 h-4" strokeWidth={3} />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[1, 2, 3, 4, 5, 6].map((num, i) => (
                  <div key={i} className="w-[92px] h-[92px] shrink-0 rounded-[24px] bg-white p-2 shadow-[0_4px_12px_rgba(255,107,157,0.2)] border-2 border-[#ffe8f0]">
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-[18px] bg-[#fef9f5]"
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
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-[#2d2440] text-lg" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>Tinker Bell Starter</h3>
                    <div className="relative">
                      <CheckCircle2 className="w-6 h-6 text-[#51cf66] fill-[#d3f9d8]" strokeWidth={2.5} />
                      {/* Confetti dots */}
                      <div className="absolute -top-1 -left-1 w-1.5 h-1.5 rounded-full bg-[#ffd93d]"></div>
                      <div className="absolute -top-2 left-3 w-1 h-1 rounded-full bg-[#ff6b9d]"></div>
                      <div className="absolute top-0 -right-2 w-1.5 h-1.5 rounded-full bg-[#74c0fc]"></div>
                      <div className="absolute -bottom-1 left-1 w-1 h-1 rounded-full bg-[#ffa500]"></div>
                    </div>
                  </div>
                  <p className="text-xs text-[#51cf66] font-black mt-0.5 uppercase tracking-wide">Complete Set</p>
                </div>
                <button className="text-[#c7a8d4] p-1.5 hover:text-[#ff6b9d] transition-colors bg-white rounded-full shadow-[0_3px_8px_rgba(255,107,157,0.12)] border-2 border-[#ffe8f0]">
                  <ChevronRight className="w-4 h-4" strokeWidth={3} />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[8, 1, 2, 3].map((num, i) => (
                  <div key={i} className="w-[92px] h-[92px] shrink-0 rounded-[24px] bg-white p-2 shadow-[0_4px_12px_rgba(81,207,102,0.3),0_0_0_3px_rgba(81,207,102,0.15)] border-[3px] border-[#51cf66] relative">
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-[18px] bg-[#f0f9f5]"
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
                  <h3 className="font-black text-[#2d2440] text-lg" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>Singles</h3>
                  <p className="text-xs text-[#8b7a9f] font-bold">4 loose pins</p>
                </div>
                <button className="text-[#c7a8d4] p-1.5 hover:text-[#ff6b9d] transition-colors bg-white rounded-full shadow-[0_3px_8px_rgba(255,107,157,0.12)] border-2 border-[#ffe8f0]">
                  <MoreHorizontal className="w-4 h-4" strokeWidth={3} />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[4, 5, 6, 7].map((num, i) => (
                  <div key={i} className="w-[92px] h-[92px] shrink-0 rounded-[24px] bg-white p-2 shadow-[0_4px_12px_rgba(255,107,157,0.2)] border-2 border-[#ffe8f0]">
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-[18px] bg-[#fef9f5]"
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
                <span className="text-6xl font-black tracking-tighter text-[#2d2440] leading-none" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>3</span>
                <span className="text-lg font-bold text-[#8b7a9f]">pins for trade</span>
              </div>

              {/* Stat Tiles */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="flex flex-col gap-2 p-4 rounded-[24px] border-[3px] border-[#74c0fc] bg-gradient-to-br from-[#d0ebff] to-[#a5d8ff]/60 text-left shadow-[0_6px_16px_rgba(116,192,252,0.25)]">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-full bg-white shadow-[0_3px_8px_rgba(116,192,252,0.2)] border-2 border-[#74c0fc]">
                      <ArrowRightLeft size={18} className="text-[#1971c2]" strokeWidth={3} />
                    </div>
                    <span className="text-3xl font-black text-[#1971c2]" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>3</span>
                  </div>
                  <span className="text-xs font-black text-[#1971c2] uppercase tracking-wider">For Trade</span>
                </div>

                <div className="flex flex-col gap-2 p-4 rounded-[24px] border-[3px] border-[#b197fc] bg-gradient-to-br from-[#e5dbff] to-[#d0bfff]/60 text-left shadow-[0_6px_16px_rgba(177,151,252,0.25)]">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-full bg-white shadow-[0_3px_8px_rgba(177,151,252,0.2)] border-2 border-[#b197fc]">
                      <Copy size={18} className="text-[#7950f2]" strokeWidth={3} />
                    </div>
                    <span className="text-3xl font-black text-[#7950f2]" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>2</span>
                  </div>
                  <span className="text-xs font-black text-[#7950f2] uppercase tracking-wider">Duplicates</span>
                </div>

                <div className="flex flex-col gap-2 p-4 rounded-[24px] border-[3px] border-[#ffd93d] bg-gradient-to-br from-[#fff9e6] to-[#ffec99]/60 text-left col-span-2 shadow-[0_6px_16px_rgba(255,217,61,0.25)]">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-full bg-white shadow-[0_3px_8px_rgba(255,217,61,0.2)] border-2 border-[#ffd93d]">
                      <Bookmark size={18} className="text-[#ffa500] fill-[#ffa500]/30" strokeWidth={3} />
                    </div>
                    <span className="text-3xl font-black text-[#ffa500]" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>4</span>
                  </div>
                  <span className="text-xs font-black text-[#ffa500] uppercase tracking-wider">In Search Of (ISO)</span>
                </div>
              </div>
            </div>

            {/* Your Trade Pile */}
            <section className="mb-8 px-5">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <h3 className="font-black text-[#2d2440] text-lg" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>Your Trade Pile</h3>
                  <p className="text-xs text-[#8b7a9f] font-bold">5 pins available for trade</p>
                </div>
              </div>

              {/* Photo Grid */}
              <div className="grid grid-cols-3 gap-3">
                {[7, 3, 8, 2, 5].map((num, i) => (
                  <div key={i} className="relative group overflow-hidden bg-white rounded-[24px] aspect-square shadow-[0_6px_16px_rgba(116,192,252,0.2)] border-[3px] border-[#a5d8ff]">
                    <img 
                      src={`/__mockup/images/pins/pin${num}.png`}
                      alt={`Trade Pin ${num}`}
                      className="w-full h-full object-cover p-2"
                    />
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#74c0fc]/70 via-transparent to-transparent opacity-70" />
                    
                    {/* Duplicate Badge */}
                    {i === 0 && (
                      <div className="absolute top-2 right-2 w-8 h-8 bg-[#b197fc] text-white rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(177,151,252,0.4)] border-[3px] border-white text-xs font-black">
                        2
                      </div>
                    )}
                    {i === 3 && (
                      <div className="absolute top-2 right-2 w-8 h-8 bg-[#b197fc] text-white rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(177,151,252,0.4)] border-[3px] border-white text-xs font-black">
                        2
                      </div>
                    )}
                    
                    {/* Status Badge */}
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="bg-white/95 backdrop-blur-sm px-2.5 py-1.5 rounded-[12px] shadow-[0_3px_8px_rgba(116,192,252,0.25)] border-2 border-[#d0ebff]">
                        <p className="text-[9px] font-black text-[#1971c2] uppercase tracking-widest text-center">For Trade</p>
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
                  <h3 className="font-black text-[#2d2440] text-lg flex items-center gap-2" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>
                    <Bookmark className="w-5 h-5 text-[#ffa500] fill-[#ffa500]/30" strokeWidth={3} />
                    In Search Of
                  </h3>
                  <p className="text-xs text-[#8b7a9f] font-bold">4 pins you're looking for</p>
                </div>
                <button className="text-[#c7a8d4] p-1.5 hover:text-[#ff6b9d] transition-colors bg-white rounded-full shadow-[0_3px_8px_rgba(255,107,157,0.12)] border-2 border-[#ffe8f0]">
                  <ChevronRight className="w-4 h-4" strokeWidth={3} />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pb-2", hideScrollbar)}>
                {[1, 4, 6, 8].map((num, i) => (
                  <div key={i} className="w-[116px] h-[116px] shrink-0 rounded-[28px] bg-gradient-to-br from-[#fff9e6] to-[#ffec99]/50 p-4 shadow-[0_6px_16px_rgba(255,217,61,0.25)] border-[3px] border-[#ffd93d] relative flex flex-col items-center justify-center">
                    <div className="absolute -top-2 -right-2 w-9 h-9 bg-[#ffd93d] rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(255,217,61,0.4)] border-[3px] border-white">
                      <Bookmark className="w-4 h-4 text-[#8b6914] fill-[#8b6914]" strokeWidth={2.5} />
                    </div>
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.2)]"
                      alt={`ISO Pin ${num}`}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Share CTA */}
            <section className="mb-12 px-5">
              <div className="bg-gradient-to-br from-[#ff6b9d] to-[#ff85b3] rounded-[32px] p-6 text-white shadow-[0_8px_24px_rgba(255,107,157,0.35)] relative overflow-hidden">
                <div className="absolute -top-8 -right-8 w-32 h-32 bg-[#ffa5d8]/30 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-[#ff5c8d]/20 rounded-full blur-2xl"></div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-14 h-14 rounded-[20px] bg-white/15 backdrop-blur-sm flex items-center justify-center border-2 border-white/30 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
                      <Share2 className="w-6 h-6 text-white" strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>Share Your Trade List</h3>
                      <p className="text-sm text-[#ffe0ed] font-bold">Find collectors nearby</p>
                    </div>
                  </div>
                  
                  <button className="w-full bg-white text-[#ff6b9d] py-4 px-6 rounded-[20px] font-black text-sm shadow-[0_6px_16px_rgba(0,0,0,0.15)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2">
                    <Share2 className="w-4 h-4" strokeWidth={3} />
                    Share Trade Pile
                  </button>
                </div>
              </div>
            </section>

          </>
        )}

      </div>

      {/* Floating Action Button */}
      <button className="absolute bottom-8 right-6 w-16 h-16 bg-gradient-to-br from-[#ff6b9d] to-[#ff5c8d] text-white rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(255,107,157,0.4)] hover:scale-110 active:scale-95 transition-all z-30 border-[3px] border-white">
        <Plus className="w-8 h-8" strokeWidth={3} />
      </button>
    </div>
  );
}

export default StylePop;
