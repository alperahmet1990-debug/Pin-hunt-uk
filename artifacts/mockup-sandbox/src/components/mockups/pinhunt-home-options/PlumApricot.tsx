import {
  Bell,
  BadgeCheck,
  Camera,
  CalendarDays,
  ChevronRight,
  Compass,
  Heart,
  Home,
  Megaphone,
  MessageCircle,
  Search,
  Sparkles,
  UsersRound,
  UserRound,
} from "lucide-react";
import { useState, type ReactNode } from "react";

const noop = () => {};

function NoticeBadge({ children }: { children: ReactNode }) {
  return <span className="pha-notice">{children}</span>;
}

function NavItem({
  icon,
  label,
  active,
  badge,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  badge?: string;
}) {
  return (
    <button type="button" onClick={noop} className={`pha-navitem ${active ? "is-active" : ""}`}>
      <span className="pha-navicon">
        {icon}
        {badge && <NoticeBadge>{badge}</NoticeBadge>}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function PlumApricot() {
  const [found, setFound] = useState(false);

  return (
    <main className="pha-shell">
      <style>{`
        .pha-shell{--ink:#382037;--muted:#806477;--apricot:#fce6d0;--paper:#fff8ef;--plum:#4b2146;--plum-deep:#35172f;--terracotta:#c95743;--peach:#ef9470;--butter:#f4ca69;--line:#edcdbd;min-height:100dvh;max-width:390px;margin:auto;overflow:hidden;position:relative;background:var(--apricot);color:var(--ink);font-family:Outfit,ui-sans-serif,sans-serif;letter-spacing:-.015em}
        .pha-shell *{box-sizing:border-box}.pha-shell button{font:inherit;color:inherit;border:0;cursor:pointer}.pha-scroll{height:100dvh;overflow-y:auto;padding:54px 16px 112px;scrollbar-width:none;background:radial-gradient(circle at 104% 8%,#f7bf98 0,transparent 27%),radial-gradient(circle at -18% 48%,#f9d3b3 0,transparent 31%),var(--apricot)}.pha-scroll::-webkit-scrollbar{display:none}
        .pha-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:17px}.pha-profile{display:flex;align-items:center;gap:10px;min-width:0;background:none;padding:0;text-align:left}.pha-avatar{width:42px;height:42px;border-radius:15px;display:grid;place-items:center;background:var(--plum);color:#ffe9c9;font-weight:800;font-size:14px;box-shadow:0 7px 15px #4b21463a}.pha-welcome small{display:block;font-size:11px;letter-spacing:.03em;color:var(--muted);font-weight:600}.pha-welcome strong{font-size:20px;line-height:21px;font-weight:800}.pha-tools{display:flex;gap:8px}.pha-tool{position:relative;width:40px;height:40px;border-radius:14px;background:#fff8ef;border:1px solid #edcec0;display:grid;place-items:center;color:var(--plum);transition:transform .2s ease}.pha-tool:active,.pha-find:active,.pha-shortcut:active{transform:scale(.95)}.pha-notice{position:absolute;right:-5px;top:-5px;min-width:17px;height:17px;padding:0 4px;border:2px solid var(--apricot);border-radius:99px;display:grid;place-items:center;background:var(--terracotta);color:#fff7ec;font-size:9px;font-weight:800;line-height:1}
        .pha-stats{display:flex;gap:0;margin-bottom:18px;padding:10px 6px;border-top:1px solid #dcae9e;border-bottom:1px solid #dcae9e}.pha-stat{flex:1;background:none;padding:0 7px;text-align:left;border-right:1px solid #dcae9e}.pha-stat:last-child{border:0}.pha-stat b{display:block;font-size:17px;line-height:17px;color:var(--terracotta)}.pha-stat span{font-size:11px;color:var(--muted);font-weight:600}
         @keyframes pha-gradient-drift{0%,100%{background-position:0% 45%}50%{background-position:100% 55%}}@keyframes pha-orbit{0%,100%{transform:translate3d(0,0,0) rotate(0deg)}50%{transform:translate3d(-10px,-7px,0) rotate(8deg)}}@keyframes pha-glint{0%,72%,100%{opacity:.26;transform:translateX(-12px) rotate(25deg)}84%{opacity:.5;transform:translateX(12px) rotate(25deg)}}.pha-find{width:100%;min-height:139px;position:relative;overflow:hidden;padding:18px;text-align:left;border-radius:25px;background:linear-gradient(115deg,var(--plum-deep) 0%,var(--plum) 48%,#6b3452 100%);background-size:180% 180%;animation:pha-gradient-drift 9s ease-in-out infinite;color:#fff5e8;box-shadow:0 13px 28px #4b214648;transition:transform .2s ease,box-shadow .2s ease}.pha-find:hover{transform:translateY(-2px);box-shadow:0 17px 30px #4b214658}.pha-find:before{content:"";position:absolute;width:170px;height:170px;border-radius:50%;border:25px solid #f4ca6940;right:-61px;bottom:-78px;animation:pha-orbit 7s ease-in-out infinite}.pha-find:after{content:"";position:absolute;width:82px;height:82px;border-radius:22px;border:1px solid #f9dca477;transform:rotate(25deg);right:29px;top:-47px;animation:pha-glint 8s ease-in-out infinite}.pha-findcopy{position:relative;z-index:1;width:190px}.pha-findlabel{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#f7cfa2}.pha-find h1{font-size:27px;line-height:28px;margin:8px 0 5px;font-weight:850;letter-spacing:-.05em}.pha-find p{font-size:13px;margin:0;color:#f7dfca;line-height:17px;font-weight:500}.pha-findicon{position:absolute;right:22px;bottom:20px;z-index:1;width:48px;height:48px;border-radius:17px;background:var(--butter);display:grid;place-items:center;color:var(--plum);box-shadow:0 7px 13px #26132950}
        .pha-shortcuts{display:flex;gap:8px;margin:14px 0 22px}.pha-shortcut{flex:1;min-height:78px;text-align:left;padding:10px 9px;border:1px solid #edcfc0;border-radius:18px;background:var(--paper);box-shadow:0 4px 11px #6b304015;transition:transform .2s ease}.pha-shortcut svg{display:block;color:var(--terracotta);margin-bottom:7px}.pha-shortcut:nth-child(2) svg{color:var(--plum)}.pha-shortcut:nth-child(3) svg{color:#c57d59}.pha-shortcut span{display:block;font-size:11px;line-height:12px;font-weight:750}
         .pha-section{margin-top:20px}.pha-sectionhead{display:flex;justify-content:space-between;align-items:baseline;margin:0 2px 9px}.pha-sectionhead h2{font-size:14px;margin:0;font-weight:850;letter-spacing:-.025em}.pha-sectionhead button{background:none;padding:0;font-size:11px;font-weight:750;color:var(--terracotta)}.pha-update{display:flex;width:100%;align-items:center;gap:12px;border:1px solid #edcfc0;border-radius:21px;padding:11px;background:var(--paper);text-align:left;box-shadow:0 5px 14px #6b304012}.pha-update-icon{width:40px;height:40px;border-radius:14px;background:#f8d699;display:grid;place-items:center;color:var(--plum);flex-shrink:0}.pha-update-text{min-width:0;flex:1}.pha-update-text b{display:block;font-size:13px;line-height:15px}.pha-update-text span{display:block;margin-top:2px;font-size:11px;color:var(--muted);font-weight:550}.pha-update>svg{color:#b87870;flex-shrink:0}.pha-event{display:block;width:100%;padding:13px 13px 12px;border:1px solid #e4b7a7;border-radius:21px;background:linear-gradient(135deg,#fff8e9 0%,#f8d8be 100%);text-align:left;box-shadow:0 6px 16px #b95a4417;transition:transform .2s ease,box-shadow .2s ease}.pha-event:hover{transform:translateY(-2px);box-shadow:0 9px 18px #b95a4425}.pha-eventtop{display:flex;align-items:center;gap:9px}.pha-eventicon{width:37px;height:37px;display:grid;place-items:center;border-radius:13px;background:var(--plum);color:var(--butter);flex-shrink:0}.pha-eventmeta{min-width:0;flex:1}.pha-official{display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border-radius:99px;background:var(--butter);color:var(--plum-deep);font-size:9px;line-height:1;font-weight:850;letter-spacing:.04em;text-transform:uppercase}.pha-eventmeta b{display:block;margin-top:6px;font-size:13px;line-height:15px}.pha-event>span:last-child{display:block;padding-left:46px;margin-top:6px;font-size:11px;line-height:14px;color:#835b5e;font-weight:650}.pha-event>svg{float:right;margin-top:-18px;color:#b45d4d}
        .pha-happening{display:flex;gap:11px;align-items:center;border-radius:20px;padding:11px 12px 11px 11px;background:#f8d5c0;border:1px solid #eab6a1}.pha-bubble{width:34px;height:34px;border-radius:13px;display:grid;place-items:center;background:var(--terracotta);color:#fff5e9;flex-shrink:0}.pha-happening b{display:block;font-size:12px;line-height:15px}.pha-happening span{font-size:10.5px;color:#855b68;font-weight:600}.pha-collect{position:relative;overflow:hidden;display:flex;align-items:center;min-height:88px;border-radius:22px;background:var(--plum-deep);padding:14px;color:#fff3df;text-align:left;box-shadow:0 8px 18px #4b214632}.pha-setshot{position:absolute;right:0;top:0;width:116px;height:100%;object-fit:cover;opacity:.36;mix-blend-mode:screen}.pha-collect:after{content:"";position:absolute;width:100px;height:100px;border:18px solid #f4ca697e;border-radius:50%;right:-40px;top:-48px}.pha-collect strong{font-size:14px;display:block;line-height:17px;position:relative;z-index:1}.pha-collect small{display:block;color:#edc796;font-size:11px;margin-top:3px;font-weight:600}.pha-progress{margin-top:7px;width:177px;height:5px;border-radius:5px;background:#76526e;overflow:hidden}.pha-progress i{display:block;width:58%;height:100%;background:var(--butter);border-radius:inherit}.pha-count{position:relative;z-index:1;margin-left:auto;width:47px;height:47px;border-radius:50%;border:4px solid var(--butter);display:grid;place-items:center;color:#f7d886;font-size:12px;font-weight:800;background:#543052}
        .pha-nav{position:absolute;bottom:0;left:0;right:0;height:88px;padding:8px 9px 18px;display:flex;align-items:stretch;background:#fff8efe8;border-top:1px solid #edcfc0;backdrop-filter:blur(15px)}.pha-navitem{position:relative;flex:1;display:flex;align-items:center;flex-direction:column;gap:4px;padding:5px 0 0;background:none;color:#987080;font-size:9px;font-weight:700}.pha-navitem.is-active{color:var(--plum)}.pha-navicon{position:relative;width:29px;height:29px;display:grid;place-items:center;border-radius:10px}.pha-navitem.is-active .pha-navicon{background:#f6d19e}.pha-navitem .pha-notice{right:-5px;top:-3px}
         .pha-find h1{color:#fff5e8}.pha-collect>span:first-of-type{position:relative;z-index:2}.pha-collect strong{color:#fff3df}
         @media (prefers-reduced-motion: reduce){.pha-find{animation:none;background-position:50% 50%}.pha-find:before,.pha-find:after{animation:none}.pha-find:hover,.pha-event:hover{transform:none}}
      `}</style>
      <div className="pha-scroll">
        <header className="pha-top">
          <button type="button" onClick={noop} className="pha-profile" aria-label="Open Emma's profile"><span className="pha-avatar">EM</span><span className="pha-welcome"><small>Good afternoon</small><strong>Hi, Emma</strong></span></button>
          <div className="pha-tools"><button type="button" onClick={noop} className="pha-tool" aria-label="Messages"><MessageCircle size={20}/><NoticeBadge>3</NoticeBadge></button><button type="button" onClick={noop} className="pha-tool" aria-label="Notifications"><Bell size={19}/><NoticeBadge>1</NoticeBadge></button></div>
        </header>
        <div className="pha-stats"><button type="button" onClick={noop} className="pha-stat"><b>248</b><span>pins</span></button><button type="button" onClick={noop} className="pha-stat"><b>19</b><span>traders</span></button><button type="button" onClick={noop} className="pha-stat"><b>34</b><span>ISO</span></button></div>
         <button type="button" onClick={() => setFound(!found)} className="pha-find" aria-label="Find a pin"><span className="pha-findcopy"><span className="pha-findlabel"><Sparkles size={13}/> {found ? "Ready when you are" : "Start here"}</span><h1>Find a Pin</h1><p>Scan or search the catalogue</p></span><span className="pha-findicon">{found ? <Search size={23}/> : <Camera size={23}/>}</span></button>
        <div className="pha-shortcuts"><button type="button" onClick={noop} className="pha-shortcut"><Heart size={18} fill="currentColor"/><span>My<br/>Collection</span></button><button type="button" onClick={noop} className="pha-shortcut"><Compass size={18}/><span>Find<br/>Trades</span></button><button type="button" onClick={noop} className="pha-shortcut"><UsersRound size={18}/><span>Community</span></button></div>
         <section className="pha-section"><div className="pha-sectionhead"><h2>For You</h2><button type="button" onClick={noop}>See all</button></div><button type="button" onClick={noop} className="pha-event" aria-label="Open PinHunt UK Community Swap announcement"><span className="pha-eventtop"><span className="pha-eventicon"><Megaphone size={18}/></span><span className="pha-eventmeta"><span className="pha-official"><BadgeCheck size={11}/> PinHunt UK official</span><b>PinHunt UK Community Swap</b></span></span><span><CalendarDays size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }}/>Sat 12 Sept · London · Posted by PinHunt UK</span><ChevronRight size={17}/></button><button type="button" onClick={noop} className="pha-update"><span className="pha-update-icon"><Sparkles size={18}/></span><span className="pha-update-text"><b>Your submission is live</b><span>Festival of Fantasy Mickey was approved</span></span><ChevronRight size={17}/></button></section>
        <section className="pha-section"><div className="pha-sectionhead"><h2>What’s Happening</h2></div><button type="button" onClick={noop} className="pha-happening"><span className="pha-bubble"><MessageCircle size={17}/></span><span><b>Sophie just added the Stitch 626 Day pin</b><span>Sophie Williams · 2h ago</span></span></button></section>
        <section className="pha-section"><div className="pha-sectionhead"><h2>Continue Collecting</h2><button type="button" onClick={noop}>View set</button></div><button type="button" onClick={noop} className="pha-collect"><img className="pha-setshot" src="/__mockup/images/pinhunt-golden-pin-case.png" alt="A golden pin case"/><span><strong>Winnie the Pooh<br/>Hunny Pot Series</strong><small>7 of 12 collected</small><span className="pha-progress"><i/></span></span><span className="pha-count">7/12</span></button></section>
      </div>
      <nav className="pha-nav" aria-label="Primary navigation"><NavItem active icon={<Home size={20}/>} label="Home"/><NavItem icon={<MessageCircle size={20}/>} label="Community" badge="3"/><NavItem icon={<Search size={20}/>} label="Find"/><NavItem icon={<Heart size={20}/>} label="Collection"/><NavItem icon={<UserRound size={20}/>} label="Profile"/></nav>
    </main>
  );
}