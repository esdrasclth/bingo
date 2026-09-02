/* ═══════════════════════════════════════════════════════════════
   Persistencia en Neon (Postgres).

   Todo es opcional: si no hay DATABASE_URL, el juego sigue funcionando
   entero en memoria. Así el proyecto arranca en local sin credenciales
   y la base de datos solo añade que las partidas sobrevivan a un reinicio.

   Las escrituras nunca bloquean una jugada: si Neon falla, se registra el
   error y la partida continúa. La memoria es la fuente de verdad en vivo;
   la base de datos es la copia duradera.
   ═══════════════════════════════════════════════════════════════ */

// .env.local es donde `neon link` deja DATABASE_URL; .env queda para overrides
require("dotenv").config({ path: [".env.local", ".env"], quiet: true });

const { neon } = require("@neondatabase/serverless");

const URL_BD = process.env.DATABASE_URL || "";
const activa = Boolean(URL_BD);

const sql = activa ? neon(URL_BD) : null;

let saludable = activa;

function avisarFallo(donde, error) {
    if (!saludable) return;          // no repetimos el aviso en cada consulta
    saludable = false;
    console.error(`⚠️  Neon no responde (${donde}): ${error.message}`);
    console.error("   La partida sigue en memoria; se reintentará más adelante.");
}

function recuperado() {
    if (saludable) return;
    saludable = true;
    console.log("✅ Neon vuelve a responder");
}

/* ── Cola de escritura ──
   Las escrituras salen sin await para no frenar una jugada, pero varias del
   mismo registro llegando a la vez se pisaban: cada UPSERT lleva su foto del
   estado y la última en confirmarse podía ser la más vieja. Aquí se serializa
   por clave y se fusiona: si llegan 40 sorteos seguidos, se escribe el primero
   y después una sola vez el estado final, ya completo. */

const enVuelo = new Map();
const pendiente = new Map();

function lanzar(clave, escribir) {
    const promesa = Promise.resolve()
        .then(escribir)                       // lee el estado ACTUAL, no una copia
        .then(recuperado)
        .catch(e => avisarFallo(clave.split(":")[0], e))
        .finally(() => {
            enVuelo.delete(clave);
            const siguiente = pendiente.get(clave);
            if (siguiente) {
                pendiente.delete(clave);
                lanzar(clave, siguiente);
            }
        });

    enVuelo.set(clave, promesa);
}

function programar(clave, escribir) {
    if (enVuelo.has(clave)) {
        pendiente.set(clave, escribir);       // solo sobrevive la más reciente
        return;
    }
    lanzar(clave, escribir);
}

// Espera a que no quede nada por escribir (apagado ordenado)
async function vaciar() {
    while (enVuelo.size || pendiente.size) {
        await Promise.allSettled([...enVuelo.values()]);
    }
}

/* ── Esquema ── */

async function migrar() {
    if (!activa) {
        console.log("💾 Sin DATABASE_URL: las partidas viven solo en memoria.");
        console.log("   Ejecuta  npx neon@latest init  para añadir persistencia.");
        return false;
    }

    try {
        await sql`
            CREATE TABLE IF NOT EXISTS partidas (
                codigo            TEXT PRIMARY KEY,
                token_admin_hash  TEXT NOT NULL,
                patron            TEXT NOT NULL DEFAULT 'FULL',
                bolas             JSONB NOT NULL DEFAULT '[]'::jsonb,
                bombo             JSONB NOT NULL DEFAULT '[]'::jsonb,
                bloqueada         BOOLEAN NOT NULL DEFAULT false,
                ganador           JSONB,
                contador_carton   INTEGER NOT NULL DEFAULT 1,
                creada            TIMESTAMPTZ NOT NULL DEFAULT now(),
                ultima_actividad  TIMESTAMPTZ NOT NULL DEFAULT now()
            )`;

        await sql`
            CREATE TABLE IF NOT EXISTS jugadores (
                id         TEXT PRIMARY KEY,
                partida    TEXT NOT NULL REFERENCES partidas(codigo) ON DELETE CASCADE,
                nombre     TEXT NOT NULL,
                carton_id  INTEGER NOT NULL,
                carton     JSONB NOT NULL,
                marcados   JSONB NOT NULL DEFAULT '[]'::jsonb,
                creado     TIMESTAMPTZ NOT NULL DEFAULT now()
            )`;

        await sql`CREATE INDEX IF NOT EXISTS jugadores_partida_idx ON jugadores (partida)`;
        await sql`CREATE INDEX IF NOT EXISTS partidas_actividad_idx ON partidas (ultima_actividad)`;

        console.log("💾 Neon conectado y esquema listo.");
        return true;

    } catch (e) {
        avisarFallo("migración", e);
        return false;
    }
}

/* ── Partidas ── */

function guardarPartida(p, tokenHash) {
    if (!activa) return;

    programar("partida:" + p.codigo, () => sql`
            INSERT INTO partidas (codigo, token_admin_hash, patron, bolas, bombo,
                                  bloqueada, ganador, contador_carton, ultima_actividad)
            VALUES (${p.codigo}, ${tokenHash}, ${p.currentPattern},
                    ${JSON.stringify(p.drawn)}, ${JSON.stringify(p.numbers)},
                    ${p.gameLocked}, ${p.ganador ? JSON.stringify(p.ganador) : null},
                    ${p.cardCounter}, now())
            ON CONFLICT (codigo) DO UPDATE SET
                patron           = EXCLUDED.patron,
                bolas            = EXCLUDED.bolas,
                bombo            = EXCLUDED.bombo,
                bloqueada        = EXCLUDED.bloqueada,
                ganador          = EXCLUDED.ganador,
                contador_carton  = EXCLUDED.contador_carton,
                ultima_actividad = now()`);
}

function borrarPartida(codigo) {
    if (!activa) return;
    programar("partida:" + codigo, () => sql`DELETE FROM partidas WHERE codigo = ${codigo}`);
}

/* ── Jugadores ── */

function guardarJugador(codigoPartida, jugador) {
    if (!activa) return;

    programar("jugador:" + jugador.id, () => sql`
            INSERT INTO jugadores (id, partida, nombre, carton_id, carton, marcados)
            VALUES (${jugador.id}, ${codigoPartida}, ${jugador.nombre},
                    ${jugador.carton.id}, ${JSON.stringify(jugador.carton.data)},
                    ${JSON.stringify(jugador.marcados)})
            ON CONFLICT (id) DO UPDATE SET
                nombre    = EXCLUDED.nombre,
                carton_id = EXCLUDED.carton_id,
                carton    = EXCLUDED.carton,
                marcados  = EXCLUDED.marcados`);
}

/* ── Recuperación al arrancar ── */

async function cargarTodo() {
    if (!activa) return [];

    try {
        const filas = await sql`
            SELECT codigo, token_admin_hash, patron, bolas, bombo, bloqueada,
                   ganador, contador_carton,
                   EXTRACT(EPOCH FROM ultima_actividad) * 1000 AS actividad
            FROM partidas
            ORDER BY ultima_actividad DESC`;

        const jugadores = await sql`
            SELECT id, partida, nombre, carton_id, carton, marcados FROM jugadores`;

        const porPartida = new Map();
        for (const j of jugadores) {
            if (!porPartida.has(j.partida)) porPartida.set(j.partida, []);
            porPartida.get(j.partida).push(j);
        }

        recuperado();

        return filas.map(f => ({
            codigo: f.codigo,
            tokenHash: f.token_admin_hash,
            patron: f.patron,
            bolas: f.bolas || [],
            bombo: f.bombo || [],
            bloqueada: f.bloqueada,
            ganador: f.ganador || null,
            contadorCarton: f.contador_carton,
            actividad: Number(f.actividad),
            jugadores: porPartida.get(f.codigo) || []
        }));

    } catch (e) {
        avisarFallo("cargarTodo", e);
        return [];
    }
}

module.exports = {
    activa,
    migrar,
    vaciar,
    guardarPartida,
    borrarPartida,
    guardarJugador,
    cargarTodo
};
