// Direction 3: Golden Era
// Warm, rich amber palette — honey tones, golden gradients, tactile cards.
// Every surface feels bathed in golden hour light. Premium but approachable.

export function GoldenStyle() {
  const posts = [
    {
      type: "ISO",
      typeColor: "#B05A00",
      typeBg: "#FFF0DC",
      tagBg: "#FFE4B5",
      user: "pinhead_lou",
      avatar: "#FFD580",
      avatarText: "P",
      time: "2m ago",
      body: "Still hunting for the Haunted Mansion 50th anniversary LE pin — anyone have one for trade? Happy to offer multiples from my collection.",
      pin: "Haunted Mansion 50th",
      pinType: "LE",
      likes: 12, comments: 4,
    },
    {
      type: "For Trade",
      typeColor: "#1A4FA0",
      typeBg: "#EEF3FF",
      tagBg: "#D6E4FF",
      user: "dizzy_collector",
      avatar: "#C7D9FF",
      avatarText: "D",
      time: "14m ago",
      body: "Duplicate Tinker Bell AP from the weekend meetup. Seeking anything from the Enchanted Storybook Castle series. Mint condition.",
      pin: "Tinker Bell AP",
      pinType: "AP",
      likes: 8, comments: 11,
    },
    {
      type: "New Pickup",
      typeColor: "#1A6B45",
      typeBg: "#EDFAF3",
      tagBg: "#C6F0D8",
      user: "vault_keeper",
      avatar: "#A8EDCA",
      avatarText: "V",
      time: "1h ago",
      body: "Completed the full Nightmare Before Christmas Jumbo set — 6 months in the making! 🎃",
      pin: null,
      pinType: null,
      likes: 47, comments: 23,
    },
  ];

  return (
    <div style={{
      width: 390,
      minHeight: 844,
      background: "#FFF8EE",
      fontFamily: "'Inter', sans-serif",
      color: "#1C1206",
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Warm ambient wash */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 200,
        background: "linear-gradient(180deg, rgba(255,200,80,0.12) 0%, transparent 100%)",
        pointerEvents: "none",
      }} />

      {/* Status bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px 0", fontSize: 12, color: "#B08040" }}>
        <span style={{ fontWeight: 700, color: "#5C3A00" }}>9:41</span>
        <div style={{ display: "flex", gap: 6 }}>
          <span>▬▬▬</span><span>WiFi</span><span>74%</span>
        </div>
      </div>

      {/* Header */}
      <div style={{ padding: "16px 20px 14px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#2D1800", letterSpacing: -0.5, lineHeight: 1.1 }}>Community</div>
          <div style={{ fontSize: 12, color: "#B08040", marginTop: 3, fontWeight: 500 }}>847 posts today</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 20,
            background: "#FFF0D0",
            border: "1.5px solid #E8C870",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, color: "#9B6A00",
          }}>✉</div>
          <div style={{
            width: 38, height: 38, borderRadius: 20,
            background: "linear-gradient(135deg, #F0A830, #E07800)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, color: "#fff",
            boxShadow: "0 4px 16px rgba(200,120,0,0.35)",
          }}>+</div>
        </div>
      </div>

      {/* Collectors Nearby */}
      <div style={{
        margin: "0 20px 16px",
        background: "linear-gradient(135deg, #FFC84A, #F09010)",
        borderRadius: 18,
        padding: "13px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 6px 24px rgba(200,120,0,0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 12,
            background: "rgba(255,255,255,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>📍</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3D1800" }}>Collectors Nearby</div>
            <div style={{ fontSize: 11, color: "rgba(61,24,0,0.6)", marginTop: 1 }}>3 collectors within 10 miles</div>
          </div>
        </div>
        <div style={{
          width: 28, height: 28, borderRadius: 14,
          background: "rgba(255,255,255,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: "#3D1800", fontWeight: 700,
        }}>›</div>
      </div>

      {/* Filter pills */}
      <div style={{ paddingLeft: 20, marginBottom: 16, display: "flex", gap: 8, overflowX: "auto" }}>
        {[
          { label: "✨ All", active: true },
          { label: "🔍 ISO", active: false },
          { label: "🔄 Trade", active: false },
          { label: "🏷 For Sale", active: false },
          { label: "📦 Pickup", active: false },
        ].map((f, i) => (
          <div key={i} style={{
            padding: "8px 16px", borderRadius: 24, whiteSpace: "nowrap",
            background: f.active ? "#3D1800" : "#FFF0D0",
            border: f.active ? "none" : "1.5px solid #E8C870",
            color: f.active ? "#FFC84A" : "#7A4500",
            fontSize: 13, fontWeight: 600,
            boxShadow: f.active ? "0 4px 12px rgba(61,24,0,0.2)" : "none",
          }}>{f.label}</div>
        ))}
      </div>

      {/* Feed */}
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {posts.map((post, i) => (
          <div key={i} style={{
            background: "#FFFFFF",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 2px 16px rgba(100,60,0,0.08), 0 1px 3px rgba(100,60,0,0.05)",
            border: "1.5px solid #F0E0C0",
          }}>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 12,
                    background: post.avatar,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 15, fontWeight: 800, color: "#3D1800",
                    border: "1.5px solid rgba(61,24,0,0.1)",
                  }}>{post.avatarText}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#2D1800" }}>@{post.user}</div>
                    <div style={{ fontSize: 11, color: "#B08040" }}>{post.time}</div>
                  </div>
                </div>
                <div style={{
                  padding: "5px 12px", borderRadius: 20,
                  background: post.typeBg,
                  fontSize: 11, fontWeight: 700, color: post.typeColor,
                }}>{post.type}</div>
              </div>

              <p style={{
                fontSize: 13.5, lineHeight: 1.6, color: "#4A2E00", margin: "0 0 12px",
                display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}>{post.body}</p>

              {post.pin && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 12px 5px 8px",
                  background: "#FFF8E0",
                  border: "1.5px solid #E8C870",
                  borderRadius: 10, fontSize: 11, marginBottom: 12,
                }}>
                  <div style={{
                    background: "linear-gradient(135deg, #FFC84A, #E07800)",
                    borderRadius: 5, padding: "1px 6px",
                    fontSize: 9, fontWeight: 800, color: "#3D1800",
                    letterSpacing: 0.5,
                  }}>{post.pinType}</div>
                  <span style={{ color: "#5C3A00", fontWeight: 600 }}>{post.pin}</span>
                </div>
              )}

              <div style={{
                paddingTop: 10, borderTop: "1px solid #F5E8D0",
                display: "flex", gap: 16, alignItems: "center",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#B08040" }}>
                  <span style={{ fontSize: 14 }}>♡</span> {post.likes}
                </div>
                <div style={{ fontSize: 12, color: "#B08040" }}>💬 {post.comments}</div>
                <div style={{ marginLeft: "auto" }}>
                  <div style={{
                    padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                    background: "linear-gradient(135deg, #FFC84A, #E07800)",
                    color: "#3D1800",
                    boxShadow: "0 2px 8px rgba(200,120,0,0.25)",
                  }}>Reply</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{
        marginTop: 16,
        background: "#FFFFFF",
        borderTop: "1.5px solid #F0E0C0",
        padding: "12px 0 28px",
        display: "flex", justifyContent: "space-around", alignItems: "center",
        boxShadow: "0 -4px 24px rgba(100,60,0,0.06)",
      }}>
        {[
          { icon: "♡", label: "Collection" },
          { icon: "⊙", label: "Discover" },
          { icon: "⊛", scan: true },
          { icon: "◈", label: "Community", active: true },
          { icon: "◯", label: "Profile" },
        ].map((tab, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            {tab.scan ? (
              <div style={{
                width: 52, height: 52, borderRadius: 26,
                background: "linear-gradient(135deg, #FFC84A, #E07800)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, marginTop: -16,
                boxShadow: "0 6px 20px rgba(200,120,0,0.4)",
                border: "3px solid #FFF8EE",
              }}>⊛</div>
            ) : (
              <>
                <div style={{ fontSize: 20, color: tab.active ? "#E07800" : "#C8A060" }}>{tab.icon}</div>
                <span style={{ fontSize: 10, color: tab.active ? "#E07800" : "#C8A060", fontWeight: tab.active ? 700 : 400 }}>{tab.label}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
