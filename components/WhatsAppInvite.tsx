export default function WhatsAppInvite() {
    const inviteLink = "https://chat.whatsapp.com/IZMFjT03IebKgDblwSNb9Y";

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
        inviteLink
    )}`;

    return (
        <div
            style={{
                marginTop: 40,
                padding: 20,
                border: "1px dashed #444",
                borderRadius: 16,
                textAlign: "center",
                maxWidth: 420,
                marginLeft: "auto",
                marginRight: "auto",
            }}
        >
            <h3 style={{ marginTop: 0 }}>💬 Intră în grupul WhatsApp</h3>

            <p style={{ opacity: 0.85 }}>
                Anunțuri despre turnee, organizare rapidă, rezultate și discuții.
            </p>

            <img
                src={qrUrl}
                alt="QR WhatsApp Group"
                style={{ margin: "12px auto", display: "block" }}
            />

            <a
                href={inviteLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    display: "inline-block",
                    marginTop: 10,
                    padding: "8px 14px",
                    borderRadius: 10,
                    border: "1px solid #25D366",
                    color: "#25D366",
                    fontWeight: 800,
                    textDecoration: "none",
                }}
            >
                👉 Intră direct în grup
            </a>
        </div>
    );
}
