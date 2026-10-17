'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Navbar.module.css';

export function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Trang chủ' },
    { href: '/import', label: 'Nhập liệu (Import)' },
    { href: '/vocab', label: 'Từ vựng' },
    { href: '/mistakes', label: 'Sổ tay lỗi' },
    { href: '/review', label: 'Ôn tập SRS' },
    { href: '/dashboard', label: 'Thống kê' },
  ];

  return (
    <header className={styles.navbar}>
      <Link href="/" className={styles.brand}>
        Learn Language App
        <span className={styles.badge}>IELTS 6.5</span>
      </Link>
      <nav className={styles.navLinks}>
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
