import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Spotlight() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    } else if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      hasError = true;
    }

    if (!hasError) {
      setIsSubmitting(true);
      setTimeout(() => {
        setIsSubmitting(false);
      }, 2000);
    }
  };

  return (
    <div className="h-screen w-full bg-vault text-vault-foreground overflow-hidden relative flex flex-col items-center justify-center">
      {/* Atmospheric background */}
      <div className="absolute inset-0 bg-gradient-radial from-vault-glow/5 via-transparent to-transparent" />
      <div className="absolute inset-0 noise" />

      {/* Hero pin image */}
      <div className="relative z-10 mb-6 glint-container">
        <div className="relative w-36 h-36">
          <img
            src="/__mockup/images/hero-pin.jpg"
            alt=""
            className="w-full h-full object-cover rounded-full shadow-pin"
          />
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-accent/20 via-transparent to-transparent glint" />
        </div>
      </div>

      {/* Login form */}
      <div className="relative z-10 w-full max-w-sm px-8">
        <div className="text-center mb-10 fade-in">
          <h1 className="font-display text-5xl tracking-tight text-accent mb-2 drop-shadow-glow">
            PinHunt
          </h1>
          <p className="text-sm text-vault-muted tracking-wide uppercase">
            UK Collectors
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 fade-in-delay">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-vault-foreground/80">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError("");
              }}
              className={`bg-vault-input border-vault-border text-vault-foreground placeholder:text-vault-muted focus:border-accent focus:ring-accent/20 transition-all duration-300 ${
                emailError ? "border-error focus:border-error focus:ring-error/20" : ""
              }`}
              placeholder="collector@example.com"
              autoComplete="email"
            />
            {emailError && (
              <p className="text-xs text-error mt-1.5 animate-shake">{emailError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-vault-foreground/80">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError("");
              }}
              className={`bg-vault-input border-vault-border text-vault-foreground placeholder:text-vault-muted focus:border-accent focus:ring-accent/20 transition-all duration-300 ${
                passwordError ? "border-error focus:border-error focus:ring-error/20" : ""
              }`}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
            {passwordError && (
              <p className="text-xs text-error mt-1.5 animate-shake">{passwordError}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-accent hover:bg-accent-hover text-accent-foreground font-medium py-6 text-base shadow-accent-glow transition-all duration-300 hover:shadow-accent-glow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="loading-dot" />
                <span className="loading-dot animation-delay-200" />
                <span className="loading-dot animation-delay-400" />
              </span>
            ) : (
              "Sign In"
            )}
          </Button>

          <div className="text-center pt-4">
            <button
              type="button"
              className="text-sm text-vault-muted hover:text-accent transition-colors duration-300 underline-offset-4 hover:underline"
              onClick={() => {}}
            >
              Create an account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
