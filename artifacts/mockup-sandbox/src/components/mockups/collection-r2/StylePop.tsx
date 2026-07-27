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
    <div className="mx-auto max-w-[390px] h-[844px] bg-[#FFF8EE] relative overflow-hidden flex flex-col font-['Nunito'] border-x border-[#F0E0C0] shadow-2xl">
      {/* Header */}
      <header className="px-5 pt-12 pb-4 bg-[#FFFFFF] sticky top-0 z-20 shadow-[0_4px_20px_rgba(224,120,0,0.08)] border-b border-[#F0E0C0]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#2D1800]" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>My Collection</h1>
            <p className="text-sm text-[#B08040] font-bold mt-0.5">23 owned • 4 ISO • 3 trade</p>
          </div>
          <button className="h-11 w-11 rounded-[20px] bg-[#FFF0D0] flex items-center justify-center text-[#E07800] hover:bg-[#F0E0C0] transition-all shadow-[0_4px_12px_rgba(224,120,0,0.12)]">
            <Search className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
        
        {/* Mode Switch */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex bg-[#FFF0D0] rounded-[28px] p-1.5 flex-1 shadow-[inset_0_2px_8px_rgba(224,120,0,0.06)]">
            <button
              onClick={() => setMode('organise')}
              className={cn(
                "flex-1 px-4 py-3 rounded-[24px] text-sm font-black transition-all",
                mode === 'organise'
                  ? "bg-gradient-to-br from-[#FFC84A] to-[#E07800] shadow-[0_4px_16px_rgba(224,120,0,0.25)] text-white scale-[1.02]"
                  : "text-[#B08040] hover:text-[#E07800]"
              )}
            >
              My Portfolio
            </button>
            <button
              onClick={() => setMode('trade')}
              className={cn(
                "flex-1 px-4 py-3 rounded-[24px] text-sm font-black transition-all",
                mode === 'trade'
                  ? "bg-gradient-to-br from-[#FFC84A] to-[#E07800] shadow-[0_4px_16px_rgba(224,120,0,0.25)] text-white scale-[1.02]"
                  : "text-[#B08040] hover:text-[#E07800]"
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
                <Target className="w-4 h-4 text-[#E07800]" strokeWidth={3} />
                <h2 className="text-sm font-black text-[#E07800] uppercase tracking-wider">Nearly Complete</h2>
              </div>
              
              <div className="bg-gradient-to-br from-[#FFC84A] to-[#E07800] rounded-[32px] p-6 text-white shadow-[0_8px_24px_rgba(224,120,0,0.35)] relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/15 rounded-full blur-2xl"></div>
                <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-[#D97832]/30 rounded-full blur-xl"></div>
                
                <div className="flex justify-between items-start mb-5 relative z-10">
                  <div>
                    <h3 className="text-xl font-black leading-tight mb-1" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>Lilo & Stitch<br/>25th Anniversary</h3>
                    <p className="text-[#FFF0D0] text-sm font-bold">5 of 6 pins collected</p>
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
                    <div className="absolute -top-2 -right-2 w-7 h-7 bg-[#D97832] rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(217,120,50,0.4)] border-2 border-white">
                      <Bookmark className="w-3.5 h-3.5 text-white fill-white" strokeWidth={2.5} />
                    </div>
                    <div className="text-white/70 text-2xl font-black mb-0.5">?</div>
                    <div className="text-[10px] font-black text-white/70 uppercase tracking-widest">ISO</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Binder Page: Hidden Disney Wave A */}
            <section className="mb-6 mx-5">
              <div className="bg-[#E8F5E9] rounded-[32px] rounded-l-[16px] border-[3px] border-[#2D9E6B] shadow-[6px_6px_0_rgba(45,158,107,0.15)] relative">
                {/* Binder Spine */}
                <div className="absolute top-0 bottom-0 left-0 w-8 flex flex-col justify-evenly py-6 border-r-[3px] border-[#2D9E6B] bg-[#A5D6A7] rounded-l-[16px]">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="relative w-full h-8 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full bg-[#E8F5E9] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15)] ring-2 ring-white/50" />
                      <div className="absolute w-5 h-[6px] left-[-4px] top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-[#b5b5b5] via-[#f0f0f0] to-[#999999] shadow-[0_2px_4px_rgba(0,0,0,0.2)] z-10" />
                    </div>
                  ))}
                </div>
                
                <div className="pl-11 pr-5 py-6">
                  <div className="flex justify-between items-start mb-5 gap-3">
                    <div>
                      <h3 className="text-[15px] font-black text-[#1B5E20] leading-tight pr-2">Hidden Disney Wave A – Castles</h3>
                      <p className="text-[11px] font-black text-[#2D9E6B] mt-1 uppercase tracking-wider">3 / 8 collected</p>
                    </div>
                    <div className="text-[11px] px-3 py-1.5 rounded-full font-black bg-white text-[#1B5E20] border-2 border-[#2D9E6B] shadow-[0_3px_8px_rgba(45,158,107,0.25)]">
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
                        pin.status === 'empty' && "bg-white/60 shadow-[inset_0_3px_8px_rgba(45,158,107,0.08)] border-2 border-[#C8E6C9]",
                        pin.status === 'iso' && "bg-[#FFF4E6] border-2 border-[#D97832] shadow-[0_3px_8px_rgba(217,120,50,0.2)]"
                      )}>
                        {pin.status === 'owned' && (
                          <img src={pin.img!} alt="" className="w-[85%] h-[85%] object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.25)] z-10" />
                        )}
                        {pin.status === 'iso' && (
                          <div className="w-9 h-9 rounded-full bg-[#FFEDCC] shadow-[inset_2px_3px_6px_rgba(217,120,50,0.25)] border-2 border-[#D97832] flex items-center justify-center">
                            <Bookmark className="w-4 h-4 text-[#D97832] fill-[#D97832]/30" strokeWidth={2.5} />
                          </div>
                        )}
                        {pin.status === 'empty' && (
                          <div className="w-7 h-7 rounded-full bg-[#E8F5E9] shadow-[inset_2px_3px_6px_rgba(45,158,107,0.15)] border-2 border-[#A5D6A7]" />
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
                  <h3 className="font-black text-[#2D1800] text-lg" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>Mickey & Friends Classics</h3>
                  <p className="text-xs text-[#B08040] font-bold">7 of 12 • 58%</p>
                </div>
                <button className="text-[#B08040] p-1.5 hover:text-[#E07800] transition-colors bg-white rounded-full shadow-[0_3px_8px_rgba(224,120,0,0.12)] border-2 border-[#F0E0C0]">
                  <ChevronRight className="w-4 h-4" strokeWidth={3} />
                </button>
              </div>
              
              <div className="pr-5 mb-4">
                <div className="h-2 w-full bg-[#FFF0D0] rounded-full overflow-hidden shadow-[inset_0_2px_4px_rgba(224,120,0,0.08)]">
                  <div className="h-full bg-gradient-to-r from-[#FFC84A] to-[#E07800] rounded-full shadow-[0_0_8px_rgba(224,120,0,0.3)]" style={{ width: '58%' }}></div>
                </div>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[6, 7, 8, 1, 2, 3, 4].map((num, i) => (
                  <div key={i} className="w-[92px] h-[92px] shrink-0 rounded-[24px] bg-white p-2 shadow-[0_4px_12px_rgba(224,120,0,0.15),0_0_0_3px_rgba(240,224,192,0.4)] border-2 border-[#F0E0C0] relative group">
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-[18px] bg-[#FFF8EE]"
                      alt={`Mickey Pin ${num}`}
                    />
                    {i === 2 && (
                      <div className="absolute -top-2 -right-2 w-8 h-8 bg-[#5B6EE8] text-white rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(91,110,232,0.4)] border-[3px] border-white">
                        <ArrowRightLeft className="w-4 h-4" strokeWidth={2.5} />
                      </div>
                    )}
                  </div>
                ))}
                {/* 5 missing pins */}
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={`miss-${i}`} className="w-[92px] h-[92px] shrink-0 rounded-[24px] border-[3px] border-dashed border-[#F0E0C0] bg-[#FFF8EE]/70 flex flex-col items-center justify-center relative">
                    {i === 1 && (
                      <div className="absolute -top-2 -right-2 w-8 h-8 bg-[#D97832] text-white rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(217,120,50,0.4)] border-[3px] border-white">
                        <Bookmark className="w-4 h-4 fill-white" strokeWidth={2.5} />
                      </div>
                    )}
                    <div className="w-9 h-9 rounded-full bg-[#FFF0D0] flex items-center justify-center text-[#E07800] mb-1 shadow-[inset_0_2px_4px_rgba(224,120,0,0.1)]">
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
                  <h3 className="font-black text-[#2D1800] text-lg" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>Grail Wall</h3>
                  <p className="text-xs text-[#B08040] font-bold">Your dream pins</p>
                </div>
                <button className="text-[#B08040] p-1.5 hover:text-[#E07800] transition-colors bg-white rounded-full shadow-[0_3px_8px_rgba(224,120,0,0.12)] border-2 border-[#F0E0C0]">
                  <MoreHorizontal className="w-4 h-4" strokeWidth={3} />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[1, 2, 3, 4, 5, 6].map((num, i) => (
                  <div key={i} className="w-[92px] h-[92px] shrink-0 rounded-[24px] bg-white p-2 shadow-[0_4px_12px_rgba(224,120,0,0.12)] border-2 border-[#F0E0C0]">
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-[18px] bg-[#FFF8EE]"
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
                    <h3 className="font-black text-[#2D1800] text-lg" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>Tinker Bell Starter</h3>
                    <div className="relative">
                      <CheckCircle2 className="w-6 h-6 text-[#2D9E6B] fill-[#E8F5E9]" strokeWidth={2.5} />
                      {/* Confetti dots */}
                      <div className="absolute -top-1 -left-1 w-1.5 h-1.5 rounded-full bg-[#FFC84A]"></div>
                      <div className="absolute -top-2 left-3 w-1 h-1 rounded-full bg-[#E07800]"></div>
                      <div className="absolute top-0 -right-2 w-1.5 h-1.5 rounded-full bg-[#3A5FA0]"></div>
                      <div className="absolute -bottom-1 left-1 w-1 h-1 rounded-full bg-[#D97832]"></div>
                    </div>
                  </div>
                  <p className="text-xs text-[#2D9E6B] font-black mt-0.5 uppercase tracking-wide">Complete Set</p>
                </div>
                <button className="text-[#B08040] p-1.5 hover:text-[#E07800] transition-colors bg-white rounded-full shadow-[0_3px_8px_rgba(224,120,0,0.12)] border-2 border-[#F0E0C0]">
                  <ChevronRight className="w-4 h-4" strokeWidth={3} />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[8, 1, 2, 3].map((num, i) => (
                  <div key={i} className="w-[92px] h-[92px] shrink-0 rounded-[24px] bg-white p-2 shadow-[0_4px_12px_rgba(45,158,107,0.25),0_0_0_3px_rgba(45,158,107,0.15)] border-[3px] border-[#2D9E6B] relative">
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-[18px] bg-[#E8F5E9]"
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
                  <h3 className="font-black text-[#2D1800] text-lg" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>Singles</h3>
                  <p className="text-xs text-[#B08040] font-bold">4 loose pins</p>
                </div>
                <button className="text-[#B08040] p-1.5 hover:text-[#E07800] transition-colors bg-white rounded-full shadow-[0_3px_8px_rgba(224,120,0,0.12)] border-2 border-[#F0E0C0]">
                  <MoreHorizontal className="w-4 h-4" strokeWidth={3} />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-2", hideScrollbar)}>
                {[4, 5, 6, 7].map((num, i) => (
                  <div key={i} className="w-[92px] h-[92px] shrink-0 rounded-[24px] bg-white p-2 shadow-[0_4px_12px_rgba(224,120,0,0.12)] border-2 border-[#F0E0C0]">
                    <img
                      src={`/__mockup/images/pins/pin${num}.png`}
                      className="w-full h-full object-cover rounded-[18px] bg-[#FFF8EE]"
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
                <span className="text-6xl font-black tracking-tighter text-[#2D1800] leading-none" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>3</span>
                <span className="text-lg font-bold text-[#B08040]">pins for trade</span>
              </div>

              {/* Stat Tiles */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="flex flex-col gap-2 p-4 rounded-[24px] border-[3px] border-[#5B6EE8] bg-gradient-to-br from-[#E3E7FC] to-[#C5CDFA]/60 text-left shadow-[0_6px_16px_rgba(91,110,232,0.2)]">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-full bg-white shadow-[0_3px_8px_rgba(91,110,232,0.15)] border-2 border-[#5B6EE8]">
                      <ArrowRightLeft size={18} className="text-[#5B6EE8]" strokeWidth={3} />
                    </div>
                    <span className="text-3xl font-black text-[#5B6EE8]" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>3</span>
                  </div>
                  <span className="text-xs font-black text-[#5B6EE8] uppercase tracking-wider">For Trade</span>
                </div>

                <div className="flex flex-col gap-2 p-4 rounded-[24px] border-[3px] border-[#3A5FA0] bg-gradient-to-br from-[#E8EDF7] to-[#D4DCED]/60 text-left shadow-[0_6px_16px_rgba(58,95,160,0.2)]">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-full bg-white shadow-[0_3px_8px_rgba(58,95,160,0.15)] border-2 border-[#3A5FA0]">
                      <Copy size={18} className="text-[#3A5FA0]" strokeWidth={3} />
                    </div>
                    <span className="text-3xl font-black text-[#3A5FA0]" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>2</span>
                  </div>
                  <span className="text-xs font-black text-[#3A5FA0] uppercase tracking-wider">Duplicates</span>
                </div>

                <div className="flex flex-col gap-2 p-4 rounded-[24px] border-[3px] border-[#D97832] bg-gradient-to-br from-[#FFF4E6] to-[#FFE5CC]/60 text-left col-span-2 shadow-[0_6px_16px_rgba(217,120,50,0.2)]">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-full bg-white shadow-[0_3px_8px_rgba(217,120,50,0.15)] border-2 border-[#D97832]">
                      <Bookmark size={18} className="text-[#D97832] fill-[#D97832]/30" strokeWidth={3} />
                    </div>
                    <span className="text-3xl font-black text-[#D97832]" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>4</span>
                  </div>
                  <span className="text-xs font-black text-[#D97832] uppercase tracking-wider">In Search Of (ISO)</span>
                </div>
              </div>
            </div>

            {/* Your Trade Pile */}
            <section className="mb-8 px-5">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <h3 className="font-black text-[#2D1800] text-lg" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>Your Trade Pile</h3>
                  <p className="text-xs text-[#B08040] font-bold">5 pins available for trade</p>
                </div>
              </div>

              {/* Photo Grid */}
              <div className="grid grid-cols-3 gap-3">
                {[7, 3, 8, 2, 5].map((num, i) => (
                  <div key={i} className="relative group overflow-hidden bg-white rounded-[24px] aspect-square shadow-[0_6px_16px_rgba(91,110,232,0.2)] border-[3px] border-[#C5CDFA]">
                    <img 
                      src={`/__mockup/images/pins/pin${num}.png`}
                      alt={`Trade Pin ${num}`}
                      className="w-full h-full object-cover p-2"
                    />
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#5B6EE8]/60 via-transparent to-transparent opacity-70" />
                    
                    {/* Duplicate Badge */}
                    {i === 0 && (
                      <div className="absolute top-2 right-2 w-8 h-8 bg-[#3A5FA0] text-white rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(58,95,160,0.4)] border-[3px] border-white text-xs font-black">
                        2
                      </div>
                    )}
                    {i === 3 && (
                      <div className="absolute top-2 right-2 w-8 h-8 bg-[#3A5FA0] text-white rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(58,95,160,0.4)] border-[3px] border-white text-xs font-black">
                        2
                      </div>
                    )}
                    
                    {/* Status Badge */}
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="bg-white/95 backdrop-blur-sm px-2.5 py-1.5 rounded-[12px] shadow-[0_3px_8px_rgba(91,110,232,0.2)] border-2 border-[#E3E7FC]">
                        <p className="text-[9px] font-black text-[#5B6EE8] uppercase tracking-widest text-center">For Trade</p>
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
                  <h3 className="font-black text-[#2D1800] text-lg flex items-center gap-2" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>
                    <Bookmark className="w-5 h-5 text-[#D97832] fill-[#D97832]/30" strokeWidth={3} />
                    In Search Of
                  </h3>
                  <p className="text-xs text-[#B08040] font-bold">4 pins you're looking for</p>
                </div>
                <button className="text-[#B08040] p-1.5 hover:text-[#E07800] transition-colors bg-white rounded-full shadow-[0_3px_8px_rgba(224,120,0,0.12)] border-2 border-[#F0E0C0]">
                  <ChevronRight className="w-4 h-4" strokeWidth={3} />
                </button>
              </div>

              <div className={cn("flex gap-3 overflow-x-auto pb-2", hideScrollbar)}>
                {[1, 4, 6, 8].map((num, i) => (
                  <div key={i} className="w-[116px] h-[116px] shrink-0 rounded-[28px] bg-gradient-to-br from-[#FFF4E6] to-[#FFE5CC]/50 p-4 shadow-[0_6px_16px_rgba(217,120,50,0.2)] border-[3px] border-[#D97832] relative flex flex-col items-center justify-center">
                    <div className="absolute -top-2 -right-2 w-9 h-9 bg-[#D97832] rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(217,120,50,0.4)] border-[3px] border-white">
                      <Bookmark className="w-4 h-4 text-white fill-white" strokeWidth={2.5} />
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
              <div className="bg-gradient-to-br from-[#FFC84A] to-[#E07800] rounded-[32px] p-6 text-white shadow-[0_8px_24px_rgba(224,120,0,0.35)] relative overflow-hidden">
                <div className="absolute -top-8 -right-8 w-32 h-32 bg-[#FFD66B]/30 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-[#D97832]/20 rounded-full blur-2xl"></div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-14 h-14 rounded-[20px] bg-white/15 backdrop-blur-sm flex items-center justify-center border-2 border-white/30 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
                      <Share2 className="w-6 h-6 text-white" strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black" style={{ fontFamily: 'Baloo 2, Nunito, system-ui, sans-serif' }}>Share Your Trade List</h3>
                      <p className="text-sm text-[#FFF0D0] font-bold">Find collectors nearby</p>
                    </div>
                  </div>
                  
                  <button className="w-full bg-white text-[#E07800] py-4 px-6 rounded-[20px] font-black text-sm shadow-[0_6px_16px_rgba(0,0,0,0.15)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2">
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
      <button className="absolute bottom-8 right-6 w-16 h-16 bg-gradient-to-br from-[#FFC84A] to-[#E07800] text-white rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(224,120,0,0.35)] hover:scale-110 active:scale-95 transition-all z-30 border-[3px] border-white">
        <Plus className="w-8 h-8" strokeWidth={3} />
      </button>
    </div>
  );
}

export default StylePop;
