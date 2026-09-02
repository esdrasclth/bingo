const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { Server } = require("socket.io");

const bd = require("./db");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: "8kb" }));
app.use(express.static("public", { index: false }));

const PATRONES = ["FULL", "HORIZONTAL", "VERTICAL", "X", "CROSS", "CENTER_BOX"];

// Sin 0/O ni 1/I/L: el código se dicta en voz alta y se teclea a mano
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const MAX_PARTIDAS       = 500;
const MAX_JUGADORES       = 200;
const VIDA_SIN_ACTIVIDAD  = 6 * 60 * 60 * 1000;   // 6 h
const BARRIDO_CADA        = 15 * 60 * 1000;       // 15 min
const CREACIONES_POR_IP   = 20;
const VENTANA_CREACION    = 10 * 60 * 1000;

/* ═══════════════════════ JUGADOR ═══════════════════════
   Vive por su id persistente, no por el socket: así recargar la página
   devuelve el mismo cartón con las mismas casillas marcadas. */

class Jugador {
    constructor(id, nombre, carton) {
        this.id = id;
        this.nombre = nombre;
        this.carton = carton;
        this.marcados = [];
        this.socketId = null;
    }

    get conectado() {
        return this.socketId !== null;
    }
}

/* ═══════════════════════ PARTIDA ═══════════════════════
   Todo el estado vive aquí dentro, no en variables de módulo, para que el
   servidor sostenga muchas salas a la vez sin que se pisen entre sí. */

class Partida {
    constructor(codigo, tokenHash) {
        this.codigo = codigo;
        this.tokenHash = tokenHash;

        this.numbers = Array.from({ length: 75 }, (_, i) => i + 1);
        this.drawn = [];
        this.gameLocked = false;
        this.currentPattern = "FULL";
        this.ganador = null;

        this.jugadores = new Map();   // jugadorId -> Jugador
        this.porSocket = new Map();   // socket.id -> jugadorId
        this.pantallas = new Set();

        this.usedCards = new Set();
        this.cardCounter = 1;

        this.creada = Date.now();
        this.ultimaActividad = Date.now();
    }

    tocar() { this.ultimaActividad = Date.now(); }

    get conectados() {
        let n = 0;
        for (const j of this.jugadores.values()) if (j.conectado) n++;
        return n;
    }

    // 🎫 CARTÓN 5x5 CON FREE
    generarCarton() {
        let card, key;

        do {
            card = [];
            const rangos = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];

            for (let i = 0; i < 5; i++) {
                const nums = [];
                for (let n = rangos[i][0]; n <= rangos[i][1]; n++) nums.push(n);
                card.push(barajar(nums).slice(0, 5));
            }

            card[2][2] = "FREE";
            key = JSON.stringify(card);

        } while (this.usedCards.has(key));

        this.usedCards.add(key);
        return { id: this.cardCounter++, data: card };
    }

    reiniciar() {
        this.numbers = Array.from({ length: 75 }, (_, i) => i + 1);
        this.drawn = [];
        this.gameLocked = false;
        this.currentPattern = "FULL";
        this.ganador = null;
        this.usedCards.clear();
        this.cardCounter = 1;

        // Cartón nuevo y limpio para todos: si no, conservan el viejo mientras
        // el contador vuelve a 1 y acaban repitiéndose los números de cartón.
        for (const jugador of this.jugadores.values()) {
            jugador.carton = this.generarCarton();
            jugador.marcados = [];
        }
    }

    listaJugadores() {
        return [...this.jugadores.values()]
            .filter(j => j.conectado)
            .map(j => ({ nombre: j.nombre, carton: j.carton.id }));
    }

    estado() {
        return {
            codigo: this.codigo,
            drawn: this.drawn,
            pattern: this.currentPattern,
            gameLocked: this.gameLocked,
            ganador: this.ganador,
            jugadores: this.conectados,
            lista: this.listaJugadores()
        };
    }
}

const partidas = new Map();
const creacionesPorIp = new Map();
const arranque = Date.now();

// Fisher-Yates: sort(() => Math.random() - 0.5) no da una permutación uniforme
function barajar(lista) {
    const a = lista.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function codigoNuevo() {
    let codigo;
    do {
        codigo = Array.from(crypto.randomBytes(5))
            .map(b => ALFABETO[b % ALFABETO.length])
            .join("");
    } while (partidas.has(codigo));
    return codigo;
}

const normalizar = c => String(c || "").trim().toUpperCase();

function limpiarNombre(nombre) {
    const limpio = String(nombre || "").replace(/\s+/g, " ").trim().slice(0, 20);
    return limpio || "Invitado";
}

// El token nunca se guarda en claro: en memoria y en la base de datos vive
// solo su hash. Al ser un valor aleatorio de 72 bits, SHA-256 basta.
const hashToken = t => crypto.createHash("sha256").update(String(t)).digest("hex");

// Comparación en tiempo constante, tolerante a longitudes distintas
function tokenValido(token, hashEsperado) {
    if (typeof token !== "string" || !hashEsperado) return false;

    const a = Buffer.from(hashToken(token));
    const b = Buffer.from(hashEsperado);

    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/* ═══════════════════════ PATRONES ═══════════════════════ */

// Casillas que exige cada patrón. Devuelve grupos: basta completar uno.
function gruposDelPatron(pattern) {
    const idx = (r, c) => r * 5 + c;
    const todas = [...Array(25).keys()];

    if (pattern === "FULL") return [todas];

    if (pattern === "HORIZONTAL") {
        return [0, 1, 2, 3, 4].map(r => [0, 1, 2, 3, 4].map(c => idx(r, c)));
    }

    if (pattern === "VERTICAL") {
        return [0, 1, 2, 3, 4].map(c => [0, 1, 2, 3, 4].map(r => idx(r, c)));
    }

    if (pattern === "X") {
        return [
            [0, 1, 2, 3, 4].map(i => idx(i, i)),
            [0, 1, 2, 3, 4].map(i => idx(i, 4 - i))
        ];
    }

    if (pattern === "CROSS") {
        const cruz = new Set();
        for (let i = 0; i < 5; i++) { cruz.add(idx(2, i)); cruz.add(idx(i, 2)); }
        return [[...cruz]];
    }

    if (pattern === "CENTER_BOX") {
        const caja = [];
        for (let r = 1; r <= 3; r++) for (let c = 1; c <= 3; c++) caja.push(idx(r, c));
        return [caja];
    }

    return [];
}

// Rejilla de booleanos: qué casillas están marcadas (FREE siempre cuenta)
function rejillaMarcada(card, marked) {
    const grid = [];
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            const val = card[c][r];
            grid.push(val === "FREE" || marked.includes(val));
        }
    }
    return grid;
}

// Cuántas casillas faltan para el grupo más cercano. 0 = bingo.
function faltanParaPatron(card, marked, pattern) {
    const grid = rejillaMarcada(card, marked);
    const grupos = gruposDelPatron(pattern);

    if (!grupos.length) return null;

    return Math.min(...grupos.map(g => g.filter(i => !grid[i]).length));
}

/* ═══════════════════════ RUTAS ═══════════════════════ */

const plantillas = new Map();

function origenPublico(req) {
    const configurado = String(process.env.PUBLIC_URL || "").trim();
    const protoCabecera = String(req.get("x-forwarded-proto") || req.protocol)
        .split(",")[0]
        .trim();
    const protocolo = protoCabecera === "https" ? "https" : "http";
    const host = String(req.get("x-forwarded-host") || req.get("host") || "localhost:3000")
        .split(",")[0]
        .trim();
    const candidato = configurado || `${protocolo}://${host}`;

    try {
        const url = new URL(candidato.includes("://") ? candidato : `https://${candidato}`);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Protocolo no válido");
        return url.origin;
    } catch {
        return "http://localhost:3000";
    }
}

const pagina = (carpeta, archivo) => {
    const ruta = path.join(__dirname, carpeta, archivo);

    return (req, res) => {
        let plantilla = plantillas.get(ruta);
        if (!plantilla) {
            plantilla = fs.readFileSync(ruta, "utf8");
            plantillas.set(ruta, plantilla);
        }

        const origen = origenPublico(req);
        const pathname = req.originalUrl.split("?")[0];
        const urlPagina = new URL(pathname, `${origen}/`).href;

        res.type("html").send(
            plantilla
                .replaceAll("{{ORIGIN}}", origen)
                .replaceAll("{{PAGE_URL}}", urlPagina)
        );
    };
};

// 🩺 Salud, para el healthcheck del contenedor y el monitor de Dokploy
app.get("/api/salud", (req, res) => {
    res.json({
        ok: true,
        partidas: partidas.size,
        jugadores: [...partidas.values()].reduce((n, p) => n + p.conectados, 0),
        baseDeDatos: bd.activa ? "conectada" : "sin configurar",
        subidoDesde: new Date(arranque).toISOString()
    });
});

app.get("/", pagina("public", "index.html"));
app.get("/jugar/:codigo", pagina("views", "jugar.html"));
app.get("/admin/:codigo", pagina("views", "admin.html"));
app.get("/pantalla/:codigo", pagina("views", "pantalla.html"));

// 🆕 Crear partida
app.post("/api/partidas", (req, res) => {
    if (partidas.size >= MAX_PARTIDAS) {
        return res.status(503).json({
            error: "El servidor tiene demasiadas partidas abiertas. Inténtalo en unos minutos."
        });
    }

    const ip = req.ip || req.socket.remoteAddress || "desconocida";
    const ahora = Date.now();
    const previas = (creacionesPorIp.get(ip) || []).filter(t => ahora - t < VENTANA_CREACION);

    if (previas.length >= CREACIONES_POR_IP) {
        return res.status(429).json({
            error: "Has creado muchas partidas seguidas. Espera unos minutos."
        });
    }

    previas.push(ahora);
    creacionesPorIp.set(ip, previas);

    const codigo = codigoNuevo();
    const tokenAdmin = crypto.randomBytes(9).toString("base64url");

    const partida = new Partida(codigo, hashToken(tokenAdmin));
    partidas.set(codigo, partida);

    // El token en claro se entrega una sola vez, aquí; después solo vive su hash
    bd.guardarPartida(partida, partida.tokenHash);

    res.json({ codigo, tokenAdmin });
});

// 🔎 Comprobar si una partida existe antes de mandar a nadie a una sala vacía
app.get("/api/partidas/:codigo", (req, res) => {
    const partida = partidas.get(normalizar(req.params.codigo));
    if (!partida) return res.status(404).json({ existe: false });

    res.json({
        existe: true,
        codigo: partida.codigo,
        jugadores: partida.conectados,
        bolas: partida.drawn.length,
        patron: partida.currentPattern,
        terminada: partida.gameLocked
    });
});

// 📱 QR del enlace para unirse, generado aquí para no depender de ningún CDN
app.get("/api/qr/:codigo", async (req, res) => {
    const partida = partidas.get(normalizar(req.params.codigo));
    if (!partida) return res.status(404).json({ error: "No existe" });

    const destino = `${req.protocol}://${req.get("host")}/jugar/${partida.codigo}`;

    try {
        const svg = await QRCode.toString(destino, {
            type: "svg",
            margin: 1,
            errorCorrectionLevel: "M",
            color: { dark: "#193F56", light: "#FFFBE5" }
        });
        res.json({ url: destino, svg });
    } catch (e) {
        res.status(500).json({ error: "No se pudo generar el QR" });
    }
});

/* ═══════════════════════ SOCKETS ═══════════════════════ */

function difundirAforo(partida) {
    io.to(partida.codigo).emit("players", {
        total: partida.conectados,
        lista: partida.listaJugadores()
    });
}

function mandarProgreso(partida, jugador) {
    if (!jugador || !jugador.socketId) return;

    io.to(jugador.socketId).emit("progreso", {
        faltan: faltanParaPatron(jugador.carton.data, jugador.marcados, partida.currentPattern)
    });
}

function difundirProgreso(partida) {
    for (const jugador of partida.jugadores.values()) {
        if (jugador.conectado) mandarProgreso(partida, jugador);
    }
}

io.on("connection", (socket) => {

    let partida = null;
    let jugador = null;
    let rol = null;

    // 🚪 Entrar a una sala. Hasta que no ocurre, el socket no recibe nada.
    socket.on("unirse", (datos, ack) => {
        const responder = r => { if (typeof ack === "function") ack(r); };

        const encontrada = partidas.get(normalizar(datos && datos.codigo));
        if (!encontrada) return responder({ ok: false, motivo: "noExiste" });

        const pedido = datos && datos.rol;
        partida = encontrada;
        rol = ["pantalla", "admin"].includes(pedido) ? pedido : "jugador";
        partida.tocar();
        socket.join(partida.codigo);

        // Pantalla y panel miran la partida, no la juegan: ni cartón ni aforo
        if (rol !== "jugador") {
            if (rol === "pantalla") partida.pantallas.add(socket.id);
            socket.emit("estado", partida.estado());
            return responder({ ok: true, codigo: partida.codigo });
        }

        // Reconexión: mismo id de jugador, mismo cartón y mismas marcas
        const idPrevio = String((datos && datos.jugadorId) || "");
        const existente = partida.jugadores.get(idPrevio);

        if (existente) {
            jugador = existente;
            if (datos.nombre) jugador.nombre = limpiarNombre(datos.nombre);
        } else {
            if (partida.jugadores.size >= MAX_JUGADORES) {
                return responder({ ok: false, motivo: "llena" });
            }

            const id = crypto.randomBytes(12).toString("base64url");
            jugador = new Jugador(id, limpiarNombre(datos && datos.nombre), partida.generarCarton());
            partida.jugadores.set(id, jugador);
            bd.guardarPartida(partida, partida.tokenHash);
        }

        bd.guardarJugador(partida.codigo, jugador);

        jugador.socketId = socket.id;
        partida.porSocket.set(socket.id, jugador.id);

        socket.emit("card", jugador.carton);
        socket.emit("marcados", jugador.marcados);
        socket.emit("estado", partida.estado());
        mandarProgreso(partida, jugador);
        difundirAforo(partida);

        responder({
            ok: true,
            codigo: partida.codigo,
            jugadorId: jugador.id,
            nombre: jugador.nombre,
            reconectado: !!existente
        });
    });

    socket.on("renombrar", (nombre) => {
        if (!jugador) return;
        jugador.nombre = limpiarNombre(nombre);
        partida.tocar();
        bd.guardarJugador(partida.codigo, jugador);
        difundirAforo(partida);
    });

    // ✔ Marcar. El servidor guarda las marcas, así sobreviven a una recarga.
    socket.on("marcar", (num) => {
        if (!partida || !jugador || partida.gameLocked) return;
        if (typeof num !== "number") return;

        // Solo valen los números realmente cantados y que estén en su cartón
        if (!partida.drawn.includes(num)) return;
        if (!jugador.carton.data.flat().includes(num)) return;

        const i = jugador.marcados.indexOf(num);
        if (i === -1) jugador.marcados.push(num);
        else jugador.marcados.splice(i, 1);

        partida.tocar();
        bd.guardarJugador(partida.codigo, jugador);
        socket.emit("marcados", jugador.marcados);
        mandarProgreso(partida, jugador);
    });

    // 🏆 El cartón y las marcas salen del servidor, nunca del cliente
    socket.on("checkBingo", () => {
        if (!partida || !jugador || partida.gameLocked) return;

        const faltan = faltanParaPatron(
            jugador.carton.data, jugador.marcados, partida.currentPattern
        );

        if (faltan !== 0) {
            socket.emit("bingoRechazado", { faltan });
            return;
        }

        partida.gameLocked = true;
        partida.ganador = {
            cardId: jugador.carton.id,
            nombre: jugador.nombre,
            jugadorId: jugador.id
        };
        partida.tocar();
        bd.guardarPartida(partida, partida.tokenHash);

        io.to(partida.codigo).emit("winner", partida.ganador);
        io.to(partida.codigo).emit("gameLocked", true);
    });

    // 👑 Autenticación de admin, contra el token de ESTA partida
    socket.on("adminAuth", (token, ack) => {
        socket.isAdmin = !!partida && tokenValido(token, partida.tokenHash);
        if (typeof ack === "function") ack(socket.isAdmin);
    });

    // La marca isAdmin vive en este socket. Si el cliente reconecta llega un
    // socket nuevo sin ella, así que avisamos en vez de ignorar en silencio.
    function esAdmin() {
        if (partida && socket.isAdmin) return true;
        socket.emit("noAutorizado");
        return false;
    }

    socket.on("setPattern", (pattern) => {
        if (!esAdmin()) return;
        if (partida.gameLocked || !PATRONES.includes(pattern)) return;

        partida.currentPattern = pattern;
        partida.tocar();
        bd.guardarPartida(partida, partida.tokenHash);

        io.to(partida.codigo).emit("pattern", pattern);
        difundirProgreso(partida);
    });

    socket.on("draw", () => {
        if (!esAdmin()) return;
        if (partida.gameLocked || partida.numbers.length === 0) return;

        const i = crypto.randomInt(partida.numbers.length);
        const num = partida.numbers.splice(i, 1)[0];

        partida.drawn.push(num);
        partida.tocar();
        bd.guardarPartida(partida, partida.tokenHash);

        io.to(partida.codigo).emit("currentNumber", num);
        difundirProgreso(partida);
    });

    socket.on("reset", () => {
        if (!esAdmin()) return;

        partida.reiniciar();
        partida.tocar();

        bd.guardarPartida(partida, partida.tokenHash);
        for (const j of partida.jugadores.values()) bd.guardarJugador(partida.codigo, j);

        for (const j of partida.jugadores.values()) {
            if (!j.conectado) continue;
            io.to(j.socketId).emit("card", j.carton);
            io.to(j.socketId).emit("marcados", j.marcados);
        }

        io.to(partida.codigo).emit("estado", partida.estado());
        io.to(partida.codigo).emit("reset");
        difundirProgreso(partida);
    });

    socket.on("disconnect", () => {
        if (!partida) return;

        partida.pantallas.delete(socket.id);

        const id = partida.porSocket.get(socket.id);
        if (id) {
            const j = partida.jugadores.get(id);
            // El jugador se conserva (con su cartón) por si vuelve a entrar
            if (j && j.socketId === socket.id) j.socketId = null;
            partida.porSocket.delete(socket.id);
        }

        difundirAforo(partida);
    });
});

/* ═══════════════════════ LIMPIEZA ═══════════════════════
   Sin esto, cada partida creada se quedaría en memoria para siempre. */

setInterval(() => {
    const ahora = Date.now();

    for (const [codigo, partida] of partidas) {
        const vacia = partida.conectados === 0 && partida.pantallas.size === 0;
        const vieja = ahora - partida.ultimaActividad > VIDA_SIN_ACTIVIDAD;

        if (vacia && vieja) {
            io.to(codigo).emit("salaCerrada");
            partidas.delete(codigo);
            bd.borrarPartida(codigo);
        }
    }

    for (const [ip, marcas] of creacionesPorIp) {
        const vivas = marcas.filter(t => ahora - t < VENTANA_CREACION);
        if (vivas.length) creacionesPorIp.set(ip, vivas);
        else creacionesPorIp.delete(ip);
    }
}, BARRIDO_CADA).unref();

/* ═══════════════════════ ARRANQUE ═══════════════════════ */

// Rehidrata las partidas guardadas. Los jugadores vuelven desconectados: al
// entrar con su id recuperan cartón y marcas tal y como estaban.
async function recuperarPartidas() {
    const guardadas = await bd.cargarTodo();
    if (!guardadas.length) return 0;

    for (const fila of guardadas) {
        const partida = new Partida(fila.codigo, fila.tokenHash);

        partida.currentPattern = fila.patron;
        partida.drawn = fila.bolas;
        partida.numbers = fila.bombo;
        partida.gameLocked = fila.bloqueada;
        partida.ganador = fila.ganador;
        partida.cardCounter = fila.contadorCarton;
        partida.ultimaActividad = fila.actividad;

        for (const j of fila.jugadores) {
            const jugador = new Jugador(j.id, j.nombre, { id: j.carton_id, data: j.carton });
            jugador.marcados = j.marcados || [];
            partida.jugadores.set(j.id, jugador);

            // Sin esto, un cartón repartido antes del reinicio podría repetirse
            partida.usedCards.add(JSON.stringify(j.carton));
        }

        partidas.set(fila.codigo, partida);
    }

    return guardadas.length;
}

const PORT = process.env.PORT || 3000;

(async () => {
    await bd.migrar();

    const recuperadas = await recuperarPartidas();
    if (recuperadas) {
        console.log(`♻️  ${recuperadas} partida(s) recuperadas de la base de datos.`);
    }

    server.listen(PORT, () => {
        console.log("🎱 Bingo PRO funcionando en puerto " + PORT);
        console.log("   Crea una partida en http://localhost:" + PORT + "/");
    });
})();

// Apagado ordenado: sin esto, un redeploy corta las escrituras en vuelo y se
// pierden las últimas bolas o marcas de las partidas activas.
for (const senal of ["SIGINT", "SIGTERM"]) {
    process.on(senal, async () => {
        console.log(`
⏳ ${senal}: guardando lo pendiente…`);
        server.close();
        await bd.vaciar();
        console.log("✅ Todo guardado. Hasta luego.");
        process.exit(0);
    });
}
