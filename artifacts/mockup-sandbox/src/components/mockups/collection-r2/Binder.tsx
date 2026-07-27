import React from 'react';
import { Search, Plus, ChevronRight, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Binder() {
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

  const BOARDS = [
    { name: 'Grail Wall', count: 6, preview: [PINS[0], PINS[1], PINS[2], PINS[3]] },
    { name: 'Trade Pile', count: 3, preview: [PINS[4], PINS[5], PINS[6]] },
  ];

  const SETS = [
    {
      name: 'Lilo & Stitch 25th Anniversary',
      owned: 5,
      total: 6,
      pins: [
        { status: 'owned', img: PINS[0] },
        { status: 'owned', img: PINS[1] },
        { status: 'owned', img: PINS[2] },
        { status: 'owned', img: PINS[3] },
        { status: 'owned', img: PINS[4] },
        { status: 'iso', img: null },
      ],
    },
    {
      name: 'Hidden Disney Wave A – Castles',
      owned: 3,
      total: 8,
      pins: [
        { status: 'owned', img: PINS[5] },
        { status: 'owned', img: PINS[6] },
        { status: 'owned', img: PINS[7] },
        { status: 'iso', img: null },
        { status: 'iso', img: null },
        { status: 'empty', img: null },
        { status: 'empty', img: null },
        { status: 'empty', img: null },
      ],
    },
    {
      name: 'Mickey & Friends Classics',
      owned: 7,
      total: 12,
      pins: [
        { status: 'owned', img: PINS[0] },
        { status: 'owned', img: PINS[2] },
        { status: 'empty', img: null },
        { status: 'owned', img: PINS[4] },
        { status: 'owned', img: PINS[5] },
        { status: 'iso', img: null },
        { status: 'owned', img: PINS[7] },
        { status: 'owned', img: PINS[1] },
        { status: 'owned', img: PINS[3] },
        { status: 'empty', img: null },
        { status: 'empty', img: null },
        { status: 'empty', img: null },
      ],
    },
    {
      name: 'Tinker Bell Starter',
      owned: 4,
      total: 4,
      pins: [
        { status: 'owned', img: PINS[6] },
        { status: 'owned', img: PINS[4] },
        { status: 'owned', img: PINS[2] },
        { status: 'owned', img: PINS[0] },
      ],
    },
  ];

  const FILTERS = ["All", "Boards", "Sets", "Trade", "ISO", "Dupes"];

  const hideScrollbar = "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]";

  return (
    <div className="bg-[#f4f3f0] w-full max-w-[390px] h-[844px] max-h-[100dvh] mx-auto relative overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.1)] ring-1 ring-stone-200/50 flex flex-col font-sans">
      
      {/* Sticky Header Section */}
      <div className="bg-[#f4f3f0] z-20 shrink-0 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] relative">
        <header className="px-5 pt-12 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">My Collection</h1>
            <div className="flex gap-3 text-[11px] font-bold text-stone-500 mt-1.5 uppercase tracking-wide">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-stone-700">23 Owned</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span className="text-stone-700">4 ISO</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span className="text-stone-700">3 Trade</span>
              </div>
            </div>
          </div>
          <button className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-stone-700 hover:bg-stone-50 transition-colors border border-stone-200/50">
            <Search className="w-5 h-5" />
          </button>
        </header>
        
        {/* Tabs / File Dividers */}
        <div className={cn("flex overflow-x-auto pl-5 pr-5 gap-1.5 pt-2", hideScrollbar)}>
          {FILTERS.map((f, i) => (
            <button key={f} className={cn(
              "px-4 py-2.5 text-sm font-bold rounded-t-xl whitespace-nowrap relative border border-b-0 transition-colors",
              i === 0 
                ? "bg-[#fcfbf9] border-stone-200 text-stone-900 z-10" 
                : "bg-stone-200/40 border-transparent text-stone-500 z-0 hover:bg-stone-200/60"
            )}>
              {f}
              {i === 0 && <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[#fcfbf9]" />}
            </button>
          ))}
        </div>
      </div>

      {/* Main Scrollable Content */}
      <main className={cn("flex-1 overflow-y-auto bg-[#fcfbf9]", hideScrollbar)}>
        
        {/* My Boards */}
        <div className="pt-6 pb-2">
          <div className="px-5 mb-4 flex justify-between items-end">
            <h2 className="text-[17px] font-extrabold text-stone-800">My Boards</h2>
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">2 Boards</span>
          </div>
          
          <div className={cn("flex overflow-x-auto gap-4 px-5 pb-6 snap-x", hideScrollbar)}>
            {BOARDS.map(board => (
              <div key={board.name} className="snap-center shrink-0 w-[140px] aspect-square rounded-[20px] bg-[#f5f1eb] shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-[#e8dfd5] p-3 flex flex-col justify-between relative overflow-hidden group cursor-pointer">
                 <div className="flex-1 relative mt-1">
                   {board.preview.map((pin, i) => {
                     const positions = [
                       { top: '0%', left: '10%', rotate: '-6deg', z: 4 },
                       { top: '15%', right: '5%', rotate: '10deg', z: 3 },
                       { bottom: '15%', left: '15%', rotate: '-4deg', z: 5 },
                       { bottom: '5%', right: '15%', rotate: '8deg', z: 2 },
                     ];
                     const pos = positions[i % 4];
                     return (
                       <img 
                         key={i} 
                         src={pin} 
                         alt=""
                         className="w-11 h-11 absolute object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)] z-10" 
                         style={{ ...pos, zIndex: pos.z }}
                       />
                     )
                   })}
                 </div>
                 <div className="text-center relative z-20 bg-white/70 backdrop-blur-md mx-[-12px] mb-[-12px] p-2.5 border-t border-white/50">
                   <div className="font-bold text-stone-800 text-[13px] leading-tight">{board.name}</div>
                   <div className="text-[9px] font-bold text-stone-500 uppercase tracking-widest mt-0.5">{board.count} pins</div>
                 </div>
              </div>
            ))}
            
            <div className="snap-center shrink-0 w-[140px] aspect-square rounded-[20px] bg-stone-50 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] border-2 border-stone-200 border-dashed p-3 flex flex-col items-center justify-center gap-3 hover:bg-stone-100 transition-colors cursor-pointer">
              <div className="w-12 h-12 rounded-full bg-stone-200/50 flex items-center justify-center">
                <Plus className="text-stone-400 w-6 h-6" />
              </div>
              <div className="text-[13px] font-bold text-stone-500">New Board</div>
            </div>
          </div>
        </div>

        {/* Official Sets */}
        <div className="pt-2 pb-6">
          <div className="px-5 mb-5 flex justify-between items-end">
            <h2 className="text-[17px] font-extrabold text-stone-800">Official Sets</h2>
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">4 Sets</span>
          </div>
          
          <div className="flex flex-col gap-6">
            {SETS.map(set => {
              const percent = Math.round((set.owned / set.total) * 100);
              const isComplete = set.owned === set.total;
              
              return (
                <div key={set.name} className="bg-[#fefcf8] rounded-2xl rounded-l-md border border-[#e8dfd5] shadow-[4px_4px_12px_rgba(0,0,0,0.03)] relative ml-5 mr-5">
                  {/* Binder Spine / Holes */}
                  <div className="absolute top-0 bottom-0 left-0 w-7 flex flex-col justify-evenly py-6 border-r border-[#e8dfd5]/50 bg-[#f9f6f0] rounded-l-md">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="relative w-full h-8 flex items-center justify-center">
                        {/* Hole */}
                        <div className="w-3 h-3 rounded-full bg-[#fcfbf9] shadow-[inset_1px_1px_4px_rgba(0,0,0,0.2)] ring-1 ring-black/5" />
                        {/* Ring */}
                        <div className="absolute w-5 h-[5px] left-[-4px] top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-[#b5b5b5] via-[#f0f0f0] to-[#999999] shadow-[0_1px_2px_rgba(0,0,0,0.2)] z-10" />
                      </div>
                    ))}
                  </div>
                  
                  {/* Page Content */}
                  <div className="pl-10 pr-4 py-5">
                    <div className="flex justify-between items-start mb-5 gap-3">
                      <div>
                        <h3 className="text-[14px] font-bold text-stone-800 leading-tight pr-2">{set.name}</h3>
                        <p className="text-[11px] font-bold text-stone-400 mt-1 uppercase tracking-wider">{set.owned} / {set.total} collected</p>
                      </div>
                      <div className={cn(
                        "text-[10px] px-2.5 py-1 rounded-full font-extrabold whitespace-nowrap shadow-sm border",
                        isComplete 
                          ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                          : "bg-stone-50 text-stone-500 border-stone-200"
                      )}>
                        {isComplete ? 'COMPLETE' : `${percent}%`}
                      </div>
                    </div>
                    
                    {/* Grid */}
                    <div className="grid grid-cols-3 gap-2.5">
                      {set.pins.map((pin, i) => (
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
              )
            })}
          </div>
        </div>

        {/* Trade / Duplicates Tray */}
        <div className="mx-5 mt-2 mb-32 bg-stone-800 rounded-[24px] p-4 shadow-xl shadow-stone-900/10 border border-stone-700 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-stone-700/40 via-transparent to-transparent pointer-events-none" />
          
          <div className="flex justify-between items-center mb-4 relative z-10">
            <div>
              <div className="text-[15px] font-bold text-white flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                Trade Tray
              </div>
              <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mt-0.5">5 pins available</div>
            </div>
            <button className="w-8 h-8 rounded-full bg-stone-700 flex items-center justify-center text-stone-300 hover:bg-stone-600 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className={cn("flex gap-2.5 overflow-x-auto pb-1 px-1 relative z-10", hideScrollbar)}>
            {[PINS[7], PINS[2], PINS[5], PINS[1], PINS[3]].map((pin, i) => (
              <div key={i} className="w-14 h-14 rounded-xl bg-stone-700/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_6px_rgba(0,0,0,0.3)] border border-stone-600 p-1.5 shrink-0 flex items-center justify-center relative">
                 {i === 0 && (
                   <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#fefcf8] text-stone-900 text-[10px] font-extrabold rounded-full flex items-center justify-center shadow-md z-20">2</div>
                 )}
                 <img src={pin} alt="" className="w-full h-full object-contain drop-shadow-sm z-10" />
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* FAB */}
      <button className="absolute bottom-8 right-6 w-[56px] h-[56px] bg-stone-900 rounded-[20px] shadow-[0_8px_24px_rgba(0,0,0,0.2)] flex items-center justify-center text-white z-50 hover:bg-stone-800 hover:scale-105 active:scale-95 transition-all">
        <Plus className="w-7 h-7" />
      </button>

    </div>
  );
}
