import type { ReactNode } from "react";
import GroupPrintEnhancer from "./GroupPrintEnhancer";
import AdminParticipantManager from "../../components/AdminParticipantManager";

// Keep print-only enhancements isolated from tournament scoring and database logic.
export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <>
            {children}
            <GroupPrintEnhancer />
            <AdminParticipantManager />
        </>
    );
}
