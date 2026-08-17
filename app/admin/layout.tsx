import type { ReactNode } from "react";
import GroupPrintEnhancer from "./GroupPrintEnhancer";

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <>
            {children}
            <GroupPrintEnhancer />
        </>
    );
}
