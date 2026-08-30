import { useState } from "react";
import {
  Bell,
  Camera,
  ChevronRight,
  HeartHandshake,
  Home,
  MapPin,
  MessageCircle,
  Search,
  Sparkles,
  UserRound,
  UsersRound,
  Vault,
} from "lucide-react";

const noop = () => {};

function CountBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-[#fff3df] bg-[#e64b20] px-1 text-[9px] font-extrabold text-white">
      {children}
    </span>
  );
}

function PinArtwork() {
  return (
    <div aria-hidden="true" className="relative h-[104px] w-[104px] shrink-0">
      <div className="absolute inset-0 rotate-6 rounded-[29px] bg-[#ffc63d] shadow-[0_12px_24px_rgba(123,48,10,.18)]" />
      <div className="absolute inset-[7px] -rotate-3 rounded-[24px] border-[3px] border-[#72341f] bg-[#f66d2f]">
        <div className="absolute left-[16px] top-[17px] h-[44px] w-[64px] rounded-[50%_50%_45%_45%] bg-[#fff0c7]" />
        <div className="absolute left-[25px] top-[36px] h-[34px] w-[50px] rounded-[42%] bg-[#ffcb45]" />
        <div className="absolute left-[33px] top-[45px] h-[7px] w-[7px] rounded-full bg-[#72341f]" />
        <div className="absolute left-[58px] top-[45px] h-[7px] w-[7px] rounded-full bg-[#72341f]" />
        <div className="absolute left-[40px] top-[58px] h-[5px] w-[20px] rounded-full bg-[#72341f]" />
        <span className="absolute bottom-[7px] left-0 right-0 text-center text-[8px] font-black tracking-[.16em] text-[#72341f]">HUNNY</span>
      </div>
    </div>
  );
}

function NavItem({
  label,
  icon,
  active,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button type="button" onClick={noop} className={`flex min-h-[62px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold ${active ? "text-[#d8491f]" : "text-[#79513c]"}`}>
      <span className={active ? "rounded-xl bg-[#ffe0a6] p-1.5" : "p-1.5"}>{icon}</span>
      {label}
    </button>
  );
}

export function VibrantUtility() {
  const [findPulse, setFindPulse] = useState(false);
  const [saved, setSaved] = useState(false);
  const findPin = () => {
    setFindPulse(true);
    window.setTimeout(() => setFindPulse(false), 450);
  };

  return (
    <main className="relative mx-auto min-h-[844px] w-full max-w-[390px] overflow-hidden bg-[#fff3df] text-[#40251d] [font-family:'Bricolage_Grotesque',sans-serif]">
      <style>{`
        @keyframes pinhunt-pop { 50% { transform: scale(.97) translateY(2px) } }
        @keyframes pinhunt-shine { 0%, 100% { opacity:.38; transform:translateX(0) } 50% { opacity:1; transform:translateX(4px) } }
        .pinhunt-find:active { transform: scale(.98) }
        .pinhunt-find.pulse { animation:pinhunt-pop .45s ease-out }
        .pinhunt-shine { animation:pinhunt-shine 3.4s ease-in-out infinite }
      `}</style>

      <div className="h-[760px] overflow-y-auto px-4 pb-7 pt-5 [scrollbar-width:none]">
        <header className="flex items-center justify-between">
          <button type="button" onClick={noop} aria-label="Open Emma's profile" className="flex min-h-[48px] items-center gap-3 text-left">
            <span className="flex h-11 w-11 items-center justify-center rounded-[17px] border-2 border-[#ffc541] bg-[#de5726] text-sm font-black text-[#fff3df] shadow-[0_5px_0_#9f321c]">EM</span>
            <span>
              <span className="block text-[12px] font-bold tracking-wide text-[#9b6548]">GOOD AFTERNOON</span>
              <span className="block text-[21px] font-black leading-5 tracking-[-.7px]">Emma</span>
            </span>
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={noop} aria-label="3 unread messages" className="relative flex h-11 w-11 items-center justify-center rounded-[15px] border border-[#f0c77c] bg-[#fff9ef] text-[#613527]">
              <MessageCircle size={20} />
              <CountBadge>3</CountBadge>
            </button>
            <button type="button" onClick={noop} aria-label="1 notification" className="relative flex h-11 w-11 items-center justify-center rounded-[15px] border border-[#f0c77c] bg-[#fff9ef] text-[#613527]">
              <Bell size={20} />
              <CountBadge>1</CountBadge>
            </button>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-3 overflow-hidden rounded-[19px] border border-[#f3c36f] bg-[#ffdf9e] shadow-[0_5px_0_#eab75a]">
          {[["248", "PINS"], ["19", "TRADERS"], ["34", "ISO"]].map(([number, label], index) => (
            <button key={label} type="button" onClick={noop} className={`min-h-[57px] text-center ${index ? "border-l border-[#edbd6b]" : ""}`}>
              <span className="block text-[18px] font-black leading-5">{number}</span>
              <span className="text-[9px] font-extrabold tracking-[.12em] text-[#80513b]">{label}</span>
            </button>
          ))}
        </section>

        <section className="relative mt-5 overflow-hidden rounded-[28px] bg-[#e65727] px-5 py-5 text-[#fff7e8] shadow-[0_8px_0_#ac371f,0_16px_30px_rgba(172,55,31,.18)]">
          <span className="pinhunt-shine absolute right-3 top-3 text-[#ffdb5c]"><Sparkles size={21} fill="currentColor" /></span>
          <span className="absolute -right-9 bottom-[-47px] h-32 w-32 rounded-full border-[18px] border-[#f87835]" />
          <p className="relative text-[10px] font-black tracking-[.16em] text-[#ffd56a]">YOUR COLLECTOR TOOL</p>
          <h1 className="relative mt-1 text-[30px] font-black leading-8 tracking-[-1.25px]">Find a Pin</h1>
          <p className="relative mt-1 text-[13px] font-semibold text-[#fff0d3]">Scan or search the catalogue</p>
          <button type="button" onClick={findPin} className={`pinhunt-find relative mt-4 flex min-h-[52px] w-full items-center justify-between rounded-[17px] bg-[#ffcf45] px-4 text-[#4b291b] shadow-[0_4px_0_#d58a22] ${findPulse ? "pulse" : ""}`}>
            <span className="flex items-center gap-2.5 text-[15px] font-black"><Camera size={20} strokeWidth={2.8} /> Start finding</span>
            <Search size={19} strokeWidth={2.8} />
          </button>
        </section>

        <section className="mt-6">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[14px] font-black tracking-[-.2px]">Shortcuts</h2>
            <span className="text-[10px] font-extrabold tracking-[.12em] text-[#a86d4c]">AT A GLANCE</span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              ["My Collection", Vault, "#f7c946", "#64351f"],
              ["Find Trades", HeartHandshake, "#f17744", "#fff5e8"],
              ["Community", UsersRound, "#f6a347", "#64351f"],
            ].map(([label, Icon, colour, ink]) => (
              <button key={label as string} type="button" onClick={noop} className="flex min-h-[92px] flex-col items-start rounded-[19px] border border-[#f1c980] bg-[#fffaf0] p-3 text-left shadow-[0_3px_0_#f0d18f] transition-transform active:translate-y-0.5">
                <span style={{ background: colour as string, color: ink as string }} className="flex h-8 w-8 items-center justify-center rounded-[11px]"><Icon size={17} strokeWidth={2.7} /></span>
                <span className="mt-2 text-[11px] font-extrabold leading-3 tracking-[-.2px]">{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[14px] font-black">For You</h2>
            <button type="button" onClick={noop} className="text-[11px] font-extrabold text-[#cf4c27]">View all</button>
          </div>
          <button type="button" onClick={noop} className="flex min-h-[69px] w-full items-center gap-3 rounded-[20px] border border-[#f0c980] bg-[#fffaf0] p-3 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#ffe0a3] text-[#d94c22]"><Sparkles size={19} fill="currentColor" /></span>
            <span className="min-w-0 flex-1"><span className="block text-[13px] font-black">Submission update</span><span className="block text-[11px] font-semibold text-[#99664c]">Your pin is now in the catalogue</span></span>
            <ChevronRight size={18} className="text-[#b1704e]" />
          </button>
        </section>

        <section className="mt-5 grid grid-cols-[1fr_104px] gap-3">
          <button type="button" onClick={noop} className="min-h-[98px] rounded-[21px] border border-[#f0c980] bg-[#fffaf0] p-3 text-left">
            <span className="flex items-center gap-1.5 text-[10px] font-black tracking-[.1em] text-[#d75028]"><MapPin size={13} fill="currentColor" /> WHAT'S HAPPENING</span>
            <p className="mt-2 text-[12px] font-bold leading-[15px]">Sophie Williams added the Stitch 626 Day pin.</p>
            <span className="mt-1 block text-[10px] font-semibold text-[#9e684d]">2h ago</span>
          </button>
          <button type="button" onClick={() => setSaved(!saved)} aria-pressed={saved} className="relative overflow-hidden rounded-[21px] bg-[#643a73] p-3 text-left text-[#fff6df] shadow-[0_4px_0_#45274f]">
            <span className="text-[9px] font-black tracking-[.1em] text-[#ffcf63]">CONTINUE</span>
            <span className="mt-1 block text-[21px] font-black leading-5">7<span className="text-[12px] text-[#ddc1c7]">/12</span></span>
            <span className="mt-1 block text-[10px] font-bold leading-3">Hunny Pot<br />Series</span>
            <span className={`absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded-full ${saved ? "bg-[#ffcf45] text-[#5d356b]" : "bg-[#81538c] text-[#fff6df]"}`}><HeartHandshake size={12} /></span>
          </button>
        </section>
      </div>

      <nav aria-label="Primary navigation" className="absolute inset-x-0 bottom-0 flex h-[84px] border-t border-[#efc777] bg-[#fff9ed] px-1 pb-2 shadow-[0_-8px_24px_rgba(116,63,25,.06)]">
        <NavItem active label="Home" icon={<Home size={19} fill="currentColor" />} />
        <NavItem label="Community" icon={<UsersRound size={19} />} />
        <NavItem label="Find" icon={<Search size={20} strokeWidth={2.7} />} />
        <NavItem label="Collection" icon={<Vault size={19} />} />
        <NavItem label="Profile" icon={<UserRound size={19} />} />
      </nav>
    </main>
  );
}