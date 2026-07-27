import React from 'react';
import { Search, Plus, ChevronRight, CheckCircle2, MoreHorizontal, Bookmark, ArrowRightLeft, Target } from 'lucide-react';

export default function SetShelves() {
  return (
    <div className="mx-auto max-w-[390px] h-[844px] bg-slate-50 relative overflow-hidden flex flex-col font-sans border-x border-slate-200 shadow-2xl">
      {/* Header */}
      <header className="px-5 pt-12 pb-4 bg-white sticky top-0 z-20 shadow-sm border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">My Collection</h1>
            <p className="text-sm text-slate-500 font-medium mt-0.5">23 owned • 4 ISO • 3 trade</p>
          </div>
          <button className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 hover:bg-slate-200 transition-colors">
            <Search className="w-5 h-5" />
          </button>
        </div>
        
        {/* Filter Chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
          {['All', 'Official Sets', 'My Boards', 'Duplicates', 'For Trade', 'ISO'].map((filter, i) => (
            <button
              key={filter}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                i === 1
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-32">
        
        {/* Hero: Nearly Complete */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-bold text-amber-600 uppercase tracking-wider">Nearly Complete</h2>
          </div>
          
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-5 text-white shadow-lg shadow-indigo-200 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
            <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-purple-400/20 rounded-full blur-xl"></div>
            
            <div className="flex justify-between items-start mb-5 relative z-10">
              <div>
                <h3 className="text-xl font-bold leading-tight mb-1">Lilo & Stitch<br/>25th Anniversary</h3>
                <p className="text-indigo-100 text-sm font-medium">5 of 6 pins collected</p>
              </div>
              
              {/* Circular Progress */}
              <div className="relative w-12 h-12 shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-white/20"
                    strokeWidth="4"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-white drop-shadow-md"
                    strokeWidth="4"
                    strokeDasharray="83, 100"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                  83%
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5 relative z-10">
              {[1, 2, 3, 4, 5].map((num) => (
                <div key={num} className="w-[72px] h-[72px] shrink-0 rounded-2xl bg-white/10 p-1 backdrop-blur-sm border border-white/20">
                  <img
                    src={`/__mockup/images/pins/pin${num}.png`}
                    className="w-full h-full object-cover rounded-xl"
                    alt={`Lilo & Stitch Pin ${num}`}
                  />
                </div>
              ))}
              {/* Missing Ghost Pin */}
              <div className="w-[72px] h-[72px] shrink-0 rounded-2xl border-2 border-dashed border-white/40 flex flex-col items-center justify-center bg-white/5 backdrop-blur-sm relative">
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center shadow-md">
                  <Bookmark className="w-3.5 h-3.5 text-amber-900 fill-amber-900" />
                </div>
                <div className="text-white/60 text-xl font-bold mb-0.5">?</div>
                <div className="text-[9px] font-bold text-white/60 uppercase tracking-widest">ISO</div>
              </div>
            </div>
          </div>
        </div>

        {/* Shelf: Mickey & Friends */}
        <section className="mb-8 pl-5">
          <div className="pr-5 mb-3 flex items-end justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Mickey & Friends Classics</h3>
              <p className="text-xs text-slate-500 font-medium">7 of 12 • 58%</p>
            </div>
            <button className="text-slate-400 p-1 hover:text-slate-600 transition-colors bg-white rounded-full shadow-sm border border-slate-100">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="pr-5 mb-4">
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: '58%' }}></div>
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto no-scrollbar pr-5 pb-2">
            {[6, 7, 8, 1, 2, 3, 4].map((num, i) => (
              <div key={i} className="w-[88px] h-[88px] shrink-0 rounded-2xl bg-white p-1 shadow-sm border border-slate-200 relative group">
                <img
                  src={`/__mockup/images/pins/pin${num}.png`}
                  className="w-full h-full object-cover rounded-xl bg-slate-50"
                  alt={`Mickey Pin ${num}`}
                />
                {/* Status Badges */}
                {i === 2 && (
                  <div className="absolute -top-2 -right-2 w-7 h-7 bg-purple-500 text-white rounded-full flex items-center justify-center shadow-sm border-2 border-slate-50">
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}
            {/* 5 missing pins */}
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={`miss-${i}`} className="w-[88px] h-[88px] shrink-0 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center relative">
                {i === 1 && (
                  <div className="absolute -top-2 -right-2 w-7 h-7 bg-amber-400 text-amber-950 rounded-full flex items-center justify-center shadow-sm border-2 border-slate-50">
                    <Bookmark className="w-3.5 h-3.5 fill-amber-950" />
                  </div>
                )}
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 mb-1">
                  <Search className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Shelf: Hidden Disney Wave A */}
        <section className="mb-8 pl-5">
          <div className="pr-5 mb-3 flex items-end justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Hidden Disney Wave A – Castles</h3>
              <p className="text-xs text-slate-500 font-medium">3 of 8 • 37%</p>
            </div>
            <button className="text-slate-400 p-1 hover:text-slate-600 transition-colors bg-white rounded-full shadow-sm border border-slate-100">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="pr-5 mb-4">
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: '37%' }}></div>
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto no-scrollbar pr-5 pb-2">
            {[5, 6, 7].map((num, i) => (
              <div key={i} className="w-[88px] h-[88px] shrink-0 rounded-2xl bg-white p-1 shadow-sm border border-slate-200 relative">
                <img
                  src={`/__mockup/images/pins/pin${num}.png`}
                  className="w-full h-full object-cover rounded-xl bg-slate-50"
                  alt={`Castle Pin ${num}`}
                />
              </div>
            ))}
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={`miss-${i}`} className="w-[88px] h-[88px] shrink-0 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                  <Search className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Shelf: Tinker Bell Starter */}
        <section className="mb-8 pl-5">
          <div className="pr-5 mb-3 flex items-end justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-slate-900 text-lg">Tinker Bell Starter</h3>
                <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-100" />
              </div>
              <p className="text-xs text-emerald-600 font-bold mt-0.5 uppercase tracking-wide">Complete Set</p>
            </div>
            <button className="text-slate-400 p-1 hover:text-slate-600 transition-colors bg-white rounded-full shadow-sm border border-slate-100">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto no-scrollbar pr-5 pb-2">
            {[8, 1, 2, 3].map((num, i) => (
              <div key={i} className="w-[88px] h-[88px] shrink-0 rounded-2xl bg-white p-1 shadow-sm border-2 border-emerald-400 relative">
                <img
                  src={`/__mockup/images/pins/pin${num}.png`}
                  className="w-full h-full object-cover rounded-xl bg-slate-50"
                  alt={`Tinker Pin ${num}`}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Shelf: Singles */}
        <section className="mb-12 pl-5">
          <div className="pr-5 mb-3 flex items-end justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Singles</h3>
              <p className="text-xs text-slate-500 font-medium">4 loose pins</p>
            </div>
            <button className="text-slate-400 p-1 hover:text-slate-600 transition-colors bg-white rounded-full shadow-sm border border-slate-100">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto no-scrollbar pr-5 pb-2">
            {[4, 5, 6, 7].map((num, i) => (
              <div key={i} className="w-[88px] h-[88px] shrink-0 rounded-2xl bg-white p-1 shadow-sm border border-slate-200">
                <img
                  src={`/__mockup/images/pins/pin${num}.png`}
                  className="w-full h-full object-cover rounded-xl bg-slate-50"
                  alt={`Single Pin ${num}`}
                />
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* Floating Action Button */}
      <button className="absolute bottom-8 right-6 w-14 h-14 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-lg shadow-slate-900/30 hover:scale-105 active:scale-95 transition-all z-30">
        <Plus className="w-7 h-7" />
      </button>

      {/* Global styles for hiding scrollbar */}
      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}
