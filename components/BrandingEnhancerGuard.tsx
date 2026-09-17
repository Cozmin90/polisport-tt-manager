"use client";

import { usePathname } from "next/navigation";
import BrandingEnhancer from "./BrandingEnhancer";

export default function BrandingEnhancerGuard() {
  const pathname = usePathname();

  if (pathname === "/admin/tournaments/new") {
    return (
      <button
        type="button"
        onClick={() => alert("Salvează mai întâi turneul. După creare, deschide pagina turneului și vei putea asocia sponsorii.")}
        className="fixed bottom-5 right-5 z-[80] rounded-full px-4 py-3 font-extrabold shadow-lg"
        style={{ background: "var(--ps-primary)", color: "white" }}
        title="Sponsorii pot fi asociați după ce turneul primește un ID valid"
      >
        Sponsorii turneului
      </button>
    );
  }

  return <BrandingEnhancer />;
}
