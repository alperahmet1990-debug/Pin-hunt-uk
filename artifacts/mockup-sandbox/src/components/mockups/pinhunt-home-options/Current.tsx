import {
  Bell,
  Camera,
  ChevronRight,
  Compass,
  Heart,
  MessageCircle,
  MessageSquare,
  Plus,
  UserRound,
} from "lucide-react";
import "./_group.css";

const noop = () => {};

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[#FFF8EE] bg-[#E07800] px-1 text-[10px] font-bold leading-none text-white">
      {children}
    </span>
  );
}

function FeedCard({
  icon,
  iconColor,
  iconBackground,
  title,
  subtitle,
  chevron = false,
}: {
  icon: React.ReactNode;
  iconColor?: string;
  iconBackground: string;
  title: string;
  subtitle: React.ReactNode;
  chevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={noop}
      className="flex w-full items-center gap-3 rounded-2xl border border-[#F0E0C0] bg-white p-[14px] text-left"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: iconBackground, color: iconColor }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-[19px] tracking-[-0.2px] text-[#2D1800]">
          {title}
        </span>
        <span className="mt-0.5 block text-[13px] leading-[17px] text-[#B08040]">
          {subtitle}
        </span>
      </span>
      {chevron && <ChevronRight size={16} className="shrink-0 text-[#B08040]" />}
    </button>
  );
}

function Tab({
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
    <button
      type="button"
      onClick={noop}
      className={`relative flex h-full flex-1 flex-col items-center justify-start gap-1 pt-3 text-[10px] font-medium ${
        active ? "text-[#E07800]" : "text-[#B08040]"
      }`}
    >
      <span className="relative">
        {icon}
        {badge && (
          <span className="absolute -right-3 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[9px] font-bold text-white">
            {badge}
          </span>
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function Current() {
  return (
    <main className="pinhunt-home relative mx-auto h-[100dvh] min-h-screen w-full max-w-[390px] overflow-hidden">
      <div className="pinhunt-home__scroll h-full overflow-y-auto px-4 pb-[112px] pt-[83px]">
        <header className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={noop}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#FFC84A] to-[#E07800] text-[15px] font-bold text-white shadow-sm">
              EM
            </span>
            <span className="truncate text-[20px] font-bold tracking-[-0.4px]">
              Hi, Emma 👋
            </span>
          </button>
          <div className="ml-3 flex gap-2">
            <button
              type="button"
              onClick={noop}
              aria-label="Messages"
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#F0E0C0] bg-white"
            >
              <MessageSquare size={20} strokeWidth={2} />
              <Badge>3</Badge>
            </button>
            <button
              type="button"
              onClick={noop}
              aria-label="Notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#F0E0C0] bg-white"
            >
              <Bell size={20} strokeWidth={2} />
              <Badge>1</Badge>
            </button>
          </div>
        </header>

        <div className="mb-6 flex items-center gap-2 pl-0.5 text-[14px] text-[#B08040]">
          <button type="button" onClick={noop}>
            <strong className="font-semibold text-[#2D1800]">248</strong> pins
          </button>
          <span className="text-[#F0E0C0]">·</span>
          <button type="button" onClick={noop}>
            <strong className="font-semibold text-[#2D1800]">19</strong> traders
          </button>
          <span className="text-[#F0E0C0]">·</span>
          <button type="button" onClick={noop}>
            <strong className="font-semibold text-[#2D1800]">34</strong> ISO
          </button>
        </div>

        <div className="mb-8 flex gap-3">
          {[
            { label: "Scan Pin", icon: <Camera size={18} /> },
            { label: "Add Pin", icon: <Plus size={18} /> },
          ].map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={noop}
              className="flex flex-1 items-center gap-2.5 rounded-2xl border border-[#F0E0C0] bg-white p-3 text-[15px] font-semibold tracking-[-0.2px]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#E0780015] text-[#E07800]">
                {action.icon}
              </span>
              {action.label}
            </button>
          ))}
        </div>

        <section className="mb-7">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.5px] opacity-80">
            For You
          </h2>
          <div className="flex flex-col gap-2.5">
            <FeedCard
              icon={<MessageCircle size={16} />}
              iconColor="#E07800"
              iconBackground="#E0780015"
              title="New messages"
              subtitle="3 unread messages"
              chevron
            />
            <FeedCard
              icon={<Bell size={16} />}
              iconColor="#E07800"
              iconBackground="#E0780015"
              title="Submission update"
              subtitle="1 unseen update"
              chevron
            />
          </div>
        </section>

        <section className="mb-7">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.5px] opacity-80">
            What’s Happening
          </h2>
          <FeedCard
            icon={<MessageSquare size={16} />}
            iconBackground="#FFF0D0"
            title="Just added the new Stitch 626 Day pin to my collection!"
            subtitle={
              <>
                <span className="text-[11px]">Sophie Williams · 2h ago</span>
              </>
            }
          />
        </section>

        <section className="mb-7">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.5px] opacity-80">
            Continue Collecting
          </h2>
          <button
            type="button"
            onClick={noop}
            className="flex w-full items-center rounded-2xl border border-[#F0E0C0] bg-white p-4 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-semibold tracking-[-0.2px]">
                Winnie the Pooh Hunny Pot Series
              </span>
              <span className="mt-1 block text-[13px] text-[#B08040]">
                7 / 12 collected
              </span>
            </span>
            <span className="ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E0780015] text-[13px] font-semibold text-[#E07800]">
              58%
            </span>
          </button>
        </section>
      </div>

      <nav className="absolute inset-x-0 bottom-0 h-[84px] border-t border-[#F0E0C0] bg-white">
        <div className="flex h-full items-start">
          <Tab active icon={<Compass size={22} />} label="Discover" />
          <Tab icon={<MessageCircle size={22} />} label="Community" badge="3" />
          <button
            type="button"
            onClick={noop}
            aria-label="Find a pin"
            className="relative flex h-full flex-1 items-start justify-center"
          >
            <span className="absolute -top-5 flex h-[66px] w-[66px] items-center justify-center rounded-full border-[3px] border-[#FFF8EE]">
              <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-gradient-to-br from-[#FFC84A] to-[#E07800] text-white shadow-[0_4px_10px_rgba(224,120,0,0.4)]">
                <Camera size={26} />
              </span>
            </span>
          </button>
          <Tab icon={<Heart size={22} />} label="Collection" />
          <Tab icon={<UserRound size={22} />} label="Profile" />
        </div>
      </nav>
    </main>
  );
}