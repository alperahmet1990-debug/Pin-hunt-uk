import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const taglines = [
  "Track every pin in your collection",
  "Trade with collectors across the UK",
  "Find the pins you've been hunting for",
  "Your collection, beautifully organised",
];

export function Minimal() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    const interval = setInterval(() => {
      setTaglineIndex((prev) => (prev + 1) % taglines.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    setPasswordError("");

    let hasError = false;

    if (!email) {
      setEmailError("Email is required");
      hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address");
      hasError = true;
    }

    if (!password) {
      setPasswordError("Password is required");
      hasError = true;
    } else if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      hasError = true;
    }

    if (!hasError) {
      console.log("Login attempt:", { email, password });
    }
  };

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden" style={{ backgroundColor: 'hsl(var(--cream))' }}>
      {/* Hero Image Section */}
      <div className="relative h-[45vh] w-full overflow-hidden">
        <div className="absolute inset-0 z-10" style={{ background: 'linear-gradient(to bottom, transparent, transparent, hsl(var(--cream)))' }} />
        <img
          src="/__mockup/images/pins-collection.jpg"
          alt=""
          className="w-full h-full object-cover opacity-90"
          style={{
            animation: isVisible ? "fadeIn 0.8s ease-out forwards" : "none",
          }}
        />
        <div className="absolute inset-0 z-10" style={{ background: 'linear-gradient(to top, hsl(var(--cream) / 0.8), transparent)' }} />
      </div>

      {/* Content Section */}
      <div
        className="flex-1 px-6 pb-8 flex flex-col"
        style={{
          animation: isVisible ? "slideUp 0.6s ease-out 0.2s backwards" : "none",
        }}
      >
        {/* Branding */}
        <div className="mb-8 -mt-4">
          <h1 className="font-display text-4xl font-bold mb-2 tracking-tight" style={{ color: 'hsl(var(--charcoal))' }}>
            PinHunt
          </h1>
          <div className="h-5 relative overflow-hidden">
            {taglines.map((tagline, index) => (
              <p
                key={index}
                className="text-sm absolute inset-0 transition-all duration-500"
                style={{
                  color: 'hsl(var(--charcoal) / 0.6)',
                  opacity: taglineIndex === index ? 1 : 0,
                  transform:
                    taglineIndex === index
                      ? "translateY(0)"
                      : index < taglineIndex
                      ? "translateY(-100%)"
                      : "translateY(100%)",
                }}
              >
                {tagline}
              </p>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
          <div className="space-y-4 mb-6">
            <div>
              <Label
                htmlFor="email"
                className="text-sm font-medium mb-1.5 block"
                style={{ color: 'hsl(var(--charcoal))' }}
              >
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError("");
                }}
                className="h-12 bg-white transition-all duration-200"
                style={{
                  borderWidth: '2px',
                  borderColor: emailError ? 'hsl(var(--coral))' : 'hsl(var(--sage) / 0.3)',
                }}
                placeholder="your@email.com"
                onFocus={(e) => {
                  if (!emailError) {
                    e.target.style.borderColor = 'hsl(var(--sage))';
                  }
                }}
                onBlur={(e) => {
                  if (!emailError) {
                    e.target.style.borderColor = 'hsl(var(--sage) / 0.3)';
                  }
                }}
              />
              {emailError && (
                <p
                  className="text-xs font-medium mt-1.5"
                  style={{ 
                    color: 'hsl(var(--coral))',
                    animation: "shake 0.4s ease-in-out"
                  }}
                >
                  {emailError}
                </p>
              )}
            </div>

            <div>
              <Label
                htmlFor="password"
                className="text-sm font-medium mb-1.5 block"
                style={{ color: 'hsl(var(--charcoal))' }}
              >
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError("");
                }}
                className="h-12 bg-white transition-all duration-200"
                style={{
                  borderWidth: '2px',
                  borderColor: passwordError ? 'hsl(var(--coral))' : 'hsl(var(--sage) / 0.3)',
                }}
                placeholder="••••••••"
                onFocus={(e) => {
                  if (!passwordError) {
                    e.target.style.borderColor = 'hsl(var(--sage))';
                  }
                }}
                onBlur={(e) => {
                  if (!passwordError) {
                    e.target.style.borderColor = 'hsl(var(--sage) / 0.3)';
                  }
                }}
              />
              {passwordError && (
                <p
                  className="text-xs font-medium mt-1.5"
                  style={{ 
                    color: 'hsl(var(--coral))',
                    animation: "shake 0.4s ease-in-out"
                  }}
                >
                  {passwordError}
                </p>
              )}
            </div>
          </div>

          <div className="mt-auto space-y-3">
            <button
              type="submit"
              className="w-full h-12 text-white font-semibold rounded-lg shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98]"
              style={{
                backgroundColor: 'hsl(145 35% 52%)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'hsl(145 40% 42%)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'hsl(145 35% 52%)';
              }}
            >
              Sign In
            </button>

            <p className="text-center text-sm" style={{ color: 'hsl(var(--charcoal) / 0.6)' }}>
              New to PinHunt?{" "}
              <button
                type="button"
                className="font-semibold transition-colors duration-200"
                style={{ color: 'hsl(var(--sage))' }}
                onClick={() => console.log("Navigate to create account")}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'hsl(var(--sage-dark))';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'hsl(var(--sage))';
                }}
              >
                Create an account
              </button>
            </p>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 0.9;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes shake {
          0%, 100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-4px);
          }
          75% {
            transform: translateX(4px);
          }
        }
      `}</style>
    </div>
  );
}
