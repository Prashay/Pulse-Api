import { useEffect, useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const GREETINGS = ["hello", "bonjour", "hola", "ciao", "pulse"];

export function AppleWelcomeModal({ isOpen, onClose }: Props) {
  const [stage, setStage] = useState<"hello" | "card">("hello");
  const [greetingIdx, setGreetingIdx] = useState(0);
  const [closing, setClosing] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(() => {
    return localStorage.getItem("pulse_skip_welcome") === "true";
  });

  // Cycle greetings during hello stage
  useEffect(() => {
    if (!isOpen) return;
    setStage("hello");
    setClosing(false);
    setGreetingIdx(0);

    const greetingTimer = setInterval(() => {
      setGreetingIdx((prev) => (prev + 1) % GREETINGS.length);
    }, 450);

    // After 1.7s, transition smoothly from hello to the iOS feature card
    const stageTimer = setTimeout(() => {
      setStage("card");
    }, 1800);

    return () => {
      clearInterval(greetingTimer);
      clearTimeout(stageTimer);
    };
  }, [isOpen]);

  // Handle escape / enter key to close or advance
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismiss();
      } else if (e.key === "Enter" || e.key === " ") {
        if (stage === "hello") {
          setStage("card");
        } else {
          handleDismiss();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, stage]);

  const handleDismiss = () => {
    if (closing) return;
    if (dontShowAgain) {
      localStorage.setItem("pulse_skip_welcome", "true");
    } else {
      localStorage.removeItem("pulse_skip_welcome");
    }
    setClosing(true);
    setTimeout(() => {
      onClose();
      setClosing(false);
      setStage("hello");
    }, 480);
  };

  if (!isOpen) return null;

  return (
    <div
      className={`ios-welcome-overlay ${closing ? "closing" : ""} ${stage}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Pulse API Studio"
    >
      {/* Dynamic ambient iOS background glowing orbs */}
      <div className="ios-aurora">
        <div className="aurora-orb orb-1" />
        <div className="aurora-orb orb-2" />
        <div className="aurora-orb orb-3" />
      </div>

      {/* Top right quick skip button */}
      <button
        className="ios-skip-pill"
        onClick={handleDismiss}
        title="Skip intro (Esc)"
        aria-label="Skip welcome"
      >
        <span>Skip</span>
        <kbd className="ios-kbd">Esc</kbd>
      </button>

      {/* STAGE 1: The Iconic Apple Cursive "hello" screen */}
      {stage === "hello" && (
        <div className="ios-hello-stage" onClick={() => setStage("card")}>
          <div className="ios-hello-wrapper">
            <svg
              className="ios-hello-svg"
              viewBox="0 0 540 220"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="appleHelloGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="45%" stopColor="#93c5fd" />
                  <stop offset="75%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#c084fc" />
                </linearGradient>
                <filter id="helloGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="10" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Handcrafted fluid cursive "hello" stroke path */}
              <path
                className="hello-stroke-path"
                d="M 60 135 C 55 100, 75 40, 95 38 C 115 36, 95 140, 92 155 C 90 165, 100 120, 115 105 C 130 90, 145 95, 142 115 C 138 140, 120 152, 138 155 C 155 158, 172 135, 175 120 C 178 105, 160 102, 155 118 C 148 138, 165 158, 185 155 C 195 152, 205 130, 215 90 C 225 50, 235 32, 240 38 C 245 44, 230 135, 235 155 C 240 162, 255 110, 268 75 C 278 45, 288 35, 292 40 C 295 45, 282 135, 288 155 C 295 160, 310 135, 320 115 C 335 85, 365 92, 365 118 C 365 145, 335 156, 320 135 C 310 120, 325 98, 345 98 C 365 98, 375 118, 370 135 C 365 152, 350 158, 380 155"
                stroke="url(#appleHelloGrad)"
                strokeWidth="11"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#helloGlow)"
              />
            </svg>

            {/* Cycling multi-language greeting ticker */}
            <div className="ios-greeting-sub">
              <span key={greetingIdx} className="ios-greeting-word">
                {GREETINGS[greetingIdx]}
              </span>
            </div>

            <div className="ios-tap-hint">Click or press Space to continue</div>
          </div>
        </div>
      )}

      {/* STAGE 2: Apple iOS Welcome Card & Features */}
      {stage === "card" && (
        <div className="ios-card-stage">
          <div className="ios-modal-card">
            {/* Ambient specular highlight rim */}
            <div className="ios-specular-edge" />

            {/* App Icon with Apple Squircle and Cardiac Pulse Line */}
            <div className="ios-icon-container">
              <div className="ios-sonar-ring ring-1" />
              <div className="ios-sonar-ring ring-2" />
              <div className="ios-app-squircle">
                <div className="squircle-gloss" />
                <svg
                  className="ios-pulse-svg"
                  viewBox="0 0 72 72"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient id="squirclePulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="50%" stopColor="#818cf8" />
                      <stop offset="100%" stopColor="#c084fc" />
                    </linearGradient>
                  </defs>
                  {/* ECG heartbeat waveform */}
                  <path
                    className="ios-ecg-path"
                    d="M 6 36 L 22 36 L 27 24 L 33 48 L 40 14 L 46 54 L 51 36 L 66 36"
                    stroke="url(#squirclePulseGrad)"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Animated leading glow bead along waveform */}
                  <circle className="ios-ecg-dot" r="4" fill="#38bdf8" />
                </svg>
              </div>
            </div>

            {/* Title & Tagline */}
            <div className="ios-header-block">
              <div className="ios-supertitle">Welcome to</div>
              <h1 className="ios-title">
                Pulse <span className="gradient-text">API Studio</span>
              </h1>
              <p className="ios-subtitle">
                High-performance API Client, Universal Collections & Microservices Engine.
              </p>
            </div>

            {/* Feature Highlights (iOS Row Style) */}
            <div className="ios-features-list">
              <div className="ios-feature-row">
                <div className="ios-feature-badge badge-blue">
                  <span>⚡</span>
                </div>
                <div className="ios-feature-text">
                  <div className="ios-feature-title">Lightning API Proxy & Mocks</div>
                  <div className="ios-feature-desc">
                    Instant local loopback, CORS bypass, and offline mock endpoints ready to run.
                  </div>
                </div>
              </div>

              <div className="ios-feature-row">
                <div className="ios-feature-badge badge-purple">
                  <span>📁</span>
                </div>
                <div className="ios-feature-text">
                  <div className="ios-feature-title">Universal Collection Parser</div>
                  <div className="ios-feature-desc">
                    Import Postman collections, README markdown, cURL commands, or Word docs.
                  </div>
                </div>
              </div>

              <div className="ios-feature-row">
                <div className="ios-feature-badge badge-green">
                  <span>🔒</span>
                </div>
                <div className="ios-feature-text">
                  <div className="ios-feature-title">Dynamic Environment Vault</div>
                  <div className="ios-feature-desc">
                    Clean variable substitution <code className="ios-inline-code">{"{{baseUrl}}"}</code>, auth tokens & runner telemetry.
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions & iOS Pill CTA */}
            <div className="ios-footer-block">
              <button className="ios-cta-btn" onClick={handleDismiss} autoFocus>
                <span className="cta-label">Get Started</span>
                <span className="cta-arrow">→</span>
              </button>

              <div className="ios-toggle-row">
                <label className="ios-checkbox-label">
                  <input
                    type="checkbox"
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                  />
                  <span>Don't show this welcome on startup</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
