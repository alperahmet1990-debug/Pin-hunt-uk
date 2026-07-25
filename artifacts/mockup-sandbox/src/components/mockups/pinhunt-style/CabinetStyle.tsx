// Direction 1: Collector's Cabinet
// Dark museum-cabinet aesthetic — navy backgrounds, warm gold glows, serif headings
// Cards feel like exhibit cases. Premium, moody, collectible-worthy.

export function CabinetStyle() {
  const posts = [
    {
      type: "ISO",
      typeColor: "#D97832",
      typeBg: "rgba(217,120,50,0.15)",
      user: "pinhead_lou",
      time: "2m ago",
      body: "Still hunting for the Haunted Mansion 50th anniversary LE pin — anyone have one for trade? Happy to offer multiples from my collection.",
      pin: "Haunted Mansion 50th",
      pinType: "LE",
      comments: 4,
    },
    {
      type: "For Trade",
      typeColor: "#7B9FE8",
      typeBg: "rgba(123,159,232,0.15)",
      user: "dizzy_collector",
      time: "14m ago",
      body: "Just picked up a duplicate Tinker Bell artist proof at the weekend meetup. Looking for anything from the Enchanted Storybook Castle series.",
      pin: "Tinker Bell AP",
      pinType: "AP",
      comments: 11,
    },
    {
      type: "New Pickup",
      typeColor: "#4CAF8A",
      typeBg: "rgba(76,175,138,0.15)",
      user: "vault_keeper",
      time: "1h ago",
      body: "Finally completed the full Nightmare Before Christmas Jumbo set — 6 months in the making! This one's going straight into the display case. 🎃",
      pin: null,
      pinType: null,
      comments: 23,
    },
  ];

  return (
    <div style={{
      width: 390,
      minHeight: 844,
      background: "linear-gradient(160deg, #0D0F1E 0%, #111328 60%, #0A0C18 100%)",
      fontFamily: "'Inter', sans-serif",
      color: "#E8E4DC",
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Ambient glow */}
      <div style={{
        position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)",
        width: 300, height: 200,
        background: "radial-gradient(ellipse, rgba(196,147,58,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Status bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px 0", fontSize: 12, color: "#9997B5" }}>
        <span style={{ fontWeight: 600 }}>9:41</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>●●●</span><span>WiFi</span><span>74%</span>
        </div>
      </div>

      {/* Header */}
      <div style={{ padding: "18px 20px 12px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#C4933A", fontWeight: 600, marginBottom: 4 }}>Community</div>
          <div style={{ fontSize: 28, fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, color: "#F0EBE0", lineHeight: 1 }}>The Exchange</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {["✉", "+"].map((icon, i) => (
            <div key={i} style={{
              width: 36, height: 36, borderRadius: 18,
              background: "rgba(196,147,58,0.1)",
              border: "1px solid rgba(196,147,58,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: i === 0 ? 15 : 18, color: "#C4933A",
            }}>{icon}</div>
          ))}
        </div>
      </div>

      {/* Collectors Nearby banner */}
      <div style={{
        margin: "0 20px 16px",
        background: "linear-gradient(135deg, rgba(196,147,58,0.18) 0%, rgba(196,147,58,0.08) 100%)",
        border: "1px solid rgba(196,147,58,0.35)",
        borderRadius: 14,
        padding: "12px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 0 20px rgba(196,147,58,0.08)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: "rgba(196,147,58,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15,
          }}>📍</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#D4AC54" }}>Collectors Nearby</div>
            <div style={{ fontSize: 11, color: "#9997B5", marginTop: 1 }}>3 collectors within 10 miles</div>
          </div>
        </div>
        <div style={{ fontSize: 16, color: "#C4933A", opacity: 0.7 }}>›</div>
      </div>

      {/* Filter pills */}
      <div style={{ paddingLeft: 20, marginBottom: 18, display: "flex", gap: 8, overflowX: "auto" }}>
        {[
          { label: "All", active: true },
          { label: "ISO", active: false },
          { label: "Trade", active: false },
          { label: "For Sale", active: false },
          { label: "Pickup", active: false },
        ].map((f, i) => (
          <div key={i} style={{
            padding: "7px 16px", borderRadius: 20, whiteSpace: "nowrap",
            background: f.active ? "linear-gradient(135deg, #C4933A, #A87730)" : "rgba(255,255,255,0.04)",
            border: f.active ? "none" : "1px solid rgba(255,255,255,0.08)",
            color: f.active ? "#0D0F1E" : "#9997B5",
            fontSize: 13, fontWeight: f.active ? 700 : 500,
            boxShadow: f.active ? "0 2px 12px rgba(196,147,58,0.35)" : "none",
          }}>{f.label}</div>
        ))}
      </div>

      {/* Feed */}
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {posts.map((post, i) => (
          <div key={i} style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
          }}>
            {/* Gold top accent line */}
            <div style={{ height: 1, background: "linear-gradient(90deg, rgba(196,147,58,0.6), transparent)" }} />
            <div style={{ padding: "14px 16px" }}>
              {/* Post header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: "linear-gradient(135deg, #1E2040, #2A2D55)",
                    border: "1px solid rgba(196,147,58,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, color: "#C4933A", fontWeight: 700,
                  }}>{post.user[0].toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#D4C8B0" }}>@{post.user}</div>
                    <div style={{ fontSize: 11, color: "#5D5B7A" }}>{post.time}</div>
                  </div>
                </div>
                <div style={{
                  padding: "4px 10px", borderRadius: 20,
                  background: post.typeBg,
                  border: `1px solid ${post.typeColor}40`,
                  fontSize: 11, fontWeight: 600, color: post.typeColor,
                }}>{post.type}</div>
              </div>

              {/* Body */}
              <p style={{ fontSize: 13, lineHeight: 1.6, color: "#A8A4BE", margin: 0, marginBottom: post.pin ? 12 : 0,
                display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}>{post.body}</p>

              {/* Pin chip */}
              {post.pin && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 10px 5px 8px",
                  background: "rgba(196,147,58,0.08)",
                  border: "1px solid rgba(196,147,58,0.2)",
                  borderRadius: 8, fontSize: 11,
                }}>
                  <div style={{
                    background: "linear-gradient(135deg, #C4933A, #A87730)",
                    borderRadius: 4, padding: "1px 5px",
                    fontSize: 9, fontWeight: 700, color: "#0D0F1E",
                  }}>{post.pinType}</div>
                  <span style={{ color: "#D4C8B0", fontWeight: 500 }}>{post.pin}</span>
                </div>
              )}

              {/* Footer */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)",
                display: "flex", alignItems: "center", gap: 16,
              }}>
                <span style={{ fontSize: 12, color: "#5D5B7A" }}>💬 {post.comments}</span>
                <span style={{ fontSize: 12, color: "#5D5B7A" }}>↗ Share</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, width: 390,
        background: "rgba(13,15,30,0.92)",
        borderTop: "1px solid rgba(196,147,58,0.15)",
        backdropFilter: "blur(20px)",
        padding: "12px 0 24px",
        display: "flex", justifyContent: "space-around", alignItems: "center",
      }}>
        {[
          { icon: "♡", label: "Collection" },
          { icon: "⊙", label: "Discover" },
          { icon: "⊛", label: "Scan", scan: true },
          { icon: "◈", label: "Community", active: true },
          { icon: "◯", label: "Profile" },
        ].map((tab, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            {tab.scan ? (
              <div style={{
                width: 48, height: 48, borderRadius: 24,
                background: "linear-gradient(135deg, #C4933A, #A87730)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, color: "#0D0F1E",
                boxShadow: "0 4px 16px rgba(196,147,58,0.4)",
                marginTop: -12,
              }}>{tab.icon}</div>
            ) : (
              <div style={{ fontSize: 20, color: tab.active ? "#C4933A" : "#3D3C55" }}>{tab.icon}</div>
            )}
            <span style={{ fontSize: 10, color: tab.active ? "#C4933A" : "#3D3C55", fontWeight: tab.active ? 600 : 400 }}>
              {!tab.scan && tab.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
