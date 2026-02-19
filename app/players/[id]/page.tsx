"use client";

import { useParams } from "next/navigation";
import PlayerProfile from "../../../components/PlayerProfile";

export default function PublicPlayerPage() {
    const params = useParams();

    // Next can return string | string[] depending on route usage.
    const raw = (params as any)?.id;
    const playerId = Array.isArray(raw) ? raw[0] : raw;

    if (!playerId || typeof playerId !== "string") {
        return <div style={{ padding: 16 }}>Profil invalid.</div>;
    }

    return <PlayerProfile playerId={playerId} showOwnerActions={false} />;
}
