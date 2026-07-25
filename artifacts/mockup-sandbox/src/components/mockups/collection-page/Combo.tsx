import React, { useState } from 'react';
import PlusIcon from 'lucide-react/dist/esm/icons/plus';
import SearchIcon from 'lucide-react/dist/esm/icons/search';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right';

type PinStatus = "owned" | "forTrade" | "iso";

interface Pin {
  id: string;
  name: string;
  size: "large" | "normal";
  status: PinStatus;
  gradient: string;
}

interface Section {
  title: string;
  pins: Pin[];
}

const filters = ["All Pins", "Official Sets", "My Boards", "Duplicates", "For Trade", "For Sale", "ISO"];

const mockData: Section[] = [
  {
    title: "UK Castle Collection",
    pins: [
      { id: "c1", name: "Cinderella", size: "large", status: "owned", gradient: "radial-gradient(circle at top left, #4a90e2, #001f3f)" },
      { id: "c2", name: "Aurora", size: "normal", status: "forTrade", gradient: "radial-gradient(circle at top left, #ff758c, #ff7eb3)" },
      { id: "c3", name: "Snow White", size: "normal", status: "owned", gradient: "radial-gradient(circle at top left, #f6d365, #fda085)" },
      { id: "c4", name: "Ariel", size: "normal", status: "iso", gradient: "radial-gradient(circle at top left, #43e97b, #38f9d7)" },
      { id: "c5", name: "Belle", size: "normal", status: "owned", gradient: "radial-gradient(circle at top left, #fccb90, #d57eeb)" },
    ]
  },
  {
    title: "Villains Sparkle Series",
    pins: [
      { id: "v1", name: "Maleficent", size: "large", status: "owned", gradient: "radial-gradient(circle at top left, #b5ff00, #3a0ca3)" },
      { id: "v2", name: "Ursula", size: "normal", status: "iso", gradient: "radial-gradient(circle at top left, #00f2fe, #1e3c72)" },
      { id: "v3", name: "Evil Queen", size: "normal", status: "owned", gradient: "radial-gradient(circle at top left, #ff0844, #2a0845)" },
    ]
  },
  {
    title: "Standalone Pins",
    pins: [
      { id: "s1", name: "Stitch 626 Day", size: "large", status: "owned", gradient: "radial-gradient(circle at top left, #4facfe, #00f2fe)" },
      { id: "s2", name: "Mary Poppins", size: "normal", status: "forTrade", gradient: "radial-gradient(circle at top left, #ff9a9e, #fecfef)" },
      { id: "s3", name: "Mickey Waffle", size: "normal", status: "owned", gradient: "radial-gradient(circle at top left, #f9d423, #ff4e50)" },
      { id: "s4", name: "Figment", size: "normal", status: "iso", gradient: "radial-gradient(circle at top left, #f2709c, #ff9472)" },
      { id: "s5", name: "Oswald", size: "large", status: "owned", gradient: "radial-gradient(circle at top left, #434343, #000000)" },
      { id: "s6", name: "Goofy", size: "normal", status: "owned", gradient: "radial-gradient(circle at top left, #11998e, #38ef7d)" },
    ]
  }
];

const getStatusColor = (status: PinStatus) => {
  switch (status) {
    case 'owned': return '#2D9E6B';
    case 'forTrade': return '#5B6EE8';
    case 'iso': return '#D97832';
    default: return '#2D1800';
  }
};

export function Combo() {
  const [activeFilter, setActiveFilter] = useState("All Pins");

  return (
    <div className="relative mx-auto min-h-[100dvh] w-full max-w-[390px] bg-[#FFF8EE] text-[#2D1800] overflow-hidden antialiased font-sans flex flex-col shadow-2xl selection:bg-[#FFC84A] selection:text-[#2D1800]">
      
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* Background Pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.4] bg-[radial-gradient(#F0E0C0_2px,transparent_2px)] bg-[size:16px_16px]"></div>

      <div className="relative z-10 flex flex-col h-full overflow-y-auto pb-28 no-scrollbar">
        
        {/* Gradient Hero Header */}
        <div className="relative bg-gradient-to-br from-[#FFC84A] to-[#E07800] text-white pt-12 pb-8 px-4 rounded-b-[2rem] shadow-md mb-10 z-10">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl font-black tracking-tight drop-shadow-sm">My Collection</h1>
              <p className="text-[13px] font-bold text-white/90 mt-1 drop-shadow-sm">128 pins &middot; £342</p>
            </div>
            <button className="p-2 text-[#E07800] bg-white border border-white/20 shadow-sm hover:bg-white/90 rounded-full transition-colors">
              <SearchIcon size={20} strokeWidth={2.5} />
            </button>
          </div>

          {/* 3 Stat Medallions Overlapping Bottom Edge */}
          <div className="absolute left-4 right-4 -bottom-6 flex gap-3 justify-between">
            <div className="flex-1 bg-white border border-[#F0E0C0] rounded-2xl p-2.5 flex flex-col items-center justify-center shadow-md relative overflow-hidden">
              <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[#2D9E6B]"></div>
              <span className="text-[#2D9E6B] bg-[#2D9E6B]/10 rounded-full px-2 py-0.5 text-[9px] font-black uppercase mb-1 tracking-wider">Owned</span>
              <span className="text-xl font-black text-[#2D1800]">128</span>
            </div>
            <div className="flex-1 bg-white border border-[#F0E0C0] rounded-2xl p-2.5 flex flex-col items-center justify-center shadow-md relative overflow-hidden">
               <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[#5B6EE8]"></div>
              <span className="text-[#5B6EE8] bg-[#5B6EE8]/10 rounded-full px-2 py-0.5 text-[9px] font-black uppercase mb-1 tracking-wider">Trading</span>
              <span className="text-xl font-black text-[#2D1800]">12</span>
            </div>
            <div className="flex-1 bg-white border border-[#F0E0C0] rounded-2xl p-2.5 flex flex-col items-center justify-center shadow-md relative overflow-hidden">
               <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[#D97832]"></div>
              <span className="text-[#D97832] bg-[#D97832]/10 rounded-full px-2 py-0.5 text-[9px] font-black uppercase mb-1 tracking-wider">ISO</span>
              <span className="text-xl font-black text-[#2D1800]">24</span>
            </div>
          </div>
        </div>

        {/* Nearly Complete Sets */}
        <div className="space-y-3 pb-8">
          <div className="flex items-center justify-between px-4">
            <h2 className="text-[12px] uppercase tracking-[0.15em] font-black text-[#2D1800]/50">
              Nearly Complete
            </h2>
            <button className="text-[11px] font-bold text-[#E07800] hover:underline flex items-center">
              View All <ChevronRightIcon className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>
          
          <div className="flex overflow-x-auto gap-3 -mx-4 px-4 no-scrollbar pb-2">
            {/* Set Card 1 */}
            <div className="bg-white border border-[#F0E0C0] rounded-2xl p-3.5 shadow-sm min-w-[240px] shrink-0 flex gap-4 items-center">
              <div className="relative w-14 h-14 shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-amber-100"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  />
                  <path
                    className="text-[#E07800]"
                    strokeDasharray="83, 100"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-black text-[13px] text-[#2D1800]">
                  10<span className="text-[9px] text-[#2D1800]/50 pt-0.5">/12</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm truncate mb-1">Villains Sparkle</h3>
                <div className="inline-flex bg-[#FFC84A]/20 text-[#E07800] font-black text-[9px] px-2 py-0.5 rounded-full tracking-wider">
                  2 PINS TO GO
                </div>
              </div>
            </div>

            {/* Set Card 2 */}
            <div className="bg-white border border-[#F0E0C0] rounded-2xl p-3.5 shadow-sm min-w-[240px] shrink-0 flex gap-4 items-center">
              <div className="relative w-14 h-14 shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-amber-100"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  />
                  <path
                    className="text-[#E07800]"
                    strokeDasharray="75, 100"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-black text-[13px] text-[#2D1800]">
                  3<span className="text-[9px] text-[#2D1800]/50 pt-0.5">/4</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm truncate mb-1">UK Castle Col...</h3>
                <div className="inline-flex bg-[#FFC84A]/20 text-[#E07800] font-black text-[9px] px-2 py-0.5 rounded-full tracking-wider">
                  1 PIN TO GO
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex overflow-x-auto gap-2 no-scrollbar px-4 pb-6">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[13px] font-bold border transition-colors shadow-sm shrink-0
                ${activeFilter === filter 
                  ? 'bg-gradient-to-r from-[#FFC84A] to-[#E07800] text-white border-transparent' 
                  : 'bg-white text-[#2D1800]/70 border-[#F0E0C0] hover:bg-amber-50'}`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Main Grid Content (Gallery Tile Style) */}
        <div className="px-4 space-y-8 pb-12">
          {mockData.map((section) => (
            <section key={section.title}>
              {/* Optional Section Header — left it out or keep it? The instructions said "set-name labels in small caps" on the main pin grid. I'll put it in the overlay. */}
              
              <div className="grid grid-cols-3 grid-flow-row-dense gap-2.5">
                {section.pins.map((pin) => {
                  const isLarge = pin.size === "large";
                  return (
                    <div 
                      key={pin.id}
                      className={`
                        group relative rounded-[1.25rem] overflow-hidden aspect-square cursor-pointer
                        shadow-[0_4px_12px_rgba(45,24,0,0.06)] hover:shadow-[0_8px_24px_rgba(45,24,0,0.12)]
                        transition-all duration-300 transform hover:-translate-y-0.5 border border-white/20
                        ${isLarge ? 'col-span-2 row-span-2 rounded-[1.75rem]' : 'col-span-1 row-span-1'}
                      `}
                      style={{ background: pin.gradient }}
                    >
                      {/* Gloss / Specular Highlight */}
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.4)_0%,transparent_50%)] mix-blend-overlay pointer-events-none"></div>
                      
                      {/* Inner Bevels */}
                      <div className={`absolute inset-0 ring-1 ring-inset ring-white/30 pointer-events-none ${isLarge ? 'rounded-[1.75rem]' : 'rounded-[1.25rem]'}`}></div>
                      <div className={`absolute inset-0 shadow-[inset_0_-4px_8px_rgba(0,0,0,0.15)] pointer-events-none ${isLarge ? 'rounded-[1.75rem]' : 'rounded-[1.25rem]'}`}></div>
                      
                      {/* Status Dot */}
                      <div 
                        className={`absolute ${isLarge ? 'top-3 right-3 w-3.5 h-3.5 ring-[3px]' : 'top-2 right-2 w-2.5 h-2.5 ring-2'} rounded-full ring-white shadow-sm z-10`}
                        style={{ backgroundColor: getStatusColor(pin.status) }}
                      />

                      {/* Pin Name Overlay with Set-Name Label */}
                      <div className="absolute inset-x-0 bottom-0 p-3 pt-12 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end">
                        <p className={`text-white/70 font-bold uppercase tracking-wider truncate w-full ${isLarge ? 'text-[9px] mb-0.5' : 'text-[7px] mb-0.5'}`}>
                          {section.title}
                        </p>
                        <p className={`text-white font-bold drop-shadow-md truncate w-full ${isLarge ? 'text-[15px]' : 'text-[11px] leading-tight'}`}>
                          {pin.name}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Add Pin FAB */}
      <button className="absolute bottom-8 right-6 w-14 h-14 bg-gradient-to-br from-[#FFC84A] to-[#E07800] rounded-full shadow-[0_8px_20px_rgba(224,120,0,0.4)] flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-all z-50">
        <PlusIcon size={28} strokeWidth={2.5} />
      </button>
    </div>
  );
}
