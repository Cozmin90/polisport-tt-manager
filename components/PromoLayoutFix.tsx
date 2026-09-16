"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function PromoLayoutFix() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;

    const sync = () => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".ps-card"));

      // The contribution card is the only homepage card that contains the three
      // public statistics. Detect it from those stable labels instead of from
      // the contribution heading, because that heading is hidden while promo is active.
      const card = cards.find((el) =>
        el.textContent?.includes("TURNEE ORGANIZATE") &&
        el.textContent?.includes("JUCĂTORI ÎN APLICAȚIE") &&
        el.textContent?.includes("ZILE DE FUNCȚIONARE")
      );
      if (!card) return;

      const children = Array.from(card.children) as HTMLElement[];
      // Normal card = contribution block + stats block (2 children).
      // Active promo portal adds a third child.
      const hasPromo = children.length >= 3;
      card.classList.toggle("ps-promo-active", hasPromo);
    };

    const timer = window.setTimeout(sync, 100);
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
        display: flex !important;
        flex-direction: column !important;
      }

      /* Hide only the original donation/IBAN/QR block. */
      .ps-card.ps-promo-active > :first-child {
        display: none !important;
      }

      /* Keep the original live statistics visible at the bottom. */
      .ps-card.ps-promo-active > :nth-child(2) {
        display: grid !important;
        order: 2 !important;
        margin-top: 1.25rem !important;
      }

      /* The portal content is the third/last child and becomes the promo header. */
      .ps-card.ps-promo-active > :nth-child(n+3) {
        order: 1 !important;
        padding: 0 !important;
        min-height: 0 !important;
      }

      .ps-card.ps-promo-active > :nth-child(n+3) > div {
        align-items: center;
        gap: 1.75rem;
      }

      .ps-card.ps-promo-active > :nth-child(n+3) img {
        max-height: 180px !important;
        max-width: 240px !important;
      }

      @media (max-width: 639px) {
        .ps-card.ps-promo-active > :nth-child(2) {
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          gap: 0.5rem !important;
        }

        .ps-card.ps-promo-active > :nth-child(2) > div {
          padding: 0.65rem 0.35rem !important;
        }

        .ps-card.ps-promo-active > :nth-child(n+3) img {
          max-height: 150px !important;
          max-width: 210px !important;
        }
      }
    `}</style>
  );
}
