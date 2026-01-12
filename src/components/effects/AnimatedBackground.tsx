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

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize particles - flowing geometric shapes
    const particleCount = Math.min(60, Math.floor(window.innerWidth / 25));
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

    const animate = () => {
      time += 0.002;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;

      // Update and draw particles
      particles.forEach((particle, i) => {
        // Gentle floating motion with sine waves
        particle.x += particle.vx + Math.sin(time + i * 0.5) * 0.2;
        particle.y += particle.vy + Math.cos(time + i * 0.3) * 0.15;

        // Mouse interaction - subtle attraction
        const dx = mouseRef.current.x - particle.x;
        const dy = mouseRef.current.y - particle.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
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
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 150) {
            const opacity = (1 - dist / 150) * 0.15;
            
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
      const waveCount = 3;
      for (let w = 0; w < waveCount; w++) {
        ctx.beginPath();
        ctx.moveTo(0, canvas.height);

        for (let x = 0; x <= canvas.width; x += 10) {
          const y = canvas.height - 100 + 
            Math.sin(x * 0.003 + time * 2 + w * 2) * 50 +
            Math.sin(x * 0.007 + time * 1.5 + w) * 30 +
            Math.cos(x * 0.002 + time + w * 0.5) * 40;
          ctx.lineTo(x, y);
        }

        ctx.lineTo(canvas.width, canvas.height);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, canvas.height - 200, 0, canvas.height);
        const hue = 180 + w * 20; // Cyan to teal
        gradient.addColorStop(0, `hsla(${hue}, 70%, 50%, ${0.02 - w * 0.005})`);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

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
