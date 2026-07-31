import { useState } from "react";
import { cn } from "@/lib/utils";

export function Gradient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const validateEmail = (value: string) => {
    if (!value) {
      setEmailError("Email is required");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError("Please enter a valid email");
      return false;
    }
    setEmailError("");
    return true;
  };

  const validatePassword = (value: string) => {
    if (!value) {
      setPasswordError("Password is required");
      return false;
    }
    if (value.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return false;
    }
    setPasswordError("");
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    
    if (isEmailValid && isPasswordValid) {
      setIsLoading(true);
      // Simulate authentication
      setTimeout(() => {
        setIsLoading(false);
      }, 2000);
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-gradient-to-b from-[#2d1b4e] via-[#4a2e6b] to-[#d4956c] flex items-center justify-center">
      {/* Animated floating pin silhouettes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img 
          src="/__mockup/images/pin-silhouettes.png" 
          alt=""
          className="absolute top-[10%] left-[15%] w-12 h-12 opacity-20 animate-float-slow"
          style={{ animationDelay: '0s' }}
        />
        <img 
          src="/__mockup/images/pin-silhouettes.png" 
          alt=""
          className="absolute top-[25%] right-[20%] w-8 h-8 opacity-15 animate-float-slow"
          style={{ animationDelay: '2s' }}
        />
        <img 
          src="/__mockup/images/pin-silhouettes.png" 
          alt=""
          className="absolute top-[45%] left-[10%] w-10 h-10 opacity-25 animate-float-slow"
          style={{ animationDelay: '4s' }}
        />
        <img 
          src="/__mockup/images/pin-silhouettes.png" 
          alt=""
          className="absolute top-[60%] right-[15%] w-14 h-14 opacity-10 animate-float-slow"
          style={{ animationDelay: '1s' }}
        />
        <img 
          src="/__mockup/images/pin-silhouettes.png" 
          alt=""
          className="absolute top-[75%] left-[25%] w-9 h-9 opacity-20 animate-float-slow"
          style={{ animationDelay: '3s' }}
        />
        <img 
          src="/__mockup/images/pin-silhouettes.png" 
          alt=""
          className="absolute top-[35%] right-[30%] w-11 h-11 opacity-15 animate-float-slow"
          style={{ animationDelay: '5s' }}
        />
      </div>

      {/* Glow orbs for depth */}
      <div className="absolute top-[20%] left-[10%] w-64 h-64 bg-[#6366f1]/20 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: '0s' }} />
      <div className="absolute bottom-[15%] right-[15%] w-80 h-80 bg-[#f59e0b]/15 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: '2s' }} />

      {/* Login form container */}
      <div className="relative z-10 w-full max-w-sm px-8 animate-fade-in-up">
        {/* Branding */}
        <div className="text-center mb-12">
          <h1 className="font-display text-5xl font-bold text-white mb-2 tracking-tight">
            PinHunt
          </h1>
          <p className="text-[#f5d5b8] font-medium text-sm tracking-wide">
            UK Collectors Community
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email field */}
          <div>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) validateEmail(e.target.value);
              }}
              onBlur={() => validateEmail(email)}
              className={cn(
                "w-full px-5 py-4 rounded-2xl bg-white/10 backdrop-blur-md border-2 transition-all duration-300",
                "text-white placeholder:text-white/50 font-medium",
                "focus:outline-none focus:bg-white/15 focus:border-[#60efff] focus:shadow-[0_0_20px_rgba(96,239,255,0.3)]",
                emailError ? "border-red-400 bg-red-500/10" : "border-white/20"
              )}
            />
            {emailError && (
              <p className="text-red-300 text-sm mt-2 ml-1 animate-shake font-medium">
                {emailError}
              </p>
            )}
          </div>

          {/* Password field */}
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) validatePassword(e.target.value);
              }}
              onBlur={() => validatePassword(password)}
              className={cn(
                "w-full px-5 py-4 rounded-2xl bg-white/10 backdrop-blur-md border-2 transition-all duration-300",
                "text-white placeholder:text-white/50 font-medium",
                "focus:outline-none focus:bg-white/15 focus:border-[#60efff] focus:shadow-[0_0_20px_rgba(96,239,255,0.3)]",
                passwordError ? "border-red-400 bg-red-500/10" : "border-white/20"
              )}
            />
            {passwordError && (
              <p className="text-red-300 text-sm mt-2 ml-1 animate-shake font-medium">
                {passwordError}
              </p>
            )}
          </div>

          {/* Sign in button */}
          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              "w-full py-4 rounded-2xl font-bold text-[#2d1b4e] text-lg transition-all duration-300",
              "bg-gradient-to-r from-[#60efff] to-[#7c3aed] shadow-[0_0_30px_rgba(96,239,255,0.4)]",
              "hover:shadow-[0_0_40px_rgba(96,239,255,0.6)] hover:scale-[1.02]",
              "active:scale-[0.98]",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
            )}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-3 border-[#2d1b4e]/30 border-t-[#2d1b4e] rounded-full animate-spin" />
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {/* Create account link */}
        <div className="text-center mt-8">
          <button
            type="button"
            className="text-[#f5d5b8] font-medium hover:text-[#60efff] transition-colors duration-300"
          >
            Create an account
          </button>
        </div>
      </div>
    </div>
  );
}
