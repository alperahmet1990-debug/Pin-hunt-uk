import React, { useState } from 'react';
import { Search, Plus, ChevronRight, Check, Bookmark, ArrowRightLeft, Target, Share2, Copy, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StyleHeritage() {
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
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap');
      `}} />
      <div className="mx-auto max-w-[390px] h-[844px] bg-[#f4f0e6] relative overflow-hidden flex flex-col font-sans border-x border-[#3b291a]/20 shadow-2xl text-[#3b291a]">
        {/* Decorative inner border for the whole cabinet */}
        <div className="absolute inset-0 pointer-events-none border-[6px] border-[#3b291a]/5 z-50"></div>
        
        {/* Header */}
        <header className="px-5 pt-12 pb-4 bg-[#f4f0e6] sticky top-0 z-20 shadow-[0_4px_20px_rgba(59,41,26,0.06)] border-b border-[#3b291a]/10 relative">
          <div className="absolute inset-0 bg-[#f4f0e6] opacity-90 backdrop-blur-md z-[-1]" />
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[26px] font-bold font-['Playfair_Display'] tracking-tight text-[#1a3022]">My Collection</h1>
              <p className="text-[10px] text-[#3b291a]/60 font-bold mt-0.5 tracking-widest uppercase">23 owned • 4 ISO • 3 trade</p>
            </div>
            <button className="h-10 w-10 rounded-full bg-[#1a3022] flex items-center justify-center text-[#c5a059] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] hover:bg-[#254230] transition-colors">
              <Search className="w-4 h-4" />
            </button>
          </div>
          
          {/* Mode Switch - segmented wood/brass feel */}
          <div className="flex items-center gap-3 mb-3 relative z-10">
            <div className="flex bg-[#e8e1d5] rounded-full p-1 flex-1 shadow-[inset_0_2px_4px_rgba(59,41,26,0.1)] border border-[#d3c6b3]">
              <button
                onClick={() => setMode('organise')}
                className={cn(
                  "flex-1 px-4 py-2.5 rounded-full text-xs font-bold transition-all uppercase tracking-wider font-['Playfair_Display']",
                  mode === 'organise'
                    ? "bg-[#1a3022] shadow-md text-[#c5a059] border border-[#2a4534]"
                    : "text-[#3b291a]/60 hover:text-[#3b291a]"
                )}
              >
                My Portfolio
              </button>
              <button
                onClick={() => setMode('trade')}
                className={cn(
                  "flex-1 px-4 py-2.5 rounded-full text-xs font-bold transition-all uppercase tracking-wider font-['Playfair_Display']",
                  mode === 'trade'
                    ? "bg-[#1a3022] shadow-md text-[#c5a059] border border-[#2a4534]"
                    : "text-[#3b291a]/60 hover:text-[#3b291a]"
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
                  <Target className="w-4 h-4 text-[#c5a059]" />
                  <h2 className="text-[10px] font-bold text-[#c5a059] uppercase tracking-widest">Nearly Complete</h2>
                </div>
                
                <div className="bg-[#1a3022] rounded-xl p-5 text-[#f4f0e6] shadow-[inset_0_0_20px_rgba(0,0,0,0.5),0_8px_16px_rgba(59,41,26,0.15)] relative overflow-hidden border-4 border-[#3b291a]">
                  {/* Velvet texture overlay */}
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.05)_0%,rgba(0,0,0,0.2)_100%)] pointer-events-none"></div>
                  
                  <div className="flex justify-between items-start mb-5 relative z-10">
                    <div>
                      <h3 className="text-xl font-bold leading-tight mb-1 font-['Playfair_Display'] text-[#c5a059]">Lilo & Stitch<br/>25th Anniversary</h3>
                      <p className="text-[#f4f0e6]/70 text-[10px] font-bold uppercase tracking-widest">5 of 6 pins collected</p>
                    </div>
                    
                    {/* Circular Progress */}
                    <div className="relative w-12 h-12 shrink-0">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <path
                          className="text-[#f4f0e6]/10"
                          strokeWidth="4"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="text-[#c5a059] drop-shadow-[0_0_4px_rgba(197,160,89,0.5)]"
                          strokeWidth="4"
                          strokeDasharray="83, 100"
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[#c5a059]">
                        83%
                      </div>
                    </div>
                  </div>
                  
                  <div className={cn("flex gap-3 overflow-x-auto -mx-5 px-5 relative z-10", hideScrollbar)}>
                    {[1, 2, 3, 4, 5].map((num) => (
                      <div key={num} className="w-[72px] h-[72px] shrink-0 rounded-lg bg-[#0d1811] p-1.5 shadow-[inset_0_2px_8px_rgba(0,0,0,0.6),0_1px_1px_rgba(255,255,255,0.1)] border border-[#2a4534] relative">
                        <img
                          src={`/__mockup/images/pins/pin${num}.png`}
                          className="w-full h-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)]"
                          alt={`Lilo & Stitch Pin ${num}`}
                        />
                        {/* Brass-gold check for owned */}
                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gradient-to-br from-[#d4af37] to-[#997a15] rounded-full flex items-center justify-center border border-[#f2d879] shadow-md z-20">
                          <Check className="w-3 h-3 text-[#3b291a]" strokeWidth={3} />
                        </div>
                      </div>
                    ))}
                    {/* Missing Ghost Pin */}
                    <div className="w-[72px] h-[72px] shrink-0 rounded-lg border border-dashed border-[#c5a059]/40 flex flex-col items-center justify-center bg-[#0d1811]/50 relative shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)]">
                      {/* Deep amber wax-seal feel for ISO */}
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-br from-[#ba3917] to-[#731c0b] rounded-full flex items-center justify-center shadow-[0_2px_4px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#d45631] z-20">
                        <Bookmark className="w-3 h-3 text-[#f4f0e6] fill-[#f4f0e6]" />
                      </div>
                      <div className="text-[#c5a059]/40 text-xl font-['Playfair_Display'] italic mb-0.5">?</div>
                      <div className="text-[8px] font-bold text-[#c5a059]/60 uppercase tracking-widest">ISO</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Binder Page: Hidden Disney Wave A */}
              <section className="mb-6 mx-5">
                <div className="bg-[#fdfcf9] rounded-sm border border-[#d3c6b3] shadow-[2px_4px_12px_rgba(59,41,26,0.08)] relative">
                  {/* Vintage Binder Spine - Brass rings over paper */}
                  <div className="absolute top-0 bottom-0 left-0 w-8 flex flex-col justify-evenly py-6 border-r border-[#d3c6b3] bg-[#f9f7f2]">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="relative w-full h-8 flex items-center justify-center">
                        <div className="w-3 h-3 rounded-full bg-[#3b291a] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.5)]" />
                        {/* Brass Ring */}
                        <div className="absolute w-6 h-1 left-[-6px] top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-[#e2c775] via-[#f9e9a4] to-[#b89535] shadow-[0_2px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.5)] z-10" />
                      </div>
                    ))}
                  </div>
                  
                  <div className="pl-12 pr-4 py-5 relative">
                    {/* Subtle stitched border inner */}
                    <div className="absolute inset-1.5 border border-dashed border-[#d3c6b3]/60 pointer-events-none"></div>

                    <div className="flex justify-between items-start mb-5 gap-3 relative z-10">
                      <div>
                        <h3 className="text-[15px] font-bold text-[#3b291a] leading-tight pr-2 font-['Playfair_Display']">Hidden Disney Wave A – Castles</h3>
                        <p className="text-[10px] font-bold text-[#3b291a]/50 mt-1 uppercase tracking-widest">3 / 8 collected</p>
                      </div>
                      <div className="text-[10px] px-2.5 py-1 rounded-sm font-bold bg-[#1a3022] text-[#c5a059] border border-[#2a4534] shadow-sm uppercase tracking-wider">
                        37%
                      </div>
                    </div>
                    
                    {/* Grid with visible empty slots */}
                    <div className="grid grid-cols-3 gap-3 relative z-10">
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
                          "aspect-square flex items-center justify-center p-1.5 relative rounded-sm transition-all",
                          pin.status === 'empty' && "bg-[#f4f0e6] shadow-[inset_0_2px_5px_rgba(59,41,26,0.06)] border border-[#d3c6b3]",
                          pin.status === 'iso' && "bg-[#f4f0e6] shadow-[inset_0_2px_5px_rgba(59,41,26,0.06)] border border-dashed border-[#ba3917]/30",
                          pin.status === 'owned' && "bg-[#fdfcf9] border border-[#e8e1d5] shadow-[0_2px_8px_rgba(59,41,26,0.04)]"
                        )}>
                          {pin.status === 'owned' && (
                            <>
                              <img src={pin.img!} alt="" className="w-full h-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.15)] z-10" />
                              <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gradient-to-br from-[#d4af37] to-[#997a15] rounded-full flex items-center justify-center border border-[#f2d879] shadow-sm z-20">
                                <Check className="w-2.5 h-2.5 text-[#3b291a]" strokeWidth={3} />
                              </div>
                            </>
                          )}
                          {pin.status === 'iso' && (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#ba3917] to-[#731c0b] shadow-[0_2px_4px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#d45631] flex items-center justify-center z-20">
                              <Bookmark className="w-3.5 h-3.5 text-[#f4f0e6] fill-[#f4f0e6]" />
                            </div>
                          )}
                          {pin.status === 'empty' && (
                            <div className="w-6 h-6 rounded-full bg-[#e8e1d5]/50 shadow-[inset_1px_2px_4px_rgba(59,41,26,0.1)]" />
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
                    <h3 className="font-bold text-[#1a3022] text-lg font-['Playfair_Display']">Mickey & Friends Classics</h3>
                    <p className="text-[10px] text-[#3b291a]/60 font-bold uppercase tracking-widest mt-1">7 of 12 • 58%</p>
                  </div>
                  <button className="text-[#3b291a]/40 p-1 hover:text-[#3b291a] transition-colors bg-[#fdfcf9] rounded-full shadow-sm border border-[#d3c6b3]">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="pr-5 mb-4">
                  <div className="h-1 w-full bg-[#e8e1d5] overflow-hidden rounded-full border border-[#d3c6b3]/50">
                    <div className="h-full bg-[#c5a059]" style={{ width: '58%' }}></div>
                  </div>
                </div>

                <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-4", hideScrollbar)}>
                  {[6, 7, 8, 1, 2, 3, 4].map((num, i) => (
                    <div key={i} className="w-[88px] h-[88px] shrink-0 rounded-sm bg-[#fdfcf9] p-1.5 shadow-[2px_4px_8px_rgba(59,41,26,0.06)] border border-[#d3c6b3] relative group flex items-center justify-center">
                      <img
                        src={`/__mockup/images/pins/pin${num}.png`}
                        className="w-full h-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.1)] relative z-10"
                        alt={`Mickey Pin ${num}`}
                      />
                      {i === 2 && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-br from-[#406d6a] to-[#254240] text-[#e8eee4] rounded-full flex items-center justify-center shadow-md border border-[#58928e] z-20">
                          <ArrowRightLeft className="w-3 h-3" />
                        </div>
                      )}
                      <div className="absolute inset-1 border border-dashed border-[#d3c6b3]/40 pointer-events-none"></div>
                    </div>
                  ))}
                  {/* 5 missing pins */}
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={`miss-${i}`} className="w-[88px] h-[88px] shrink-0 rounded-sm border border-dashed border-[#d3c6b3] bg-[#f4f0e6] shadow-[inset_0_2px_5px_rgba(59,41,26,0.04)] flex flex-col items-center justify-center relative">
                      {i === 1 && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-br from-[#ba3917] to-[#731c0b] rounded-full flex items-center justify-center shadow-[0_2px_4px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#d45631] z-20">
                          <Bookmark className="w-3 h-3 text-[#f4f0e6] fill-[#f4f0e6]" />
                        </div>
                      )}
                      <div className="w-8 h-8 rounded-full bg-[#e8e1d5] flex items-center justify-center text-[#3b291a]/30 mb-1 shadow-[inset_1px_2px_4px_rgba(59,41,26,0.05)] z-10">
                        <Search className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Boards: Grail Wall */}
              <section className="mb-6 pl-5">
                <div className="pr-5 mb-3 flex items-end justify-between">
                  <div>
                    <h3 className="font-bold text-[#1a3022] text-lg font-['Playfair_Display']">Grail Wall</h3>
                    <p className="text-[10px] text-[#3b291a]/60 font-bold uppercase tracking-widest mt-1">Your dream pins</p>
                  </div>
                  <button className="text-[#3b291a]/40 p-1 hover:text-[#3b291a] transition-colors bg-[#fdfcf9] rounded-full shadow-sm border border-[#d3c6b3]">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>

                <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-4", hideScrollbar)}>
                  {[1, 2, 3, 4, 5, 6].map((num, i) => (
                    <div key={i} className="w-[88px] h-[88px] shrink-0 rounded-sm bg-[#1a3022] p-2 shadow-[inset_0_0_15px_rgba(0,0,0,0.6),0_4px_8px_rgba(59,41,26,0.1)] border border-[#2a4534] relative">
                       <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.05)_0%,rgba(0,0,0,0.2)_100%)] pointer-events-none"></div>
                      <img
                        src={`/__mockup/images/pins/pin${num}.png`}
                        className="w-full h-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.4)] relative z-10"
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
                      <h3 className="font-bold text-[#1a3022] text-lg font-['Playfair_Display']">Tinker Bell Starter</h3>
                      <div className="w-4 h-4 bg-gradient-to-br from-[#d4af37] to-[#997a15] rounded-full flex items-center justify-center border border-[#f2d879] shadow-sm">
                        <Check className="w-2.5 h-2.5 text-[#3b291a]" strokeWidth={3} />
                      </div>
                    </div>
                    <p className="text-[10px] text-[#c5a059] font-bold mt-1 uppercase tracking-widest">Complete Set</p>
                  </div>
                  <button className="text-[#3b291a]/40 p-1 hover:text-[#3b291a] transition-colors bg-[#fdfcf9] rounded-full shadow-sm border border-[#d3c6b3]">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-4", hideScrollbar)}>
                  {[8, 1, 2, 3].map((num, i) => (
                    <div key={i} className="w-[88px] h-[88px] shrink-0 rounded-sm bg-[#fdfcf9] p-1.5 shadow-[2px_4px_8px_rgba(59,41,26,0.06)] border-2 border-[#c5a059] relative flex items-center justify-center">
                      <img
                        src={`/__mockup/images/pins/pin${num}.png`}
                        className="w-full h-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.1)] relative z-10"
                        alt={`Tinker Pin ${num}`}
                      />
                      <div className="absolute inset-1 border border-dashed border-[#c5a059]/40 pointer-events-none"></div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Singles */}
              <section className="mb-12 pl-5">
                <div className="pr-5 mb-3 flex items-end justify-between">
                  <div>
                    <h3 className="font-bold text-[#1a3022] text-lg font-['Playfair_Display']">Singles</h3>
                    <p className="text-[10px] text-[#3b291a]/60 font-bold uppercase tracking-widest mt-1">4 loose pins</p>
                  </div>
                  <button className="text-[#3b291a]/40 p-1 hover:text-[#3b291a] transition-colors bg-[#fdfcf9] rounded-full shadow-sm border border-[#d3c6b3]">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>

                <div className={cn("flex gap-3 overflow-x-auto pr-5 pb-4", hideScrollbar)}>
                  {[4, 5, 6, 7].map((num, i) => (
                    <div key={i} className="w-[88px] h-[88px] shrink-0 rounded-sm bg-[#fdfcf9] p-1.5 shadow-[2px_4px_8px_rgba(59,41,26,0.06)] border border-[#d3c6b3] relative flex items-center justify-center group">
                      <img
                        src={`/__mockup/images/pins/pin${num}.png`}
                        className="w-full h-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.1)] relative z-10"
                        alt={`Single Pin ${num}`}
                      />
                      <div className="absolute inset-1 border border-dashed border-[#d3c6b3]/40 pointer-events-none"></div>
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
                <div className="flex items-baseline gap-2 mb-6 border-b border-[#3b291a]/10 pb-4">
                  <span className="text-6xl font-black tracking-tighter text-[#1a3022] leading-none font-['Playfair_Display']">3</span>
                  <span className="text-xs font-bold text-[#3b291a]/60 uppercase tracking-widest">pins for trade</span>
                </div>

                {/* Stat Tiles - Museum Labels */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="flex flex-col gap-2 p-4 bg-[#fdfcf9] text-left shadow-[2px_4px_8px_rgba(59,41,26,0.05)] border border-[#d3c6b3] relative">
                    <div className="absolute inset-1.5 border border-dashed border-[#d3c6b3]/60 pointer-events-none"></div>
                    <div className="flex items-center justify-between relative z-10">
                      <div className="p-1.5 rounded-full bg-gradient-to-br from-[#406d6a] to-[#254240] shadow-[0_2px_4px_rgba(0,0,0,0.2)] border border-[#58928e]">
                        <ArrowRightLeft size={16} className="text-[#e8eee4]" strokeWidth={2.5} />
                      </div>
                      <span className="text-3xl font-black text-[#1a3022] font-['Playfair_Display']">3</span>
                    </div>
                    <span className="text-[10px] font-bold text-[#375e5b] uppercase tracking-widest relative z-10">For Trade</span>
                  </div>

                  <div className="flex flex-col gap-2 p-4 bg-[#fdfcf9] text-left shadow-[2px_4px_8px_rgba(59,41,26,0.05)] border border-[#d3c6b3] relative">
                    <div className="absolute inset-1.5 border border-dashed border-[#d3c6b3]/60 pointer-events-none"></div>
                    <div className="flex items-center justify-between relative z-10">
                      <div className="p-1.5 rounded-full bg-[#3b291a] shadow-[0_2px_4px_rgba(0,0,0,0.2)] border border-[#5a432f]">
                        <Copy size={16} className="text-[#d3c6b3]" strokeWidth={2.5} />
                      </div>
                      <span className="text-3xl font-black text-[#1a3022] font-['Playfair_Display']">2</span>
                    </div>
                    <span className="text-[10px] font-bold text-[#3b291a] uppercase tracking-widest relative z-10">Duplicates</span>
                  </div>

                  <div className="flex flex-col gap-2 p-4 bg-[#fdfcf9] text-left col-span-2 shadow-[2px_4px_8px_rgba(59,41,26,0.05)] border border-[#d3c6b3] relative">
                    <div className="absolute inset-1.5 border border-dashed border-[#d3c6b3]/60 pointer-events-none"></div>
                    <div className="flex items-center justify-between relative z-10">
                      <div className="p-1.5 rounded-full bg-gradient-to-br from-[#ba3917] to-[#731c0b] shadow-[0_2px_4px_rgba(0,0,0,0.3)] border border-[#d45631]">
                        <Bookmark size={16} className="text-[#f4f0e6] fill-[#f4f0e6]" strokeWidth={2.5} />
                      </div>
                      <span className="text-3xl font-black text-[#1a3022] font-['Playfair_Display']">4</span>
                    </div>
                    <span className="text-[10px] font-bold text-[#9b2c14] uppercase tracking-widest relative z-10">In Search Of (ISO)</span>
                  </div>
                </div>
              </div>

              {/* Your Trade Pile */}
              <section className="mb-8 px-5">
                <div className="mb-4 flex items-end justify-between">
                  <div>
                    <h3 className="font-bold text-[#1a3022] text-lg font-['Playfair_Display']">Your Trade Pile</h3>
                    <p className="text-[10px] text-[#3b291a]/60 font-bold uppercase tracking-widest mt-1">5 pins available for trade</p>
                  </div>
                </div>

                {/* Photo Grid - Museum labels */}
                <div className="grid grid-cols-3 gap-3">
                  {[7, 3, 8, 2, 5].map((num, i) => (
                    <div key={i} className="relative group overflow-hidden bg-[#fdfcf9] rounded-sm aspect-square shadow-[2px_4px_8px_rgba(59,41,26,0.06)] border border-[#d3c6b3] flex items-center justify-center p-2">
                      <div className="absolute inset-1 border border-dashed border-[#d3c6b3]/60 pointer-events-none z-10"></div>
                      <img 
                        src={`/__mockup/images/pins/pin${num}.png`}
                        alt={`Trade Pin ${num}`}
                        className="w-full h-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.1)] relative z-10"
                      />
                      
                      {/* Duplicate Badge */}
                      {i === 0 && (
                        <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-[#3b291a] text-[#d3c6b3] rounded-full flex items-center justify-center shadow-md border border-[#5a432f] text-xs font-black z-20 font-['Playfair_Display']">
                          2
                        </div>
                      )}
                      {i === 3 && (
                        <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-[#3b291a] text-[#d3c6b3] rounded-full flex items-center justify-center shadow-md border border-[#5a432f] text-xs font-black z-20 font-['Playfair_Display']">
                          2
                        </div>
                      )}
                      
                      {/* Status Badge */}
                      <div className="absolute bottom-2 left-2 right-2 z-20">
                        <div className="bg-gradient-to-r from-[#406d6a] to-[#254240] px-2 py-1 shadow-sm border border-[#58928e]">
                          <p className="text-[8px] font-bold text-[#e8eee4] uppercase tracking-widest text-center">For Trade</p>
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
                    <h3 className="font-bold text-[#1a3022] text-lg flex items-center gap-2 font-['Playfair_Display']">
                      <Bookmark className="w-4 h-4 text-[#9b2c14] fill-[#9b2c14]" />
                      In Search Of
                    </h3>
                    <p className="text-[10px] text-[#3b291a]/60 font-bold uppercase tracking-widest mt-1">4 pins you're looking for</p>
                  </div>
                  <button className="text-[#3b291a]/40 p-1 hover:text-[#3b291a] transition-colors bg-[#fdfcf9] rounded-full shadow-sm border border-[#d3c6b3]">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className={cn("flex gap-3 overflow-x-auto pb-4", hideScrollbar)}>
                  {[1, 4, 6, 8].map((num, i) => (
                    <div key={i} className="w-[110px] h-[110px] shrink-0 rounded-sm bg-[#fdfcf9] p-3 shadow-[2px_4px_8px_rgba(59,41,26,0.06)] border border-[#d3c6b3] relative flex flex-col items-center justify-center">
                      <div className="absolute inset-1.5 border border-dashed border-[#d3c6b3]/60 pointer-events-none"></div>
                      <div className="absolute -top-2 -right-2 w-7 h-7 bg-gradient-to-br from-[#ba3917] to-[#731c0b] rounded-full flex items-center justify-center shadow-[0_2px_4px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#d45631] z-20">
                        <Bookmark className="w-3.5 h-3.5 text-[#f4f0e6] fill-[#f4f0e6]" />
                      </div>
                      <img
                        src={`/__mockup/images/pins/pin${num}.png`}
                        className="w-full h-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.15)] relative z-10"
                        alt={`ISO Pin ${num}`}
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Share CTA */}
              <section className="mb-12 px-5">
                <div className="bg-[#1a3022] rounded-sm p-6 text-[#f4f0e6] shadow-[inset_0_0_20px_rgba(0,0,0,0.5),0_8px_16px_rgba(59,41,26,0.15)] relative overflow-hidden border-4 border-[#3b291a]">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.05)_0%,rgba(0,0,0,0.2)_100%)] pointer-events-none"></div>
                  
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-12 h-12 rounded-full bg-[#1a3022] flex items-center justify-center shadow-[inset_0_1px_3px_rgba(255,255,255,0.2),0_4px_8px_rgba(0,0,0,0.4)] border border-[#2a4534]">
                        <Share2 className="w-5 h-5 text-[#c5a059]" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold font-['Playfair_Display'] text-[#c5a059]">Share Your Trade List</h3>
                        <p className="text-[10px] text-[#f4f0e6]/60 font-bold uppercase tracking-widest mt-0.5">Find collectors nearby</p>
                      </div>
                    </div>
                    
                    <button className="w-full bg-[#f4f0e6] text-[#1a3022] py-3.5 px-6 font-bold text-xs uppercase tracking-widest shadow-[0_4px_8px_rgba(0,0,0,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-[#d3c6b3]">
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
        <button className="absolute bottom-8 right-6 w-14 h-14 bg-[#c5a059] text-[#1a3022] rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(197,160,89,0.3),inset_0_2px_4px_rgba(255,255,255,0.4)] hover:scale-105 active:scale-95 transition-all z-30 border border-[#d6ba75]">
          <Plus className="w-7 h-7" strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}

export default StyleHeritage;