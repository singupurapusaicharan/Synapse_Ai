import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  hue: number;
  connections: number[];
}

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Performance: respect reduced motion and dial down work on low-power devices.
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const cores = (navigator as unknown as { hardwareConcurrency?: number }).hardwareConcurrency ?? 4;
    const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
    const isSmallScreen = window.innerWidth < 768;
    const isLowPowerDevice = isSmallScreen || cores <= 4 || deviceMemory <= 4;

    const quality: 'off' | 'low' | 'high' = prefersReducedMotion ? 'off' : isLowPowerDevice ? 'low' : 'high';

    if (quality === 'off') {
      // Leave the base background; skip the canvas animation entirely.
      return;
    }

    // Throttle rendering to reduce CPU/GPU usage (keeps UI responsive).
    const targetFps = quality === 'low' ? 24 : 30;
    const minFrameMs = 1000 / targetFps;
    let lastFrameTs = 0;

    const maxDpr = quality === 'low' ? 1 : 1.5;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

    const resizeCanvas = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      // Keep drawing coordinates in CSS pixels.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize particles - flowing geometric shapes
    const particleCount =
      quality === 'low'
        ? Math.min(32, Math.floor(window.innerWidth / 40))
        : Math.min(60, Math.floor(window.innerWidth / 25));
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.3 + 0.1,
      hue: Math.random() * 40 + 180, // Cyan to teal range
      connections: [],
    }));

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove);

    let time = 0;

    const maxConnectDist = quality === 'low' ? 110 : 150;
    const maxConnectDistSq = maxConnectDist * maxConnectDist;
    const waveCount = quality === 'low' ? 1 : 3;
    const waveStepX = quality === 'low' ? 14 : 10;

    const animate = (ts: number) => {
      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      if (ts - lastFrameTs < minFrameMs) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      lastFrameTs = ts;

      time += 0.002;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const particles = particlesRef.current;

      // Update and draw particles
      particles.forEach((particle, i) => {
        // Gentle floating motion with sine waves
        particle.x += particle.vx + Math.sin(time + i * 0.5) * 0.2;
        particle.y += particle.vy + Math.cos(time + i * 0.3) * 0.15;

        // Mouse interaction - subtle attraction
        const dx = mouseRef.current.x - particle.x;
        const dy = mouseRef.current.y - particle.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);
        if (dist < 200 && dist > 0) {
          const force = (200 - dist) / 200 * 0.02;
          particle.vx += (dx / dist) * force;
          particle.vy += (dy / dist) * force;
        }

        // Damping
        particle.vx *= 0.99;
        particle.vy *= 0.99;

        // Wrap around edges
        if (particle.x < -50) particle.x = canvas.width + 50;
        if (particle.x > canvas.width + 50) particle.x = -50;
        if (particle.y < -50) particle.y = canvas.height + 50;
        if (particle.y > canvas.height + 50) particle.y = -50;

        // Draw particle with glow
        const gradient = ctx.createRadialGradient(
          particle.x, particle.y, 0,
          particle.x, particle.y, particle.size * 4
        );
        gradient.addColorStop(0, `hsla(${particle.hue}, 80%, 60%, ${particle.opacity})`);
        gradient.addColorStop(0.5, `hsla(${particle.hue}, 80%, 60%, ${particle.opacity * 0.3})`);
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Core particle
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${particle.hue}, 90%, 70%, ${particle.opacity * 2})`;
        ctx.fill();
      });

      // Draw flowing connections
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        // In low quality mode, cap comparisons per particle to avoid O(n^2) work.
        const jMax = quality === 'low' ? Math.min(particles.length, i + 12) : particles.length;
        for (let j = i + 1; j < jMax; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distSq = dx * dx + dy * dy;

          if (distSq < maxConnectDistSq) {
            const dist = Math.sqrt(distSq);
            const opacity = (1 - dist / maxConnectDist) * 0.15;
            
            // Gradient line
            const gradient = ctx.createLinearGradient(
              particles[i].x, particles[i].y,
              particles[j].x, particles[j].y
            );
            gradient.addColorStop(0, `hsla(${particles[i].hue}, 70%, 60%, ${opacity})`);
            gradient.addColorStop(1, `hsla(${particles[j].hue}, 70%, 60%, ${opacity})`);

            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            
            // Curved connection
            const midX = (particles[i].x + particles[j].x) / 2;
            const midY = (particles[i].y + particles[j].y) / 2 + Math.sin(time * 2 + i) * 10;
            ctx.quadraticCurveTo(midX, midY, particles[j].x, particles[j].y);
            
            ctx.strokeStyle = gradient;
            ctx.stroke();
          }
        }
      }

      // Draw flowing aurora waves
      for (let w = 0; w < waveCount; w++) {
        ctx.beginPath();
        ctx.moveTo(0, window.innerHeight);

        for (let x = 0; x <= window.innerWidth; x += waveStepX) {
          const y = window.innerHeight - 100 + 
            Math.sin(x * 0.003 + time * 2 + w * 2) * 50 +
            Math.sin(x * 0.007 + time * 1.5 + w) * 30 +
            Math.cos(x * 0.002 + time + w * 0.5) * 40;
          ctx.lineTo(x, y);
        }

        ctx.lineTo(window.innerWidth, window.innerHeight);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, window.innerHeight - 200, 0, window.innerHeight);
        const hue = 180 + w * 20; // Cyan to teal
        gradient.addColorStop(0, `hsla(${hue}, 70%, 50%, ${0.02 - w * 0.005})`);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <>
      {/* Base dark background */}
      <div 
        className="fixed inset-0 z-[-2]" 
        style={{ background: 'hsl(220 20% 6%)' }} 
      />
      {/* Canvas animation */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-[-1]"
        style={{ opacity: 0.8 }}
      />
    </>
  );
}
