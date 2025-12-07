import Link from 'next/link';
import { SignInButton, SignUpButton, SignedIn, SignedOut } from '@clerk/nextjs';
import GlobalGradient from '@/components/GlobalGradient';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import CTA from '@/components/CTA';
import Features from '@/components/Features';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0b0b0b]">
      <Header />
      <div className="relative">
        <GlobalGradient />
        <Hero />
        <Features />
        <CTA />
      </div>
    </div>
  );
}
