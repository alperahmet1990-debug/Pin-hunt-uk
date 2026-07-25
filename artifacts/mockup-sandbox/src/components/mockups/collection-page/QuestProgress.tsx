import React, { useState } from 'react';
import { Search, LayoutGrid, List, Trophy, Sparkles, ChevronRight, Award, Flame, Medal, Hexagon } from 'lucide-react';

const mockPins = [
  { id: 1, name: "Stitch 626 Day Exclusive", set: "Lilo & Stitch Collection", status: "owned", isNew: true, colors: "from-blue-500 via-indigo-500 to-purple-600" },
  { id: 2, name: "Maleficent Dragon Form", set: "Villains Sparkle", status: "forTrade", isNew: false, colors: "from-purple-600 via-emerald-600 to-green-700" },
  { id: 3, name: "Mary Poppins Carousel", set: "UK Castle Collection", status: "iso", isNew: false, colors: "from-rose-400 via-pink-500 to-red-500" },
  { id: 4, name: "Tinker Bell Autumn Leaf", set: "Fairy Seasons", status: "owned", isNew: false, colors: "from-amber-400 via-orange-500 to-red-600" },
  { id: 5, name: "Winnie the Pooh Hunny", set: "100 Acre Wood", status: "owned", isNew: false, colors: "from-yellow-300 via-amber-500 to-orange-600" },
  { id: 6, name: "Hades Flaming Hair", set: "Villains Sparkle", status: "forSale", isNew: false, colors: "from-cyan-400 via-blue-500 to-indigo-700" },
];

const filters = ["All Pins", "Official Sets", "My Boards", "Duplicates", "For Trade", "For Sale", "ISO"];

export function QuestProgress() {
  const [activeFilter, setActiveFilter] = useState("All Pins");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  return (
    <div className="min-h-[100dvh] w-full max-w-[390px] mx-auto bg-[#FFF8EE] text-[#2D1800] relative overflow-hidden font-sans pb-24 shadow-2xl flex flex-col items-stretch selection:bg-[#FFC84A] selection:text-[#2D1800]">
      {/* Background Pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.4] bg-[radial-gradient(#F0E0C0_2px,transparent_2px)] bg-[size:16px_16px]"></div>
      
      {/* Top Header / Profile Progress */}
      <div className="relative bg-gradient-to-br from-[#FFC84A] to-[#E07800] text-white pt-12 pb-6 px-4 rounded-b-[2rem] shadow-md z-10">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Hexagon className="w-5 h-5 fill-white/20 text-white" />
              <span className="font-bold tracking-wide text-sm uppercase">Level 7 Collector</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight drop-shadow-sm">My Collection</h1>
          </div>
          <div className="text-right flex flex-col items-end">
            <span className="text-white/80 text-xs font-semibold uppercase tracking-wider mb-0.5">Est. Value</span>
            <span className="font-bold text-xl drop-shadow-sm">£342</span>
          </div>
        </div>

        {/* XP Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs font-bold mb-1.5 text-white/90 drop-shadow-sm">
            <span>2,450 XP</span>
            <span>Next Level: 3,000 XP</span>
          </div>
          <div className="h-2.5 bg-black/15 rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-white rounded-full w-[81%] shadow-[0_0_8px_rgba(255,255,255,0.6)] relative overflow-hidden">
               <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.4)_50%,transparent_75%)] bg-[length:20px_20px] animate-[pulse_2s_ease-in-out_infinite]"></div>
            </div>
          </div>
        </div>

        {/* 3 Stat Medallions */}
        <div className="flex gap-3 justify-between">
          <div className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-2.5 flex flex-col items-center justify-center shadow-lg relative overflow-hidden">
            <div className="absolute inset-x-0 bottom-0 h-1 bg-[#2D9E6B]"></div>
            <span className="text-[#2D9E6B] bg-white rounded-full px-2 py-0.5 text-[10px] font-black uppercase mb-1 drop-shadow-sm">Owned</span>
            <span className="text-xl font-black">128</span>
          </div>
          <div className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-2.5 flex flex-col items-center justify-center shadow-lg relative overflow-hidden">
             <div className="absolute inset-x-0 bottom-0 h-1 bg-[#5B6EE8]"></div>
            <span className="text-[#5B6EE8] bg-white rounded-full px-2 py-0.5 text-[10px] font-black uppercase mb-1 drop-shadow-sm">Trading</span>
            <span className="text-xl font-black">12</span>
          </div>
          <div className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-2.5 flex flex-col items-center justify-center shadow-lg relative overflow-hidden">
             <div className="absolute inset-x-0 bottom-0 h-1 bg-[#D97832]"></div>
            <span className="text-[#D97832] bg-white rounded-full px-2 py-0.5 text-[10px] font-black uppercase mb-1 drop-shadow-sm">ISO</span>
            <span className="text-xl font-black">24</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto z-0 relative pt-4 px-4 pb-24 space-y-6 scrollbar-hide">
        
        {/* Milestone Toast */}
        <div className="bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-300 rounded-2xl p-3 flex items-center gap-3 shadow-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-amber-400 opacity-20 rounded-full blur-xl"></div>
          <div className="w-10 h-10 bg-amber-400 text-white rounded-full flex items-center justify-center shrink-0 shadow-inner">
            <Trophy className="w-5 h-5 drop-shadow-sm" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-0.5">Milestone Unlocked!</div>
            <div className="text-sm font-semibold text-[#2D1800]">50 Villains pins collected</div>
          </div>
        </div>

        {/* Filters & Actions */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-amber-700/50 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search pins..." 
                className="w-full bg-white border border-[#F0E0C0] rounded-xl pl-9 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#E07800]/20 focus:border-[#E07800] shadow-sm placeholder:text-amber-900/40"
              />
            </div>
            <div className="flex bg-white border border-[#F0E0C0] rounded-xl shadow-sm p-1">
              <button 
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg ${viewMode === 'grid' ? 'bg-amber-100 text-[#E07800]' : 'text-amber-900/40'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-lg ${viewMode === 'list' ? 'bg-amber-100 text-[#E07800]' : 'text-amber-900/40'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 scrollbar-hide">
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-bold border transition-colors shadow-sm shrink-0
                  ${activeFilter === filter 
                    ? 'bg-[#E07800] text-white border-[#E07800]' 
                    : 'bg-white text-amber-900/60 border-[#F0E0C0] hover:bg-amber-50'}`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Nearly Complete Sets */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight flex items-center gap-1.5">
              <Flame className="w-5 h-5 text-orange-500" />
              Nearly Complete
            </h2>
            <button className="text-xs font-bold text-[#E07800] hover:underline flex items-center">
              View All <ChevronRight className="w-3 h-3 ml-0.5" />
            </button>
          </div>
          
          <div className="flex overflow-x-auto gap-3 pb-4 -mx-4 px-4 scrollbar-hide">
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
                <div className="absolute inset-0 flex items-center justify-center font-black text-sm text-[#2D1800]">
                  10<span className="text-[10px] text-amber-900/50">/12</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm truncate mb-0.5">Villains Sparkle</h3>
                <div className="inline-flex bg-orange-100 text-[#D97832] font-black text-[10px] px-2 py-0.5 rounded-full tracking-wide">
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
                <div className="absolute inset-0 flex items-center justify-center font-black text-sm text-[#2D1800]">
                  3<span className="text-[10px] text-amber-900/50">/4</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm truncate mb-0.5">UK Castle Col...</h3>
                <div className="inline-flex bg-orange-100 text-[#D97832] font-black text-[10px] px-2 py-0.5 rounded-full tracking-wide">
                  1 PIN TO GO
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pin Grid */}
        <div className="grid grid-cols-2 gap-3">
          {mockPins.map((pin) => (
            <div key={pin.id} className="group bg-white border border-[#F0E0C0] rounded-[20px] p-2.5 shadow-sm relative overflow-hidden flex flex-col">
              
              {/* Corner Ribbon/Stamp */}
              {pin.status !== 'owned' && (
                <div className={`absolute top-0 right-0 text-[10px] font-black uppercase tracking-wider text-white px-3 py-1 rounded-bl-xl z-10 shadow-sm
                  ${pin.status === 'forTrade' ? 'bg-[#5B6EE8]' : ''}
                  ${pin.status === 'forSale' ? 'bg-[#E07800]' : ''}
                  ${pin.status === 'iso' ? 'bg-[#D97832]' : ''}
                `}>
                  {pin.status === 'forTrade' ? 'Trade' : pin.status === 'forSale' ? 'Sale' : 'ISO'}
                </div>
              )}
              
              {/* New Sparkle */}
              {pin.isNew && (
                <div className="absolute top-2 left-2 z-10 bg-white/90 backdrop-blur rounded-full p-1 shadow-sm border border-amber-200 text-amber-500 animate-bounce">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              )}

              {/* Pin Image Placeholder */}
              <div className="w-full aspect-square rounded-2xl mb-3 relative flex items-center justify-center p-4">
                {/* Simulated pin enamel shine */}
                <div className={`absolute inset-0 opacity-20 bg-gradient-to-br ${pin.colors} mix-blend-multiply rounded-2xl`}></div>
                <div className={`w-full h-full rounded-[2rem] bg-gradient-to-tr ${pin.colors} shadow-md border-2 border-white/20 relative overflow-hidden flex items-center justify-center`}>
                  <div className="absolute top-0 right-0 w-1/2 h-full bg-white/20 -skew-x-12 translate-x-4"></div>
                  <Award className="w-8 h-8 text-white/50 drop-shadow-md" />
                </div>
              </div>
              
              <div className="px-1 flex-1 flex flex-col">
                <h4 className="font-bold text-[13px] leading-tight text-[#2D1800] mb-1 line-clamp-2">{pin.name}</h4>
                <p className="text-[11px] font-medium text-amber-900/50 mt-auto truncate">{pin.set}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
