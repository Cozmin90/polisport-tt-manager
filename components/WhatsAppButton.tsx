import Link from "next/link";

export default function WhatsAppButton() {
    return (
        <div style={{ textAlign: "center", marginTop: 30 }}>
            <Link
                href="/whatsapp"
                style={{
                    display: "inline-block",
                    padding: "10px 18px",
                    borderRadius: 12,
                    border: "1px solid #25D366",
                    color: "#25D366",
                    fontWeight: 900,
                    textDecoration: "none",
                }}
            >
                💬 Intră pe grupul de WhatsApp
            </Link>
        </div>
    );
}