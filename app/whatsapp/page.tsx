"use client";

import Link from "next/link";

export default function WhatsAppPage() {
    const inviteLink = "https://chat.whatsapp.com/LWamu3NBeTyE4etl5i2HGv";

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
        inviteLink
    )}`;

    return (
        <div
            style={{
                maxWidth: 520,
                margin: "40px auto",
                padding: 20,
                textAlign: "center",
            }}
        >
            <p style={{ opacity: 0.85, color: "#f5d000" }}>Comunitatea oficială PoliSport TT.</p>

            <ul
                style={{
                    opacity: 0.85,
                    listStylePosition: "inside",
                    padding: 0,
                    margin: "0 auto 20px auto",
                    display: "inline-block",
                    textAlign: "center",
                }}
            >
                <li>Anunțuri despre turnee, organizare evenimente, </li>
                <li>rezultate, clasamente  și discuții cu alți jucători</li>
            </ul>


            <img
                src={qrUrl}
                alt="QR WhatsApp Group"
                style={{ display: "block", margin: "20px auto" }}
            />

            <a
                href={inviteLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    display: "inline-block",
                    padding: "12px 22px",
                    borderRadius: 14,
                    border: "2px solid #25D366",
                    color: "#25D366",
                    fontWeight: 900,
                    textDecoration: "none",
                    transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(37, 211, 102, 0.12)";
                    e.currentTarget.style.boxShadow =
                        "0 0 0 4px rgba(37, 211, 102, 0.15)";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.boxShadow = "none";
                }}
            >
                👉 Intră direct pe grup
            </a>

            <div style={{ marginTop: 25 }}>
                <Link
                    href="/"
                    style={{
                        fontSize: 14,
                        opacity: 0.8,
                        textDecoration: "none",
                    }}
                >
                    ← Înapoi la pagina principală
                </Link>
            </div>
        </div>
    );
}
