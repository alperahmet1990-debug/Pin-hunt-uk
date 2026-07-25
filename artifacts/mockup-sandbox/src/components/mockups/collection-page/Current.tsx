import React, { useState } from "react";
import { Search, Grid, List } from "lucide-react";

const filters = [
  "All Pins",
  "Official Sets",
  "My Boards",
  "Duplicates",
  "For Trade",
  "For Sale",
  "ISO",
];

const pins = [
  {
    id: 1,
    title: "Maleficent Dragon",
    collection: "Villains Sparkle Series",
    status: "Owned",
    gradient: "from-purple-500 to-slate-900",
  },
  {
    id: 2,
    title: "Stitch 626 Day",
    collection: "Lilo & Stitch Anniversary",
    status: "For Trade",
    gradient: "from-blue-400 to-indigo-600",
  },
  {
    id: 3,
    title: "Mary Poppins Carousel",
    collection: "UK Castle Collection",
    status: "ISO",
    gradient: "from-rose-400 to-red-600",
  },
  {
    id: 4,
    title: "Tinker Bell Autumn",
    collection: "Seasons of Pixie Hollow",
    status: "Owned",
    gradient: "from-green-400 to-emerald-600",
  },
  {
    id: 5,
    title: "Winnie the Pooh Hunny Pot",
    collection: "Winnie the Pooh Hunny Pot Series",
    status: "Owned",
    gradient: "from-amber-300 to-orange-500",
  },
  {
    id: 6,
    title: "Ursula Sea Shell",
    collection: "Villains Sparkle Series",
    status: "For Sale",
    gradient: "from-violet-500 to-purple-800",
  },
  {
    id: 7,
    title: "Mickey UK Flag Balloon",
    collection: "London Exclusives",
    status: "Owned",
    gradient: "from-red-500 to-blue-700",
  },
  {
    id: 8,
    title: "Alice in Wonderland Teacup",
    collection: "Mad Tea Party Series",
    status: "ISO",
    gradient: "from-teal-300 to-cyan-600",
  },
];

function getStatusColor(status: string) {
  switch (status) {
    case "Owned":
      return "bg-[#2D9E6B]";
    case "For Trade":
      return "bg-[#5B6EE8]";
    case "ISO":
      return "bg-[#D97832]";
    case "For Sale":
      return "bg-[#E07800]";
    default:
      return "bg-gray-400";
  }
}

export function Current() {
  const [activeFilter, setActiveFilter] = useState("All Pins");

  return (
    <div
      className="w-full max-w-[390px] mx-auto min-h-[100dvh] bg-[#FFF8EE] text-[#2D1800] overflow-x-hidden flex flex-col font-sans"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Header */}
      <div className="px-4 pt-12 pb-4">
        <h1 className="text-[28px] font-bold tracking-tight">My Collection</h1>
        <p className="text-[14px] text-[#2D1800]/60 mt-0.5">
          128 pins &middot; est. £342
        </p>
      </div>

      {/* Filters Row */}
      <div className="px-4 pb-4 overflow-x-auto no-scrollbar flex gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[14px] font-medium transition-colors ${
              activeFilter === f
                ? "bg-[#E07800] text-white border border-[#E07800]"
                : "bg-white border border-[#F0E0C0] text-[#2D1800]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Search and Toggle */}
      <div className="px-4 pb-4 flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D1800]/40" />
          <input
            type="text"
            placeholder="Search collection..."
            className="w-full bg-white border border-[#F0E0C0] rounded-xl py-2 pl-9 pr-4 text-[14px] outline-none focus:border-[#E07800] placeholder:text-[#2D1800]/40"
          />
        </div>
        <div className="flex bg-white border border-[#F0E0C0] rounded-xl p-1">
          <button className="p-1.5 bg-[#FFF8EE] rounded-lg text-[#2D1800]">
            <Grid className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-[#2D1800]/40">
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="px-4 pb-12 grid grid-cols-2 gap-3">
        {pins.map((pin) => (
          <div
            key={pin.id}
            className="bg-white rounded-[12px] border border-[#F0E0C0] overflow-hidden flex flex-col"
          >
            <div
              className={`aspect-square w-full bg-gradient-to-br ${pin.gradient} relative`}
            >
              <div className="absolute inset-0 bg-white/10 mix-blend-overlay"></div>
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-60"></div>
            </div>
            <div className="p-3 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-[14px] font-semibold text-[#2D1800] leading-tight mb-1 line-clamp-2">
                  {pin.title}
                </h3>
                <p className="text-[12px] text-[#2D1800]/60 leading-tight line-clamp-1">
                  {pin.collection}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <div
                  className={`w-2 h-2 rounded-full ${getStatusColor(
                    pin.status
                  )}`}
                />
                <span className="text-[10px] font-bold text-[#2D1800]/60 uppercase tracking-widest">
                  {pin.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
