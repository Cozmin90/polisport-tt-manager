import Link from "next/link";
import { MEDIA_LABEL, PRIVACY_VERSION } from "../../lib/privacy";

export default function PrivacyPage() {
    return <main style={{ maxWidth: 850, margin: "0 auto", padding: 24, lineHeight: 1.7 }}>
        <Link href="/account" style={{ textDecoration: "underline" }}>← Contul meu</Link>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 20 }}>Date personale și foto-video</h1>
        <p>Informare privind opțiunile din platforma PoliSport Table Tennis · Versiunea {PRIVACY_VERSION}</p>
        <h2 style={{ fontSize: 21, fontWeight: 700, marginTop: 24 }}>Contul și participarea</h2>
        <p>Platforma utilizează datele contului și ale profilului pentru autentificare, înscrieri, organizarea competițiilor și gestionarea rezultatelor și clasamentelor. Profilul sportiv, rezultatele și clasamentele sunt vizibile pe site. Confirmarea citirii acestei informări nu reprezintă un acord nelimitat pentru utilizarea datelor tale.</p>
        <p>Opțiunea foto-video privește exclusiv utilizările descrise mai jos. Retragerea ei nu șterge automat contul, înscrierile sau rezultatele sportive. Pentru acces, rectificare, ștergere, restricționare sau opoziție privind datele personale, adresează o solicitare organizatorului; cererile se analizează potrivit drepturilor și temeiurilor aplicabile.</p>
        <h2 style={{ fontSize: 21, fontWeight: 700, marginTop: 24 }}>Fotografii și filmări</h2>
        <p>Evenimentele PoliSport Table Tennis sunt, de regulă, fotografiate și filmate pentru promovarea mișcării, a fair-play-ului, a comunității universitare, a POLITEHNICII București și a Clubului Sportiv Știința București.</p>
        <p>Acordul opțional din cont are următorul conținut:</p>
        <blockquote style={{ borderLeft: "3px solid #888", paddingLeft: 16 }}>{MEDIA_LABEL}</blockquote>
        <p>Căsuța nu este bifată în prealabil. Poți refuza sau retrage acordul din cont, fără a pierde dreptul de participare. Retragerea este înregistrată imediat după salvare și este vizibilă administratorilor. La sosirea la competiție, te rugăm să reamintești organizatorului preferința ta, pentru a facilita respectarea ei; această informare verbală nu este o condiție a retragerii.</p>
        <p>Retragerea privește utilizările bazate pe acest consimțământ și nu afectează legalitatea utilizărilor anterioare retragerii. Pentru materiale deja publicate, poți solicita organizatorului analizarea situației. În cazul minorilor, organizatorul stabilește condițiile de informare și acord ale reprezentantului legal; o bifă din cont nu înlocuiește verificările necesare.</p>
        <h2 style={{ fontSize: 21, fontWeight: 700, marginTop: 24 }}>Evidența opțiunilor</h2>
        <p>Platforma păstrează opțiunea, data înregistrării și versiunea textului, pentru evidența acordării sau retragerii. Istoricul poate fi consultat de titularul contului și de administratorii autorizați; nu este afișat în profilul public.</p>
        <p>Pentru solicitări, contactează organizatorul competiției prin canalul de contact anunțat pentru eveniment. Vezi și <Link href="/info" style={{ textDecoration: "underline" }}>regulamentul</Link>.</p>
    </main>;
}
