import React, { useState } from "react";
import { Search, Grid, List, Plus, Bookmark, ArrowRightLeft, Copy, LayoutGrid, Check, Settings2, SlidersHorizontal, Image as ImageIcon } from "lucide-react";

// Mock data
const PINS = [
  { id: 1, name: "Castle Series – Cinderella", set: "Hidden Disney Wave A", image: "/__mockup/images/pins/pin1.png", status: "owned" },
  { id: 2, name: "Alien Stitch", set: "Lilo & Stitch 25th", image: "/__mockup/images/pins/pin2.png", status: "iso" },
  { id: 3, name: "Sailor Donald", set: "Mickey & Friends", image: "/__mockup/images/pins/pin3.png", status: "trade" },
  { id: 4, name: "Honey Pot", set: "Winnie the Pooh", image: "/__mockup/images/pins/pin4.png", status: "owned" },
  { id: 5, name: "Fairy Glitter Wings", set: "Tinker Bell Starter", image: "/__mockup/images/pins/pin5.png", status: "duplicate" },
  { id: 6, name: "Chipmunk Duo", set: "Mickey & Friends", image: "/__mockup/images/pins/pin6.png", status: "owned" },
  { id: 7, name: "Bow Minnie", set: "Mickey & Friends", image: "/__mockup/images/pins/pin7.png", status: "trade" },
  { id: 8, name: "Classic Mickey", set: "Mickey & Friends", image: "/__mockup/images/pins/pin8.png", status: "owned" },
  { id: 9, name: "Castle Series – Sleeping Beauty", set: "Hidden Disney Wave A", image: "/__mockup/images/pins/pin1.png", status: "owned" },
  { id: 10, name: "Surfer Stitch", set: "Lilo & Stitch 25th", image: "/__mockup/images/pins/pin2.png", status: "iso" },
  { id: 11, name: "Captain Mickey", set: "Mickey & Friends", image: "/__mockup/images/pins/pin8.png", status: "trade" },
  { id: 12, name: "Tink Pose", set: "Tinker Bell Starter", image: "/__mockup/images/pins/pin5.png", status: "owned" },
  { id: 13, name: "Pluto Doghouse", set: "Mickey & Friends", image: "/__mockup/images/pins/pin3.png", status: "owned" },
  { id: 14, name: "Daisy Floral", set: "Mickey & Friends", image: "/__mockup/images/pins/pin7.png", status: "duplicate" },
  { id: 15, name: "Castle Series – Snow White", set: "Hidden Disney Wave A", image: "/__mockup/images/pins/pin1.png", status: "owned" },
  { id: 16, name: "Hula Stitch", set: "Lilo & Stitch 25th", image: "/__mockup/images/pins/pin2.png", status: "iso" },
  { id: 17, name: "Goofy Surprised", set: "Mickey & Friends", image: "/__mockup/images/pins/pin6.png", status: "owned" },
  { id: 18, name: "Tink Flying", set: "Tinker Bell Starter", image: "/__mockup/images/pins/pin5.png", status: "owned" },
];

const STATS = [
  { id: "owned", label: "Owned", count: 23, color: "bg-emerald-500", icon: Check },
  { id: "iso", label: "ISO", count: 4, color: "bg-amber-500", icon: Bookmark },
  { id: "trade", label: "For Trade", count: 3, color: "bg-blue-500", icon: ArrowRightLeft },
  { id: "duplicate", label: "Duplicates", count: 2, color: "bg-purple-500", icon: Copy },
];

export function Showcase() {
  const [activeFilter, setActiveFilter] = useState("owned");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  return (
    <div className="flex justify-center items-center min-h-screen bg-neutral-200 p-4 sm:p-8 font-sans">
      <div className="w-full max-w-[390px] h-[844px] bg-white rounded-[40px] shadow-2xl overflow-hidden relative flex flex-col border-[8px] border-neutral-900">
        
        {/* Top Header - Minimal Chrome */}
        <div className="pt-12 pb-2 px-5 flex items-center justify-between bg-white z-10 relative">
          <h1 className="text-xl font-bold tracking-tight text-neutral-900">My Collection</h1>
          <div className="flex items-center gap-4">
            <button className="text-neutral-500 hover:text-neutral-900 transition-colors">
              <Search size={22} strokeWidth={2.5} />
            </button>
            <div className="flex bg-neutral-100 p-1 rounded-full items-center">
              <button 
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-full transition-colors ${viewMode === "grid" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-400"}`}
              >
                <LayoutGrid size={16} strokeWidth={2.5} />
              </button>
              <button 
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-full transition-colors ${viewMode === "list" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-400"}`}
              >
                <List size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pb-24 hide-scrollbar">
          
          {/* Identity Header */}
          <div className="px-5 pt-4 pb-6">
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-6xl font-black tracking-tighter text-neutral-900 leading-none">23</span>
              <span className="text-lg font-medium text-neutral-500">pins owned</span>
            </div>

            {/* Stat Tiles / Filters */}
            <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-5 px-5 pb-2">
              {STATS.map((stat) => {
                const isActive = activeFilter === stat.id;
                const Icon = stat.icon;
                return (
                  <button
                    key={stat.id}
                    onClick={() => setActiveFilter(stat.id)}
                    className={`flex flex-col gap-2 min-w-[96px] p-3 rounded-2xl border transition-all text-left flex-shrink-0 ${
                      isActive 
                        ? "border-neutral-900 bg-neutral-900 text-white shadow-md" 
                        : "border-neutral-100 bg-neutral-50 text-neutral-600 hover:border-neutral-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`p-1.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-white shadow-sm'}`}>
                        <Icon size={14} className={isActive ? "text-white" : stat.color.replace('bg-', 'text-')} strokeWidth={3} />
                      </div>
                      <span className={`text-xl font-bold ${isActive ? 'text-white' : 'text-neutral-900'}`}>
                        {stat.count}
                      </span>
                    </div>
                    <span className={`text-xs font-semibold ${isActive ? 'text-neutral-300' : 'text-neutral-500'}`}>
                      {stat.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gallery Area */}
          <div className="px-5 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-900 uppercase tracking-wider">Gallery</span>
              <span className="text-sm text-neutral-400 font-medium">({PINS.length})</span>
            </div>
            <button className="text-xs font-semibold text-neutral-500 flex items-center gap-1.5 hover:text-neutral-900 bg-neutral-50 px-2.5 py-1.5 rounded-full">
              <SlidersHorizontal size={14} />
              Filter
            </button>
          </div>

          <div className={`px-5 ${viewMode === "grid" ? "grid grid-cols-3 gap-2" : "flex flex-col gap-3"}`}>
            {PINS.map((pin) => (
              <div 
                key={pin.id} 
                className={`relative group overflow-hidden bg-neutral-100 rounded-xl ${
                  viewMode === "grid" ? "aspect-square" : "flex items-center gap-4 p-3 h-24"
                }`}
              >
                {/* Image */}
                <div className={`${viewMode === "grid" ? "absolute inset-0" : "w-16 h-16 rounded-lg overflow-hidden relative flex-shrink-0 bg-neutral-200"}`}>
                  <img 
                    src={pin.image} 
                    alt={pin.name} 
                    className="w-full h-full object-cover mix-blend-multiply"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNlNWU1ZTUiIC8+PC9zdmc+';
                    }}
                  />
                  {/* Grid Scrim */}
                  {viewMode === "grid" && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
                  )}
                </div>

                {/* Status Dot */}
                <div className={`absolute ${viewMode === "grid" ? "top-2 right-2" : "top-3 right-3"}`}>
                  <div className={`w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                    pin.status === 'owned' ? 'bg-emerald-500' :
                    pin.status === 'iso' ? 'bg-amber-500' :
                    pin.status === 'trade' ? 'bg-blue-500' :
                    'bg-purple-500'
                  }`} />
                </div>

                {/* Info */}
                {viewMode === "grid" ? (
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-[10px] font-bold text-white leading-tight line-clamp-2 drop-shadow-md">
                      {pin.name}
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <p className="text-sm font-bold text-neutral-900 truncate mb-0.5">{pin.name}</p>
                    <p className="text-xs text-neutral-500 truncate">{pin.set}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>

        {/* Floating FAB */}
        <div className="absolute bottom-6 right-5 flex justify-end">
          <button className="w-14 h-14 bg-neutral-900 text-white rounded-full flex items-center justify-center shadow-xl shadow-neutral-900/30 hover:scale-105 active:scale-95 transition-transform">
            <Plus size={28} strokeWidth={2.5} />
          </button>
        </div>

        {/* Bottom Nav Placeholder (optional, keeping minimal for focus on gallery) */}
        <div className="absolute bottom-0 w-full h-safe pb-4 pt-3 px-6 bg-white/90 backdrop-blur-md border-t border-neutral-100 flex justify-between items-center z-10">
           <button className="text-neutral-900 flex flex-col items-center gap-1">
              <ImageIcon size={20} strokeWidth={2.5} />
              <span className="text-[10px] font-bold">Collection</span>
           </button>
           <button className="text-neutral-400 hover:text-neutral-900 flex flex-col items-center gap-1 transition-colors">
              <Search size={20} strokeWidth={2.5} />
              <span className="text-[10px] font-bold">Discover</span>
           </button>
           <div className="w-10"></div> {/* Spacer for FAB alignment if centered, but FAB is right-aligned here. Let's adjust space */}
           <button className="text-neutral-400 hover:text-neutral-900 flex flex-col items-center gap-1 transition-colors">
              <ArrowRightLeft size={20} strokeWidth={2.5} />
              <span className="text-[10px] font-bold">Trades</span>
           </button>
           <button className="text-neutral-400 hover:text-neutral-900 flex flex-col items-center gap-1 transition-colors">
              <Settings2 size={20} strokeWidth={2.5} />
              <span className="text-[10px] font-bold">Profile</span>
           </button>
        </div>
        
      </div>
    </div>
  );
}

export default Showcase;
