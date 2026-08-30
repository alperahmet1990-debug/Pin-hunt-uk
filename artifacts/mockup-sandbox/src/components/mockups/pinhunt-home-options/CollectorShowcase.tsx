import { useState } from "react";
import {
  Bell,
  Camera,
  ChevronRight,
  Compass,
  Heart,
  Home,
  MessageCircle,
  MessageSquare,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import "./_group.css";

const noop = () => {};

function Pin({ color, icon }: { color: string; icon: React.ReactNode }) {
  return (
    <span
      className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#FFF3D5] text-[#FFF8E9] shadow-[0_3px_0_rgba(77,31,14,.22)]"
      style={{ background: color }}
    >
      {icon}
    </span>
  );
}

function BottomTab({
  label,
  active,
  children,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={noop}
      className={`flex min-w-0 flex-1 flex-col items-center gap-1 pt-2 text-[9px] font-bold tracking-[.02em] ${
        active ? "text-[#9A3B12]" : "text-[#9B6338]"
      }`}
    >
      <span
        className={`flex h-7 w-9 items-center justify-center rounded-full transition-transform duration-200 active:scale-90 ${
          active ? "bg-[#FBD96A]" : ""
        }`}
      >
        {children}
      </span>
      {label}
    </button>
  );
}

export function CollectorShowcase() {
  const [shimmer, setShimmer] = useState(false);
  const [liked, setLiked] = useState(false);

  return (
    <main className="pinhunt-home relative mx-auto h-[844px] w-[390px] overflow-hidden bg-[#FFF1D4] text-[#4A1E0C]">
      <style>{`
        .collector-shell { font-family: Georgia, 'Times New Roman', serif; }
        .collector-shell button { -webkit-tap-highlight-color: transparent; }
        .collector-sans { font-family: 'Trebuchet MS', sans-serif; }
        .case-bg { background: radial-gradient(circle at 83% 5%, #ffd96d 0 9%, transparent 10%), linear-gradient(145deg, #f79624, #e26713 57%, #c64915); }
        .case-texture { background-image: repeating-linear-gradient(111deg, rgba(255,255,255,.1) 0 1px, transparent 1px 7px); }
        @keyframes soft-sparkle { 50% { transform: scale(1.14) rotate(12deg); opacity: .76; } }
        .soft-sparkle { animation: soft-sparkle 2.8s ease-in-out infinite; }
        @keyframes case-shimmer { from { transform: translateX(-130%) skewX(-20deg); } to { transform: translateX(240%) skewX(-20deg); } }
        .case-shimmer { animation: case-shimmer .85s ease-out; }
      `}</style>
      <div className="collector-shell h-full overflow-y-auto pb-[85px]">
        <div className="case-bg case-texture relative min-h-[329px] overflow-hidden px-5 pb-5 pt-5 text-[#FFF8E9]">
          <span className="absolute right-[18px] top-[91px] text-[#FFECA2] opacity-80 soft-sparkle"><Sparkles size={19} /></span>
          <span className="absolute left-[33px] top-[146px] text-[#FFECA2] opacity-65"><Sparkles size={12} /></span>
          {shimmer && <span className="case-shimmer absolute inset-y-0 w-14 bg-white/30" />}
          <header className="relative flex items-center justify-between">
            <button type="button" onClick={noop} className="flex items-center gap-2.5 text-left">
              <span className="flex h-11 w-11 items-center justify-center rounded-[17px] border border-white/50 bg-[#FFDC83] text-[14px] font-bold text-[#863010] shadow-[0_4px_0_rgba(111,43,8,.21)]">EM</span>
              <span>
                <span className="collector-sans block text-[10px] font-bold uppercase tracking-[.15em] text-[#FFE9AB]">Your pin case</span>
                <span className="block text-[20px] font-bold leading-5">Hello, Emma</span>
              </span>
            </button>
            <div className="flex gap-2">
              <button aria-label="Messages, 3 unread" type="button" onClick={noop} className="relative grid h-10 w-10 place-items-center rounded-full border border-white/35 bg-[#B74413]/25">
                <MessageSquare size={19} />
                <b className="collector-sans absolute -right-1 -top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full border border-[#D95C15] bg-[#FFF3C9] px-1 text-[9px] text-[#923306]">3</b>
              </button>
              <button aria-label="Notifications, 1 unread" type="button" onClick={noop} className="relative grid h-10 w-10 place-items-center rounded-full border border-white/35 bg-[#B74413]/25">
                <Bell size={19} />
                <b className="collector-sans absolute -right-1 -top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full border border-[#D95C15] bg-[#FFF3C9] px-1 text-[9px] text-[#923306]">1</b>
              </button>
            </div>
          </header>

          <div className="relative mt-5 flex gap-2">
            {["248 pins", "19 traders", "34 ISO"].map((item) => (
              <button key={item} type="button" onClick={noop} className="collector-sans rounded-full border border-white/35 bg-[#A83D12]/25 px-3 py-1.5 text-[11px] font-bold text-[#FFF4D1] active:scale-95">{item}</button>
            ))}
          </div>

          <section className="relative mt-4 overflow-hidden rounded-[24px] border border-[#9E350D]/45 bg-[#712B12] p-3 shadow-[inset_0_2px_6px_rgba(45,12,0,.65),0_6px_0_rgba(125,43,10,.2)]">
            <div className="absolute inset-x-3 top-1/2 h-px bg-[#D78A36]/35" />
            <div className="relative grid grid-cols-6 gap-1.5">
              <Pin color="#16929A" icon={<Compass size={17} />} />
              <Pin color="#DC4B36" icon={<Heart size={16} fill="currentColor" />} />
              <Pin color="#E3AD20" icon={<Sparkles size={16} />} />
              <Pin color="#7D5AA6" icon={<span className="text-[14px] font-bold">M</span>} />
              <Pin color="#398454" icon={<span className="text-[15px] font-bold">?</span>} />
              <Pin color="#D96822" icon={<span className="text-[13px] font-bold">W</span>} />
            </div>
            <div className="relative mt-2 grid grid-cols-6 gap-1.5">
              <Pin color="#CB3C63" icon={<Heart size={15} fill="currentColor" />} />
              <Pin color="#1B6B9B" icon={<span className="text-[14px] font-bold">D</span>} />
              <Pin color="#C68B1D" icon={<Sparkles size={16} />} />
              <Pin color="#4C826B" icon={<span className="text-[14px] font-bold">P</span>} />
              <Pin color="#A84824" icon={<span className="text-[14px] font-bold">S</span>} />
              <Pin color="#B85B8B" icon={<Heart size={15} fill="currentColor" />} />
            </div>
          </section>
        </div>

        <div className="-mt-3 relative rounded-t-[27px] bg-[#FFF1D4] px-5 pt-5">
          <button
            type="button"
            onClick={() => setShimmer(true)}
            onAnimationEnd={() => setShimmer(false)}
            className="collector-sans flex w-full items-center gap-4 rounded-[22px] bg-[#572314] px-4 py-3.5 text-left text-[#FFF7DE] shadow-[0_7px_0_#E6A83C] transition-transform active:translate-y-1 active:shadow-[0_3px_0_#E6A83C]"
          >
            <span className="grid h-11 w-11 place-items-center rounded-[15px] bg-[#F7B72C] text-[#68260D]"><Camera size={23} /></span>
            <span className="flex-1"><b className="block text-[16px]">Find a Pin</b><small className="mt-0.5 block text-[11px] font-semibold text-[#F8D779]">Scan or search the catalogue</small></span>
            <ChevronRight size={20} className="text-[#F8D779]" />
          </button>

          <div className="collector-sans mt-5 grid grid-cols-3 gap-2">
            {[
              ["My Collection", <Heart size={17} />],
              ["Find Trades", <Compass size={17} />],
              ["Community", <MessageCircle size={17} />],
            ].map(([label, icon]) => (
              <button key={label as string} type="button" onClick={noop} className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-[17px] border border-[#F0CA78] bg-[#FFF9E9] text-[10px] font-bold text-[#723015] shadow-[0_2px_0_#F1D795] active:translate-y-0.5">
                <span className="text-[#C85014]">{icon}</span>{label as string}
              </button>
            ))}
          </div>

          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between"><h2 className="text-[17px] font-bold">For you</h2><button type="button" onClick={noop} className="collector-sans text-[10px] font-bold text-[#AF4A18]">SEE ALL</button></div>
            <button type="button" onClick={noop} className="collector-sans flex w-full items-center gap-3 rounded-[18px] border border-[#F2D392] bg-[#FFF9E9] p-3 text-left">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#FFE4A5] text-[#B74614]"><MessageCircle size={17} /></span>
              <span className="flex-1"><b className="block text-[12px] text-[#5E2814]">New messages</b><small className="block pt-0.5 text-[10px] text-[#9F6740]">3 collectors want to trade</small></span><ChevronRight size={17} className="text-[#C87A30]" />
            </button>
          </section>

          <section className="mt-4">
            <h2 className="mb-2 text-[17px] font-bold">What’s happening</h2>
            <button type="button" onClick={() => setLiked(!liked)} className="collector-sans flex w-full items-center gap-3 rounded-[18px] border border-[#F2D392] bg-[#FFF9E9] p-3 text-left">
              <span className="grid h-9 w-9 place-items-center rounded-[13px] bg-[#63A6A3] text-[#FFF8E9]">S</span>
              <span className="flex-1"><b className="block text-[11px] leading-[14px] text-[#5E2814]">Sophie added the Stitch 626 Day pin</b><small className="block pt-1 text-[10px] text-[#9F6740]">2h ago</small></span>
              <Heart size={17} className={liked ? "fill-[#CC4A32] text-[#CC4A32]" : "text-[#CC4A32]"} />
            </button>
          </section>

          <section className="mb-3 mt-4 rounded-[20px] bg-[#F5C24B] p-3.5 text-[#63270E]">
            <div className="flex items-center justify-between"><span className="text-[16px] font-bold">Continue collecting</span><span className="collector-sans rounded-full bg-[#FFF3C7] px-2 py-1 text-[10px] font-bold">7 / 12</span></div>
            <p className="collector-sans mt-1 text-[11px] font-bold">Winnie the Pooh Hunny Pot Series</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#C77818]/30"><div className="h-full w-[58%] rounded-full bg-[#873310]" /></div>
          </section>
        </div>
      </div>

      <nav className="collector-sans absolute inset-x-0 bottom-0 flex h-[76px] border-t border-[#EAC776] bg-[#FFF8E5] px-2 pt-1.5">
        <BottomTab active label="Home"><Home size={19} fill="currentColor" /></BottomTab>
        <BottomTab label="Community"><MessageCircle size={19} /></BottomTab>
        <BottomTab label="Find"><Search size={19} /></BottomTab>
        <BottomTab label="Collection"><Heart size={19} /></BottomTab>
        <BottomTab label="Profile"><UserRound size={19} /></BottomTab>
      </nav>
    </main>
  );
}