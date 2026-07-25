import React, { useState } from 'react';
import { Search, Star, Sparkles, Award, ChevronRight } from 'lucide-react';

const FILTERS = ["All Pins", "Official Sets", "My Boards", "Duplicates", "For Trade", "For Sale", "ISO"];

const SETS = [
  {
    id: 1,
    name: "Villains Sparkle Series",
    owned: 5,
    total: 8,
    pins: [
      { id: 101, color: "from-purple-600 to-slate-900", shape: "rounded-full" },
      { id: 102, color: "from-red-600 to-rose-900", shape: "rounded-lg transform rotate-3" },
      { id: 103, color: "from-emerald-500 to-teal-900", shape: "rounded-full" },
      { id: 104, color: "from-blue-600 to-indigo-900", shape: "rounded-md transform -rotate-2" },
      { id: 105, color: "from-amber-500 to-orange-800", shape: "rounded-full" },
    ]
  },
  {
    id: 2,
    name: "UK Castle Collection",
    owned: 10,
    total: 10,
    pins: [
      { id: 201, color: "from-blue-400 to-indigo-600", shape: "rounded-t-[20px] rounded-b-md" },
      { id: 202, color: "from-indigo-400 to-purple-600", shape: "rounded-t-[20px] rounded-b-md" },
      { id: 203, color: "from-sky-400 to-blue-600", shape: "rounded-t-[20px] rounded-b-md" },
      { id: 204, color: "from-pink-400 to-rose-600", shape: "rounded-t-[20px] rounded-b-md" },
    ]
  },
  {
    id: 3,
    name: "Winnie the Pooh Hunny Pot",
    owned: 2,
    total: 6,
    pins: [
      { id: 301, color: "from-yellow-400 to-amber-600", shape: "rounded-b-[24px] rounded-t-sm" },
      { id: 302, color: "from-amber-400 to-orange-600", shape: "rounded-b-[24px] rounded-t-sm" },
    ]
  },
  {
    id: 4,
    name: "Haunted Mansion 50th",
    owned: 3,
    total: 12,
    pins: [
      { id: 401, color: "from-teal-800 to-slate-900", shape: "rounded-sm transform rotate-6" },
      { id: 402, color: "from-violet-800 to-slate-900", shape: "rounded-full" },
      { id: 403, color: "from-slate-700 to-slate-900", shape: "rounded-md transform -rotate-3" },
    ]
  }
];

export function TrophyCase() {
  const [activeFilter, setActiveFilter] = useState("Official Sets");

  return (
    <div className="w-[390px] min-h-screen bg-[#FFF8EE] text-[#2D1800] font-sans flex flex-col relative overflow-hidden pb-12 shadow-2xl mx-auto">
      {/* Background Subtle Texture/Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#FFC84A]/5 to-transparent pointer-events-none" />

      {/* Header */}
      <div className="px-5 pt-12 pb-2 flex items-center justify-between z-10">
        <h1 className="text-[26px] font-black tracking-tight text-[#2D1800] drop-shadow-sm">My Collection</h1>
        <button className="w-10 h-10 rounded-full bg-white border border-[#F0E0C0] flex items-center justify-center shadow-sm text-[#E07800] hover:bg-[#FFFDF9] transition-colors">
          <Search size={20} strokeWidth={2.5} />
        </button>
      </div>

      {/* Hero Showcase / Spotlight Container */}
      <div className="px-5 mb-6 mt-2 relative z-10">
        <div className="rounded-[20px] bg-gradient-to-b from-[#FFFFFF] to-[#FFF4E0] border border-[#F0E0C0] p-6 pb-5 flex flex-col items-center relative shadow-[0_12px_40px_rgb(224,120,0,0.12)] overflow-hidden">
          {/* Spotlight Glow Effect */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[240px] h-[180px] bg-gradient-to-b from-[#FFC84A]/30 to-transparent blur-2xl rounded-full pointer-events-none" />
          
          <div className="mb-3 text-[11px] font-bold tracking-[0.15em] text-[#E07800] uppercase flex items-center gap-1.5 bg-[#FFF8EE] px-3 py-1 rounded-full border border-[#FFC84A]/30 shadow-sm">
            <Award size={14} className="text-[#FFC84A]" /> Prized Possession
          </div>
          
          {/* Featured Pin (Hero) */}
          <div className="relative w-36 h-36 my-2 z-10 group cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-tr from-[#FFC84A] to-[#E07800] rounded-full blur-xl opacity-30 group-hover:opacity-50 transition-opacity duration-500" />
            <div className="w-full h-full relative z-10 bg-gradient-to-br from-purple-700 via-indigo-800 to-slate-900 rounded-[2.8rem] shadow-[inset_0_2px_12px_rgba(255,255,255,0.4),0_12px_24px_rgba(0,0,0,0.25)] border-[3px] border-[#FFC84A]/60 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-300">
              <Sparkles className="text-white/30 absolute top-4 left-4 w-6 h-6" />
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-700 rounded-full shadow-[inset_0_-4px_10px_rgba(0,0,0,0.4)] border border-emerald-300/40 flex items-center justify-center">
                <Star className="text-yellow-100/90 w-8 h-8 fill-current drop-shadow-sm" />
              </div>
            </div>
            
            {/* Twinkles around pin */}
            <div className="absolute -top-1 -right-1 w-4 h-4 text-[#FFC84A] animate-pulse">✨</div>
            <div className="absolute bottom-2 -left-3 w-5 h-5 text-[#E07800] animate-pulse delay-150">✨</div>
          </div>
          
          <h2 className="text-xl font-bold text-[#2D1800] text-center leading-tight mt-3 mb-0.5 z-10 drop-shadow-sm">Maleficent Dragon</h2>
          <p className="text-xs text-[#E07800] mb-5 z-10 font-bold tracking-wide">D23 EXCLUSIVE • LE 500</p>
          
          {/* Engraved Plaque Stats */}
          <div className="flex items-center gap-3 w-full z-10">
            <div className="flex-1 bg-gradient-to-b from-[#F0E0C0] to-[#EBC48F] p-[1px] rounded-[14px] shadow-sm relative overflow-hidden">
              <div className="bg-gradient-to-b from-[#FFFDF9] to-[#FFF8EE] rounded-[13px] py-2.5 px-3 text-center flex flex-col justify-center h-full shadow-[inset_0_2px_4px_rgba(255,255,255,0.8)]">
                <span className="text-[9px] uppercase tracking-widest text-[#2D1800]/50 font-bold mb-0.5">Pins Owned</span>
                <span className="text-[22px] font-black text-[#2D1800] leading-none tracking-tight">128</span>
              </div>
            </div>
            <div className="flex-1 bg-gradient-to-b from-[#F0E0C0] to-[#EBC48F] p-[1px] rounded-[14px] shadow-sm relative overflow-hidden">
              <div className="bg-gradient-to-b from-[#FFFDF9] to-[#FFF8EE] rounded-[13px] py-2.5 px-3 text-center flex flex-col justify-center h-full shadow-[inset_0_2px_4px_rgba(255,255,255,0.8)]">
                <span className="text-[9px] uppercase tracking-widest text-[#2D1800]/50 font-bold mb-0.5">Est. Value</span>
                <span className="text-[22px] font-black text-[#2D1800] leading-none tracking-tight">£342</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters (Gold Tab Chips) */}
      <div className="pl-5 mb-4 overflow-x-auto pb-4 pt-1 scrollbar-none flex gap-2.5 w-full pr-5 z-10 relative">
        {FILTERS.map(filter => {
          const isActive = activeFilter === filter;
          return (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-[13px] font-bold transition-all flex-shrink-0 border 
                ${isActive 
                  ? 'bg-gradient-to-r from-[#FFC84A] to-[#E07800] text-white border-transparent shadow-[0_6px_16px_rgb(224,120,0,0.3)] scale-105 transform origin-left' 
                  : 'bg-white text-[#2D1800]/60 border-[#F0E0C0] hover:bg-[#FFFDF9] shadow-sm hover:text-[#2D1800]'}`}
            >
              {filter}
            </button>
          );
        })}
      </div>

      {/* Shelves Section */}
      <div className="flex-1 flex flex-col gap-8 px-5 relative z-10 pb-10">
        {SETS.map((set) => {
          const isComplete = set.owned === set.total;
          
          return (
            <div key={set.id} className="relative pt-1 group">
              {/* Shelf Header */}
              <div className="flex justify-between items-end mb-2 pl-1 pr-14">
                <h3 className="font-extrabold text-[#2D1800] text-[16px] tracking-tight">{set.name}</h3>
                <button className="text-[11px] font-bold text-[#E07800] flex items-center gap-0.5 hover:text-[#2D1800] transition-colors">
                  VIEW <ChevronRight size={12} strokeWidth={3} />
                </button>
              </div>
              
              {/* Shelf Container */}
              <div className="relative mt-3">
                {/* Pins on Shelf */}
                <div className="flex items-end gap-3.5 pl-2 pr-16 relative z-10 pb-[2px] min-h-[56px]">
                  {set.pins.map((pin, i) => (
                    <div 
                      key={pin.id} 
                      className={`w-12 h-12 bg-gradient-to-br ${pin.color} ${pin.shape} shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),0_6px_10px_rgba(0,0,0,0.15)] border-[1.5px] border-white/30 relative cursor-pointer hover:-translate-y-1.5 transition-transform duration-300 ease-out`}
                      style={{ zIndex: 10 - i }}
                    >
                      <div className="absolute inset-0 bg-white/5 rounded-inherit"></div>
                      {/* Fake highlight */}
                      <div className="absolute top-1 left-1 right-2 bottom-3 bg-gradient-to-br from-white/30 to-transparent rounded-inherit opacity-60 pointer-events-none"></div>
                    </div>
                  ))}
                  
                  {/* Empty spots representation (ghost outlines) */}
                  {Array.from({ length: Math.min(3, set.total - set.owned) }).map((_, i) => (
                    <div key={`empty-${i}`} className="w-[46px] h-[46px] border-[1.5px] border-dashed border-[#E07800]/30 rounded-full flex items-center justify-center bg-[#E07800]/5 opacity-60 mb-[1px]">
                      <div className="w-3 h-3 rounded-full bg-[#E07800]/15"></div>
                    </div>
                  ))}
                  
                  {/* Plus indicator if there are more missing than shown */}
                  {set.total - set.owned > 3 && (
                    <div className="w-8 h-8 flex items-center justify-center opacity-40 mb-2">
                      <span className="text-xl font-bold text-[#E07800] tracking-widest leading-none">...</span>
                    </div>
                  )}
                </div>

                {/* The Physical Wood/Amber Shelf Line */}
                <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-b from-[#F0E0C0] to-[#EBC48F]/40 rounded-full border-t border-white shadow-[0_6px_12px_rgba(224,120,0,0.08)]">
                  {/* Inner lip */}
                  <div className="w-full h-[1px] bg-[#2D1800]/5 absolute top-[1px]"></div>
                </div>

                {/* Completion Ring on right end of shelf */}
                <div className="absolute right-0 bottom-[-8px] w-14 h-14 bg-white rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-[#F0E0C0] flex items-center justify-center z-20 overflow-hidden group-hover:scale-105 transition-transform duration-300">
                  {/* Background inner color based on status */}
                  {isComplete && <div className="absolute inset-0 bg-[#2D9E6B]/5"></div>}
                  
                  <svg className="w-[48px] h-[48px] transform -rotate-90 relative z-10" viewBox="0 0 36 36">
                    <path
                      className="text-[#FFF4E0]"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className={isComplete ? "text-[#2D9E6B]" : "text-[#E07800]"}
                      strokeWidth="3.5"
                      strokeDasharray={`${(set.owned / set.total) * 100}, 100`}
                      stroke="currentColor"
                      fill="none"
                      strokeLinecap="round"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center flex-col leading-none pt-[1px] z-20">
                    <span className={`text-[12px] font-black ${isComplete ? "text-[#2D9E6B]" : "text-[#2D1800]"}`}>{set.owned}</span>
                    <div className="w-5 h-[1px] bg-[#2D1800]/10 my-[1px]"></div>
                    <span className="text-[9px] text-[#2D1800]/50 font-bold">{set.total}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
