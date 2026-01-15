import fs from "fs";
import path from "path";
import Link from "next/link";

export default function InfoPage() {
    const htmlPath = path.join(process.cwd(), "content", "info.html");
    const html = fs.readFileSync(htmlPath, "utf8");

    return (
        <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
                <Link
                    href="/"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid rgba(0,0,0,0.2)",
                        textDecoration: "none",
                        fontWeight: 600,
                    }}
                >
                    ← Înapoi la Home
                </Link>
            </div>
            <div className="doc" dangerouslySetInnerHTML={{ __html: html }} />

            <style>{`
        .doc h1 { font-size: 28px; font-weight: 800; }
        .doc h2 { font-size: 20px; font-weight: 800; margin-top: 18px; }
        .doc p { line-height: 1.7; margin: 10px 0; }
        .doc ul, .doc ol { margin-left: 22px; }
      `}</style>
        </main>
    );
}