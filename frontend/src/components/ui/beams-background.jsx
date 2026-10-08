import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

function createBeam(width, height) {
  const angle = -35 + Math.random() * 10;
  return {
    x: Math.random() * width * 1.5 - width * 0.25,
    y: Math.random() * height * 1.5 - height * 0.25,
    width: 30 + Math.random() * 60,
    length: height * 2.5,
    angle,
    speed: 0.6 + Math.random() * 1.2,
    opacity: 0.08 + Math.random() * 0.12,
    hue: Math.random() > 0.7 ? 348 + Math.random() * 12 : 4 + Math.random() * 10,
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.02 + Math.random() * 0.03,
  };
}

export function BeamsBackground({ className, children }) {
  const canvasRef = useRef(null);
  const beamsRef = useRef([]);
  const animationFrameRef = useRef(0);
  const MINIMUM_BEAMS = 20;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Fix 1: respect prefers-reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const updateCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);

      // Fix 2: fewer beams on mobile
      const isMobile = window.innerWidth < 768;
      const totalBeams = MINIMUM_BEAMS * (isMobile ? 1 : 1.5);
      beamsRef.current = Array.from({ length: totalBeams }, () =>
        createBeam(canvas.width, canvas.height)
      );
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);

    function resetBeam(beam, index, totalBeams) {
      if (!canvas) return beam;
      const column = index % 3;
      const spacing = canvas.width / 3;
      beam.y = canvas.height + 100;
      beam.x =
        column * spacing +
        spacing / 2 +
        (Math.random() - 0.5) * spacing * 0.5;
      beam.width = 100 + Math.random() * 100;
      beam.speed = 0.5 + Math.random() * 0.4;
      beam.hue = 4 + (index * 10) / totalBeams;
      beam.opacity = 0.08 + Math.random() * 0.1;
      return beam;
    }

    function drawBeam(ctx, beam) {
      ctx.save();
      ctx.translate(beam.x, beam.y);
      ctx.rotate((beam.angle * Math.PI) / 180);

      const pulsingOpacity = beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.2);

      const gradient = ctx.createLinearGradient(0, 0, 0, beam.length);
      gradient.addColorStop(0, `hsla(${beam.hue}, 80%, 52%, 0)`);
      gradient.addColorStop(0.1, `hsla(${beam.hue}, 80%, 52%, ${pulsingOpacity * 0.5})`);
      gradient.addColorStop(0.4, `hsla(${beam.hue}, 80%, 52%, ${pulsingOpacity})`);
      gradient.addColorStop(0.6, `hsla(${beam.hue}, 80%, 52%, ${pulsingOpacity})`);
      gradient.addColorStop(0.9, `hsla(${beam.hue}, 80%, 52%, ${pulsingOpacity * 0.5})`);
      gradient.addColorStop(1, `hsla(${beam.hue}, 80%, 52%, 0)`);

      ctx.fillStyle = gradient;
      ctx.fillRect(-beam.width / 2, 0, beam.width, beam.length);
      ctx.restore();
    }

    function animate() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.filter = "blur(35px)";

      const totalBeams = beamsRef.current.length;
      beamsRef.current.forEach((beam, index) => {
        beam.y -= beam.speed;
        beam.pulse += beam.pulseSpeed;
        if (beam.y + beam.length < -100) {
          resetBeam(beam, index, totalBeams);
        }
        drawBeam(ctx, beam);
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      window.removeEventListener("resize", updateCanvasSize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        "relative min-h-screen w-full overflow-hidden bg-[#0a0a0a]",
        className
      )}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ filter: "blur(15px)" }}
      />

      {/* Fix 3: red-tinted ambient glow, no off-brand teal */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(217,45,32,0.12)_0%,transparent_70%)] blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(185,28,28,0.08)_0%,transparent_60%)] blur-[80px]" />
      </div>

      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
}
