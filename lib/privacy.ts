export const PRIVACY_VERSION = "2026-09-11.1";
export const NOTICE_LABEL = "Am citit cum sunt folosite datele mele cu caracter personal pentru cont și participarea la competiții.";
export const MEDIA_LABEL = "Sunt de acord să fiu fotografiat(ă) și filmat(ă) la competiții și la festivitățile de premiere, iar materialele să fie publicate pe paginile și canalele oficiale PoliSport Table Tennis, POLITEHNICA București și Clubul Sportiv Știința București, pentru promovarea sportului, a comunității universitare și a activităților acestor organizații.";
export const WITHDRAWAL_MESSAGE = "Consimțământul foto-video a fost retras și modificarea este disponibilă organizatorului în platformă. Poți participa în continuare la competiții. La următoarea participare, te rugăm să îi reamintești organizatorului preferința ta la sosire, pentru a facilita respectarea ei de către echipa foto-video. Retragerea este deja înregistrată și nu depinde de informarea verbală. Pentru materialele deja publicate, poți transmite o solicitare organizatorului.";

export type PrivacyEvent = {
    id: number;
    user_id: string;
    kind: "privacy_notice" | "media";
    accepted: boolean;
    version: string;
    created_at: string;
};

export function latestEvent(events: PrivacyEvent[], kind: PrivacyEvent["kind"]) {
    return events.find((event) => event.kind === kind);
}
