import React from 'react';
import { Search, Filter, Plus } from 'lucide-react';

type PinStatus = "owned" | "trade" | "wanted";

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
      { id: "c2", name: "Aurora", size: "normal", status: "trade", gradient: "radial-gradient(circle at top left, #ff758c, #ff7eb3)" },
      { id: "c3", name: "Snow White", size: "normal", status: "owned", gradient: "radial-gradient(circle at top left, #f6d365, #fda085)" },
      { id: "c4", name: "Ariel", size: "normal", status: "wanted", gradient: "radial-gradient(circle at top left, #43e97b, #38f9d7)" },
      { id: "c5", name: "Belle", size: "normal", status: "owned", gradient: "radial-gradient(circle at top left, #fccb90, #d57eeb)" },
    ]
  },
  {
    title: "Villains Sparkle Series",
    pins: [
      { id: "v1", name: "Maleficent", size: "large", status: "owned", gradient: "radial-gradient(circle at top left, #b5ff00, #3a0ca3)" },
      { id: "v2", name: "Ursula", size: "normal", status: "wanted", gradient: "radial-gradient(circle at top left, #00f2fe, #1e3c72)" },
      { id: "v3", name: "Evil Queen", size: "normal", status: "owned", gradient: "radial-gradient(circle at top left, #ff0844, #2a0845)" },
    ]
  },
  {
    title: "Standalone Pins",
    pins: [
      { id: "s1", name: "Stitch 626 Day", size: "large", status: "owned", gradient: "radial-gradient(circle at top left, #4facfe, #00f2fe)" },
      { id: "s2", name: "Mary Poppins", size: "normal", status: "trade", gradient: "radial-gradient(circle at top left, #ff9a9e, #fecfef)" },
      { id: "s3", name: "Mickey Waffle", size: "normal", status: "owned", gradient: "radial-gradient(circle at top left, #f9d423, #ff4e50)" },
      { id: "s4", name: "Figment", size: "normal", status: "wanted", gradient: "radial-gradient(circle at top left, #f2709c, #ff9472)" },
      { id: "s5", name: "Oswald", size: "large", status: "owned", gradient: "radial-gradient(circle at top left, #434343, #000000)" },
      { id: "s6", name: "Goofy", size: "normal", status: "owned", gradient: "radial-gradient(circle at top left, #11998e, #38ef7d)" },
    ]
  }
];

const getStatusColor = (status: PinStatus) => {
  switch (status) {
    case 'owned': return '#2D9E6B';
    case 'trade': return '#5B6EE8';
    case 'wanted': return '#D97832';
    default: return '#2D1800';
  }
};

export function Gallery() {
  return (
    <div 
      className="relative mx-auto min-h-screen w-full max-w-[390px] overflow-hidden antialiased"
      style={{
        backgroundColor: '#FFF8EE',
        color: '#2D1800',
        fontFamily: '"Inter", sans-serif'
      }}
    >
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-[#FFF8EE]/85 backdrop-blur-xl border-b border-[#F0E0C0]/60 pt-12 pb-3 px-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-[#2D1800] leading-tight">My Collection</h1>
            <p className="text-[13px] font-medium text-[#2D1800]/60 mt-0.5">128 pins · £342</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-[#2D1800] hover:bg-[#F0E0C0]/40 rounded-full transition-colors">
              <Search size={20} strokeWidth={2} />
            </button>
            <button className="p-2 -mr-1 text-[#2D1800] hover:bg-[#F0E0C0]/40 rounded-full transition-colors">
              <Filter size={20} strokeWidth={2} />
            </button>
          </div>
        </div>
        
        {/* Filter Chips */}
        <div className="flex overflow-x-auto gap-2 no-scrollbar -mx-4 px-4 pb-1">
          {filters.map((f, i) => (
            <button 
              key={f} 
              className={\`whitespace-nowrap px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-all \${
                i === 0 
                  ? 'bg-[#2D1800] text-[#FFF8EE] shadow-md shadow-[#2D1800]/10' 
                  : 'bg-[#FFF8EE] border border-[#F0E0C0] text-[#2D1800]/70 hover:bg-[#F0E0C0]/40'
              }\`}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="px-4 py-8 space-y-12 pb-28">
        {mockData.map((section) => (
          <section key={section.title}>
            <h2 className="text-[11px] uppercase tracking-[0.15em] font-bold text-[#2D1800]/40 mb-4 ml-1">
              {section.title}
            </h2>
            
            <div className="grid grid-cols-3 grid-flow-row-dense gap-2.5">
              {section.pins.map((pin) => {
                const isLarge = pin.size === "large";
                return (
                  <div 
                    key={pin.id}
                    className={\`
                      group relative rounded-[1.25rem] overflow-hidden aspect-square cursor-pointer
                      shadow-[0_4px_12px_rgba(45,24,0,0.06)] hover:shadow-[0_8px_24px_rgba(45,24,0,0.12)]
                      transition-all duration-300 transform hover:-translate-y-0.5
                      \${isLarge ? 'col-span-2 row-span-2 rounded-[1.75rem]' : 'col-span-1 row-span-1'}
                    \`}
                    style={{ background: pin.gradient }}
                  >
                    {/* Gloss / Specular Highlight */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.4)_0%,transparent_50%)] mix-blend-overlay pointer-events-none"></div>
                    
                    {/* Inner Bevels */}
                    <div className={\`absolute inset-0 ring-1 ring-inset ring-white/30 pointer-events-none \${isLarge ? 'rounded-[1.75rem]' : 'rounded-[1.25rem]'}\`}></div>
                    <div className={\`absolute inset-0 shadow-[inset_0_-4px_8px_rgba(0,0,0,0.15)] pointer-events-none \${isLarge ? 'rounded-[1.75rem]' : 'rounded-[1.25rem]'}\`}></div>
                    
                    {/* Status Dot */}
                    <div 
                      className={\`absolute \${isLarge ? 'top-3.5 right-3.5 w-3 h-3 ring-[2.5px]' : 'top-2.5 right-2.5 w-2.5 h-2.5 ring-2'} rounded-full ring-white/80 shadow-sm z-10\`}
                      style={{ backgroundColor: getStatusColor(pin.status) }}
                    />

                    {/* Pin Name Overlay */}
                    <div className="absolute inset-x-0 bottom-0 p-3 pt-12 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-end">
                      <p className={\`text-white font-medium drop-shadow-md truncate w-full \${isLarge ? 'text-[15px] pb-1 pl-1' : 'text-[11px] leading-tight'}\`}>
                        {pin.name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {/* Add Pin FAB */}
      <button className="fixed bottom-8 right-6 w-14 h-14 bg-gradient-to-br from-[#FFC84A] to-[#E07800] rounded-full shadow-[0_8px_20px_rgba(224,120,0,0.4)] flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-all z-50">
        <Plus size={28} strokeWidth={2.5} />
      </button>
    </div>
  );
}
