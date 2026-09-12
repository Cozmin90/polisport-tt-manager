import Link from "next/link";
import styles from "./regulation.module.css";

const pdf = "/regulament/Regulament_tenis_de_masa_11-09-2026.pdf";

export default function InfoPage() {
    return (
        <main className={styles.page}>
            <Link href="/" className={styles.back}>← Înapoi acasă</Link>
            <header className={styles.header}>
                <div>
                    <p className={styles.eyebrow}>POLISPORT TABLE TENNIS</p>
                    <h1 className={styles.title}>Regulamentul competițiilor</h1>
                    <p className={styles.description}>Tot ce trebuie să știi despre participare și desfășurarea competițiilor, într-un singur document.</p>
                    <p className={styles.meta}>Ediția din 11 septembrie 2026 <span aria-hidden="true">·</span> 16 pagini <span aria-hidden="true">·</span> PDF</p>
                </div>
                <div className={styles.actions}>
                    <a href={pdf} target="_blank" rel="noopener noreferrer" className={styles.primary}>Deschide regulamentul ↗<span className={styles.srOnly}> (filă nouă)</span></a>
                    <a href={pdf} download className={styles.secondary}>Descarcă PDF-ul ↓</a>
                </div>
            </header>
            <section className={styles.viewer} aria-label="Regulamentul actualizat în format PDF">
                <div className={styles.viewerBar}><strong>Regulament PoliSport Table Tennis</strong><span>11.09.2026</span></div>
                <object data={`${pdf}#view=FitH`} type="application/pdf" className={styles.document} aria-label="Document PDF: regulamentul competițiilor PoliSport Table Tennis">
                    <p className={styles.fallback}>Browserul nu poate afișa PDF-ul aici. <a href={pdf} target="_blank" rel="noopener noreferrer">Deschide regulamentul într-o filă nouă</a> sau folosește butonul de descărcare.</p>
                </object>
                <div className={styles.mobile}>
                    <span className={styles.pdfIcon} aria-hidden="true">PDF</span>
                    <h2>Regulamentul, la îndemână</h2>
                    <p>Pe telefon, deschide documentul pe tot ecranul pentru a mări textul și a parcurge paginile mai ușor.</p>
                    <a href={pdf} target="_blank" rel="noopener noreferrer" className={styles.primary}>Citește regulamentul ↗<span className={styles.srOnly}> (filă nouă)</span></a>
                </div>
            </section>
        </main>
    );
}
