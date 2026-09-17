import pg from "pg";
import "dotenv/config";
const { Pool } = pg;
export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20
});
export async function tx(fn) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    }
    catch (e) {
        await client.query("ROLLBACK");
        throw e;
    }
    finally {
        client.release();
    }
}
