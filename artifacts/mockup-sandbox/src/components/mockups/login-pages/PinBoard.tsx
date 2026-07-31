import { useState } from "react";

export function PinBoard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    setPasswordError("");

    let hasError = false;

    if (!email) {
      setEmailError("Email is required");
      hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email");
      hasError = true;
    }

    if (!password) {
      setPasswordError("Password is required");
      hasError = true;
    } else if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      hasError = true;
    }

    if (!hasError) {
      // Success state
      console.log("Login attempt:", { email, password });
    }
  };

  const pins = [
    { src: "/__mockup/images/pin-castle.png", rotation: -12, top: "8%", left: "12%" },
    { src: "/__mockup/images/pin-star.png", rotation: 18, top: "15%", left: "78%" },
    { src: "/__mockup/images/pin-balloons.png", rotation: -8, top: "28%", left: "8%" },
    { src: "/__mockup/images/pin-carousel.png", rotation: 22, top: "42%", left: "82%" },
    { src: "/__mockup/images/pin-teacup.png", rotation: -15, top: "58%", left: "10%" },
    { src: "/__mockup/images/pin-heart.png", rotation: 10, top: "72%", left: "80%" },
    { src: "/__mockup/images/pin-castle.png", rotation: 8, top: "85%", left: "15%" },
    { src: "/__mockup/images/pin-star.png", rotation: -20, top: "20%", left: "88%" },
    { src: "/__mockup/images/pin-balloons.png", rotation: 14, top: "65%", left: "6%" },
  ];

  return (
    <div className="h-screen w-full relative overflow-hidden bg-gradient-to-br from-[#0f4c5c] via-[#1a5f7a] to-[#2d3e50] flex items-center justify-center">
      {/* Grain texture overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none grain-texture" />

      {/* Scattered pins background */}
      <div className="absolute inset-0">
        {pins.map((pin, i) => (
          <div
            key={i}
            className="absolute pin-float"
            style={{
              top: pin.top,
              left: pin.left,
              transform: `rotate(${pin.rotation}deg)`,
              animationDelay: `${i * 0.1}s`,
            }}
          >
            <img
              src={pin.src}
              alt=""
              className="w-16 h-16 sm:w-20 sm:h-20 drop-shadow-2xl opacity-40 hover:opacity-60 transition-opacity duration-500"
              style={{ filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.3))" }}
            />
          </div>
        ))}
      </div>

      {/* Login card */}
      <div className="relative z-10 w-full max-w-sm mx-4 animate-card-enter">
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20">
          {/* Branding */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2" style={{ fontFamily: "Syne, sans-serif", color: "#0f4c5c" }}>
              PinHunt
            </h1>
            <p className="text-sm" style={{ fontFamily: "DM Sans, sans-serif", color: "#5a6c7d" }}>
              UK Collector Community
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email field */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-2"
                style={{ fontFamily: "DM Sans, sans-serif", color: "#2d3e50" }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError("");
                }}
                className={`w-full px-4 py-3 rounded-xl border-2 transition-all duration-200 focus:outline-none focus:ring-4 ${
                  emailError
                    ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                    : "border-gray-200 focus:border-[#e8991c] focus:ring-[#e8991c]/20"
                }`}
                style={{ fontFamily: "DM Sans, sans-serif" }}
                placeholder="your@email.com"
              />
              {emailError && (
                <p className="mt-2 text-sm text-red-600 animate-error-shake" style={{ fontFamily: "DM Sans, sans-serif" }}>
                  {emailError}
                </p>
              )}
            </div>

            {/* Password field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-2"
                style={{ fontFamily: "DM Sans, sans-serif", color: "#2d3e50" }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError("");
                }}
                className={`w-full px-4 py-3 rounded-xl border-2 transition-all duration-200 focus:outline-none focus:ring-4 ${
                  passwordError
                    ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                    : "border-gray-200 focus:border-[#e8991c] focus:ring-[#e8991c]/20"
                }`}
                style={{ fontFamily: "DM Sans, sans-serif" }}
                placeholder="Enter your password"
              />
              {passwordError && (
                <p className="mt-2 text-sm text-red-600 animate-error-shake" style={{ fontFamily: "DM Sans, sans-serif" }}>
                  {passwordError}
                </p>
              )}
            </div>

            {/* Sign in button */}
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl font-semibold text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                fontFamily: "DM Sans, sans-serif",
                background: "linear-gradient(135deg, #e8991c 0%, #d88015 100%)",
              }}
            >
              Sign In
            </button>
          </form>

          {/* Create account link */}
          <div className="mt-6 text-center">
            <button
              type="button"
              className="text-sm font-medium hover:underline transition-all duration-200"
              style={{ fontFamily: "DM Sans, sans-serif", color: "#0f4c5c" }}
            >
              Create an account
            </button>
          </div>
        </div>
      </div>

      {/* CSS animations and grain texture */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700&family=DM+Sans:wght@400;500;600&display=swap');

        .grain-texture {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='2.5' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }

        @keyframes pin-float {
          0%, 100% {
            transform: translateY(0) rotate(var(--rotation));
          }
          50% {
            transform: translateY(-8px) rotate(var(--rotation));
          }
        }

        .pin-float {
          animation: pin-float 4s ease-in-out infinite;
          --rotation: 0deg;
        }

        @keyframes card-enter {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .animate-card-enter {
          animation: card-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes error-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }

        .animate-error-shake {
          animation: error-shake 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
}
