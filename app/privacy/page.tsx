import Link from "next/link";

export default function PrivacyPage() {
    const heading = { fontSize: 21, fontWeight: 700, marginTop: 28, marginBottom: 12 };
    return <main style={{ maxWidth: 800, margin: "0 auto", padding: 24, lineHeight: 1.75 }}>
        <Link href="/account" style={{ textDecoration: "underline" }}>← Contul meu</Link>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 20 }}>Cum folosim datele și imaginile tale</h1>
        <p style={{ marginTop: 12 }}>În cont ai două bife cu roluri diferite: prima confirmă că ai citit cum folosim datele tale cu caracter personal; a doua arată dacă ești de acord cu fotografierea, filmarea și publicarea imaginilor de la competiții.</p>
        <h2 style={heading}>1. Datele tale cu caracter personal</h2>
        <p>Folosim numele, adresa de e-mail și informațiile din profil pentru a-ți crea contul și a gestiona participarea la competiții. Rezultatele sportive sunt folosite pentru clasamente.</p>
        <p style={{ marginTop: 12 }}>Profilul sportiv, rezultatele și clasamentele pot fi văzute pe site. Opțiunea ta foto-video nu este afișată în profilul public.</p>
        <p style={{ marginTop: 12 }}>Prima bifă înseamnă „Am citit aceste informații”. După confirmare, rămâne bifată. Nu este un acord pentru orice folosire a datelor tale.</p>
        <p style={{ marginTop: 12 }}>Dacă vrei să afli ce date avem despre tine, să corectezi o informație sau să ceri ștergerea unor date, contactează organizatorul. Acesta îți va explica ce poate modifica sau șterge și dacă există date care trebuie păstrate pentru evidența competițiilor.</p>
        <h2 style={heading}>2. Fotografiile și filmările de la competiții</h2>
        <p>De regulă, fotografiem și filmăm competițiile și festivitățile de premiere. Folosim aceste materiale pentru a promova sportul, fair-play-ul, comunitatea universitară și activitățile PoliSport Table Tennis, POLITEHNICII București și Clubului Sportiv Știința București.</p>
        <p style={{ marginTop: 12 }}>Dacă bifezi acordul foto-video, ești de acord să apari în aceste fotografii și filmări și să le publicăm pe paginile și canalele oficiale ale organizațiilor menționate.</p>
        <p style={{ marginTop: 12 }}><strong>Tu alegi dacă îți dai acordul. Poți crea un cont și participa la competiții și fără această bifă.</strong></p>
        <h2 style={heading}>Dacă te răzgândești</h2>
        <p>Debifează acordul foto-video din Contul meu. După salvare, organizatorul vede că nu mai ai un acord activ. Contul și participarea ta la competiții rămân disponibile.</p>
        <p style={{ marginTop: 12 }}>La următoarea competiție, te rugăm să îi spui și organizatorului la sosire, ca să poată anunța echipa foto-video. Retragerea este deja salvată în platformă; nu trebuie să aștepți confirmarea lui.</p>
        <p style={{ marginTop: 12 }}>Din acel moment, nu mai folosim acordul retras pentru fotografii, filmări sau publicări noi. Materialele deja publicate nu dispar automat. Dacă dorești eliminarea unui material în care apari, contactează organizatorul.</p>
        <p style={{ marginTop: 12 }}>Debifarea acordului foto-video nu este o cerere de ștergere a contului sau a rezultatelor sportive. Pentru acestea, trimite o solicitare separată organizatorului.</p>
        <h2 style={heading}>Ce păstrăm despre alegerea ta</h2>
        <p>Păstrăm doar opțiunea actuală pentru fiecare bifă și data ultimei modificări, împreună cu versiunea explicațiilor la care se referă. Nu păstrăm lista bifărilor și debifărilor anterioare. Aceste informații sunt vizibile doar pentru tine și administratorii autorizați.</p>
        <p style={{ marginTop: 12 }}>Pentru participanții minori, organizatorul discută în prealabil cu reprezentantul legal despre fotografii și filmări, inclusiv despre acordul necesar.</p>
        <p style={{ marginTop: 24 }}>Pentru întrebări sau solicitări, folosește datele de contact ale organizatorului anunțate pentru competiție. Vezi și <Link href="/info" style={{ textDecoration: "underline" }}>regulamentul</Link>.</p>
    </main>;
}
