import {
  BadgeCheck,
  Bell,
  CalendarDays,
  Camera,
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
  return <span className="phc-notice">{children}</span>;
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
    <button type="button" onClick={noop} className={`phc-navitem ${active ? "is-active" : ""}`}>
      <span className="phc-navicon">{icon}{badge && <NoticeBadge>{badge}</NoticeBadge>}</span>
      <span>{label}</span>
    </button>
  );
}

export function CitrusInk() {
  const [found, setFound] = useState(false);

  return (
    <main className="phc-shell">
      <style>{`
        .phc-shell{--ink:#11253c;--muted:#52677a;--cream:#fffbe9;--paper:#fffef5;--lemon:#f5e85d;--tangerine:#ed682b;--lime:#a8cf3d;--line:#e8e3b8;min-height:100dvh;max-width:390px;margin:auto;overflow:hidden;position:relative;background:var(--cream);color:var(--ink);font-family:Outfit,ui-sans-serif,sans-serif;letter-spacing:-.015em}
        .phc-shell *{box-sizing:border-box}.phc-shell button{font:inherit;color:inherit;border:0;cursor:pointer}.phc-scroll{height:100dvh;overflow-y:auto;padding:54px 16px 112px;scrollbar-width:none;background:radial-gradient(circle at 105% 3%,#f5e85d 0,transparent 26%),radial-gradient(circle at -20% 52%,#d9eb91 0,transparent 27%),var(--cream)}.phc-scroll::-webkit-scrollbar{display:none}
        .phc-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:17px}.phc-profile{display:flex;align-items:center;gap:10px;min-width:0;background:none;padding:0;text-align:left}.phc-avatar{width:42px;height:42px;border-radius:15px;display:grid;place-items:center;background:var(--ink);color:var(--lemon);font-weight:800;font-size:14px;box-shadow:0 7px 14px #11253c20}.phc-welcome small{display:block;font-size:11px;letter-spacing:.03em;color:var(--muted);font-weight:600}.phc-welcome strong{font-size:20px;line-height:21px;font-weight:800}.phc-tools{display:flex;gap:8px}.phc-tool{position:relative;width:40px;height:40px;border-radius:14px;background:var(--paper);border:1px solid var(--line);display:grid;place-items:center;transition:transform .2s ease}.phc-tool:active,.phc-find:active,.phc-shortcut:active{transform:scale(.95)}.phc-notice{position:absolute;right:-5px;top:-5px;min-width:17px;height:17px;padding:0 4px;border:2px solid var(--cream);border-radius:99px;display:grid;place-items:center;background:var(--tangerine);color:#fff9e9;font-size:9px;font-weight:800;line-height:1}
        .phc-stats{display:flex;gap:0;margin-bottom:18px;padding:10px 6px;border-top:1px solid #d8d89d;border-bottom:1px solid #d8d89d}.phc-stat{flex:1;background:none;padding:0 7px;text-align:left;border-right:1px solid #d8d89d}.phc-stat:last-child{border:0}.phc-stat b{display:block;font-size:17px;line-height:17px;color:var(--ink)}.phc-stat span{font-size:11px;color:var(--muted);font-weight:600}
         @keyframes phc-gradient-drift{0%,100%{background-position:0% 45%}50%{background-position:100% 55%}}@keyframes phc-orbit{0%,100%{transform:translate3d(0,0,0) rotate(0deg)}50%{transform:translate3d(-10px,-7px,0) rotate(8deg)}}@keyframes phc-glint{0%,72%,100%{opacity:.26;transform:translateX(-12px) rotate(25deg)}84%{opacity:.5;transform:translateX(12px) rotate(25deg)}}.phc-find{width:100%;min-height:139px;position:relative;overflow:hidden;padding:18px;text-align:left;border-radius:25px;background:linear-gradient(115deg,#ed682b 0%,#ee7a31 48%,#f5e85d 100%);background-size:180% 180%;animation:phc-gradient-drift 9s ease-in-out infinite;color:#fffced;box-shadow:0 13px 28px #c84f2340;transition:transform .2s ease,box-shadow .2s ease}.phc-find:hover{transform:translateY(-2px);box-shadow:0 17px 30px #c84f2350}.phc-find:before{content:"";position:absolute;width:145px;height:145px;border-radius:50%;border:25px solid #f5e85d70;right:-55px;bottom:-65px;animation:phc-orbit 7s ease-in-out infinite}.phc-find:after{content:"";position:absolute;width:80px;height:80px;border:1px solid #fff8d877;transform:rotate(25deg);right:31px;top:-46px;animation:phc-glint 8s ease-in-out infinite}.phc-findcopy{position:relative;z-index:1;width:190px}.phc-findlabel{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff1b4}.phc-find h1{font-size:27px;line-height:28px;margin:8px 0 5px;font-weight:850;letter-spacing:-.05em}.phc-find p{font-size:13px;margin:0;color:#fff8dc;line-height:17px;font-weight:500}.phc-findicon{position:absolute;right:22px;bottom:20px;z-index:1;width:48px;height:48px;border-radius:17px;background:var(--lemon);display:grid;place-items:center;color:var(--ink);box-shadow:0 7px 13px #9d3d2740}
        .phc-shortcuts{display:flex;gap:8px;margin:14px 0 22px}.phc-shortcut{flex:1;min-height:78px;text-align:left;padding:10px 9px;border:1px solid var(--line);border-radius:18px;background:var(--paper);box-shadow:0 4px 11px #53632914;transition:transform .2s ease}.phc-shortcut svg{display:block;color:var(--tangerine);margin-bottom:7px}.phc-shortcut:nth-child(2) svg{color:#7eaa22}.phc-shortcut:nth-child(3) svg{color:var(--ink)}.phc-shortcut span{display:block;font-size:11px;line-height:12px;font-weight:750}
        .phc-section{margin-top:20px}.phc-sectionhead{display:flex;justify-content:space-between;align-items:baseline;margin:0 2px 9px}.phc-sectionhead h2{font-size:14px;margin:0;font-weight:850;letter-spacing:-.025em}.phc-sectionhead button{background:none;padding:0;font-size:11px;font-weight:750;color:#c75326}.phc-update{display:flex;width:100%;align-items:center;gap:12px;border:1px solid var(--line);border-radius:21px;padding:11px;background:var(--paper);text-align:left;box-shadow:0 5px 14px #53632912}.phc-update-icon{width:40px;height:40px;border-radius:14px;background:#edf3b9;display:grid;place-items:center;color:#6d9020;flex-shrink:0}.phc-update-text{min-width:0;flex:1}.phc-update-text b{display:block;font-size:13px;line-height:15px}.phc-update-text span{display:block;margin-top:2px;font-size:11px;color:var(--muted);font-weight:550}.phc-update>svg{color:#77933f;flex-shrink:0}
         .phc-event{display:block;width:100%;padding:13px 13px 12px;border:1px solid #d7d98c;border-radius:21px;background:linear-gradient(135deg,#fffde9 0%,#f3efad 100%);text-align:left;box-shadow:0 6px 16px #6d902018;transition:transform .2s ease,box-shadow .2s ease}.phc-event:hover{transform:translateY(-2px);box-shadow:0 9px 18px #6d902026}.phc-eventtop{display:flex;align-items:center;gap:9px}.phc-eventicon{width:37px;height:37px;display:grid;place-items:center;border-radius:13px;background:var(--ink);color:var(--lemon);flex-shrink:0}.phc-eventmeta{min-width:0;flex:1}.phc-official{display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border-radius:99px;background:var(--lime);color:var(--ink);font-size:9px;line-height:1;font-weight:850;letter-spacing:.04em;text-transform:uppercase}.phc-eventmeta b{display:block;margin-top:6px;font-size:13px;line-height:15px}.phc-event>span:last-child{display:block;padding-left:46px;margin-top:6px;font-size:11px;line-height:14px;color:#52677a;font-weight:650}.phc-event>svg{float:right;margin-top:-18px;color:#77933f}
        .phc-happening{display:flex;gap:11px;align-items:center;border-radius:20px;padding:11px 12px 11px 11px;background:#eef3c5;border:1px solid #dce4a2}.phc-bubble{width:34px;height:34px;border-radius:13px;display:grid;place-items:center;background:var(--ink);color:var(--lemon);flex-shrink:0}.phc-happening b{display:block;font-size:12px;line-height:15px}.phc-happening span{font-size:10.5px;color:#52677a;font-weight:600}.phc-collect{position:relative;overflow:hidden;display:flex;align-items:center;min-height:88px;border-radius:22px;background:var(--ink);padding:14px;color:#fffbe9;text-align:left;box-shadow:0 8px 18px #11253c2d}.phc-setshot{position:absolute;right:0;top:0;width:116px;height:100%;object-fit:cover;opacity:.36;mix-blend-mode:screen}.phc-collect:after{content:"";position:absolute;width:100px;height:100px;border:18px solid #a8cf3d90;border-radius:50%;right:-40px;top:-48px}.phc-collect strong{font-size:14px;display:block;line-height:17px;position:relative;z-index:1}.phc-collect small{display:block;color:#d8ed83;font-size:11px;margin-top:3px;font-weight:600}.phc-progress{margin-top:7px;width:177px;height:5px;border-radius:5px;background:#3f5262;overflow:hidden}.phc-progress i{display:block;width:58%;height:100%;background:var(--lemon);border-radius:inherit}.phc-count{position:relative;z-index:1;margin-left:auto;width:47px;height:47px;border-radius:50%;border:4px solid var(--lime);display:grid;place-items:center;color:var(--lemon);font-size:12px;font-weight:800;background:#1c3348}
        .phc-nav{position:absolute;bottom:0;left:0;right:0;height:88px;padding:8px 9px 18px;display:flex;align-items:stretch;background:#fffceded;border-top:1px solid var(--line);backdrop-filter:blur(15px)}.phc-navitem{position:relative;flex:1;display:flex;align-items:center;flex-direction:column;gap:4px;padding:5px 0 0;background:none;color:#687b87;font-size:9px;font-weight:700}.phc-navitem.is-active{color:var(--tangerine)}.phc-navicon{position:relative;width:29px;height:29px;display:grid;place-items:center;border-radius:10px}.phc-navitem.is-active .phc-navicon{background:#f5e85d}.phc-navitem .phc-notice{right:-5px;top:-3px}
      `}</style>
      <div className="phc-scroll">
        <header className="phc-top">
          <button type="button" onClick={noop} className="phc-profile" aria-label="Open Emma's profile"><span className="phc-avatar">EM</span><span className="phc-welcome"><small>Good afternoon</small><strong>Hi, Emma</strong></span></button>
          <div className="phc-tools"><button type="button" onClick={noop} className="phc-tool" aria-label="Messages"><MessageCircle size={20}/><NoticeBadge>3</NoticeBadge></button><button type="button" onClick={noop} className="phc-tool" aria-label="Notifications"><Bell size={19}/><NoticeBadge>1</NoticeBadge></button></div>
        </header>
        <div className="phc-stats"><button type="button" onClick={noop} className="phc-stat"><b>248</b><span>pins</span></button><button type="button" onClick={noop} className="phc-stat"><b>19</b><span>traders</span></button><button type="button" onClick={noop} className="phc-stat"><b>34</b><span>ISO</span></button></div>
         <button type="button" onClick={() => setFound(!found)} className="phc-find" aria-label="Find a pin"><span className="phc-findcopy"><span className="phc-findlabel"><Sparkles size={13}/> {found ? "Ready when you are" : "Start here"}</span><h1>Find a Pin</h1><p>Scan or search the catalogue</p></span><span className="phc-findicon">{found ? <Search size={23}/> : <Camera size={23}/>}</span></button>
        <div className="phc-shortcuts"><button type="button" onClick={noop} className="phc-shortcut"><Heart size={18} fill="currentColor"/><span>My<br/>Collection</span></button><button type="button" onClick={noop} className="phc-shortcut"><Compass size={18}/><span>Find<br/>Trades</span></button><button type="button" onClick={noop} className="phc-shortcut"><UsersRound size={18}/><span>Community</span></button></div>
         <section className="phc-section"><div className="phc-sectionhead"><h2>For You</h2><button type="button" onClick={noop}>See all</button></div><button type="button" onClick={noop} className="phc-event" aria-label="Open PinHunt UK Community Swap announcement"><span className="phc-eventtop"><span className="phc-eventicon"><Megaphone size={18}/></span><span className="phc-eventmeta"><span className="phc-official"><BadgeCheck size={11}/> PinHunt UK official</span><b>PinHunt UK Community Swap</b></span></span><span><CalendarDays size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }}/>Sat 12 Sept · London · Posted by PinHunt UK</span><ChevronRight size={17}/></button><button type="button" onClick={noop} className="phc-update"><span className="phc-update-icon"><Sparkles size={18}/></span><span className="phc-update-text"><b>Your submission is live</b><span>Festival of Fantasy Mickey was approved</span></span><ChevronRight size={17}/></button></section>
        <section className="phc-section"><div className="phc-sectionhead"><h2>What’s Happening</h2></div><button type="button" onClick={noop} className="phc-happening"><span className="phc-bubble"><MessageCircle size={17}/></span><span><b>Sophie just added the Stitch 626 Day pin</b><span>Sophie Williams · 2h ago</span></span></button></section>
        <section className="phc-section"><div className="phc-sectionhead"><h2>Continue Collecting</h2><button type="button" onClick={noop}>View set</button></div><button type="button" onClick={noop} className="phc-collect"><img className="phc-setshot" src="/__mockup/images/pinhunt-golden-pin-case.png" alt="A golden pin case"/><span><strong>Winnie the Pooh<br/>Hunny Pot Series</strong><small>7 of 12 collected</small><span className="phc-progress"><i/></span></span><span className="phc-count">7/12</span></button></section>
       </div>
       <style>{`
         @media (prefers-reduced-motion: reduce){.phc-find{animation:none;background-position:50% 50%}.phc-find:before,.phc-find:after{animation:none}.phc-find:hover,.phc-event:hover{transform:none}}
       `}</style>
      <nav className="phc-nav" aria-label="Primary navigation"><NavItem active icon={<Home size={20}/>} label="Home"/><NavItem icon={<MessageCircle size={20}/>} label="Community" badge="3"/><NavItem icon={<Search size={20}/>} label="Find"/><NavItem icon={<Heart size={20}/>} label="Collection"/><NavItem icon={<UserRound size={20}/>} label="Profile"/></nav>
    </main>
  );
}