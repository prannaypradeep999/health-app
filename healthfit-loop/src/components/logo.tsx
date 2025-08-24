import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  variant?: 'icon' | 'text-gradient' | 'text-black' | 'full';
  className?: string;
  width?: number;
  height?: number;
  href?: string;
}

export default function Logo({ 
  variant = 'full', 
  className = '', 
  width,
  height,
  href = '/'
}: LogoProps) {
  const logoConfig = {
    'icon': {
      src: '/fytr-icon.svg',
      defaultWidth: 40,
      defaultHeight: 40,
      alt: 'FYTR AI Icon'
    },
    'text-gradient': {
      src: '/fytr-text-gradient.svg',
      defaultWidth: 120,
      defaultHeight: 36,
      alt: 'FYTR AI'
    },
    'text-black': {
      src: '/fytr-text-black.svg',
      defaultWidth: 120,
      defaultHeight: 36,
      alt: 'FYTR AI'
    },
    'full': {
      src: '/fytr-full-logo.svg',
      defaultWidth: 180,
      defaultHeight: 45,
      alt: 'FYTR AI - Health & Fitness Loop'
    }
  } as const;

  const config = logoConfig[variant];
  const logoWidth = width || config.defaultWidth;
  const logoHeight = height || config.defaultHeight;

  const logoImage = (
    <Image
      src={config.src}
      alt={config.alt}
      width={logoWidth}
      height={logoHeight}
      className={`${className}`}
      priority
    />
  );

  if (href) {
    return (
      <Link href={href} className="inline-block">
        {logoImage}
      </Link>
    );
  }

  return logoImage;
}