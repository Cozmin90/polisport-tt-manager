"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function PromoLayoutFix() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;

    const sync = () => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".ps-card"));
      const card = cards.find((el) => el.textContent?.includes("CONTRIBUIE ȘI TU"));
      if (!card) return;

      const children = Array.from(card.children) as HTMLElement[];
      const hasPromo = children.length >= 3;
      card.classList.toggle("ps-promo-active", hasPromo);
    };

    const timer = window.setTimeout(sync, 200);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      document.querySelectorAll(".ps-promo-active").forEach((el) => el.classList.remove("ps-promo-active"));
    };
  }, [pathname]);

  return (
    <style jsx global>{`
      .ps-card.ps-promo-active {
        display: flex;
        flex-direction: column;
      }

      .ps-card.ps-promo-active > :first-child {
        display: none !important;
      }

      .ps-card.ps-promo-active > :nth-child(2) {
        order: 2;
        margin-top: 1.25rem;
      }

      .ps-card.ps-promo-active > :last-child {
        order: 1;
        padding: 0 !important;
        min-height: 0 !important;
      }

      .ps-card.ps-promo-active > :last-child > div {
        align-items: center;
        gap: 1.75rem;
      }

      .ps-card.ps-promo-active > :last-child img {
        max-height: 180px !important;
        max-width: 240px !important;
      }

      @media (max-width: 639px) {
        .ps-card.ps-promo-active > :nth-child(2) {
          gap: 0.5rem;
        }

        .ps-card.ps-promo-active > :nth-child(2) > div {
          padding: 0.65rem 0.35rem;
        }

        .ps-card.ps-promo-active > :last-child img {
          max-height: 150px !important;
          max-width: 210px !important;
        }
      }
    `}</style>
  );
}
