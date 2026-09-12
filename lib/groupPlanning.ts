export function parseTableCount(value: string): number | null {
    if (!value.trim()) return null;
    const count = Number(value);
    if (!Number.isInteger(count) || count < 1 || count > 2147483647) throw new Error("Introdu un număr întreg de mese, mai mare decât zero, sau lasă câmpul gol.");
    return count;
}

export function chooseGroupCount(N: number, minSize: number, maxSize: number, preferred: number, tables: number | null = null) {
    const minimum = Math.ceil(N / maxSize);
    const maximum = Math.floor(N / minSize);
    if (N < minSize || minimum > maximum) return null;
    if (tables !== null) {
        if (!Number.isInteger(tables) || tables < 1) throw new Error("Număr de mese invalid.");
        return Math.max(minimum, Math.min(tables, maximum));
    }
    let best = minimum;
    let bestScore = Infinity;
    for (let groups = minimum; groups <= maximum; groups++) {
        const base = Math.floor(N / groups);
        const extra = N % groups;
        const score = extra * Math.abs(base + 1 - preferred) + (groups - extra) * Math.abs(base - preferred);
        if (score < bestScore) { best = groups; bestScore = score; }
    }
    return best;
}

export function buildGroupSizes(N: number, groups: number) {
    return Array.from({ length: groups }, (_, index) => Math.floor(N / groups) + (index < N % groups ? 1 : 0));
}

export function describeGroupPlan(players: number, tables: number | null) {
    if (!Number.isInteger(players) || players < 3) return "Repartizarea va fi calculată când există cel puțin 3 participanți.";
    const groups = chooseGroupCount(players, 4, 6, 5, tables);
    if (!groups) return `${players} jucători: format Liga (o singură grupă), cu confirmarea organizatorului.`;
    const sizes = buildGroupSizes(players, groups);
    const distribution = [...new Set(sizes)].map(size => `${sizes.filter(value => value === size).length} ${sizes.filter(value => value === size).length === 1 ? "grupă" : "grupe"} × ${size} jucători`).join(" + ");
    const note = tables === null ? "" : groups > tables ? ` Sunt mai multe grupe decât mese (${groups}/${tables}); grupele vor trebui jucate pe rând, sub coordonarea organizatorului.` : groups < tables ? ` Sunt suficiente ${groups} mese pentru aceste grupe.` : " Câte o grupă pentru fiecare masă.";
    return `${players} jucători: ${distribution}.${note}`;
}
