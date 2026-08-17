"use client";

import { useEffect } from "react";

type PrintableMatch = {
    row: HTMLTableRowElement;
    player1: string;
    player2: string;
    originalIndex: number;
};

function orderMatchesForRest(matches: PrintableMatch[]) {
    const remaining = [...matches];
    const ordered: PrintableMatch[] = [];
    const lastSeen = new Map<string, number>();
    let previousPlayers = new Set<string>();

    while (remaining.length > 0) {
        let bestIndex = 0;
        let bestKey: [number, number, number] | null = null;

        for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i];
            const overlap =
                (previousPlayers.has(candidate.player1) ? 1 : 0) +
                (previousPlayers.has(candidate.player2) ? 1 : 0);
            const mostRecentAppearance = Math.max(
                lastSeen.get(candidate.player1) ?? -1,
                lastSeen.get(candidate.player2) ?? -1
            );
            const key: [number, number, number] = [overlap, mostRecentAppearance, candidate.originalIndex];

            if (
                bestKey === null ||
                key[0] < bestKey[0] ||
                (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
                (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])
            ) {
                bestKey = key;
                bestIndex = i;
            }
        }

        const [chosen] = remaining.splice(bestIndex, 1);
        const position = ordered.length;
        ordered.push(chosen);
        lastSeen.set(chosen.player1, position);
        lastSeen.set(chosen.player2, position);
        previousPlayers = new Set([chosen.player1, chosen.player2]);
    }

    return ordered;
}

function styleCell(cell: HTMLTableCellElement, header = false) {
    cell.style.border = "1px solid #000";
    cell.style.padding = header ? "5px 6px" : "4px 6px";
    cell.style.fontWeight = header ? "800" : "600";
    cell.style.textAlign = "left";
    cell.style.verticalAlign = "middle";
}

function buildParticipantsTable(players: string[]) {
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.fontSize = "11px";
    table.style.marginBottom = "10px";

    const thead = table.createTHead();
    const headerRow = thead.insertRow();

    const noHeader = document.createElement("th");
    noHeader.textContent = "Nr.";
    noHeader.style.width = "48px";
    styleCell(noHeader, true);
    headerRow.appendChild(noHeader);

    const playerHeader = document.createElement("th");
    playerHeader.textContent = "Participant";
    styleCell(playerHeader, true);
    headerRow.appendChild(playerHeader);

    const tbody = table.createTBody();
    players.forEach((player, index) => {
        const row = tbody.insertRow();
        const noCell = row.insertCell();
        noCell.textContent = String(index + 1);
        noCell.style.textAlign = "center";
        styleCell(noCell);

        const playerCell = row.insertCell();
        playerCell.textContent = player;
        styleCell(playerCell);
    });

    return table;
}

function createSectionTitle(text: string, marginTop = 0) {
    const title = document.createElement("div");
    title.textContent = text;
    title.style.fontSize = "12px";
    title.style.fontWeight = "900";
    title.style.marginTop = `${marginTop}px`;
    title.style.marginBottom = "5px";
    return title;
}

function enhanceGroupSheet(sheet: HTMLElement) {
    if (sheet.dataset.groupPrintEnhanced === "1") return;
    if (!(sheet.textContent ?? "").includes("Masa:")) return;

    const matchTable = sheet.querySelector("table");
    if (!(matchTable instanceof HTMLTableElement)) return;

    const tbody = matchTable.tBodies.item(0);
    if (!tbody) return;

    const matches = Array.from(tbody.rows)
        .map((row, originalIndex): PrintableMatch | null => {
            if (row.cells.length < 2) return null;
            const player1 = (row.cells[0].textContent ?? "").trim();
            const player2 = (row.cells[1].textContent ?? "").trim();
            if (!player1 || !player2 || player1 === "—" || player2 === "—") return null;
            return { row, player1, player2, originalIndex };
        })
        .filter((match): match is PrintableMatch => match !== null);

    if (matches.length === 0) return;

    const ordered = orderMatchesForRest(matches);

    ordered.forEach((match, index) => {
        tbody.appendChild(match.row);
        const numberCell = match.row.insertCell(0);
        numberCell.textContent = String(index + 1);
        numberCell.style.width = "42px";
        numberCell.style.textAlign = "center";
        styleCell(numberCell);
    });

    const headerRow = matchTable.tHead?.rows.item(0);
    if (headerRow) {
        const numberHeader = document.createElement("th");
        numberHeader.textContent = "Nr.";
        numberHeader.style.width = "42px";
        numberHeader.style.textAlign = "center";
        styleCell(numberHeader, true);
        headerRow.insertBefore(numberHeader, headerRow.firstChild);
    }

    const participants = Array.from(
        new Set(ordered.flatMap((match) => [match.player1, match.player2]))
    ).sort((a, b) => a.localeCompare(b, "ro"));

    const participantsTitle = createSectionTitle("Participanți în grupă", 4);
    const participantsTable = buildParticipantsTable(participants);
    const matchesTitle = createSectionTitle("Meciuri – ordine recomandată de joc", 8);
    const note = document.createElement("div");
    note.textContent =
        "Ordinea este optimizată pentru a intercala jucătorii și a evita, când este posibil, două meciuri consecutive pentru aceeași persoană.";
    note.style.fontSize = "9px";
    note.style.marginBottom = "5px";
    note.style.color = "#333";

    matchTable.parentNode?.insertBefore(participantsTitle, matchTable);
    matchTable.parentNode?.insertBefore(participantsTable, matchTable);
    matchTable.parentNode?.insertBefore(matchesTitle, matchTable);
    matchTable.parentNode?.insertBefore(note, matchTable);

    sheet.dataset.groupPrintEnhanced = "1";
}

function enhancePrintableGroups() {
    document
        .querySelectorAll<HTMLElement>(".print-only .print-sheet")
        .forEach(enhanceGroupSheet);
}

export default function GroupPrintEnhancer() {
    useEffect(() => {
        const onBeforePrint = () => enhancePrintableGroups();
        window.addEventListener("beforeprint", onBeforePrint);
        return () => window.removeEventListener("beforeprint", onBeforePrint);
    }, []);

    return null;
}
