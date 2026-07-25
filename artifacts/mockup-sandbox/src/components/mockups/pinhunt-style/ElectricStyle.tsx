// Direction 2: Electric Market
// High-energy dark UI — vivid neon accents, bold typography, glowing filter pills.
// Feels like a live trading floor: urgent, vibrant, exciting.

export function ElectricStyle() {
  const posts = [
    {
      type: "ISO",
      typeColor: "#FF7A2F",
      glowColor: "rgba(255,122,47,0.3)",
      user: "pinhead_lou",
      avatar: "🦁",
      time: "2m ago",
      body: "Still hunting for the Haunted Mansion 50th anniversary LE pin — anyone have one for trade? Happy to offer multiples.",
      pin: "Haunted Mansion 50th",
      pinType: "LE",
      heart: 12, comment: 4,
    },
    {
      type: "For Trade",
      typeColor: "#3ECFFF",
      glowColor: "rgba(62,207,255,0.3)",
      user: "dizzy_collector",
      avatar: "🎪",
      time: "14m ago",
      body: "Duplicate Tinker Bell AP from weekend meetup. Looking for anything Enchanted Storybook Castle series. Condition: mint.",
      pin: "Tinker Bell AP",
      pinType: "AP",
      heart: 8, comment: 11,
    },
    {
      type: "Pickup",
      typeColor: "#00E676",
      glowColor: "rgba(0,230,118,0.3)",
      user: "vault_keeper",
      avatar: "🏰",
      time: "1h ago",
      body: "Completed the full Nightmare Before Christmas Jumbo set — 6 months in the making! 🎃",
      pin: null,
      pinType: null,
      heart: 47, comment: 23,
    },
  ];

  return (
    <div style={{
      width: 390,
      minHeight: 844,
      background: "#0A0B0F",
      fontFamily: "'Inter', sans-serif",
      color: "#FFFFFF",
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Top gradient accent */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: "linear-gradient(90deg, #FF7A2F, #FF3CAC, #3ECFFF, #00E676)",
      }} />

      {/* Status bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px 0", fontSize: 12, color: "#666" }}>
        <span style={{ fontWeight: 700, color: "#fff" }}>9:41</span>
        <div style={{ display: "flex", gap: 6, color: "#888" }}>
          <span>▬▬▬</span><span>WiFi</span><span style={{ color: "#00E676" }}>74%</span>
        </div>
      </div>

      {/* Header */}
      <div style={{ padding: "16px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1 }}>Community</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2, fontWeight: 500 }}>LIVE FEED · 847 POSTS TODAY</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, border: "1px solid #222",
            background: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>✉</div>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "linear-gradient(135deg, #FF7A2F, #FF3CAC)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, color: "#fff",
            boxShadow: "0 4px 16px rgba(255,122,47,0.4)",
          }}>+</div>
        </div>
      </div>

      {/* Collectors Nearby */}
      <div style={{
        margin: "0 20px 16px",
        background: "linear-gradient(135deg, #0F1320, #111928)",
        border: "1px solid #1E2840",
        borderRadius: 14, padding: "12px 16px",
        display: "flex", alignItems: "center", gap: 12,
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, bottom: 0, width: 3,
          background: "linear-gradient(180deg, #3ECFFF, #7B5BFF)",
        }} />
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: "linear-gradient(135deg, #3ECFFF22, #7B5BFF22)",
          border: "1px solid #3ECFFF33",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
        }}>📍</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#3ECFFF" }}>3 Collectors Nearby</div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 1 }}>Potential trades within 10 miles</div>
        </div>
        <div style={{
          padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: "linear-gradient(135deg, #3ECFFF, #7B5BFF)",
          color: "#0A0B0F",
        }}>View</div>
      </div>

      {/* Filter pills */}
      <div style={{ paddingLeft: 20, marginBottom: 16, display: "flex", gap: 8, overflowX: "auto" }}>
        {[
          { label: "All", active: true, color: "#fff", bg: "#fff", glowColor: "rgba(255,255,255,0.2)" },
          { label: "ISO", active: false, color: "#FF7A2F", bg: "#FF7A2F", glowColor: "rgba(255,122,47,0.3)" },
          { label: "Trade", active: false, color: "#3ECFFF", bg: "#3ECFFF", glowColor: "rgba(62,207,255,0.3)" },
          { label: "For Sale", active: false, color: "#00E676", bg: "#00E676", glowColor: "rgba(0,230,118,0.3)" },
          { label: "Pickup", active: false, color: "#FF3CAC", bg: "#FF3CAC", glowColor: "rgba(255,60,172,0.3)" },
        ].map((f, i) => (
          <div key={i} style={{
            padding: "7px 16px", borderRadius: 8, whiteSpace: "nowrap",
            background: f.active ? f.bg : "#111",
            border: f.active ? "none" : `1px solid ${f.color}33`,
            color: f.active ? "#0A0B0F" : f.color,
            fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
            boxShadow: f.active ? `0 0 16px ${f.glowColor}` : "none",
          }}>{f.label}</div>
        ))}
      </div>

      {/* Feed */}
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {posts.map((post, i) => (
          <div key={i} style={{
            background: "#111",
            border: "1px solid #1E1E26",
            borderRadius: 14,
            overflow: "hidden",
          }}>
            {/* Type indicator bar */}
            <div style={{ height: 2, background: post.typeColor, boxShadow: `0 0 8px ${post.glowColor}` }} />
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 10, background: "#1A1A24",
                    border: `1px solid ${post.typeColor}33`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                  }}>{post.avatar}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>@{post.user}</div>
                    <div style={{ fontSize: 11, color: "#444" }}>{post.time}</div>
                  </div>
                </div>
                <div style={{
                  padding: "5px 12px", borderRadius: 6,
                  background: `${post.typeColor}18`,
                  border: `1px solid ${post.typeColor}44`,
                  fontSize: 11, fontWeight: 800, color: post.typeColor,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  boxShadow: `0 0 10px ${post.glowColor}`,
                }}>{post.type}</div>
              </div>

              <p style={{ fontSize: 13, lineHeight: 1.55, color: "#BBB", margin: "0 0 12px",
                display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}>{post.body}</p>

              {post.pin && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 10px 5px 8px",
                  background: "#1A1A24",
                  border: `1px solid ${post.typeColor}33`,
                  borderRadius: 6, fontSize: 11, marginBottom: 10,
                }}>
                  <div style={{
                    background: post.typeColor,
                    borderRadius: 4, padding: "1px 5px",
                    fontSize: 9, fontWeight: 800, color: "#0A0B0F",
                    letterSpacing: 0.5,
                  }}>{post.pinType}</div>
                  <span style={{ color: "#DDD", fontWeight: 500 }}>{post.pin}</span>
                </div>
              )}

              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#444" }}>
                  <span style={{ color: "#FF3CAC" }}>♥</span> {post.heart}
                </div>
                <div style={{ fontSize: 12, color: "#444" }}>💬 {post.comment}</div>
                <div style={{ marginLeft: "auto", fontSize: 12, color: "#333", fontWeight: 600 }}>Reply ›</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{
        marginTop: 16,
        background: "#0D0D12",
        borderTop: "1px solid #1A1A24",
        padding: "12px 0 24px",
        display: "flex", justifyContent: "space-around", alignItems: "center",
      }}>
        {[
          { icon: "♡", label: "Collection", color: "#333" },
          { icon: "⊙", label: "Discover", color: "#333" },
          { icon: "⊛", label: "", scan: true },
          { icon: "◈", label: "Community", active: true },
          { icon: "◯", label: "Profile", color: "#333" },
        ].map((tab, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            {tab.scan ? (
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: "linear-gradient(135deg, #FF7A2F, #FF3CAC)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, marginTop: -14,
                boxShadow: "0 4px 20px rgba(255,122,47,0.5)",
              }}>⊛</div>
            ) : (
              <div style={{ fontSize: 20, color: tab.active ? "#fff" : "#333" }}>{tab.icon}</div>
            )}
            {tab.label && <span style={{ fontSize: 10, color: tab.active ? "#fff" : "#333", fontWeight: tab.active ? 700 : 400 }}>{tab.label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
