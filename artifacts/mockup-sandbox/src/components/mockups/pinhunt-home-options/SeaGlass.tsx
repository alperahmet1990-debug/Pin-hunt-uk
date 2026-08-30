import {
  Bell,
  Camera,
  ChevronRight,
  Compass,
  Heart,
  Home,
  MessageCircle,
  Search,
  Sparkles,
  UsersRound,
  UserRound,
} from "lucide-react";
import { useState } from "react";

const noop = () => {};

function NoticeBadge({ children }: { children: React.ReactNode }) {
  return <span className="phs-notice">{children}</span>;
}

function NavItem({
  icon,
  label,
  active,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: string;
}) {
  return (
    <button type="button" onClick={noop} className={`phs-navitem ${active ? "is-active" : ""}`}>
      <span className="phs-navicon">{icon}{badge && <NoticeBadge>{badge}</NoticeBadge>}</span>
      <span>{label}</span>
    </button>
  );
}

export function SeaGlass() {
  const [found, setFound] = useState(false);

  return (
    <main className="phs-shell">
      <style>{`
        .phs-shell{--ink:#123f47;--muted:#58777a;--mist:#e8f7f3;--paper:#f9fffc;--aqua:#c9eee8;--coral:#e86d61;--coral-deep:#c95552;--sand:#d9af66;--line:#c8e4df;min-height:100dvh;max-width:390px;margin:auto;overflow:hidden;position:relative;background:var(--mist);color:var(--ink);font-family:Outfit,ui-sans-serif,sans-serif;letter-spacing:-.015em}
        .phs-shell *{box-sizing:border-box}.phs-shell button{font:inherit;color:inherit;border:0;cursor:pointer}.phs-scroll{height:100dvh;overflow-y:auto;padding:54px 16px 112px;scrollbar-width:none;background:radial-gradient(circle at 100% 5%,#c0e9e0 0,transparent 27%),radial-gradient(circle at -18% 53%,#d7f2e9 0,transparent 32%),var(--mist)}.phs-scroll::-webkit-scrollbar{display:none}
        .phs-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:17px}.phs-profile{display:flex;align-items:center;gap:10px;min-width:0;background:none;padding:0;text-align:left}.phs-avatar{width:42px;height:42px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(135deg,#6ccbc0,#ef786d 78%);color:#f7fffc;font-weight:800;font-size:14px;box-shadow:0 6px 15px #4b9e9850}.phs-welcome small{display:block;font-size:11px;letter-spacing:.03em;color:var(--muted);font-weight:600}.phs-welcome strong{font-size:20px;line-height:21px;font-weight:800}.phs-tools{display:flex;gap:8px}.phs-tool{position:relative;width:40px;height:40px;border-radius:14px;background:#f8fffc;border:1px solid var(--line);display:grid;place-items:center;transition:transform .2s ease}.phs-tool:active,.phs-find:active,.phs-shortcut:active{transform:scale(.95)}.phs-notice{position:absolute;right:-5px;top:-5px;min-width:17px;height:17px;padding:0 4px;border:2px solid var(--mist);border-radius:99px;display:grid;place-items:center;background:var(--coral-deep);color:#fff;font-size:9px;font-weight:800;line-height:1}
        .phs-stats{display:flex;gap:0;margin-bottom:18px;padding:10px 6px;border-top:1px solid #b5dcd5;border-bottom:1px solid #b5dcd5}.phs-stat{flex:1;background:none;padding:0 7px;text-align:left;border-right:1px solid #b5dcd5}.phs-stat:last-child{border:0}.phs-stat b{display:block;font-size:17px;line-height:17px;color:var(--coral-deep)}.phs-stat span{font-size:11px;color:var(--muted);font-weight:600}
        .phs-find{width:100%;min-height:139px;position:relative;overflow:hidden;padding:18px;text-align:left;border-radius:25px;background:linear-gradient(120deg,#d95e5b 0%,#e97868 54%,#efb174 100%);color:#fffdf5;box-shadow:0 13px 28px #c96e6660;transition:transform .2s ease,box-shadow .2s ease}.phs-find:hover{transform:translateY(-2px);box-shadow:0 17px 30px #c96e666c}.phs-find:before{content:"";position:absolute;width:145px;height:145px;border-radius:50%;border:25px solid #ffdba064;right:-55px;bottom:-65px}.phs-find:after{content:"";position:absolute;width:80px;height:80px;border-radius:20px;border:1px solid #fff8e577;transform:rotate(25deg);right:31px;top:-46px}.phs-findcopy{position:relative;z-index:1;width:190px}.phs-findlabel{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff2d7}.phs-find h1{font-size:27px;line-height:28px;margin:8px 0 5px;font-weight:850;letter-spacing:-.05em}.phs-find p{font-size:13px;margin:0;color:#fff6e8;line-height:17px;font-weight:500}.phs-findicon{position:absolute;right:22px;bottom:20px;z-index:1;width:48px;height:48px;border-radius:17px;background:#fff3dc;display:grid;place-items:center;color:var(--coral-deep);box-shadow:0 7px 13px #a44f4840}
        .phs-shortcuts{display:flex;gap:8px;margin:14px 0 22px}.phs-shortcut{flex:1;min-height:78px;text-align:left;padding:10px 9px;border:1px solid var(--line);border-radius:18px;background:#f9fffc;box-shadow:0 4px 11px #55998c1c;transition:transform .2s ease}.phs-shortcut svg{display:block;color:#d65d5a;margin-bottom:7px}.phs-shortcut:nth-child(2) svg{color:#c4914c}.phs-shortcut:nth-child(3) svg{color:#3b9e99}.phs-shortcut span{display:block;font-size:11px;line-height:12px;font-weight:750}
        .phs-section{margin-top:20px}.phs-sectionhead{display:flex;justify-content:space-between;align-items:baseline;margin:0 2px 9px}.phs-sectionhead h2{font-size:14px;margin:0;font-weight:850;letter-spacing:-.025em}.phs-sectionhead button{background:none;padding:0;font-size:11px;font-weight:750;color:var(--coral-deep)}.phs-update{display:flex;width:100%;align-items:center;gap:12px;border:1px solid var(--line);border-radius:21px;padding:11px;background:var(--paper);text-align:left;box-shadow:0 5px 14px #55998c12}.phs-update-icon{width:40px;height:40px;border-radius:14px;background:#f6dfab;display:grid;place-items:center;color:#a77a35;flex-shrink:0}.phs-update-text{min-width:0;flex:1}.phs-update-text b{display:block;font-size:13px;line-height:15px}.phs-update-text span{display:block;margin-top:2px;font-size:11px;color:var(--muted);font-weight:550}.phs-update>svg{color:#7ca3a0;flex-shrink:0}
        .phs-happening{display:flex;gap:11px;align-items:center;border-radius:20px;padding:11px 12px 11px 11px;background:#d9f1ec;border:1px solid #b9dfd8}.phs-bubble{width:34px;height:34px;border-radius:13px;display:grid;place-items:center;background:var(--coral);color:#fff8ee;flex-shrink:0}.phs-happening b{display:block;font-size:12px;line-height:15px}.phs-happening span{font-size:10.5px;color:#5f7d7d;font-weight:600}.phs-collect{position:relative;overflow:hidden;display:flex;align-items:center;min-height:88px;border-radius:22px;background:#16525a;padding:14px;color:#f3fffa;text-align:left;box-shadow:0 8px 18px #1c5e5b35}.phs-setshot{position:absolute;right:0;top:0;width:116px;height:100%;object-fit:cover;opacity:.33;mix-blend-mode:screen}.phs-collect:after{content:"";position:absolute;width:100px;height:100px;border:18px solid #e5bd7090;border-radius:50%;right:-40px;top:-48px}.phs-collect strong{font-size:14px;display:block;line-height:17px;position:relative;z-index:1}.phs-collect small{display:block;color:#d5e9d5;font-size:11px;margin-top:3px;font-weight:600}.phs-progress{margin-top:7px;width:177px;height:5px;border-radius:5px;background:#3c7778;overflow:hidden}.phs-progress i{display:block;width:58%;height:100%;background:var(--sand);border-radius:inherit}.phs-count{position:relative;z-index:1;margin-left:auto;width:47px;height:47px;border-radius:50%;border:4px solid #dcb36b;display:grid;place-items:center;color:#f1d28f;font-size:12px;font-weight:800;background:#236167}
        .phs-nav{position:absolute;bottom:0;left:0;right:0;height:88px;padding:8px 9px 18px;display:flex;align-items:stretch;background:#f8fffcdf;border-top:1px solid var(--line);backdrop-filter:blur(15px)}.phs-navitem{position:relative;flex:1;display:flex;align-items:center;flex-direction:column;gap:4px;padding:5px 0 0;background:none;color:#71918f;font-size:9px;font-weight:700}.phs-navitem.is-active{color:var(--coral-deep)}.phs-navicon{position:relative;width:29px;height:29px;display:grid;place-items:center;border-radius:10px}.phs-navitem.is-active .phs-navicon{background:#f8d9d0}.phs-navitem .phs-notice{right:-5px;top:-3px}
      `}</style>
      <div className="phs-scroll">
        <header className="phs-top">
          <button type="button" onClick={noop} className="phs-profile" aria-label="Open Emma's profile"><span className="phs-avatar">EM</span><span className="phs-welcome"><small>Good afternoon</small><strong>Hi, Emma</strong></span></button>
          <div className="phs-tools"><button type="button" onClick={noop} className="phs-tool" aria-label="Messages"><MessageCircle size={20}/><NoticeBadge>3</NoticeBadge></button><button type="button" onClick={noop} className="phs-tool" aria-label="Notifications"><Bell size={19}/><NoticeBadge>1</NoticeBadge></button></div>
        </header>
        <div className="phs-stats"><button type="button" onClick={noop} className="phs-stat"><b>248</b><span>pins</span></button><button type="button" onClick={noop} className="phs-stat"><b>19</b><span>traders</span></button><button type="button" onClick={noop} className="phs-stat"><b>34</b><span>ISO</span></button></div>
        <button type="button" onClick={() => setFound(!found)} className="phs-find" aria-label="Find a pin"><span className="phs-findcopy"><span className="phs-findlabel"><Sparkles size={13}/> {found ? "Ready when you are" : "Your pin detective"}</span><h1>Find a Pin</h1><p>Scan or search the catalogue</p></span><span className="phs-findicon">{found ? <Search size={23}/> : <Camera size={23}/>}</span></button>
        <div className="phs-shortcuts"><button type="button" onClick={noop} className="phs-shortcut"><Heart size={18} fill="currentColor"/><span>My<br/>Collection</span></button><button type="button" onClick={noop} className="phs-shortcut"><Compass size={18}/><span>Find<br/>Trades</span></button><button type="button" onClick={noop} className="phs-shortcut"><UsersRound size={18}/><span>Community</span></button></div>
        <section className="phs-section"><div className="phs-sectionhead"><h2>For You</h2><button type="button" onClick={noop}>See all</button></div><button type="button" onClick={noop} className="phs-update"><span className="phs-update-icon"><Sparkles size={18}/></span><span className="phs-update-text"><b>Your submission is live</b><span>Festival of Fantasy Mickey was approved</span></span><ChevronRight size={17}/></button></section>
        <section className="phs-section"><div className="phs-sectionhead"><h2>What’s Happening</h2></div><button type="button" onClick={noop} className="phs-happening"><span className="phs-bubble"><MessageCircle size={17}/></span><span><b>Sophie just added the Stitch 626 Day pin</b><span>Sophie Williams · 2h ago</span></span></button></section>
        <section className="phs-section"><div className="phs-sectionhead"><h2>Continue Collecting</h2><button type="button" onClick={noop}>View set</button></div><button type="button" onClick={noop} className="phs-collect"><img className="phs-setshot" src="/__mockup/images/pinhunt-golden-pin-case.png" alt="A golden pin case"/><span><strong>Winnie the Pooh<br/>Hunny Pot Series</strong><small>7 of 12 collected</small><span className="phs-progress"><i/></span></span><span className="phs-count">7/12</span></button></section>
      </div>
      <nav className="phs-nav" aria-label="Primary navigation"><NavItem active icon={<Home size={20}/>} label="Home"/><NavItem icon={<MessageCircle size={20}/>} label="Community" badge="3"/><NavItem icon={<Search size={20}/>} label="Find"/><NavItem icon={<Heart size={20}/>} label="Collection"/><NavItem icon={<UserRound size={20}/>} label="Profile"/></nav>
    </main>
  );
}