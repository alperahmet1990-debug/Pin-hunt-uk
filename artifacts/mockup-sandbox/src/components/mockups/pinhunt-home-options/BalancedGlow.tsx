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
  return <span className="phg-notice">{children}</span>;
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
    <button type="button" onClick={noop} className={`phg-navitem ${active ? "is-active" : ""}`}>
      <span className="phg-navicon">{icon}{badge && <NoticeBadge>{badge}</NoticeBadge>}</span>
      <span>{label}</span>
    </button>
  );
}

export function BalancedGlow() {
  const [found, setFound] = useState(false);

  return (
    <main className="phg-shell">
      <style>{`
        .phg-shell{--ink:#3d2130;--muted:#805a64;--cream:#fff4e4;--paper:#fffaf1;--coral:#e96037;--orange:#f78d28;--gold:#ffc957;--line:#f0d8c2;min-height:100dvh;max-width:390px;margin:auto;overflow:hidden;position:relative;background:var(--cream);color:var(--ink);font-family:Outfit,ui-sans-serif,sans-serif;letter-spacing:-.015em}
        .phg-shell *{box-sizing:border-box}.phg-shell button{font:inherit;color:inherit;border:0;cursor:pointer}.phg-scroll{height:100dvh;overflow-y:auto;padding:54px 16px 112px;scrollbar-width:none;background:radial-gradient(circle at 95% 12%,#ffd68c 0,transparent 26%),radial-gradient(circle at -15% 56%,#ffd2c1 0,transparent 31%),var(--cream)}.phg-scroll::-webkit-scrollbar{display:none}
        .phg-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:17px}.phg-profile{display:flex;align-items:center;gap:10px;min-width:0;background:none;padding:0;text-align:left}.phg-avatar{width:42px;height:42px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(135deg,#fbd170,#e7623a 70%);color:#fff9ef;font-weight:800;font-size:14px;box-shadow:0 6px 15px #df704448}.phg-welcome small{display:block;font-size:11px;letter-spacing:.03em;color:var(--muted);font-weight:600}.phg-welcome strong{font-size:20px;line-height:21px;font-weight:800}.phg-tools{display:flex;gap:8px}.phg-tool{position:relative;width:40px;height:40px;border-radius:14px;background:#fffaf2;border:1px solid #f1ddcc;display:grid;place-items:center;transition:transform .2s ease}.phg-tool:active,.phg-find:active,.phg-shortcut:active{transform:scale(.95)}.phg-notice{position:absolute;right:-5px;top:-5px;min-width:17px;height:17px;padding:0 4px;border:2px solid #fff8ed;border-radius:99px;display:grid;place-items:center;background:#df493b;color:#fff;font-size:9px;font-weight:800;line-height:1}
        .phg-stats{display:flex;gap:0;margin-bottom:18px;padding:10px 6px;border-top:1px solid #efcfae;border-bottom:1px solid #efcfae}.phg-stat{flex:1;background:none;padding:0 7px;text-align:left;border-right:1px solid #efcfae}.phg-stat:last-child{border:0}.phg-stat b{display:block;font-size:17px;line-height:17px;color:#d95631}.phg-stat span{font-size:11px;color:var(--muted);font-weight:600}
        .phg-find{width:100%;min-height:139px;position:relative;overflow:hidden;padding:18px;text-align:left;border-radius:25px;background:linear-gradient(115deg,#ea6339 0%,#f58b2a 62%,#ffc95f 100%);color:#fffaf0;box-shadow:0 13px 28px #da71355c;transition:transform .2s ease,box-shadow .2s ease}.phg-find:hover{transform:translateY(-2px);box-shadow:0 17px 30px #da71356c}.phg-find:before{content:"";position:absolute;width:145px;height:145px;border-radius:50%;border:25px solid #ffda7a55;right:-55px;bottom:-65px}.phg-find:after{content:"";position:absolute;width:80px;height:80px;border-radius:20px;border:1px solid #fff7d477;transform:rotate(25deg);right:31px;top:-46px}.phg-findcopy{position:relative;z-index:1;width:190px}.phg-findlabel{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff0c9}.phg-find h1{font-size:27px;line-height:28px;margin:8px 0 5px;font-weight:850;letter-spacing:-.05em}.phg-find p{font-size:13px;margin:0;color:#fff5dc;line-height:17px;font-weight:500}.phg-findicon{position:absolute;right:22px;bottom:20px;z-index:1;width:48px;height:48px;border-radius:17px;background:#fff8dc;display:grid;place-items:center;color:#dd6133;box-shadow:0 7px 13px #b6493040}
        .phg-shortcuts{display:flex;gap:8px;margin:14px 0 22px}.phg-shortcut{flex:1;min-height:78px;text-align:left;padding:10px 9px;border:1px solid #f0d9c4;border-radius:18px;background:#fffaf2;box-shadow:0 4px 11px #bb744219;transition:transform .2s ease}.phg-shortcut svg{display:block;color:#df6138;margin-bottom:7px}.phg-shortcut:nth-child(2) svg{color:#e38e1c}.phg-shortcut:nth-child(3) svg{color:#ba5f57}.phg-shortcut span{display:block;font-size:11px;line-height:12px;font-weight:750}
        .phg-section{margin-top:20px}.phg-sectionhead{display:flex;justify-content:space-between;align-items:baseline;margin:0 2px 9px}.phg-sectionhead h2{font-size:14px;margin:0;font-weight:850;letter-spacing:-.025em}.phg-sectionhead button{background:none;padding:0;font-size:11px;font-weight:750;color:#d85d36}.phg-update{display:flex;width:100%;align-items:center;gap:12px;border:1px solid #f1d9c4;border-radius:21px;padding:11px;background:#fffaf1;text-align:left;box-shadow:0 5px 14px #c6815314}.phg-update-icon{width:40px;height:40px;border-radius:14px;background:#ffe5a4;display:grid;place-items:center;color:#cf6922;flex-shrink:0}.phg-update-text{min-width:0;flex:1}.phg-update-text b{display:block;font-size:13px;line-height:15px}.phg-update-text span{display:block;margin-top:2px;font-size:11px;color:var(--muted);font-weight:550}.phg-update>svg{color:#bd7a61;flex-shrink:0}
        .phg-happening{display:flex;gap:11px;align-items:center;border-radius:20px;padding:11px 12px 11px 11px;background:#fff0d7;border:1px solid #f1d5ac}.phg-bubble{width:34px;height:34px;border-radius:13px;display:grid;place-items:center;background:#e86842;color:#fff8ee;flex-shrink:0}.phg-happening b{display:block;font-size:12px;line-height:15px}.phg-happening span{font-size:10.5px;color:#8a625e;font-weight:600}.phg-collect{position:relative;overflow:hidden;display:flex;align-items:center;min-height:88px;border-radius:22px;background:#3e2941;padding:14px;color:#fff7e7;text-align:left;box-shadow:0 8px 18px #492a3b2d}.phg-setshot{position:absolute;right:0;top:0;width:116px;height:100%;object-fit:cover;opacity:.42;mix-blend-mode:screen}.phg-collect:after{content:"";position:absolute;width:100px;height:100px;border:18px solid #ffca5890;border-radius:50%;right:-40px;top:-48px}.phg-collect strong{font-size:14px;display:block;line-height:17px;position:relative;z-index:1}.phg-collect small{display:block;color:#f4cd9d;font-size:11px;margin-top:3px;font-weight:600}.phg-progress{margin-top:7px;width:177px;height:5px;border-radius:5px;background:#71566c;overflow:hidden}.phg-progress i{display:block;width:58%;height:100%;background:#ffc455;border-radius:inherit}.phg-count{position:relative;z-index:1;margin-left:auto;width:47px;height:47px;border-radius:50%;border:4px solid #f9b94b;display:grid;place-items:center;color:#ffdb81;font-size:12px;font-weight:800;background:#4d354d}
        .phg-nav{position:absolute;bottom:0;left:0;right:0;height:88px;padding:8px 9px 18px;display:flex;align-items:stretch;background:#fff9f0ed;border-top:1px solid #efd8c3;backdrop-filter:blur(15px)}.phg-navitem{position:relative;flex:1;display:flex;align-items:center;flex-direction:column;gap:4px;padding:5px 0 0;background:none;color:#936e70;font-size:9px;font-weight:700}.phg-navitem.is-active{color:#d95836}.phg-navicon{position:relative;width:29px;height:29px;display:grid;place-items:center;border-radius:10px}.phg-navitem.is-active .phg-navicon{background:#ffe0b8}.phg-navitem .phg-notice{right:-5px;top:-3px}
      `}</style>
      <div className="phg-scroll">
        <header className="phg-top">
          <button type="button" onClick={noop} className="phg-profile" aria-label="Open Emma's profile">
            <span className="phg-avatar">EM</span>
            <span className="phg-welcome"><small>Good afternoon</small><strong>Hi, Emma</strong></span>
          </button>
          <div className="phg-tools">
            <button type="button" onClick={noop} className="phg-tool" aria-label="Messages"><MessageCircle size={20}/><NoticeBadge>3</NoticeBadge></button>
            <button type="button" onClick={noop} className="phg-tool" aria-label="Notifications"><Bell size={19}/><NoticeBadge>1</NoticeBadge></button>
          </div>
        </header>
        <div className="phg-stats">
          <button type="button" onClick={noop} className="phg-stat"><b>248</b><span>pins</span></button>
          <button type="button" onClick={noop} className="phg-stat"><b>19</b><span>traders</span></button>
          <button type="button" onClick={noop} className="phg-stat"><b>34</b><span>ISO</span></button>
        </div>
        <button type="button" onClick={() => setFound(!found)} className="phg-find" aria-label="Find a pin">
          <span className="phg-findcopy"><span className="phg-findlabel"><Sparkles size={13}/> {found ? "Ready when you are" : "Your pin detective"}</span><h1>Find a Pin</h1><p>Scan or search the catalogue</p></span>
          <span className="phg-findicon">{found ? <Search size={23}/> : <Camera size={23}/>}</span>
        </button>
        <div className="phg-shortcuts">
          <button type="button" onClick={noop} className="phg-shortcut"><Heart size={18} fill="currentColor"/><span>My<br/>Collection</span></button>
          <button type="button" onClick={noop} className="phg-shortcut"><Compass size={18}/><span>Find<br/>Trades</span></button>
          <button type="button" onClick={noop} className="phg-shortcut"><UsersRound size={18}/><span>Community</span></button>
        </div>
        <section className="phg-section">
          <div className="phg-sectionhead"><h2>For You</h2><button type="button" onClick={noop}>See all</button></div>
          <button type="button" onClick={noop} className="phg-update">
            <span className="phg-update-icon"><Sparkles size={18}/></span><span className="phg-update-text"><b>Your submission is live</b><span>Festival of Fantasy Mickey was approved</span></span><ChevronRight size={17}/>
          </button>
        </section>
        <section className="phg-section">
          <div className="phg-sectionhead"><h2>What’s Happening</h2></div>
          <button type="button" onClick={noop} className="phg-happening"><span className="phg-bubble"><MessageCircle size={17}/></span><span><b>Sophie just added the Stitch 626 Day pin</b><span>Sophie Williams · 2h ago</span></span></button>
        </section>
        <section className="phg-section">
          <div className="phg-sectionhead"><h2>Continue Collecting</h2><button type="button" onClick={noop}>View set</button></div>
          <button type="button" onClick={noop} className="phg-collect"><img className="phg-setshot" src="/__mockup/images/pinhunt-golden-pin-case.png" alt="A golden pin case"/><span><strong>Winnie the Pooh<br/>Hunny Pot Series</strong><small>7 of 12 collected</small><span className="phg-progress"><i/></span></span><span className="phg-count">7/12</span></button>
        </section>
      </div>
      <nav className="phg-nav" aria-label="Primary navigation">
        <NavItem active icon={<Home size={20}/>} label="Home"/>
        <NavItem icon={<MessageCircle size={20}/>} label="Community" badge="3"/>
        <NavItem icon={<Search size={20}/>} label="Find"/>
        <NavItem icon={<Heart size={20}/>} label="Collection"/>
        <NavItem icon={<UserRound size={20}/>} label="Profile"/>
      </nav>
    </main>
  );
}