import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();

  return (
    // Keyed wrapper triggers a fresh CSS animation on navigation without introducing a blank delay.
    <div key={location.pathname} className="animate-in will-change-transform">
      {children}
    </div>
  );
}
