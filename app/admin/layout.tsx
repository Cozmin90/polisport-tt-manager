import type { ReactNode } from "react";
import GroupPrintEnhancer from "./GroupPrintEnhancer";

// Keep print-only enhancements isolated from tournament scoring and database logic.
export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <>
            {children}
            <GroupPrintEnhancer />
        </>
    );
}
