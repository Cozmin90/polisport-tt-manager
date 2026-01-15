import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function Page() {
    return (
        <Suspense fallback={<div style={{ padding: 20 }}>Se încarcă…</div>}>
            <LoginClient />
        </Suspense>
    );
}
