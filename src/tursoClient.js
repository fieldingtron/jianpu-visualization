import { createClient } from "@libsql/client";

const url = import.meta.env.VITE_TURSO_DATABASE_URL;
const authToken = import.meta.env.VITE_TURSO_AUTH_TOKEN;

export const turso = (url && authToken) ? createClient({
    url,
    authToken,
}) : {
    execute: async () => {
        console.warn("Turso DB not configured. Check .env");
        return { rows: [] };
    }
};
